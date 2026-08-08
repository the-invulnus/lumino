/**
 * Agent 循环 — Lumino 应用层薄包装
 *
 * 负责：
 * 1. 构建系统提示词（buildAgentMessages）
 * 2. 获取工具列表（getLuminoAgentTools）
 * 3. 创建 LlmClient（thinking 由 background 解析好的 thinkingBody 驱动，缺省 = 跟随模型默认）
 * 4. 调用核心 runAgentLoop() 并管理消息累积
 *
 * 核心 Agent 循环逻辑在 src/lib/llm/agent-loop.ts 中，不与 Lumino 业务耦合。
 */

import { runAgentLoop as coreRunAgentLoop } from "../llm/agent-loop"
import { LlmClient } from "../llm/llm-client"
import type { LlmMessage, LlmSettings, LuminoTool } from "../llm/llm-types"
import type { OpenAiChatMessage } from "./openai-messages"
import { buildAgentMessages } from "./system-prompt"
import { getLuminoAgentTools } from "./tool-definitions"

const MAX_AGENT_STEPS = 100

function buildUserInputWithTime(userInput: string): string {
  const now = new Date()
  const timeStr = now.toISOString()
  return `[Current Time: ${timeStr}]\n\n${userInput}`
}

export type AgentLoopInput = {
  settings: LlmSettings
  threadId: string
  historyMessages: OpenAiChatMessage[]
  userInput: string
  onMessagesUpdate?: (messages: OpenAiChatMessage[]) => Promise<void>
  signal?: AbortSignal
  mode?: string
  agentConfig?: {
    systemPrompt: string
    tools: string[]
    isBuiltin: boolean
  }
  /** 模型思考 mode 的请求体附加字段（由 background 解析好传入）。undefined = 不注入 */
  thinkingBody?: Record<string, unknown>
}

export async function runAgentLoop(
  input: AgentLoopInput
): Promise<OpenAiChatMessage[]> {
  const {
    settings,
    historyMessages,
    userInput,
    onMessagesUpdate,
    signal,
    agentConfig,
    thinkingBody
  } = input

  // 1. 构建系统提示词
  const systemMessages = await buildAgentMessages(
    historyMessages.filter((m) => m.role !== "system") as any,
    { systemPromptOverride: agentConfig?.systemPrompt }
  )
  const systemPrompt = systemMessages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n")

  // 2. 获取工具列表
  // 内置 agent 用全部工具（toolFilter = undefined）；自定义 agent 用其显式配置的 tools
  // 白名单（空数组 = 真没工具）。MCP 通配符 "mcp:*" 在 getLuminoAgentTools 内处理。
  const toolFilter = agentConfig?.isBuiltin
    ? undefined
    : agentConfig?.tools
  const tools: LuminoTool[] = await getLuminoAgentTools(toolFilter)

  // 3. 创建 LlmClient（thinking 由 background 解析好的 thinkingBody 驱动，缺省 = 跟随模型默认）
  const client = new LlmClient({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    thinkingBody
  })

  // 4. 初始消息：重试时 historyMessages 已包含完整历史，直接使用；否则追加新 user 消息
  const initialMessages: LlmMessage[] = historyMessages.map(
    (m) => m as LlmMessage
  )
  const accumulatedMessages: OpenAiChatMessage[] = [...historyMessages]

  if (userInput) {
    const isNewThread = historyMessages.length === 0
    const enrichedInput = isNewThread
      ? buildUserInputWithTime(userInput)
      : userInput
    initialMessages.push({ role: "user", content: enrichedInput })
    accumulatedMessages.push({ role: "user", content: enrichedInput })
  }

  // 5. 执行核心循环
  const result = await coreRunAgentLoop({
    client,
    systemPrompt,
    messages: initialMessages,
    tools,
    maxSteps: MAX_AGENT_STEPS,
    signal,
    fetcher: async (url, init) => {
      if (signal?.aborted)
        throw new DOMException("用户中止了请求", "AbortError")
      return fetch(url, { ...init, signal })
    },
    onStepFinish: async (step) => {
      // 将 step 结果追加到 UI 消息数组
      if (step.toolCalls && step.toolCalls.length > 0) {
        // assistant 消息（含 tool_calls）去重：以首个 tool_call_id 作为该 step 的标识，
        // 同一 step 会被回调多次（tool_calls 发起时一次 + 每个工具完成时各一次），
        // 仅在首次推送时插入 assistant 消息。
        const firstCallId = step.toolCalls[0].toolCallId
        const assistantExists = accumulatedMessages.some(
          (m) =>
            m.role === "assistant" &&
            Array.isArray(m.tool_calls) &&
            m.tool_calls.some((tc) => tc.id === firstCallId)
        )
        if (!assistantExists) {
          accumulatedMessages.push({
            role: "assistant",
            content: step.text,
            tool_calls: step.toolCalls.map((tc) => ({
              id: tc.toolCallId,
              type: "function" as const,
              function: { name: tc.toolName, arguments: JSON.stringify(tc.input) }
            })),
            // 仅当模型实际返回推理内容时才携带该字段（解耦 thinking 配置）
            ...(step.reasoningContent
              ? { reasoning_content: step.reasoningContent }
              : {})
          })
        }
      }

      if (step.toolResults && step.toolResults.length > 0) {
        for (const tr of step.toolResults) {
          const alreadyExists = accumulatedMessages.some(
            (m) => m.role === "tool" && m.tool_call_id === tr.toolCallId
          )
          if (alreadyExists) continue
          accumulatedMessages.push({
            role: "tool",
            tool_call_id: tr.toolCallId,
            content: tr.output
          })
        }
      }

      if (!step.toolCalls?.length && !step.toolResults?.length && step.text) {
        accumulatedMessages.push({
          role: "assistant",
          content: step.text,
          // 仅当模型实际返回推理内容时才携带该字段（解耦 thinking 配置）
          ...(step.reasoningContent
            ? { reasoning_content: step.reasoningContent }
            : {})
        })
      }

      if (onMessagesUpdate) await onMessagesUpdate(accumulatedMessages)
    }
  })

  return result as unknown as OpenAiChatMessage[]
}
