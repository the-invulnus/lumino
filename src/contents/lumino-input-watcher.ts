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

// 抑制 Plasmo parcel-runtime 在 SW 回收时抛出的未捕获 "Extension context invalidated" 错误
window.addEventListener("error", (event) => {
  if (event.message?.includes("Extension context invalidated")) {
    event.preventDefault()
    event.stopPropagation()
    return false
  }
})

// ============================================================
// 健壮的消息发送：自动处理 Service Worker 重启导致 "context invalidated"
// ============================================================

/**
 * SW 空闲 30s 后被 Chrome 强制卸载，content script 发消息时会遇到
 * "Extension context invalidated" 错误。此函数自动重试直到 SW 恢复。
 */
let swRestarting = false

async function safeSendMessage(message: unknown): Promise<void> {
  const maxRetries = 5
  const baseDelay = 200

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await chrome.runtime.sendMessage(message)
      if (swRestarting) {
        console.log("[Lumino CS] SW 连接恢复")
        swRestarting = false
      }
      return
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (
        msg.includes("Extension context invalidated") ||
        msg.includes("Could not establish connection") ||
        msg.includes("message port closed")
      ) {
        if (!swRestarting) {
          console.warn("[Lumino CS] SW 上下文失效，等待重建...")
          swRestarting = true
        }
        // 指数退避：200ms → 400ms → 800ms → 1600ms → 3200ms
        await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)))
        continue
      }
      // 非上下文失效的异常直接吞掉（原有行为）
      console.warn("[Lumino CS] 发送失败:", msg)
      return
    }
  }
  console.warn("[Lumino CS] SW 重试耗尽，消息发送失败")
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

  safeSendMessage(message)

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

        safeSendMessage({
          type: INPUT_EVENT_MESSAGE,
          payload
        } as InputEventMessage)

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

    safeSendMessage({
      type: COPY_EVENT_MESSAGE,
      payload: { hostname, text }
    } as CopyEventMessage)

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
