export type LlmSettings = {
  baseUrl: string
  apiKey: string
  model: string
}

export type ChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type Fetcher = typeof fetch

export type ChatCompletionOptions = {
  fetcher?: Fetcher
}
