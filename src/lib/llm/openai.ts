import type { OpenAiChatMessage, OpenAiToolCall, OpenAiToolDefinition } from "../chat/openai-messages"
import type { ChatMessage, ChatCompletionOptions, LlmSettings } from "./types"

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string
    message?: {
      role?: string
      content?: string | null
      tool_calls?: OpenAiToolCall[]
    }
  }>
}

type OpenAiErrorResponse = {
  error?: {
    message?: string
  }
}

export class LlmRequestError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "LlmRequestError"
    this.status = status
  }
}

function buildChatCompletionUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`
}

async function parseJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T
  } catch {
    return undefined
  }
}

type ChatCompletionRequestBody = {
  model: string
  messages: OpenAiChatMessage[]
  tools?: OpenAiToolDefinition[]
  tool_choice?: "auto" | "none" | "required"
}

async function postChatCompletion(
  settings: LlmSettings,
  body: ChatCompletionRequestBody,
  options: ChatCompletionOptions
) {
  const fetcher = options.fetcher ?? fetch
  const controller = options.signal ? undefined : new AbortController()
  const signal = options.signal ?? controller?.signal

  // 默认 120 秒超时
  const timeoutMs = options.timeoutMs ?? 120_000
  const timeoutId = setTimeout(() => {
    controller?.abort()
  }, timeoutMs)

  try {
    const response = await fetcher(buildChatCompletionUrl(settings.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(body),
      signal
    })

  if (!response.ok) {
    const data = await parseJson<OpenAiErrorResponse>(response)

    throw new LlmRequestError(
      data?.error?.message || `LLM request failed with status ${response.status}`,
      response.status
    )
  }

    return parseJson<OpenAiChatCompletionResponse>(response)
  } finally {
    clearTimeout(timeoutId)
  }
}

export type ChatCompletionTurnResult = {
  message: {
    role: "assistant"
    content: string | null
    tool_calls?: OpenAiToolCall[]
  }
  finishReason?: string
}


// ═══════════════ 流式响应 ═══════════════

export type StreamChunk = {
  /** 增量文本内容（delta），可能为空字符串 */
  delta: string
  /** 本次流式片段中的 tool_calls 增量 */
  tool_call_deltas?: Array<{
    index: number
    id?: string
    function?: {
      name?: string
      arguments?: string
    }
  }>
  /** 流结束时的 finish_reason */
  finishReason?: string | null
}

export type StreamResult = {
  /** 完整拼接后的文本内容 */
  content: string | null
  /** 完整拼接后的 tool_calls（已去重合并） */
  tool_calls?: OpenAiToolCall[]
  finishReason?: string
}

/**
 * 流式请求 chat/completions，通过 onChunk 回调逐 token 推送。
 * 返回完整的 StreamResult（文本 + tool_calls）。
 */
export async function requestChatCompletionStream(
  settings: LlmSettings,
  input: {
    messages: OpenAiChatMessage[]
    tools?: OpenAiToolDefinition[]
    toolChoice?: "auto" | "none" | "required"
  },
  onChunk: (chunk: StreamChunk) => void,
  options: ChatCompletionOptions = {}
): Promise<StreamResult> {
  const fetcher = options.fetcher ?? fetch
  const controller = options.signal ? undefined : new AbortController()
  const signal = options.signal ?? controller?.signal

  const timeoutMs = options.timeoutMs ?? 120_000
  const timeoutId = setTimeout(() => {
    controller?.abort()
  }, timeoutMs)

  try {
    const response = await fetcher(buildChatCompletionUrl(settings.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: input.messages,
        tools: input.tools,
        tool_choice: input.toolChoice ?? (input.tools?.length ? "auto" : undefined),
        stream: true,
        stream_options: { include_usage: false }
      }),
      signal
    })

    if (!response.ok) {
      const data = await parseJson<OpenAiErrorResponse>(response)
      throw new LlmRequestError(
        data?.error?.message || `LLM stream request failed with status ${response.status}`,
        response.status
      )
    }

    if (!response.body) {
      throw new LlmRequestError("Response body is null (streaming not supported)")
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    let fullContent = ""
    const toolCallAccumulators: Map<number, {
      id: string
      name: string
      arguments: string
    }> = new Map()
    let finishReason: string | null = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      // 最后一个可能不完整，保留
      buffer = lines.pop() || ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith("data:")) continue

        const data = trimmed.slice(5).trim()
        if (data === "[DONE]") continue

        try {
          const parsed = JSON.parse(data)
          const choice = parsed.choices?.[0]
          if (!choice) continue

          const delta = choice.delta
          finishReason = choice.finish_reason || finishReason

          if (!delta) continue

          // 文本增量
          const textDelta: string = delta.content || ""
          if (textDelta) {
            fullContent += textDelta
          }

          // tool_calls 增量
          const toolCallDeltas: StreamChunk["tool_call_deltas"] = []
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0

              if (!toolCallAccumulators.has(idx)) {
                toolCallAccumulators.set(idx, {
                  id: tc.id || "",
                  name: "",
                  arguments: ""
                })
              }

              const acc = toolCallAccumulators.get(idx)!
              if (tc.id) acc.id = tc.id
              if (tc.function?.name) acc.name += tc.function.name
              if (tc.function?.arguments) acc.arguments += tc.function.arguments

              toolCallDeltas.push({
                index: idx,
                id: tc.id,
                function: tc.function ? {
                  name: tc.function.name,
                  arguments: tc.function.arguments
                } : undefined
              })
            }
          }

          // 回调
          onChunk({
            delta: textDelta,
            tool_call_deltas: toolCallDeltas.length > 0 ? toolCallDeltas : undefined,
            finishReason
          })

        } catch {
          // 跳过无法解析的行
        }
      }
    }

    // 构建完整的 tool_calls（从 accumulator 合并）
    const toolCalls: OpenAiToolCall[] = []
    for (const [, acc] of toolCallAccumulators) {
      if (acc.name || acc.arguments) {
        toolCalls.push({
          id: acc.id || `call_${Date.now()}`,
          type: "function",
          function: {
            name: acc.name,
            arguments: acc.arguments
          }
        })
      }
    }

    return {
      content: fullContent || null,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: finishReason || undefined
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function requestChatCompletionTurn(
  settings: LlmSettings,
  input: {
    messages: OpenAiChatMessage[]
    tools?: OpenAiToolDefinition[]
    toolChoice?: ChatCompletionRequestBody["tool_choice"]
  },
  options: ChatCompletionOptions = {}
): Promise<ChatCompletionTurnResult> {
  const data = await postChatCompletion(
    settings,
    {
      model: settings.model,
      messages: input.messages,
      tools: input.tools,
      tool_choice: input.toolChoice ?? (input.tools?.length ? "auto" : undefined)
    },
    options
  )

  const choice = data?.choices?.[0]
  const raw = choice?.message

  if (!raw || raw.role === undefined) {
    throw new LlmRequestError("LLM response did not include an assistant message")
  }

  return {
    message: {
      role: "assistant",
      content: raw.content ?? null,
      tool_calls: raw.tool_calls
    },
    finishReason: choice?.finish_reason
  }
}

function chatMessagesToOpenAi(messages: ChatMessage[]): OpenAiChatMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content
  }))
}

export async function requestChatCompletion(
  settings: LlmSettings,
  messages: ChatMessage[],
  options: ChatCompletionOptions = {}
) {
  const data = await postChatCompletion(
    settings,
    {
      model: settings.model,
      messages: chatMessagesToOpenAi(messages)
    },
    options
  )

  const content = data?.choices?.[0]?.message?.content

  if (!content) {
    throw new LlmRequestError("LLM response did not include an answer")
  }

  return content
}
