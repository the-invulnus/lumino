import { useId, useState } from "react"
import type { OpenAiChatMessage } from "../../lib/chat/openai-messages"
import { useT } from "../../lib/i18n"
import { ChatMessageBlock } from "./ChatMessageBlock"
import { MessageErrorBoundary } from "./MessageErrorBoundary"

/** One user turn: collapsible execution history, followed by the visible final answer. */
export function AssistantTurn({ messages, running = false }: { messages: OpenAiChatMessage[]; running?: boolean }) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  let finalIndex = -1
  // A text before a tool call is a progress update, not the final answer.
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role === "tool") break
    if (message.role !== "assistant") continue
    if (!message.tool_calls?.length && message.content?.trim()) finalIndex = index
    break
  }
  const finalMessage = finalIndex >= 0 ? messages[finalIndex] : null
  const process = messages.flatMap((message, index) => {
    if (index !== finalIndex) return [{ message, index }]
    // Keep the final step's reasoning in the disclosure, separate from its answer.
    if (message.role === "assistant" && message.reasoning_content) {
      return [{ message: { ...message, content: null }, index }]
    }
    return []
  })
  const hasProcess = process.some(({ message }) => message.role === "assistant" &&
    (message.content?.trim() || message.reasoning_content || message.tool_calls?.length))
  const callIds = new Set(messages.flatMap(message => message.role === "assistant" ? (message.tool_calls ?? []).map(call => call.id) : []))

  return <div className="lumi-assistant-turn">
    {hasProcess && <div className="lumi-turn-process">
      <button
        type="button"
        className="lumi-turn-process__summary"
        aria-expanded={expanded}
        aria-controls={expanded ? detailsId : undefined}
        onClick={() => setExpanded(value => !value)}
      >
        <span>{callIds.size ? t("execution.toolCalls", { count: callIds.size }) : t("execution.process")}</span>
        {running && <span className="lumi-turn-process__running">{t("execution.running")}</span>}
        <svg className={`lumi-turn-process__chevron${expanded ? " is-open" : ""}`} aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
      </button>
      {expanded && <div className="lumi-turn-process__details lumi-sequence-stack" id={detailsId}>
        {process.map(({ message, index }) => <MessageErrorBoundary key={index}>
          <ChatMessageBlock message={message} allMessages={messages} index={index} inGroup />
        </MessageErrorBoundary>)}
      </div>}
    </div>}
    {finalMessage?.role === "assistant" && <MessageErrorBoundary>
      <ChatMessageBlock message={{ ...finalMessage, reasoning_content: undefined }} allMessages={messages} index={finalIndex} inGroup />
    </MessageErrorBoundary>}
  </div>
}
