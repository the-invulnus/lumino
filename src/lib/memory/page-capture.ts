// ============================================================
// 页面内容采集 — turndown 封装，可替换模块
// ============================================================

import TurndownService from "turndown"

/**
 * 可配置的 turndown 实例。
 * 将来可通过初始化参数替换为自定义转换逻辑。
 */
let turndownInstance: TurndownService | null = null

function getTurndown(): TurndownService {
  if (!turndownInstance) {
    turndownInstance = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
      bulletListMarker: "-"
    })

    // 移除 script / style / nav / footer 等噪音元素
    turndownInstance.remove(["script", "style", "nav", "footer", "iframe", "noscript"])
  }

  return turndownInstance
}

/**
 * 将当前 document 的 body 转为完整 Markdown。
 * 返回空字符串表示转换失败。
 */
export function capturePageAsMarkdown(): string {
  try {
    const body = document.body
    if (!body) return ""

    // 克隆 body 避免修改原始 DOM
    const clone = body.cloneNode(true) as HTMLElement

    // 移除可能包含敏感信息的 hidden input
    const hiddenInputs = clone.querySelectorAll('input[type="hidden"]')
    hiddenInputs.forEach((el) => el.remove())

    const turndown = getTurndown()
    const markdown = turndown.turndown(clone)
    return markdown.trim()
  } catch (error) {
    console.warn("[Lumino] turndown 转换失败:", error)
    return ""
  }
}

/**
 * 可替换的页面内容提取函数。
 * 默认使用 turndown，将来可替换为 browser-use 的 Markdown 插件等。
 */
export const extractPageContent = capturePageAsMarkdown

/**
 * 设置自定义 turndown 实例（用于测试或替换）。
 */
export function setTurndownInstance(instance: TurndownService | null): void {
  turndownInstance = instance
}
