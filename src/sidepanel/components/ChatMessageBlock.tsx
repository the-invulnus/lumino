import { Fragment, useState } from "react"
import { marked } from "marked"
import DOMPurify from "dompurify"
import type { OpenAiChatMessage } from "../../lib/chat/openai-messages"
import { exportWorkspaceFile } from "../../lib/fs/workspace"
import { useT } from "../../lib/i18n"
import { LumiToolCall } from "./LumiToolCall"

function renderMarkdown(text: string): JSX.Element {
  const rawHtml = marked.parse(text, { async: false }) as string
  // 消毒：LLM 回复（或被 prompt injection）可能含 <script>/<img onerror> 等，
  // side panel 运行在扩展上下文，XSS 等于扩展被接管，必须过滤。
  // trim 末尾换行防止 white-space: pre-wrap 产生底部空行
  const html = DOMPurify.sanitize(rawHtml.trimEnd(), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "style"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"]
  })
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
    if (inGroup) return <>{formatMessagePreview(message)}</>
    return (
      <div className="lm-chat-row lm-chat-row--user">
        <div className="lm-chat-bubble lm-chat-bubble--user">
          {formatMessagePreview(message)}
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

    const inner = hasTools ? (
      <div className="lumi-sequence-stack">
        {toolCalls!.map((call, i) => (
          <Fragment key={call.id}>
            {i < paragraphs.length ? (
              renderMarkdown(paragraphs[i])
            ) : null}
            <LumiToolCall
              call={call}
              result={toolResults[call.id] ?? null}
            />
          </Fragment>
        ))}
        {paragraphs.slice(toolCalls!.length).map((part, i) => (
          <Fragment key={`md-${i}`}>{renderMarkdown(part)}</Fragment>
        ))}
      </div>
    ) : (
      renderMarkdown(text)
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
