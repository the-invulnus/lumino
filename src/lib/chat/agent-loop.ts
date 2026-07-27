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

const MAX_AGENT_STEPS = 100

// ═══════════════ OpenAI → AI SDK ModelMessage ═══════════════

function openAiToModelMessages(msgs: OpenAiChatMessage[]): ModelMessage[] {
  // 修复历史消息：收集所有已有 tool result 的 ID，过滤掉没有对应结果的 tool_calls
  // 避免 AI_MissingToolResultsError（可能由之前的 bug 导致）
  const existingToolResultIds = new Set(
    msgs.filter((m): m is OpenAiChatMessage & { role: "tool" } => m.role === "tool" && !!m.tool_call_id).map((m) => m.tool_call_id)
  )
  const repaired = msgs.map((m) => {
    if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
      const filtered = m.tool_calls.filter((tc) => existingToolResultIds.has(tc.id))
      if (filtered.length === m.tool_calls.length) return m
      return { ...m, tool_calls: filtered.length > 0 ? filtered : undefined }
    }
    return m
  })

  return repaired
    .filter((m) => {
      if (m.role === "system") return false
      // 过滤掉修复后既没有内容也没有 tool_calls 的 assistant 消息
      if (m.role === "assistant" && !m.tool_calls?.length) {
        const text = typeof m.content === "string" ? m.content.trim() : ""
        if (!text) return false
      }
      return true
    })
    .map((m): ModelMessage => {
      switch (m.role) {
        case "user":
          return { role: "user", content: typeof m.content === "string" ? m.content : "" }
        case "assistant": {
          const text = typeof m.content === "string" ? m.content : ""
          const toolCallParts = (m.tool_calls ?? []).map((tc: OpenAiToolCall) => ({
            type: "tool-call" as const,
            toolCallId: tc.id,
            toolName: tc.function.name,
            input: safeJsonParse(tc.function.arguments)
          }))
          return {
            role: "assistant" as const,
            content: toolCallParts.length > 0
              ? [{ type: "text" as const, text }, ...toolCallParts]
              : text
          } as ModelMessage
        }
        case "tool": {
          // 从相邻 assistant 消息中获取 toolName
          let toolName = ""
          const idx = msgs.indexOf(m)
          for (let i = idx - 1; i >= 0; i--) {
            const prev = msgs[i]
            if (prev.role === "assistant" && prev.tool_calls) {
              const match = prev.tool_calls.find((tc: OpenAiToolCall) => tc.id === m.tool_call_id)
              if (match) { toolName = match.function.name; break }
            }
          }
          const rawContent = m.content
          // AI SDK v6 toolResultPartSchema 要求 output 是 discriminated union:
          // { type: "text", value: string } | { type: "json", value: JSONValue } | ...
          let output: unknown
          if (typeof rawContent === "string") {
            output = { type: "text" as const, value: rawContent }
            // 尝试解析为 JSON：如果看起来像 JSON，尝试解析
            const trimmed = rawContent.trim()
            if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
              try {
                const parsed = JSON.parse(rawContent)
                // 避免双包：如果已经带有合法的 output discriminator 结构则直接使用
                // AI SDK v6 合法的 output type: text, json, execution-denied, error-text, error-json, content
                const VALID_OUTPUT_TYPES = new Set(["text", "json", "execution-denied", "error-text", "error-json", "content"])
                if (parsed && typeof parsed === "object" && "type" in parsed
                  && VALID_OUTPUT_TYPES.has((parsed as Record<string, unknown>).type as string)
                  && ("value" in parsed || "reason" in parsed)) {
                  output = parsed
                } else {
                  output = { type: "json" as const, value: parsed }
                }
              } catch { /* 保持 text 类型 */ }
            }
          } else if (typeof rawContent === "object" && rawContent !== null) {
            output = { type: "json" as const, value: rawContent }
          } else {
            output = { type: "text" as const, value: String(rawContent ?? "") }
          }
          return {
            role: "tool",
            content: [{
              type: "tool-result",
              toolCallId: m.tool_call_id,
              toolName,
              output
            }]
          } as unknown as ModelMessage
        }
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
  const hasToolResults = step.toolResults && step.toolResults.length > 0

  // AI SDK 可能将 tool calls 和 tool results 拆分到不同 step：
  // Step N 含 toolCalls 无 toolResults；Step N+1 无 toolCalls 含 toolResults
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
  }

  if (hasToolResults) {
    for (const tr of step.toolResults!) {
      // 跳过已存在的 tool 结果（AI SDK 可能重复传递）
      const alreadyExists = current.some(
        (m) => m.role === "tool" && m.tool_call_id === tr.toolCallId
      )
      if (alreadyExists) continue

      // AI SDK v6 tool output 是 discriminated union: { type: "text"|"json", value: ... }
      let toolContent: string
      if (typeof tr.output === "object" && tr.output !== null && "value" in tr.output) {
        const val = (tr.output as { value: unknown }).value
        toolContent = typeof val === "string" ? val : JSON.stringify(val)
      } else {
        toolContent = typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output)
      }
      current.push({
        role: "tool",
        tool_call_id: tr.toolCallId,
        content: toolContent
      })
    }
  }

  if (!hasToolCalls && !hasToolResults && step.text) {
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
  /** Agent 模式 id + 配置 */
  mode?: string
  agentConfig?: {
    systemPrompt: string
    tools: string[]
  }
}

export async function runAgentLoop(input: AgentLoopInput): Promise<OpenAiChatMessage[]> {
  const { settings, historyMessages, userInput, onMessagesUpdate, signal, agentConfig } = input
  const startTime = Date.now()

  // 系统提示词
  const systemMessages = await buildAgentMessages(
    historyMessages.filter((m) => m.role !== "system") as any,
    { systemPromptOverride: agentConfig?.systemPrompt }
  )
  const systemPrompt = systemMessages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n")

  // 工具列表（按模式过滤）
  const toolFilter = agentConfig?.tools && agentConfig.tools.length > 0
    ? agentConfig.tools
    : undefined
  const tools = await getLuminoAgentTools(toolFilter) as unknown as ToolSet

  // OpenAI provider（强制 Chat API）
  let fetchCallCount = 0
  const openai = createOpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl,
    fetch: async (url, init) => {
      if (signal?.aborted) throw new DOMException("用户中止了请求", "AbortError")
      fetchCallCount++
      const callIdx = fetchCallCount
      // 注入 thinking:disabled 到请求体（deepseek 等模型需要 extra_body）
      let patchedInit = init
      if (init?.body) {
        try {
          const body = JSON.parse(init.body as string)
          body.thinking = { type: "disabled" }
          patchedInit = { ...init, body: JSON.stringify(body) }
        } catch { /* body 非 JSON */ }
      }
      const res = await fetch(url, { ...patchedInit, signal: signal ?? init?.signal })
      // 克隆响应体，记录原始内容
      const cloned = res.clone()
      const resText = await cloned.text()
      console.log(`[lumino:agent] 🔽 HTTP #${callIdx} status=${res.status}, body=`, resText.slice(0, 3000))
      return res
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

  try {
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
    const stepCount = result.steps?.length ?? 0
    // 达到步数上限时追加提示，让用户知道 agent 被截断了
    if (stepCount >= MAX_AGENT_STEPS && !result.text) {
      accumulatedMessages.push({
        role: "assistant",
        content: `（已达到最大步数 ${MAX_AGENT_STEPS}，agent 终止。可继续补充提问或重新生成。）`
      })
      if (onMessagesUpdate) await onMessagesUpdate(accumulatedMessages)
    }

    return accumulatedMessages
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err
    }
    console.error("[lumino:agent] 执行出错:", err)
    throw err
  }
}
