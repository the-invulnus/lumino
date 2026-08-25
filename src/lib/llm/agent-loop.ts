/**
 * 核心 Agent 循环 — while(true) + tool calling
 *
 * 自研替代 AI SDK 的 `generateText()`，不与 Lumino 业务逻辑耦合。
 * 消息格式全程使用 OpenAI 原生格式（LlmMessage）。
 */

import { LlmClient } from "./llm-client"
import { luminoToolsToOpenAi } from "./llm-types"
import type {
  LlmMessage,
  LlmTool,
  LlmToolCall,
  LuminoTool,
  ChatOptions
} from "./llm-types"
import { maybeEvictToolResult } from "../chat/tool-eviction"

const DEFAULT_MAX_STEPS = Infinity

// ═══════════════ 类型 ═══════════════

export interface AgentLoopInput {
  /** LLM 客户端（已配置好 apiKey, baseUrl, model 等） */
  client: LlmClient
  /** 系统提示词（纯字符串，已由调用方拼接完成） */
  systemPrompt: string
  /** 初始消息列表（不含系统提示词） */
  messages: LlmMessage[]
  /** 可用工具列表 */
  tools: LuminoTool[]
  /** 最大步数（默认 100） */
  maxSteps?: number
  /** 每步完成回调（用于实时推送消息到 UI） */
  onStepFinish?: (step: AgentStepResult) => Promise<void>
  /** 中止信号 */
  signal?: AbortSignal
  /** 自定义 fetch（透传给 LlmClient，用于日志/拦截） */
  fetcher?: typeof fetch
  /** 请求超时（毫秒），不传则无超时限制 */
  timeoutMs?: number
}

/** 每个 step 完成后的结果 */
export interface AgentStepResult {
  /** 当前 step 的文本输出（可能为 null） */
  text: string | null
  /** 推理内容（仅当模型实际返回 reasoning_content 时存在） */
  reasoningContent?: string
  /** 工具调用列表（整个 step 内所有 tool_calls，回调时始终携带完整列表） */
  toolCalls?: Array<{
    toolCallId: string
    toolName: string
    input: Record<string, unknown>
  }>
  /**
   * 工具执行结果列表（随执行进度增量增长）。
   * - tool_calls 刚发起、尚未执行任何 tool 时为空数组
   * - 每个 tool 执行完后追加一条
   * - 全部执行完时与 toolCalls 等长
   */
  toolResults?: Array<{
    toolCallId: string
    toolName: string
    output: string
  }>
}

// ═══════════════ Agent 循环 ═══════════════

/**
 * 执行 Agent 循环：多轮 tool calling，直到模型返回纯文本或达到步数上限。
 *
 * 返回完整的 LlmMessage[] 数组（包括所有中间 assistant + tool 消息），
 * 调用方可直接持久化或转发给 UI。
 */
export async function runAgentLoop(
  input: AgentLoopInput
): Promise<LlmMessage[]> {
  const {
    client,
    systemPrompt,
    messages: initialMessages,
    tools,
    maxSteps = DEFAULT_MAX_STEPS,
    onStepFinish,
    signal,
    fetcher,
    timeoutMs
  } = input

  // 工具集：LuminoTool[] → LlmTool[]（OpenAI API 格式）
  const openAiTools: LlmTool[] | undefined =
    tools.length > 0 ? luminoToolsToOpenAi(tools) : undefined

  // 工具名 → LuminoTool 映射（用于快速查找 execute）
  const toolMap = new Map<string, LuminoTool>()
  for (const t of tools) {
    toolMap.set(t.name, t)
  }

  // 累积完整消息
  const messages = [...initialMessages]

  const chatOptions: ChatOptions = { signal, fetcher, timeoutMs }

  let stepCount = 0

  while (stepCount < maxSteps) {    // 检查中止
    if (signal?.aborted) {
      throw new DOMException("用户中止了请求", "AbortError")
    }

    stepCount++

    // 构建请求消息：系统提示词 + 累积消息
    const requestMessages: LlmMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages
    ]

    // 调用 LLM
    const response = await client.chat(requestMessages, openAiTools, chatOptions)

    // 无 tool_calls → Agent 完成
    if (!response.toolCalls || response.toolCalls.length === 0) {
      if (response.text) {
        messages.push({
          role: "assistant",
          content: response.text,
          // 仅当模型实际返回推理内容时才携带该字段（解耦 thinking 配置）
          ...(response.reasoningContent
            ? { reasoning_content: response.reasoningContent }
            : {})
        })
      }
      // 最后一次 step 回调
      if (onStepFinish) {
        await onStepFinish({
          text: response.text,
          reasoningContent: response.reasoningContent,
          toolCalls: undefined,
          toolResults: undefined
        })
      }
      break
    }

    // 有 tool_calls → 构建 assistant 消息
    const assistantMsg: LlmMessage = {
      role: "assistant",
      content: response.text,
      tool_calls: response.toolCalls,
      // 仅当模型实际返回推理内容时才携带该字段（解耦 thinking 配置）
      ...(response.reasoningContent
        ? { reasoning_content: response.reasoningContent }
        : {})
    }
    messages.push(assistantMsg)

    // 构建 step 结果的 toolCalls 部分（给回调用）
    const stepToolCalls = response.toolCalls.map((tc) => ({
      toolCallId: tc.id,
      toolName: tc.function.name,
      input: safeJsonParse(tc.function.arguments)
    }))

    // 执行每个 tool call
    const stepToolResults: AgentStepResult["toolResults"] = []

    // 工具调用已发起、尚未执行任何工具 → 立即推送一次，
    // 让前端先渲染「执行中」的工具调用框（toolResults 为空数组）。
    if (onStepFinish) {
      await onStepFinish({
        text: response.text,
        reasoningContent: response.reasoningContent,
        toolCalls: stepToolCalls,
        toolResults: []
      })
    }

    for (const tc of response.toolCalls) {
      const toolName = tc.function.name
      const tool = toolMap.get(toolName)

      let result: string
      if (!tool) {
        result = JSON.stringify({
          error: "unknown_tool",
          name: toolName,
          hint: "该工具的 handler 未注册，可能是 MCP 连接失败。请检查 Obsidian 是否运行。"
        })
      } else {
        try {
          const args = safeJsonParse(tc.function.arguments)
          result = await tool.execute(args)
        } catch (err) {
          result = JSON.stringify({
            error: "tool_execution_failed",
            name: toolName,
            message: err instanceof Error ? err.message : String(err)
          })
        }
      }

      // 大结果驱逐
      result = await maybeEvictToolResult(result, tc.id, toolName)

      // 追加 tool 消息
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result
      })

      stepToolResults.push({
        toolCallId: tc.id,
        toolName,
        output: result
      })

      // 每个工具执行完 → 推送一次，前端据此把对应工具框从「执行中」切换为「已完成」
      if (onStepFinish) {
        await onStepFinish({
          text: response.text,
          reasoningContent: response.reasoningContent,
          toolCalls: stepToolCalls,
          toolResults: [...stepToolResults]
        })
      }
    }
  }

  // 达到显式步数上限时追加提示（maxSteps 为 Infinity 时不会走到这里）
  if (stepCount >= maxSteps && maxSteps !== Infinity) {
    const lastMsg = messages[messages.length - 1]
    const hasFinalText = lastMsg?.role === "assistant" && typeof lastMsg.content === "string" && lastMsg.content
    if (!hasFinalText) {
      messages.push({
        role: "assistant",
        content: `（已达到最大步数 ${maxSteps}，agent 终止。可继续补充提问或重新生成。）`
      })
    }
    if (onStepFinish) {
      await onStepFinish({ text: null })
    }
  }

  return messages
}

// ═══════════════ 工具函数 ═══════════════

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>
  } catch {
    return {}
  }
}