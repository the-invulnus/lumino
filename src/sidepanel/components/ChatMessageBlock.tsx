import { Fragment, useState } from "react"
import { marked } from "marked"
import DOMPurify from "dompurify"
import "katex/dist/katex.min.css"
import { renderLatexInText, ALLOWED_KATEX_TAGS, ALLOWED_KATEX_ATTR } from "../../lib/katex-markdown"
import type { OpenAiChatMessage } from "../../lib/chat/openai-messages"
import { exportWorkspaceFile } from "../../lib/fs/workspace"
import { useT } from "../../lib/i18n"
import { LumiToolCall } from "./LumiToolCall"
import { ReasoningBlock } from "./ReasoningBlock"

function renderMarkdown(text: string): JSX.Element {
  let html: string
  try {
    const textWithLatex = renderLatexInText(text)
    const rawHtml = marked.parse(textWithLatex, { async: false }) as string
    // 消毒：LLM 回复（或被 prompt injection）可能含 <script>/<img onerror> 等，
    // side panel 运行在扩展上下文，XSS 等于扩展被接管，必须过滤。
    // trim 末尾换行防止 white-space: pre-wrap 产生底部空行
    html = DOMPurify.sanitize(rawHtml.trimEnd(), {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["script", "style"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
      ADD_TAGS: ALLOWED_KATEX_TAGS,
      ADD_ATTR: ALLOWED_KATEX_ATTR
    })
  } catch (err) {
    console.warn("[lumino] renderMarkdown 失败，退回纯文本:", err)
    // 渲染失败时退回纯文本，不做 Markdown/LaTeX 解析
    html = text.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  }
  return (
    <div
      className="lm-chat-md"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const target = e.target as HTMLElement
        const anchor = target.closest("a")
        if (anchor) {
          e.preventDefault()
          const href = anchor.getAttribute("href")
          if (href) {
            chrome.tabs.create({ url: href }).catch(() => {})
          }
        }
      }}
    />
  )
}

/** 隐藏内部标记前缀（如 Current Time），不暴露给 UI */
const HIDDEN_PREFIX = /^\[Current Time: \d{4}-\d{2}-\d{2}.+\]\n\n/

export function displayContent(content: string): string {
  return content.replace(HIDDEN_PREFIX, "")
}

export function formatMessagePreview(message: OpenAiChatMessage): string {
  if (message.role === "tool") {
    return message.content ?? ""
  }
  if (typeof message.content === "string") {
    return message.content
  }
  if (Array.isArray(message.content)) {
    return message.content.map((part) => (part as { text?: string }).text ?? "").join("\n")
  }
  return ""
}

export function ChatMessageBlock({
  message,
  allMessages,
  index,
  inGroup = false
}: {
  message: OpenAiChatMessage
  allMessages: OpenAiChatMessage[]
  index: number
  inGroup?: boolean
}) {
  const t = useT()
  if (message.role === "user") {
    if (inGroup) return <>{displayContent(formatMessagePreview(message))}</>
    return (
      <div className="lm-chat-row lm-chat-row--user">
        <div className="lm-chat-bubble lm-chat-bubble--user">
          {displayContent(formatMessagePreview(message))}
        </div>
      </div>
    )
  }

  if (message.role === "assistant") {
    const text = formatMessagePreview(message)
    const toolCalls = message.tool_calls

    const toolResults: Record<string, string> = {}
    for (let j = index + 1; j < allMessages.length; j++) {
      const next = allMessages[j]
      if (next.role === "tool" && next.tool_call_id) {
        if (!(next.tool_call_id in toolResults)) {
          toolResults[next.tool_call_id] = next.content ?? ""
        }
      }
    }

    const hasContent = !!text
    const hasTools = toolCalls && toolCalls.length > 0
    const paragraphs = hasContent
      ? text.split(/\n{2,}/).filter((p) => p.trim().length > 0)
      : []

    // 推理过程（仅当模型实际返回 reasoning_content 时存在）
    const reasoning = message.reasoning_content
    const reasoningBlock = reasoning ? (
      <ReasoningBlock content={reasoning} />
    ) : null

    // 渲染顺序：推理过程 → 全部 content 段落 → 全部工具调用卡片。
    // OpenAI 协议中一个 assistant 消息的 content 与 tool_calls 是并行的——
    // 模型先写完整文本，再同时发起多个工具调用，不存在「段落 ↔ 工具」的交错对应，
    // 交错排列会把工具卡夹在 content 的 \n\n 段落中间，破坏阅读顺序。
    const inner = hasTools ? (
      <div className="lumi-sequence-stack">
        {reasoningBlock}
        {paragraphs.map((part, i) => (
          <Fragment key={`md-${i}`}>{renderMarkdown(part)}</Fragment>
        ))}
        {toolCalls!.map((call) => (
          <LumiToolCall
            key={call.id}
            call={call}
            result={toolResults[call.id] ?? null}
          />
        ))}
      </div>
    ) : (
      <Fragment>
        {reasoningBlock}
        {renderMarkdown(text)}
      </Fragment>
    )

    if (inGroup) return <>{inner}</>
    return (
      <div className="lm-chat-row lm-chat-row--assistant">
        <div className="lm-chat-bubble lm-chat-bubble--assistant">
          {inner}
        </div>
      </div>
    )
  }

  // 独立 tool 结果
  if (message.role === "tool") {
    const id = message.tool_call_id

    let handled = false
    for (let i = index - 1; i >= 0; i--) {
      const prev = allMessages[i]
      if (prev.role === "assistant" && prev.tool_calls) {
        if (prev.tool_calls.some((tc) => tc.id === id)) {
          handled = true
        }
        break
      }
      if (prev.role !== "tool") break
    }
    if (handled) return null

    let toolName = ""
    for (let i = index - 1; i >= 0; i--) {
      const prev = allMessages[i]
      if (prev.role === "assistant" && prev.tool_calls) {
        const match = prev.tool_calls.find((tc) => tc.id === id)
        if (match) { toolName = match.function.name; break }
      }
    }

    if (inGroup) return null
    return (
      <div className="lm-chat-row lm-chat-row--tool">
        <div className="lm-chat-meta">
          {t("toolcall.result", { name: toolName || id.slice(0, 8) })}
        </div>
        <pre className="lm-chat-tool-body">{message.content ?? ""}</pre>
      </div>
    )
  }

  return null
}
