/**
 * LlmClient — OpenAI 兼容的 LLM 调用客户端
 *
 * 提供非流式（chat）和流式（chatStream）两种调用模式。
 * 继承自 `src/lib/llm/openai.ts` 的流式/非流式逻辑，统一封装为类。
 */

import type {
  LlmConfig,
  LlmMessage,
  LlmTool,
  LlmToolCall,
  LlmResponse,
  LlmStreamChunk,
  ChatOptions
} from "./llm-types"

// ═══════════════ 错误类型 ═══════════════

export class LlmRequestError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "LlmRequestError"
    this.status = status
  }
}

// ═══════════════ 内部类型 ═══════════════

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string
    message?: {
      role?: string
      content?: string | null
      tool_calls?: LlmToolCall[]
      /** 推理内容（DeepSeek-R1 等 OpenAI 兼容 API 返回） */
      reasoning_content?: string
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

type OpenAiErrorResponse = {
  error?: {
    message?: string
  }
}

// ═══════════════ LlmClient ═══════════════

export class LlmClient {
  private config: LlmConfig

  constructor(config: LlmConfig) {
    this.config = config
  }

  // ── 公共 API ──

  /**
   * 非流式调用。传入 messages + tools，返回 text + toolCalls。
   */
  async chat(
    messages: LlmMessage[],
    tools?: LlmTool[],
    options?: ChatOptions
  ): Promise<LlmResponse> {
    const data = await this.postChatCompletion(messages, tools, options)
    const choice = data?.choices?.[0]
    const raw = choice?.message

    if (!raw || raw.role === undefined) {
      throw new LlmRequestError("LLM response did not include an assistant message")
    }

    return {
      text: raw.content ?? null,
      toolCalls: raw.tool_calls,
      reasoningContent: raw.reasoning_content,
      usage: data?.usage ? {
        promptTokens: data.usage.prompt_tokens ?? 0,
        completionTokens: data.usage.completion_tokens ?? 0,
        totalTokens: data.usage.total_tokens ?? 0
      } : undefined
    }
  }

  /**
   * 流式调用。通过 onChunk 回调逐 token 推送。
   * 返回完整的 LlmResponse（文本 + tool_calls）。
   */
  async chatStream(
    messages: LlmMessage[],
    tools: LlmTool[] | undefined,
    onChunk: (chunk: LlmStreamChunk) => void,
    options?: ChatOptions
  ): Promise<LlmResponse> {
    const fetcher = options?.fetcher ?? fetch
    const controller = options?.signal ? undefined : new AbortController()
    const signal = options?.signal ?? controller?.signal

    const timeoutMs = options?.timeoutMs ?? 120_000
    const timeoutId = setTimeout(() => {
      controller?.abort()
    }, timeoutMs)

    try {
      const response = await fetcher(this.buildUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(this.buildRequestBody(messages, tools, true)),
        signal
      })

      if (!response.ok) {
        const data = await this.parseJson<OpenAiErrorResponse>(response)
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
      let fullReasoning = ""
      const toolCallAccumulators = new Map<number, {
        id: string
        name: string
        arguments: string
      }>()
      let finishReason: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
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

            // 推理内容增量（DeepSeek-R1 等流式返回 delta.reasoning_content）
            const reasoningDelta: string = delta.reasoning_content || ""
            if (reasoningDelta) {
              fullReasoning += reasoningDelta
            }

            // tool_calls 增量
            const toolCallDeltas: LlmStreamChunk["toolCallDeltas"] = []
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

            onChunk({
              delta: textDelta,
              toolCallDeltas: toolCallDeltas.length > 0 ? toolCallDeltas : undefined,
              finishReason
            })
          } catch {
            // 跳过无法解析的行
          }
        }
      }

      // 构建完整的 tool_calls（从 accumulator 合并）
      const toolCalls: LlmToolCall[] = []
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
        text: fullContent || null,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        reasoningContent: fullReasoning || undefined
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // ── 私有方法 ──

  private buildUrl(): string {
    return `${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`
  }

  private buildRequestBody(
    messages: LlmMessage[],
    tools?: LlmTool[],
    stream?: boolean
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      stream: stream ?? false
    }

    if (tools && tools.length > 0) {
      body.tools = tools
      body.tool_choice = "auto"
    }

    if (this.config.maxTokens !== undefined) {
      body.max_tokens = this.config.maxTokens
    }
    if (this.config.temperature !== undefined) {
      body.temperature = this.config.temperature
    }
    if (this.config.topP !== undefined) {
      body.top_p = this.config.topP
    }
    // 模型思考 mode 附加字段（浅合并；空/undefined = 不注入，等价 auto）
    if (this.config.thinkingBody && Object.keys(this.config.thinkingBody).length > 0) {
      Object.assign(body, this.config.thinkingBody)
    }
    // extraBody 最后合并、优先级最高（保留现状语义）
    if (this.config.extraBody) {
      Object.assign(body, this.config.extraBody)
    }

    return body
  }

  private async postChatCompletion(
    messages: LlmMessage[],
    tools?: LlmTool[],
    options?: ChatOptions
  ): Promise<OpenAiChatCompletionResponse | undefined> {
    const fetcher = options?.fetcher ?? fetch
    const controller = options?.signal ? undefined : new AbortController()
    const signal = options?.signal ?? controller?.signal

    // 仅当显式传入 timeoutMs 时才设置超时，否则不限制
    const timeoutId =
      options?.timeoutMs != null
        ? setTimeout(() => controller?.abort(), options.timeoutMs)
        : undefined

    try {
      const response = await fetcher(this.buildUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(this.buildRequestBody(messages, tools)),
        signal
      })

      if (!response.ok) {
        // clone response 以便在 JSON 解析失败后还能读取原始文本
        const cloned = response.clone()
        const data = await this.parseJson<OpenAiErrorResponse>(response)
        const errorMessage = data?.error?.message
        if (errorMessage) {
          throw new LlmRequestError(
            `LLM request failed with status ${response.status}: ${errorMessage}`,
            response.status
          )
        }
        // parseJson 失败或响应体不是标准 OpenAI 错误格式时，从克隆副本读取原始文本
        const rawText = await this.readResponseText(cloned)
        throw new LlmRequestError(
          rawText || `LLM request failed with status ${response.status}`,
          response.status
        )
      }

      return this.parseJson<OpenAiChatCompletionResponse>(response)
    } finally {
      if (timeoutId != null) clearTimeout(timeoutId)
    }
  }

  private async parseJson<T>(response: Response): Promise<T | undefined> {
    try {
      return (await response.json()) as T
    } catch {
      return undefined
    }
  }

  private async readResponseText(response: Response): Promise<string> {
    try {
      return await response.text()
    } catch {
      return ""
    }
  }
}