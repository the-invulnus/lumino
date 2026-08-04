import katex from "katex"

/**
 * 将文本中的 LaTeX 公式（$$...$$ 和 $...$）替换为 KaTeX 渲染的 HTML。
 *
 * - 块级公式 `$$...$$` → `katex.renderToString()` with `displayMode: true`
 * - 行内公式 `$...$`  → `katex.renderToString()` with `displayMode: false`
 * - 不会误匹配 `$` 后紧跟数字或空格的文本（如货币符号 "$100"）
 * - 渲染失败时保留原始 LaTeX 源码，避免因 LLM 输出格式瑕疵导致内容丢失
 */
export function renderLatexInText(text: string): string {
  // 预清理：移除零宽空格（U+200B）、零宽连接符（U+200C-D）、软连字符（U+00AD）、
  // 零宽非断空格（U+FEFF）等 KaTeX 无法处理的不可见字符
  const cleaned = text.replace(/[​‌‍​﻿]/g, "")

  // 先处理块级公式 $$...$$（必须在行内 $...$ 之前，否则会被错误截断）
  let result = replaceLatexBlocks(cleaned, /\$\$([^$]+)\$\$/g, true)

  // 再处理行内公式 $...$（排除 $ 后紧跟数字/空格/$ 的情况）
  result = replaceLatexInline(result, /\$([^$\s\d][^$]*?)\$/g, false)

  return result
}

/**
 * 安全地进行 KaTeX 渲染，捕获渲染中的异常并限制耗时。
 * KaTeX 遇到无法识别的字符（如零宽空格）或特定公式组合时可能抛出异常
 * 或长时间占用主线程导致页面卡死。
 */
function safeRenderLatex(formula: string, displayMode: boolean): string {
  // 移除公式中的零宽空格等不可见字符（KaTeX 3.x 对 U+200B 无 metrics）
  const cleaned = formula.replace(/[​‌‍​﻿]/g, "").trim()
  if (!cleaned) return ""

  // 限制公式长度，避免超长公式导致渲染卡死
  if (cleaned.length > 2000) return cleaned

  try {
    return katex.renderToString(cleaned, {
      displayMode,
      throwOnError: false,
      strict: false
    })
  } catch {
    // 渲染失败时返回原始公式文本，避免内容丢失
    return formula
  }
}

function replaceLatexBlocks(text: string, regex: RegExp, displayMode: boolean): string {
  return text.replace(regex, (_match: string, formula: string) => {
    return safeRenderLatex(formula, displayMode)
  })
}

function replaceLatexInline(text: string, regex: RegExp, displayMode: boolean): string {
  return text.replace(regex, (_match: string, formula: string) => {
    return safeRenderLatex(formula, displayMode)
  })
}

/**
 * KaTeX 渲染输出中使用的所有 HTML 标签。
 * DOMPurify 必须允许这些标签，否则公式会被清空。
 */
export const ALLOWED_KATEX_TAGS = [
  "span",
  "svg",
  "path",
  "line",
  "annotation",
  "semantics",
  "math",
  "menclose",
  "mfrac",
  "mi",
  "mmultiscripts",
  "mn",
  "mo",
  "mover",
  "mpadded",
  "mphantom",
  "mprescripts",
  "mroot",
  "mrow",
  "ms",
  "mspace",
  "msqrt",
  "mstyle",
  "msub",
  "msubsup",
  "msup",
  "mtable",
  "mtd",
  "mtext",
  "mtr",
  "munder",
  "munderover"
]

/**
 * KaTeX 渲染输出中使用的所有 HTML 属性。
 * DOMPurify 必须允许这些属性，否则公式样式/布局会丢失。
 */
export const ALLOWED_KATEX_ATTR = [
  "aria-hidden",
  "style",
  "class",
  "width",
  "height",
  "viewBox",
  "preserveAspectRatio",
  "d",
  "x1",
  "y1",
  "x2",
  "y2",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "fill",
  "transform",
  "clip-path",
  "data-*"
]
