import {
  generateText,
  stepCountIs,
  type ModelMessage,
  type ToolSet
} from "ai"
import { createOpenAI } from "@ai-sdk/openai"

import type { OpenAiChatMessage, OpenAiToolCall } from "./openai-messages"
import type { LlmSettings } from "../llm/types"
import { buildAgentMessages } from "./system-prompt"
import { getLuminoAgentTools } from "./tool-definitions"

const MAX_AGENT_STEPS = 15
const DEBUG_AGENT = true
function debugLog(...args: unknown[]) {
  if (DEBUG_AGENT) console.log("[lumino:agent]", ...args)
}

// ═══════════════ OpenAI → AI SDK ModelMessage ═══════════════

function openAiToModelMessages(msgs: OpenAiChatMessage[]): ModelMessage[] {
  return msgs
    .filter((m) => m.role !== "system")
    .map((m): ModelMessage => {
      switch (m.role) {
        case "user":
          return { role: "user", content: typeof m.content === "string" ? m.content : "" }
        case "assistant": {
          const toolCalls = (m.tool_calls ?? []).map((tc: OpenAiToolCall) => ({
            toolCallId: tc.id,
            toolName: tc.function.name,
            args: safeJsonParse(tc.function.arguments)
          }))
          return { role: "assistant", content: m.content ?? "", toolCalls } as ModelMessage
        }
        case "tool":
          return {
            role: "tool",
            content: [{
              type: "tool-result",
              toolCallId: m.tool_call_id,
              toolName: "",
              result: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
            }]
          } as unknown as ModelMessage
        default:
          return { role: "user", content: "" }
      }
    })
}

// ═══════════════ 结果追加到消息数组 ═══════════════

function appendStepMessages(
  current: OpenAiChatMessage[],
  step: {
    text: string
    toolCalls?: Array<{ toolCallId: string; toolName: string; input: unknown }>
    toolResults?: Array<{ toolCallId: string; toolName: string; output: unknown }>
  }
): OpenAiChatMessage[] {
  const hasToolCalls = step.toolCalls && step.toolCalls.length > 0

  if (hasToolCalls) {
    current.push({
      role: "assistant",
      content: step.text,
      tool_calls: step.toolCalls!.map((tc) => ({
        id: tc.toolCallId,
        type: "function" as const,
        function: { name: tc.toolName, arguments: JSON.stringify(tc.input) }
      }))
    })
    for (const tr of step.toolResults ?? []) {
      current.push({
        role: "tool",
        tool_call_id: tr.toolCallId,
        content: typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output)
      })
    }
  } else if (step.text) {
    current.push({ role: "assistant", content: step.text })
  }

  return current
}

function safeJsonParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown> } catch { return {} }
}

// ═══════════════ Agent ═══════════════

export type AgentLoopInput = {
  settings: LlmSettings
  threadId: string
  historyMessages: OpenAiChatMessage[]
  userInput: string
  onMessagesUpdate?: (messages: OpenAiChatMessage[]) => Promise<void>
  signal?: AbortSignal
}

export async function runAgentLoop(input: AgentLoopInput): Promise<OpenAiChatMessage[]> {
  const { settings, historyMessages, userInput, onMessagesUpdate, signal } = input
  const startTime = Date.now()

  // 系统提示词
  const systemMessages = await buildAgentMessages(
    historyMessages.filter((m) => m.role !== "system") as any
  )
  const systemPrompt = systemMessages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n")

  // 工具列表
  const luminoTools = await getLuminoAgentTools()
  const toolNames = [
    "memory_get", "memory_search",
    "ls", "read_file", "write_file", "edit_file", "glob", "grep", "rm", "export",
    "current_page", "tabs", "get_active_tab_id",
    "get_page_content", "take_selection", "inspect_element",
    "fill_form", "click_element", "screenshot",
    "scroll", "press_key", "navigate",
    "obsidian_list", "obsidian_read", "obsidian_write",
    "obsidian_append", "obsidian_patch", "obsidian_search", "obsidian_open"
  ]
  const tools: ToolSet = {}
  for (let i = 0; i < luminoTools.length; i++) {
    const name = toolNames[i]
    if (name) tools[name] = luminoTools[i] as unknown as ToolSet[string]
  }

  // OpenAI provider（强制 Chat API）
  const openai = createOpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl,
    fetch: async (url, init) => {
      if (signal?.aborted) throw new DOMException("用户中止了请求", "AbortError")
      return fetch(url, { ...init, signal: signal ?? init?.signal })
    }
  })

  const initialMessages: ModelMessage[] = [
    ...openAiToModelMessages(historyMessages),
    { role: "user" as const, content: userInput }
  ]

  // 累积完整消息数组——和原来 while(true) 行为一致
  const accumulatedMessages: OpenAiChatMessage[] = [
    ...historyMessages,
    { role: "user", content: userInput }
  ]

  debugLog(`Agent 启动，历史=${historyMessages.length}，工具=${Object.keys(tools).length}，model=${settings.model}`)

  try {
    debugLog("→ 调用 generateText...")
    const result = await generateText({
      model: openai.chat(settings.model as any),
      system: systemPrompt,
      messages: initialMessages,
      tools,
      abortSignal: signal,
      stopWhen: stepCountIs(MAX_AGENT_STEPS),

      onStepFinish: async (event) => {
        // 把当前 step 的结果追加到累积消息数组中
        appendStepMessages(accumulatedMessages, {
          text: event.text,
          toolCalls: event.toolCalls?.map((tc) => ({
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: tc.input
          })),
          toolResults: event.toolResults?.map((tr) => ({
            toolCallId: tr.toolCallId,
            toolName: tr.toolName,
            output: tr.output
          }))
        })

        // 推完整消息数组给 UI —— 和原来行为完全一致
        if (onMessagesUpdate) await onMessagesUpdate(accumulatedMessages)
      }
    })
    debugLog("← generateText 返回")
    debugLog(`Agent 结束，耗时 ${Date.now() - startTime}ms，步骤=${result.steps?.length ?? 0}，最终消息数=${accumulatedMessages.length}`)
    return accumulatedMessages
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      debugLog("Agent 被用户中止")
      throw err
    }
    console.error("[lumino:agent] 执行出错:", err)
    debugLog("Agent 出错:", err)
    throw err
  }
}
