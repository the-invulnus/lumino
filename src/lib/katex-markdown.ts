import katex from "katex"

/**
 * KaTeX 公式渲染（auto-render 方案）。
 *
 * 使用官方 `auto-render` 的分隔符分段逻辑（移植自
 * katex/contrib/auto-render/splitAtDelimiters.ts，MIT License），
 * 采用官方默认分隔符配置：
 *
 * - 块级 `$$...$$`、`\[...\]` → `displayMode: true`
 * - 行内 `\(...\)` → `displayMode: false`
 * - AMS 环境 `\begin{equation}` / `\begin{align}` 等
 *
 * 官方默认不含 `$...$`（会误伤普通美元符号，如 "$100"），保持一致。
 * 为什么不用官方 `renderMathInElement`：它是 DOM 级操作，而本流程是
 * 字符串 → HTML string → dangerouslySetInnerHTML，必须在 marked 之前
 * 完成替换。
 */

type DelimiterSpec = { left: string; right: string; display: boolean }
type SplitPart =
  | { type: "text"; data: string }
  | { type: "math"; data: string; display: boolean }

const escapeRegex = (s: string): string => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")

/** 从 startIndex 起查找右分隔符，忽略 `\{ \}` 花括号配对内的内容 */
function findEndOfMath(delimiter: string, text: string, startIndex: number): number {
  let index = startIndex
  let braceLevel = 0
  const delimLength = delimiter.length

  while (index < text.length) {
    const character = text[index]
    if (braceLevel <= 0 && text.slice(index, index + delimLength) === delimiter) {
      return index
    } else if (character === "\\") {
      index++
    } else if (character === "{") {
      braceLevel++
    } else if (character === "}") {
      braceLevel--
    }
    index++
  }
  return -1
}

const AMS_RE = /^\\begin{/

/** 分隔符配置：$$、\[ \]、\( \)、AMS 环境 */
const DELIMITERS: DelimiterSpec[] = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "\\(", right: "\\)", display: false },
  { left: "\\begin{equation}", right: "\\end{equation}", display: true },
  { left: "\\begin{align}", right: "\\end{align}", display: true },
  { left: "\\begin{alignat}", right: "\\end{alignat}", display: true },
  { left: "\\begin{gather}", right: "\\end{gather}", display: true },
  { left: "\\begin{CD}", right: "\\end{CD}", display: true }
]

/** 将文本按分隔符分段为 text / math 片段 */
function splitAtDelimiters(text: string, delimiters: DelimiterSpec[]): SplitPart[] {
  const parts: SplitPart[] = []
  const regexLeft = new RegExp(
    "(" + delimiters.map((d) => escapeRegex(d.left)).join("|") + ")"
  )

  while (true) {
    const index = text.search(regexLeft)
    if (index === -1) break
    if (index > 0) {
      parts.push({ type: "text", data: text.slice(0, index) })
      text = text.slice(index)
    }

    const i = delimiters.findIndex((d) => text.startsWith(d.left))
    const end = findEndOfMath(delimiters[i]!.right, text, delimiters[i]!.left.length)
    if (end === -1) break

    const rawData = text.slice(0, end + delimiters[i]!.right.length)
    // AMS 环境需要保留 \begin{...} / \end{...} 整体传给 KaTeX
    const math = AMS_RE.test(rawData)
      ? rawData
      : text.slice(delimiters[i]!.left.length, end)

    parts.push({ type: "math", data: math, display: delimiters[i]!.display })
    text = text.slice(end + delimiters[i]!.right.length)
  }

  if (text !== "") parts.push({ type: "text", data: text })
  return parts
}

/**
 * 将文本中的 LaTeX 公式替换为 KaTeX 渲染的 HTML。
 * 渲染失败时保留原始 LaTeX 源码，避免内容丢失。
 */
export function renderLatexInText(text: string): string {
  // 预清理：移除零宽空格（U+200B）、零宽连接符（U+200C-D）、软连字符（U+00AD）、
  // 零宽非断空格（U+FEFF）等 KaTeX 无法处理的不可见字符
  const cleaned = text.replace(/[​‌‍​﻿]/g, "")

  const parts = splitAtDelimiters(cleaned, DELIMITERS)
  let result = ""
  for (const part of parts) {
    if (part.type === "text") {
      result += part.data
    } else {
      result += safeRenderLatex(part.data, part.display)
    }
  }
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
  if (cleaned.length > 2000) return formula

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
