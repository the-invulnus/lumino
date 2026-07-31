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
  // 先处理块级公式 $$...$$（必须在行内 $...$ 之前，否则会被错误截断）
  let result = replaceLatexBlocks(text, /\$\$([^$]+)\$\$/g, true)

  // 再处理行内公式 $...$（排除 $ 后紧跟数字/空格/$ 的情况）
  result = replaceLatexInline(result, /\$([^$\s\d][^$]*?)\$/g, false)

  return result
}

function replaceLatexBlocks(text: string, regex: RegExp, displayMode: boolean): string {
  return text.replace(regex, (_match: string, formula: string) => {
    try {
      return katex.renderToString(formula.trim(), {
        displayMode,
        throwOnError: false,
        strict: false
      })
    } catch {
      return _match
    }
  })
}

function replaceLatexInline(text: string, regex: RegExp, displayMode: boolean): string {
  return text.replace(regex, (_match: string, formula: string) => {
    try {
      return katex.renderToString(formula.trim(), {
        displayMode,
        throwOnError: false,
        strict: false
      })
    } catch {
      return _match
    }
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
