// ============================================================
// 三层记忆系统 — 所有类型定义
// ============================================================

// --- Layer 1: 原始浏览事件 ---

export type Layer1EventType =
  | "page_visit"
  | "input_focus"
  | "input_blur"
  | "input_type"
  | "tab_switch"
  | "page_scroll"
  | "idle"

export type PageMeta = {
  url: string
  title: string
  /** 域名，用于隐私过滤 */
  hostname: string
  /** 页面文本的前 3000 字符摘要 */
  textSnippet: string
}

export type InputMeta = {
  /** CSS 选择器（模糊） */
  selectorHint: string
  /** input / textarea / contenteditable */
  nodeType: string
  placeholder: string
  /** 当前输入框内已输入的全部文本 */
  text: string
  /** 仅当 type=page_scroll 时有意义 */
  scrollY?: number
}

export type Layer1Event = {
  id: string
  type: Layer1EventType
  /** Unix ms */
  timestamp: number
  tabId: number
  windowId: number
  /** 页面聚焦开始时间（用于计算停留时长） */
  sessionStartMs?: number
  /** 页面信息（type=page_visit|tab_switch|page_scroll|idle 时填充） */
  page?: PageMeta
  /** 输入信息（type=input_focus|input_blur|input_type 时填充） */
  input?: InputMeta
}

// --- Layer 2: 日记忆 ---

export type DailyMemoryEntry = {
  /** 日期 key，如 "2026-05-10" */
  date: string
  /** Unix ms 生成时间 */
  createdAt: number
  /** LLM 总结的自由文本 */
  summary: string
  /** LLM 提取的关键词列表 */
  keywords: string[]
  /** 引用的 Layer1 事件 ID 集合（用于追溯） */
  sourceEventIds: string[]
}

// --- 用户画像 ---

export type UserProfile = {
  /** 昵称 */
  name: string
  /** 偏好的语言 */
  language: string
  /** 关注领域（动态） */
  interests: string[]
  /** 常用工具/站点 */
  frequentSites: string[]
  /** 自定义补充信息 */
  notes: string
  /** 最后更新时间 */
  updatedAt: number
}

// --- 检索结果 ---

export type RetrievalResult = {
  /** 匹配的日记忆条目 */
  dailyMemories: DailyMemoryEntry[]
  /** 原始 Layer1 事件（回退层） */
  rawEvents: Layer1Event[]
}

// --- 补全上下文 ---

export type CompletionContext = {
  /** 用户画像 */
  profile: UserProfile
  /** 当前 Session 浏览上下文 */
  sessionContext: string
  /** 检索到的相关历史记忆 */
  relatedMemories: string
  /** 输入框描述 */
  inputDescription: string
}

// --- 活跃补全状态 ---

export type ActiveCompletion = {
  id: string
  /** 目标 tab id */
  tabId: number
  /** 输入框在当前 tab 中的标识 */
  inputId: string
  /** LLM 返回的补全文本 */
  completion: string
  /** 当前已输入的文本 */
  userText: string
  /** 过期时间戳 */
  expiresAt: number
}

// --- Chrome Storage keys ---

export const STORAGE_KEY_EVENTS = "lumino_layer1_events" as const
export const STORAGE_KEY_DAILY = "lumino_daily_memories" as const
export const STORAGE_KEY_PROFILE = "lumino_user_profile" as const
export const STORAGE_KEY_SESSION_START = "lumino_session_start" as const
export const STORAGE_KEY_DAILY_SCHEDULE = "lumino_daily_schedule" as const
export const STORAGE_KEY_COMPLETION_ENABLED = "lumino_completion_enabled" as const

// --- 消息类型 ---

/** Content Script → Background: 上报 Layer1 事件 */
export const L1_EVENT_MESSAGE = "lumino/l1-event" as const

/** Content Script → Background: 请求补全 */
export const REQUEST_COMPLETION_MESSAGE = "lumino/request-completion" as const

/** Background → Content Script: 返回补全结果 */
export const COMPLETION_RESULT_MESSAGE = "lumino/completion-result" as const

/** Content Script → Background: 报告补全接受 */
export const COMPLETION_ACCEPT_MESSAGE = "lumino/completion-accept" as const

/** Content Script → Background: 报告补全拒绝 */
export const COMPLETION_REJECT_MESSAGE = "lumino/completion-reject" as const

export type L1EventMessage = {
  type: typeof L1_EVENT_MESSAGE
  event: Layer1Event
}

export type RequestCompletionMessage = {
  type: typeof REQUEST_COMPLETION_MESSAGE
  payload: {
    tabId: number
    inputId: string
    userText: string
    inputMeta: InputMeta
    pageMeta: PageMeta
  }
}

export type CompletionResultMessage = {
  type: typeof COMPLETION_RESULT_MESSAGE
  payload: {
    id: string
    tabId: number
    inputId: string
    completion: string | null
    userText: string
  }
}

export type CompletionAcceptMessage = {
  type: typeof COMPLETION_ACCEPT_MESSAGE
  payload: {
    id: string
    inputId: string
    acceptedText: string
  }
}

export type CompletionRejectMessage = {
  type: typeof COMPLETION_REJECT_MESSAGE
  payload: {
    id: string
    inputId: string
  }
}
