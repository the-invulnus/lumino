import type { OpenAiChatMessage, OpenAiToolCall } from "./openai-messages"
import type { LlmSettings } from "../llm/types"
import { requestChatCompletionTurn } from "../llm/openai"
import { executeToolCall } from "./tool-executor"
import { buildAgentMessages } from "./system-prompt"
import { LUMINO_AGENT_TOOLS } from "./tool-definitions"

const MAX_TOOL_ROUNDS = 8

export type AgentLoopInput = {
  settings: LlmSettings
  threadId: string
  historyMessages: OpenAiChatMessage[]
  userInput: string
  onMessagesUpdate?: (messages: OpenAiChatMessage[]) => Promise<void>
}

export async function runAgentLoop(
  input: AgentLoopInput
): Promise<OpenAiChatMessage[]> {
  const { settings, historyMessages, userInput, onMessagesUpdate } = input

  const messages: OpenAiChatMessage[] = [
    ...historyMessages,
    {
      role: "user",
      content: userInput
    }
  ]

  let rounds = 0

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++

    const systemMessages = await buildAgentMessages(
      messages.filter(
        (m) => m.role === "user" || m.role === "assistant" || m.role === "tool"
      ) as Array<{
        role: "user" | "assistant" | "tool"
        content: string | null
        tool_calls?: unknown[]
        tool_call_id?: string
      }>
    )

    const requestMessages: OpenAiChatMessage[] = [
      ...(systemMessages as OpenAiChatMessage[]),
    ]

    const result = await requestChatCompletionTurn(settings, {
      messages: requestMessages,
      tools: LUMINO_AGENT_TOOLS
    })

    const assistantMsg = result.message as OpenAiChatMessage & {
      role: "assistant"
      content: string | null
      tool_calls?: OpenAiToolCall[]
    }

    messages.push(assistantMsg)

    if (onMessagesUpdate) {
      await onMessagesUpdate([...messages])
    }

    const toolCalls = assistantMsg.tool_calls
    if (!toolCalls || toolCalls.length === 0) {
      break
    }

    for (const call of toolCalls) {
      const toolResult = await executeToolCall(call)

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: toolResult
      })

      if (onMessagesUpdate) {
        await onMessagesUpdate([...messages])
      }
    }
  }

  return messages
}
