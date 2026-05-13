// ============================================================
// 输入监听 / 复制监听 / 页面采集 — Content Script
// ============================================================

import type { PlasmoCSConfig } from "plasmo"
import {
  TAB_OPEN_MESSAGE,
  INPUT_EVENT_MESSAGE,
  COPY_EVENT_MESSAGE,
  CAPTURE_PAGE_MESSAGE,
  CAPTURE_PAGE_RESULT_MESSAGE,
  type TabOpenMessage,
  type InputEventMessage,
  type CopyEventMessage,
  type CapturePageResultMessage
} from "../lib/memory/types"
import { capturePageAsMarkdown } from "../lib/memory/page-capture"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

let pendingPasteSource = false
let pendingPastedLength = 0
let lastUrl = ""

// ---- 初始化 ----

function init(): void {
  reportTabOpen()
  setupInputListeners()
  setupPasteListeners()
  setupCopyListeners()
  setupCaptureListener()
  setupUrlChangeObserver()
}

// ---- Tab 打开上报 ----

function reportTabOpen(): void {
  const url = location.href
  if (
    !url ||
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://")
  ) {
    return
  }

  let hostname = ""
  try {
    hostname = new URL(url).hostname
  } catch {
    return
  }

  const message: TabOpenMessage = {
    type: TAB_OPEN_MESSAGE,
    payload: { url, title: document.title, hostname }
  }

  chrome.runtime.sendMessage(message).catch((err) =>
    console.warn("[Lumino CS] tab-open 发送失败:", err)
  )

  lastUrl = url
}

// ---- Background → Content Script: 采集页面内容 ----

function setupCaptureListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === CAPTURE_PAGE_MESSAGE) {
      try {
        const markdown = capturePageAsMarkdown()
        const result: CapturePageResultMessage = {
          type: CAPTURE_PAGE_RESULT_MESSAGE,
          payload: {
            markdown,
            title: document.title,
            url: location.href
          }
        }
        sendResponse(result)
      } catch (err) {
        console.warn("[Lumino CS] 页面采集失败:", err)
        sendResponse(null)
      }
      return true // 保持消息通道开启以异步响应
    }
  })
}

// ---- 输入框事件 ----

function setupInputListeners(): void {
  let inputThrottleTimer: ReturnType<typeof setTimeout> | null = null

  document.addEventListener(
    "input",
    (e) => {
      const target = e.target as HTMLElement
      if (!isInputElement(target)) return
      if (inputThrottleTimer) return

      inputThrottleTimer = setTimeout(() => {
        inputThrottleTimer = null

        const hostname = extractHostname()
        const nodeType = getNodeType(target)
        const text = getElementText(target)
        const source: "typing" | "paste" = pendingPasteSource ? "paste" : "typing"

        const payload: InputEventMessage["payload"] = {
          hostname,
          nodeType,
          text,
          inputSource: source
        }
        if (pendingPasteSource) {
          payload.pastedLength = pendingPastedLength
        }

        pendingPasteSource = false
        pendingPastedLength = 0

        chrome.runtime.sendMessage({
          type: INPUT_EVENT_MESSAGE,
          payload
        } as InputEventMessage).catch((err) =>
          console.warn("[Lumino CS] input-event 发送失败:", err)
        )

        console.log("[Lumino CS] input 上报:", source, text.slice(0, 30))
      }, 2000)
    },
    true
  )
}

// ---- paste 事件 ----

function setupPasteListeners(): void {
  document.addEventListener(
    "paste",
    (e) => {
      const target = e.target as HTMLElement
      if (!isInputElement(target)) return

      const clipboardData = (e as ClipboardEvent).clipboardData
      const text = clipboardData?.getData("text") ?? ""
      if (text.length > 0) {
        pendingPasteSource = true
        pendingPastedLength = text.length
        console.log("[Lumino CS] paste 检测: 长度", pendingPastedLength)
      }
    },
    true
  )
}

// ---- 复制事件 ----

function setupCopyListeners(): void {
  document.addEventListener("copy", () => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return

    const text = selection.toString().trim()
    if (!text) return

    const hostname = extractHostname()

    chrome.runtime.sendMessage({
      type: COPY_EVENT_MESSAGE,
      payload: { hostname, text }
    } as CopyEventMessage).catch((err) =>
      console.warn("[Lumino CS] copy-event 发送失败:", err)
    )

    console.log("[Lumino CS] copy 上报:", text.slice(0, 40))
  })
}

// ---- SPA 路由变化检测 ----

function setupUrlChangeObserver(): void {
  const checkUrlChange = (): void => {
    if (location.href !== lastUrl) {
      reportTabOpen()
    }
  }

  const originalPushState = history.pushState.bind(history)
  const originalReplaceState = history.replaceState.bind(history)

  history.pushState = function (...args) {
    originalPushState(...args)
    checkUrlChange()
    return undefined as unknown as void
  }
  history.replaceState = function (...args) {
    originalReplaceState(...args)
    checkUrlChange()
    return undefined as unknown as void
  }

  window.addEventListener("popstate", checkUrlChange)
}

// ---- 辅助函数 ----

function isInputElement(element: HTMLElement): boolean {
  const tag = element.tagName.toLowerCase()
  return (
    tag === "input" ||
    tag === "textarea" ||
    element.getAttribute("contenteditable") === "true"
  )
}

function getNodeType(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase()
  return element.getAttribute("contenteditable") === "true"
    ? "contenteditable"
    : tag
}

function getElementText(element: HTMLElement): string {
  if ("value" in element) {
    return (element as HTMLInputElement | HTMLTextAreaElement).value
  }
  return element.textContent ?? ""
}

function extractHostname(): string {
  try {
    return new URL(location.href).hostname
  } catch {
    return ""
  }
}

console.log("[Lumino CS] input-watcher 已注入:", location.href)
init()
