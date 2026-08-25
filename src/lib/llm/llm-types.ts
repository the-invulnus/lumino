/**
 * Lumino LLM 模块 — 核心类型定义
 *
 * 设计原则：
 * - 所有类型对齐 OpenAI Chat Completions API 格式
 * - 不与 Lumino 上层应用逻辑耦合
 * - 支持流式/非流式、图片输入、LLM 参数配置
 */

import type { ZodType } from "zod"
import { zodToJsonSchema } from "./zod-to-json-schema"

// ═══════════════ LLM 配置 ═══════════════

/** 完整的 LLM 配置，继承现有 LlmSettings 并扩展 */
export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
  /** 最大输出 token 数（不传则由模型决定） */
  maxTokens?: number
  /** 温度（0-2，默认 1） */
  temperature?: number
  /** top_p 采样（0-1） */
  topP?: number
  /**
   * 模型思考 mode 的请求体附加字段（由 settings.resolveThinkingBody 产出）。
   * undefined 或空对象 = 不注入任何字段（等价 auto，跟随模型默认）。
   */
  thinkingBody?: Record<string, unknown>
  /** 额外的请求体字段（透传给 API，优先级最高） */
  extraBody?: Record<string, unknown>
}

/** 兼容别名：现有代码中使用的 LlmSettings */
export type LlmSettings = Pick<LlmConfig, "baseUrl" | "apiKey" | "model">

// ═══════════════ 消息类型 ═══════════════

/** 文本内容片段 */
export interface ContentPartText {
  type: "text"
  text: string
}

/** 图片内容片段（支持 URL、data URI、base64） */
export interface ContentPartImage {
  type: "image_url"
  image_url: {
    url: string
    detail?: "auto" | "low" | "high"
  }
}

/** 多模态内容片段 */
export type ContentPart = ContentPartText | ContentPartImage

/** 工具调用（OpenAI API 格式） */
export interface LlmToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string // JSON 字符串
  }
}

/** 对齐 OpenAI API 的消息格式 */
export type LlmMessage =
  | {
      role: "system"
      content: string | null
      name?: string
    }
  | {
      role: "user"
      content: string | ContentPart[]
      name?: string
    }
  | {
      role: "assistant"
      content: string | null
      tool_calls?: LlmToolCall[]
      name?: string
      /** 推理内容（snake_case 对齐 API 响应字段，透传到持久化层） */
      reasoning_content?: string
    }
  | {
      role: "tool"
      tool_call_id: string
      content: string | null
    }

// ═══════════════ 工具类型 ═══════════════

/** 工具定义（OpenAI API 格式 — 传给 /chat/completions 的 tools 参数） */
export interface LlmTool {
  type: "function"
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown> // JSON Schema
  }
}

/** 应用层工具定义（Zod schema + execute 函数）。不依赖 AI SDK */
export interface LuminoTool {
  /** 工具名称（必须与 toolRegistry 的 key 一致） */
  name: string
  /** 工具描述（传给 LLM） */
  description: string
  /** 输入参数的 Zod schema（用于校验和生成 JSON Schema） */
  inputSchema: ZodType
  /** 执行函数（传入已解析的参数，返回字符串结果） */
  execute: (args: Record<string, unknown>) => Promise<string>
}

// ═══════════════ API 响应类型 ═══════════════

/** 非流式单次调用返回 */
export interface LlmResponse {
  /** 模型文本输出（只有 tool_calls 时可能为 null） */
  text: string | null
  /** 工具调用列表（无工具调用时为 undefined） */
  toolCalls?: LlmToolCall[]
  /**
   * 推理内容（部分推理模型返回，如 DeepSeek-R1 的 message.reasoning_content）。
   * 仅当模型实际返回时存在，与请求体的 thinking 配置解耦。
   * 命名用驼峰符合本文件 TS 惯例；构造 LlmMessage 时映射回 snake_case 的 reasoning_content。
   */
  reasoningContent?: string
  /** 消耗的 token 数（可选，用于日志） */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/** 流式 chunk */
export interface LlmStreamChunk {
  /** 增量文本内容 */
  delta: string
  /** 流式 tool_calls 增量 */
  toolCallDeltas?: Array<{
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

// ═══════════════ 调用选项 ═══════════════

export interface ChatOptions {
  /** 自定义 fetch 实现（用于日志、拦截） */
  fetcher?: typeof fetch
  /** 中止信号 */
  signal?: AbortSignal
  /** 请求超时（毫秒），不传则无超时限制 */
  timeoutMs?: number
}

// ═══════════════ 工具函数 ═══════════════

/**
 * 将 LuminoTool[] 转换为 OpenAI tools 参数格式（LlmTool[]）。
 * 用于构建 /chat/completions 请求体中的 tools 字段。
 */
export function luminoToolsToOpenAi(tools: LuminoTool[]): LlmTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(t.inputSchema)
    }
  }))
}