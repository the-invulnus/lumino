// ============================================================
// Layer 1 事件采集器 — Content Script 端采集浏览行为
// ============================================================

import type {
  InputMeta,
  Layer1Event,
  Layer1EventType,
  PageMeta
} from "./types"
import { isPrivacyUrl } from "./privacy-filter"

/**
 * 截取页面文本的前 N 个字符作为上下文摘要。
 */
function extractTextSnippet(doc: Document, maxLength = 3000): string {
  const body = doc.body
  if (!body) {
    return ""
  }

  const text = body.innerText ?? ""
  // 清理多余空白
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
 * 构建一个模糊的 CSS 选择器用于标识元素。
 * 注意：仅用于记忆关联，不保证唯一性。
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
 * 生成唯一事件 ID。
 */
export function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
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
  inputElement?: HTMLInputElement | HTMLTextAreaElement | HTMLElement
): Layer1Event | null {
  const url = doc.location.href
  if (isPrivacyUrl(url)) {
    return null
  }

  const page = buildPageMeta(doc)
  const input = inputElement ? buildInputMeta(inputElement) : undefined

  return {
    id: generateEventId(),
    type,
    timestamp: Date.now(),
    tabId,
    windowId,
    sessionStartMs,
    page,
    input
  }
}

/**
 * 检查当前页面是否应该被采集。
 */
export function shouldCollectPage(url: string): boolean {
  return !isPrivacyUrl(url)
}
