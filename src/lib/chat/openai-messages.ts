/**
 * OpenAI Chat Completions 兼容的消息结构（用于 IndexedDB 持久化与 API 请求体）。
 * @see https://platform.openai.com/docs/api-reference/chat/create
 */

export type OpenAiToolCall = {
  id: string
  type: "function"
  function: {
    name: string
    /** JSON 字符串，由模型生成 */
    arguments: string
  }
}

/** 与 Chat Completions `messages` 数组元素对齐的可存储消息 */
export type OpenAiChatMessage =
  | {
      role: "system"
      content: string | null
      name?: string
    }
  | {
      role: "user"
      content: string | Array<{ type: "text"; text: string }>
      name?: string
    }
  | {
      role: "assistant"
      content: string | null
      /** 工具调用：与 API 响应中 assistant.message.tool_calls 一致 */
      tool_calls?: OpenAiToolCall[]
      refusal?: string | null
      name?: string
      /**
       * 推理内容（部分 OpenAI 兼容 API，如 DeepSeek-R1，在 message 上返回）。
       * 仅当模型实际返回时存在——存储与展示逻辑不依赖请求体的 thinking 配置，
       * 只根据此字段是否出现来决定是否渲染推理区块。
       */
      reasoning_content?: string
    }
  | {
      role: "tool"
      tool_call_id: string
      content: string | null
    }

export type OpenAiToolDefinition = {
  type: "function"
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export function cloneMessages(messages: OpenAiChatMessage[]): OpenAiChatMessage[] {
  return structuredClone(messages)
}
