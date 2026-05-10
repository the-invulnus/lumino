// ============================================================
// 输入观察器 — Content Script 端监听输入框交互
// ============================================================

import { isPrivacyUrl } from "../memory/privacy-filter"
import {
  L1_EVENT_MESSAGE,
  REQUEST_COMPLETION_MESSAGE,
  COMPLETION_RESULT_MESSAGE,
  COMPLETION_ACCEPT_MESSAGE,
  COMPLETION_REJECT_MESSAGE,
  type L1EventMessage,
  type RequestCompletionMessage,
  type CompletionResultMessage,
  type CompletionAcceptMessage,
  type CompletionRejectMessage
} from "../memory/types"
import { buildPageMeta, buildInputMeta, createLayer1Event, shouldCollectPage } from "../memory/event-collector"

/** 允许触发补全的输入类型 */
const COMPLETION_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url"
])

/** 防抖时间 (ms) */
const DEBOUNCE_MS = 500

/** 每个输入框最大补全请求次数 */
const MAX_COMPLETIONS_PER_INPUT = 5

type WatchedInput = {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLElement
  inputId: string
  completionCount: number
  lastValue: string
  debounceTimer: ReturnType<typeof setTimeout> | null
}

/**
 * 给输入框分配唯一 ID。
 */
function assignInputId(element: HTMLElement): string {
  const existing = element.getAttribute("data-lumino-input-id")
  if (existing) {
    return existing
  }

  const id = `lumino-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  element.setAttribute("data-lumino-input-id", id)
  return id
}

/**
 * 判断元素是否为可补全输入框。
 */
function isCompletionInput(
  element: HTMLElement
): element is HTMLInputElement | HTMLTextAreaElement {
  const tag = element.tagName.toLowerCase()
  const contentEditable = element.getAttribute("contenteditable")

  if (contentEditable === "true") {
    return true
  }

  if (tag === "textarea") {
    return true
  }

  if (tag === "input") {
    const type = (element as HTMLInputElement).type.toLowerCase()
    return COMPLETION_INPUT_TYPES.has(type)
  }

  return false
}

/** 全局 InputWatcher 单例状态 */
class InputWatcher {
  private watchedInputs = new Map<HTMLElement, WatchedInput>()
  private activeInput: WatchedInput | null = null
  private sessionStartMs: number
  private tabId: number
  private windowId: number

  constructor(tabId: number, windowId: number) {
    this.tabId = tabId
    this.windowId = windowId
    this.sessionStartMs = Date.now()
  }

  /**
   * 绑定页面全局事件。
   */
  start(): void {
    document.addEventListener("focusin", this.handleFocusIn, true)
    document.addEventListener("focusout", this.handleFocusOut, true)
    document.addEventListener("input", this.handleInput, true)
    document.addEventListener("keydown", this.handleKeyDown, true)

    // 监听来自 background 的补全结果
    chrome.runtime.onMessage.addListener(this.handleMessage)
  }

  /**
   * 销毁监听器。
   */
  destroy(): void {
    document.removeEventListener("focusin", this.handleFocusIn, true)
    document.removeEventListener("focusout", this.handleFocusOut, true)
    document.removeEventListener("input", this.handleInput, true)
    document.removeEventListener("keydown", this.handleKeyDown, true)
    chrome.runtime.onMessage.removeListener(this.handleMessage)

    // 清理所有计时器
    for (const watched of this.watchedInputs.values()) {
      if (watched.debounceTimer) {
        clearTimeout(watched.debounceTimer)
      }
    }

    this.watchedInputs.clear()
    this.activeInput = null
  }

  /**
   * 上报 Layer1 事件到 background。
   */
  private reportL1(eventType: string, inputElement?: HTMLElement): void {
    if (!shouldCollectPage(document.location.href)) {
      return
    }

    const event = createLayer1Event(
      eventType as Parameters<typeof createLayer1Event>[0],
      this.tabId,
      this.windowId,
      this.sessionStartMs,
      document,
      inputElement
    )

    if (!event) {
      return
    }

    const message: L1EventMessage = {
      type: L1_EVENT_MESSAGE,
      event
    }

    chrome.runtime.sendMessage(message).catch(() => {
      // Service Worker 可能未激活，忽略错误
    })
  }

  /**
   * 请求补全。
   */
  private requestCompletion(watched: WatchedInput): void {
    if (watched.completionCount >= MAX_COMPLETIONS_PER_INPUT) {
      return
    }

    if (!shouldCollectPage(document.location.href)) {
      return
    }

    const userText = this.getInputValue(watched.element)

    if (userText.length < 2) {
      return
    }

    watched.completionCount++

    const inputMeta = buildInputMeta(watched.element)
    const pageMeta = buildPageMeta(document)

    const message: RequestCompletionMessage = {
      type: REQUEST_COMPLETION_MESSAGE,
      payload: {
        tabId: this.tabId,
        inputId: watched.inputId,
        userText,
        inputMeta,
        pageMeta
      }
    }

    chrome.runtime.sendMessage(message).catch(() => {
      // 忽略 SW 未激活的情况
    })
  }

  /**
   * 获取输入框当前值。
   */
  private getInputValue(
    element: HTMLElement
  ): string {
    if ("value" in element) {
      return (element as HTMLInputElement | HTMLTextAreaElement).value
    }

    return element.textContent ?? ""
  }

  // ---- 事件处理器 ----

  private handleFocusIn = (event: FocusEvent): void => {
    const target = event.target as HTMLElement | null
    if (!target || !isCompletionInput(target)) {
      return
    }

    const inputId = assignInputId(target)
    const existing = this.watchedInputs.get(target)

    if (existing) {
      this.activeInput = existing
    } else {
      const watched: WatchedInput = {
        element: target,
        inputId,
        completionCount: 0,
        lastValue: "",
        debounceTimer: null
      }
      this.watchedInputs.set(target, watched)
      this.activeInput = watched
    }

    this.reportL1("input_focus", target)
  }

  private handleFocusOut = (event: FocusEvent): void => {
    const target = event.target as HTMLElement | null
    if (!target) {
      return
    }

    const watched = this.watchedInputs.get(target)
    if (!watched) {
      return
    }

    if (watched.debounceTimer) {
      clearTimeout(watched.debounceTimer)
      watched.debounceTimer = null
    }

    this.reportL1("input_blur", target)

    if (this.activeInput === watched) {
      this.activeInput = null
    }
  }

  private handleInput = (event: Event): void => {
    const target = event.target as HTMLElement | null
    if (!target) {
      return
    }

    const watched = this.watchedInputs.get(target)
    if (!watched) {
      return
    }

    this.activeInput = watched

    // 清除旧的防抖
    if (watched.debounceTimer) {
      clearTimeout(watched.debounceTimer)
    }

    // 上报输入事件（去重：值没变不报）
    const currentValue = this.getInputValue(target)
    if (currentValue !== watched.lastValue) {
      watched.lastValue = currentValue
      this.reportL1("input_type", target)
    }

    // 防抖后请求补全
    watched.debounceTimer = setTimeout(() => {
      this.requestCompletion(watched)
      watched.debounceTimer = null
    }, DEBOUNCE_MS)
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.activeInput) {
      return
    }

    // Tab 键接受补全
    if (event.key === "Tab") {
      // 由 ghost-overlay.ts 处理实际插入
      // 这里只做标记
      return
    }

    // Escape 关闭补全
    if (event.key === "Escape") {
      this.dismissCompletion()
    }
  }

  /**
   * 处理来自 background 的补全结果消息。
   */
  private handleMessage = (
    message: unknown,
    _sender: chrome.runtime.MessageSender
  ): void => {
    if (
      typeof message !== "object" ||
      message === null ||
      (message as { type?: string }).type !== COMPLETION_RESULT_MESSAGE
    ) {
      return
    }

    const { payload } = message as CompletionResultMessage

    if (payload.tabId !== this.tabId) {
      return
    }

    // 查找对应的输入框
    const watched = this.findWatchedByInputId(payload.inputId)
    if (!watched) {
      return
    }

    // 检查当前值是否匹配（用户可能继续输入了）
    const currentValue = this.getInputValue(watched.element)
    if (currentValue !== payload.userText || currentValue.length < 2) {
      return
    }

    // 通知 ghost overlay 显示补全
    if (payload.completion) {
      showCompletion(
        watched.element,
        payload.id,
        payload.completion,
        payload.userText
      )
    }
  }

  private findWatchedByInputId(inputId: string): WatchedInput | null {
    for (const watched of this.watchedInputs.values()) {
      if (watched.inputId === inputId) {
        return watched
      }
    }

    return null
  }

  private dismissCompletion(): void {
    // ghost-overlay 会在自身逻辑中处理 dismiss
    const overlay = document.getElementById("lumino-ghost-overlay")
    if (overlay) {
      overlay.remove()
    }
  }
}

// ---- Ghost Overlay 渲染 ----

/**
 * 显示补全 ghost text overlay。
 */
function showCompletion(
  element: HTMLElement,
  completionId: string,
  completion: string,
  userText: string
): void {
  // 先移除已有的 overlay
  const existing = document.getElementById("lumino-ghost-overlay")
  if (existing) {
    existing.remove()
  }

  const rect = element.getBoundingClientRect()
  const style = window.getComputedStyle(element)

  const overlay = document.createElement("div")
  overlay.id = "lumino-ghost-overlay"
  overlay.setAttribute("data-lumino-completion-id", completionId)
  overlay.setAttribute("data-lumino-input-id", element.getAttribute("data-lumino-input-id") ?? "")

  const leadingSpaces = userText.match(/^\s*/)?.[0] ?? ""

  const prefixSpan = document.createElement("span")
  prefixSpan.textContent = leadingSpaces
  prefixSpan.style.visibility = "hidden"

  const ghostSpan = document.createElement("span")
  ghostSpan.textContent = completion
  ghostSpan.className = "lumino-ghost-text"

  overlay.appendChild(prefixSpan)
  overlay.appendChild(ghostSpan)

  // 样式
  Object.assign(overlay.style, {
    position: "absolute",
    top: `${rect.top + window.scrollY}px`,
    left: `${rect.left + window.scrollX}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    padding: style.padding,
    paddingTop: style.paddingTop,
    paddingRight: style.paddingRight,
    paddingBottom: style.paddingBottom,
    paddingLeft: style.paddingLeft,
    border: "1px solid transparent",
    borderRadius: style.borderRadius,
    boxSizing: "border-box",
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    pointerEvents: "none",
    zIndex: "2147483646",
    color: "rgba(128, 128, 128, 0.55)",
    background: "transparent"
  })

  // 放在 body 中，绝对定位
  document.body.appendChild(overlay)

  // 设置事件监听
  setupCompletionKeyHandler(element, completionId, completion)
}

/**
 * 设置 Tab 接受补全的键盘处理。
 */
function setupCompletionKeyHandler(
  element: HTMLElement,
  completionId: string,
  fullCompletion: string
): void {
  const handler = (event: KeyboardEvent): void => {
    if (event.key !== "Tab") {
      return
    }

    event.preventDefault()

    // 接受补全：将补全文本插入输入框
    if ("value" in element) {
      const input = element as HTMLInputElement | HTMLTextAreaElement
      input.value += fullCompletion
    } else {
      element.textContent += fullCompletion
    }

    // 触发 input 事件以通知框架（React/Vue 等）
    element.dispatchEvent(new Event("input", { bubbles: true }))
    element.dispatchEvent(new Event("change", { bubbles: true }))

    // 移除 overlay
    const overlay = document.getElementById("lumino-ghost-overlay")
    if (overlay) {
      overlay.remove()
    }

    // 上报接受事件
    const acceptMessage: CompletionAcceptMessage = {
      type: COMPLETION_ACCEPT_MESSAGE,
      payload: {
        id: completionId,
        inputId: element.getAttribute("data-lumino-input-id") ?? "",
        acceptedText: fullCompletion
      }
    }

    chrome.runtime.sendMessage(acceptMessage).catch(() => {})

    document.removeEventListener("keydown", handler, true)
  }

  document.addEventListener("keydown", handler, true)

  // 5 秒后自动清理
  setTimeout(() => {
    document.removeEventListener("keydown", handler, true)
    const overlay = document.getElementById("lumino-ghost-overlay")
    if (overlay) {
      overlay.remove()
    }
  }, 8000)
}

// ---- 导出 ----

let globalWatcher: InputWatcher | null = null

/**
 * 初始化输入观察器。
 */
export function initInputWatcher(tabId: number, windowId: number): InputWatcher {
  if (globalWatcher) {
    globalWatcher.destroy()
  }

  globalWatcher = new InputWatcher(tabId, windowId)
  globalWatcher.start()
  return globalWatcher
}

/**
 * 销毁输入观察器。
 */
export function destroyInputWatcher(): void {
  if (globalWatcher) {
    globalWatcher.destroy()
    globalWatcher = null
  }
}
