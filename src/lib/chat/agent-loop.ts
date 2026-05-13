import type { OpenAiChatMessage, OpenAiToolCall } from "./openai-messages"
import type { LlmSettings } from "../llm/types"
import { requestChatCompletionTurn } from "../llm/openai"
import { executeToolCall } from "./tool-executor"
import { buildAgentMessages } from "./system-prompt"
import { LUMINO_AGENT_TOOLS } from "./tool-definitions"

/** 单次 LLM 请求超时（毫秒） */
const LLM_REQUEST_TIMEOUT_MS = 120_000

/** 单个工具执行超时（毫秒） */
const TOOL_EXEC_TIMEOUT_MS = 30_000

/** 调试日志开关：true 时在 console 中输出 agent 执行轨迹 */
const DEBUG_AGENT = true

function debugLog(...args: unknown[]) {
  if (DEBUG_AGENT) {
    console.log("[lumino:agent]", ...args)
  }
}

/**
 * 带超时的 Promise 包装
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} 超时（${timeoutMs / 1000}s）`))
    }, timeoutMs)

    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

export type AgentLoopInput = {
  settings: LlmSettings
  threadId: string
  historyMessages: OpenAiChatMessage[]
  userInput: string
  onMessagesUpdate?: (messages: OpenAiChatMessage[]) => Promise<void>
  /** 流式内容增量回调，逐 token 推送 */
}

export async function runAgentLoop(
  input: AgentLoopInput
): Promise<OpenAiChatMessage[]> {
  const { settings, historyMessages, userInput, onMessagesUpdate } = input
  const startTime = Date.now()

  const messages: OpenAiChatMessage[] = [
    ...historyMessages,
    {
      role: "user",
      content: userInput
    }
  ]


  let totalToolCalls = 0

  while (true) {
    debugLog(`第 ${totalToolCalls + 1} 次 LLM 调用，当前消息数=${messages.length}`)

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

    debugLog("→ 请求 LLM...")
    const llmStart = Date.now()

    const result = await withTimeout(
      requestChatCompletionTurn(settings, {
        messages: requestMessages,
        tools: LUMINO_AGENT_TOOLS
      }, {
        timeoutMs: LLM_REQUEST_TIMEOUT_MS
      }),
      LLM_REQUEST_TIMEOUT_MS + 5_000,
      "LLM 请求"
    )

    debugLog(`← LLM 响应，耗时 ${Date.now() - llmStart}ms，finishReason=${result.finishReason || "unknown"}, content=${result.message.content?.length || 0}chars, tools=${result.message.tool_calls?.length || 0}`)

    const assistantMsg = {
      role: "assistant" as const,
      content: result.message.content,
      tool_calls: result.message.tool_calls
    }

    // 检测空响应：既没有文本也没有工具调用
    const hasContent = !!(assistantMsg.content && assistantMsg.content.trim().length > 0)
    const hasToolCalls = !!(assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0)

    if (!hasContent && !hasToolCalls) {
      debugLog("LLM 返回空响应（无内容、无工具调用）")
      // 注入一条错误消息让 UI 知道
      assistantMsg.content = "（模型返回了空响应，可能是请求超时或上下文过长。请重试或缩短对话。）"
    }

    messages.push(assistantMsg)

    if (onMessagesUpdate) {
      await onMessagesUpdate([...messages])
    }

    if (!hasToolCalls) {
      debugLog("无工具调用，结束循环")
      break
    }

    const toolCalls = assistantMsg.tool_calls!
    debugLog(`需要执行 ${toolCalls.length} 个工具: ${toolCalls.map(c => c.function.name).join(", ")}`)

    for (const call of toolCalls) {
      totalToolCalls++
      debugLog(`  → 执行工具 #${totalToolCalls}: ${call.function.name}(${call.function.arguments?.slice(0, 200)})`)
      const toolStart = Date.now()

      const toolResult = await withTimeout(
        executeToolCall(call),
        TOOL_EXEC_TIMEOUT_MS,
        `工具 ${call.function.name}`
      )

      const resultLen = toolResult.length
      debugLog(`  ← 工具结果: ${call.function.name}，长度=${resultLen}，耗时 ${Date.now() - toolStart}ms`)

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

  debugLog(`Agent 循环结束，总耗时 ${Date.now() - startTime}ms，工具调用 ${totalToolCalls} 次`)
  return messages
}
