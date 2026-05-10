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
  const response = await fetcher(buildChatCompletionUrl(settings.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const data = await parseJson<OpenAiErrorResponse>(response)

    throw new LlmRequestError(
      data?.error?.message || `LLM request failed with status ${response.status}`,
      response.status
    )
  }

  return parseJson<OpenAiChatCompletionResponse>(response)
}

export type ChatCompletionTurnResult = {
  message: {
    role: "assistant"
    content: string | null
    tool_calls?: OpenAiToolCall[]
  }
  finishReason?: string
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
