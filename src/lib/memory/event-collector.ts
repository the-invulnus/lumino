// ============================================================
// Layer 1 事件采集器 — Content Script 端采集浏览行为
// ============================================================

import type {
  ClickMeta,
  InputMeta,
  Layer1Event,
  Layer1EventType,
  PageMeta,
  ScrollMeta
} from "./types"
import { isPrivacyUrl } from "./privacy-filter"
import { formatDateKey } from "./collection-config"

/**
 * 生成唯一事件 ID。
 */
function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * 截取页面文本的前 N 个字符作为上下文摘要。
 */
function extractTextSnippet(doc: Document, maxLength = 3000): string {
  const body = doc.body
  if (!body) {
    return ""
  }

  const text = body.innerText ?? ""
  const cleaned = text.replace(/\s{2,}/g, " ").trim()
  return cleaned.length > maxLength
    ? cleaned.slice(0, maxLength) + "…"
    : cleaned
}

/**
 * 构建当前页面的 PageMeta。
 */
export function buildPageMeta(doc: Document): PageMeta {
  const url = doc.location.href
  const hostname = doc.location.hostname
  const title = doc.title ?? ""
  const textSnippet = extractTextSnippet(doc)

  return { url, title, hostname, textSnippet }
}

/**
 * 构建输入框的 InputMeta。
 */
export function buildInputMeta(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLElement
): InputMeta {
  const tag = element.tagName.toLowerCase()
  const nodeType =
    element.getAttribute("contenteditable") === "true" ? "contenteditable" : tag

  const selectorHint = buildSelectorHint(element)
  const placeholder =
    (element as HTMLInputElement | HTMLTextAreaElement).placeholder ?? ""

  let text = ""
  if ("value" in element) {
    text = (element as HTMLInputElement | HTMLTextAreaElement).value
  } else {
    text = element.textContent ?? ""
  }

  return { selectorHint, nodeType, placeholder, text }
}

/**
 * 构建滚动元数据。
 */
export function buildScrollMeta(doc: Document): ScrollMeta {
  const scrollHeight = doc.documentElement.scrollHeight - doc.documentElement.clientHeight
  if (scrollHeight <= 0) {
    return { scrollDepth: 0 }
  }

  const scrollY = window.scrollY
  const depth = Math.min(100, Math.round((scrollY / scrollHeight) * 100))

  return { scrollDepth: depth }
}

/**
 * 构建点击元数据。
 */
export function buildClickMeta(
  element: HTMLElement
): ClickMeta {
  const tag = element.tagName.toLowerCase()
  const href =
    element instanceof HTMLAnchorElement
      ? element.href
      : element.closest("a")?.href

  let elementType: ClickMeta["elementType"] = "other"

  if (tag === "a" || element.closest("a")) {
    elementType = "link"
  } else if (tag === "button" || element.closest("button")) {
    elementType = "button"
  } else if (
    tag === "input" &&
    (element as HTMLInputElement).type === "search"
  ) {
    elementType = "search"
  } else if (element.closest("nav")) {
    elementType = "navigation"
  }

  const label =
    element.textContent?.trim().slice(0, 200) ??
    (element as HTMLInputElement).value?.slice(0, 200) ??
    ""

  return { elementType, label, href }
}

/**
 * 构建一个模糊的 CSS 选择器用于标识元素。
 */
function buildSelectorHint(
  element: HTMLElement
): string {
  const parts: string[] = []
  let current: HTMLElement | null = element
  let depth = 0

  while (current && current !== document.body && depth < 4) {
    const tag = current.tagName.toLowerCase()
    const id = current.id
    const name = current.getAttribute("name")
    const type = current.getAttribute("type")
    const cls = current.className
      ? "." +
        (typeof current.className === "string"
          ? current.className.split(/\s+/).slice(0, 2).join(".")
          : "")
      : ""

    if (id) {
      parts.unshift(`${tag}#${id}`)
      break
    } else if (name) {
      parts.unshift(`${tag}[name="${name}"]`)
      break
    } else if (type) {
      parts.unshift(`${tag}[type="${type}"]${cls}`)
    } else {
      parts.unshift(`${tag}${cls}`)
    }

    current = current.parentElement
    depth++
  }

  return parts.join(" > ")
}

/**
 * 创建 Layer1Event 对象。
 */
export function createLayer1Event(
  type: Layer1EventType,
  tabId: number,
  windowId: number,
  sessionStartMs: number,
  doc: Document,
  options?: {
    inputElement?: HTMLInputElement | HTMLTextAreaElement | HTMLElement
    inputSource?: "typing" | "paste"
    pastedLength?: number
    clickElement?: HTMLElement
    dwellMs?: number
  }
): Layer1Event | null {
  const url = doc.location.href
  if (isPrivacyUrl(url)) {
    return null
  }

  const timestamp = Date.now()
  const event: Layer1Event = {
    id: generateEventId(),
    type,
    timestamp,
    dateKey: formatDateKey(timestamp),
    tabId,
    windowId,
    sessionStartMs
  }

  if (
    type === "page_visit" ||
    type === "tab_switch"
  ) {
    event.page = buildPageMeta(doc)
    if (type === "page_visit") {
      event.dwellStatus = "pending"
    }
  }

  if (type === "page_scroll") {
    event.page = buildPageMeta(doc)
    event.scroll = buildScrollMeta(doc)
  }

  if (type === "page_dwell_end" && options?.dwellMs != null) {
    event.page = buildPageMeta(doc)
    event.dwellMs = options.dwellMs
    event.dwellStatus = "settled"
  }

  if (type === "page_click" && options?.clickElement) {
    event.page = buildPageMeta(doc)
    event.click = buildClickMeta(options.clickElement)
  }

  if (
    (type === "input_focus" ||
      type === "input_blur" ||
      type === "input_type") &&
    options?.inputElement
  ) {
    event.page = buildPageMeta(doc)
    event.input = buildInputMeta(options.inputElement)
    if (options.inputSource) {
      event.input.inputSource = options.inputSource
    }
    if (options.pastedLength != null) {
      event.input.pastedLength = options.pastedLength
    }
  }

  return event
}

/**
 * 检查当前页面是否应该被采集。
 */
export function shouldCollectPage(url: string): boolean {
  return !isPrivacyUrl(url)
}
