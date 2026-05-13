// ============================================================
// 输入监听 & 事件采集 — Content Script
// ============================================================

import type { PlasmoCSConfig } from "plasmo"
import { L1_EVENT_MESSAGE } from "../lib/memory/types"
import { createLayer1Event, shouldCollectPage } from "../lib/memory/event-collector"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

/** 当前 tab / window 信息在注入后异步获取 */
let tabId = -1
let windowId = -1
let sessionStartMs = Date.now()

/** paste 来源标记 */
let pendingPasteSource = false
let pendingPastedLength = 0

/** 页面 URL 变更检测 */
let lastUrl = ""

// ---- 初始化 ----

function init(): void {
  // 获取 tab 信息
  chrome.runtime.sendMessage(
    { type: "lumino/get-tab-info" },
    (response: { tabId: number; windowId: number } | undefined) => {
      if (response) {
        tabId = response.tabId
        windowId = response.windowId
      }

      // 上报 page_visit
      reportPageVisit()
    }
  )

  // 监听输入框事件
  setupInputListeners()
  // 监听 paste 事件
  setupPasteListeners()
  // 监听滚动事件
  setupScrollListeners()
  // 监听链接点击事件
  setupClickListeners()
  // 监听页面 URL 变化（SPA 路由切换）
  setupUrlChangeObserver()
}

// ---- 页面访问上报 ----

function reportPageVisit(): void {
  if (!shouldCollectPage(location.href)) return

  const event = createLayer1Event(
    "page_visit",
    tabId,
    windowId,
    sessionStartMs,
    document
  )

  if (event) {
    console.log("[Lumino CS] page_visit 上报:", event.page?.url)
    chrome.runtime.sendMessage({
      type: L1_EVENT_MESSAGE,
      event
    }).catch((err) => console.warn("[Lumino CS] page_visit 发送失败:", err))
  }

  lastUrl = location.href
}

// ---- 输入框事件 ----

function setupInputListeners(): void {
  let activeInputElement: HTMLElement | null = null

  document.addEventListener(
    "focusin",
    (e) => {
      const target = e.target as HTMLElement
      if (!isInputElement(target)) return

      activeInputElement = target

      const event = createLayer1Event(
        "input_focus",
        tabId,
        windowId,
        sessionStartMs,
        document,
        { inputElement: target as HTMLInputElement | HTMLTextAreaElement }
      )

      if (event) {
        chrome.runtime.sendMessage({
          type: L1_EVENT_MESSAGE,
          event
        })
      }
    },
    true
  )

  document.addEventListener(
    "focusout",
    (e) => {
      const target = e.target as HTMLElement
      if (!isInputElement(target)) return

      if (activeInputElement === target) {
        activeInputElement = null
      }

      const event = createLayer1Event(
        "input_blur",
        tabId,
        windowId,
        sessionStartMs,
        document,
        { inputElement: target as HTMLInputElement | HTMLTextAreaElement }
      )

      if (event) {
        chrome.runtime.sendMessage({
          type: L1_EVENT_MESSAGE,
          event
        })
      }
    },
    true
  )

  // input 事件 — 节流 2 秒
  let inputThrottleTimer: ReturnType<typeof setTimeout> | null = null

  document.addEventListener(
    "input",
    (e) => {
      const target = e.target as HTMLElement
      if (!isInputElement(target)) return

      if (inputThrottleTimer) return

      inputThrottleTimer = setTimeout(() => {
        inputThrottleTimer = null

        const event = createLayer1Event(
          "input_type",
          tabId,
          windowId,
          sessionStartMs,
          document,
          {
            inputElement: target as HTMLInputElement | HTMLTextAreaElement,
            inputSource: pendingPasteSource ? "paste" : "typing",
            pastedLength: pendingPasteSource ? pendingPastedLength : undefined
          }
        )

        pendingPasteSource = false
        pendingPastedLength = 0

        if (event) {
          console.log("[Lumino CS] input_type 上报:", event.input?.inputSource, event.input?.text?.slice(0, 30))
          chrome.runtime.sendMessage({
            type: L1_EVENT_MESSAGE,
            event
          }).catch((err) => console.warn("[Lumino CS] input_type 发送失败:", err))
        }
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

// ---- 滚动事件 ----

function setupScrollListeners(): void {
  let scrollThrottleTimer: ReturnType<typeof setTimeout> | null = null

  document.addEventListener(
    "scroll",
    () => {
      if (scrollThrottleTimer) return

      scrollThrottleTimer = setTimeout(() => {
        scrollThrottleTimer = null

        const event = createLayer1Event(
          "page_scroll",
          tabId,
          windowId,
          sessionStartMs,
          document
        )

        if (event) {
          console.log("[Lumino CS] scroll 上报:", event.scroll?.scrollDepth, "%")
          chrome.runtime.sendMessage({
            type: L1_EVENT_MESSAGE,
            event
          }).catch((err) => console.warn("[Lumino CS] scroll 发送失败:", err))
        }
      }, 5000) // 5 秒节流
    },
    { passive: true }
  )
}

// ---- 链接点击事件 ----

function setupClickListeners(): void {
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement
      if (!target) return

      const event = createLayer1Event(
        "page_click",
        tabId,
        windowId,
        sessionStartMs,
        document,
        { clickElement: target }
      )

      if (event) {
        console.log("[Lumino CS] click 上报:", event.click?.elementType, event.click?.label?.slice(0, 30))
        chrome.runtime.sendMessage({
          type: L1_EVENT_MESSAGE,
          event
        }).catch((err) => console.warn("[Lumino CS] click 发送失败:", err))
      }
    },
    true
  )
}

// ---- SPA 路由变化检测 ----

function setupUrlChangeObserver(): void {
  // 使用 MutationObserver 监听 URL 变化（SPA 路由切换不触发完整页面加载）
  const checkUrlChange = (): void => {
    if (location.href !== lastUrl) {
      reportPageVisit()
    }
  }

  // history.pushState / replaceState
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

  // popstate
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

// ---- 启动 ----

console.log("[Lumino CS] input-watcher 已注入:", location.href)
init()
