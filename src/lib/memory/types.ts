// ============================================================
// 三层记忆系统 — 所有类型定义
// ============================================================

// --- Layer 1: 原始浏览事件 ---

export type Layer1EventType =
  | "page_visit"
  | "page_dwell_end"
  | "page_click"
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
  /** 输入来源 */
  inputSource?: "typing" | "paste"
  /** 粘贴内容的长度 */
  pastedLength?: number
}

export type ScrollMeta = {
  /** 当前滚动位置占页面总高度的百分比 0-100 */
  scrollDepth: number
}

export type ClickMeta = {
  /** 被点击元素类型 */
  elementType: "link" | "button" | "search" | "navigation" | "other"
  /** 链接/按钮文字，截断到 200 字符 */
  label: string
  /** 如果是链接，目标 href */
  href?: string
}

export type Layer1Event = {
  id: string
  type: Layer1EventType
  /** Unix ms */
  timestamp: number
  /** 日期 key，如 "2026-05-12"，方便按天查询 */
  dateKey: string
  tabId: number
  windowId: number
  /** 页面聚焦开始时间（用于计算停留时长） */
  sessionStartMs?: number
  /** 页面信息（type=page_visit|tab_switch|page_scroll|idle 时填充） */
  page?: PageMeta
  /** 输入信息（type=input_focus|input_blur|input_type 时填充） */
  input?: InputMeta
  /** 滚动信息（type=page_scroll 时填充） */
  scroll?: ScrollMeta
  /** 点击信息（type=page_click 时填充） */
  click?: ClickMeta
  /** 停留时长（毫秒），type=page_dwell_end 时填充 */
  dwellMs?: number
  /** dwell 结算状态：pending 待确认 / confirmed 超过阈值 / settled 已关闭最终结算 / discarded 丢弃 */
  dwellStatus?: "pending" | "confirmed" | "settled" | "discarded"
}

// --- 书签变更事件 ---

export type BookmarkChangeEvent = {
  id: string
  /** "added" | "removed" | "changed" */
  action: "added" | "removed" | "changed"
  timestamp: number
  dateKey: string
  bookmarkId: string
  title: string
  url?: string
  parentId?: string
  index?: number
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
  /** Agent 手动追加的笔记 */
  manualNotes?: string[]
  /** 记忆状态：ok / needs_review / dismissed */
  status?: string
  /** 状态原因说明 */
  statusReason?: string
  /** 最后修改者 */
  lastModifiedBy?: string
  /** 最后修改时间 */
  lastModifiedAt?: number
}

// --- 对话洞察 ---

export type ConversationInsight = {
  id: string
  /** 创建时间 */
  createdAt: number
  /** 分类（如 personal_note, todo, decision, fact） */
  category: string
  /** 洞察内容 */
  content: string
  /** 来源对话 thread id */
  sourceThreadId?: string
  /** 过期时间（可选，用于待办类） */
  expiresAt?: number
}

// --- 手动笔记 ---

export type ManualNote = {
  date: string
  content: string
  createdAt: number
  source: "agent" | "user"
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
export const STORAGE_KEY_COLLECTION_CONFIG = "lumino_collection_config" as const

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

// --- 采集配置 ---

export type CollectionConfig = {
  /** 最小有效浏览时长（毫秒），默认 5000 = 5 秒 */
  minDwellMs: number
  /** 超过此时间开始衰减（毫秒），默认 1800000 = 30 分钟 */
  dwellDecayStartMs: number
  /** 衰减比例（超过衰减起点的部分乘以此系数），默认 0.3 */
  dwellDecayRatio: number
  /** 后台 tab 停留系数（从未 active 过的 tab），默认 0.1 */
  backgroundTabCoeff: number
  /** 页面内容摘要最大字符数 */
  maxTextSnippetChars: number
  /** scroll 事件最小间隔（毫秒） */
  scrollThrottleMs: number
  /** 定时巡检间隔（毫秒），默认 60000 = 1 分钟 */
  dwellCheckIntervalMs: number
}

export const DEFAULT_COLLECTION_CONFIG: CollectionConfig = {
  minDwellMs: 5000,
  dwellDecayStartMs: 30 * 60 * 1000,
  dwellDecayRatio: 0.3,
  backgroundTabCoeff: 0.1,
  maxTextSnippetChars: 3000,
  scrollThrottleMs: 5000,
  dwellCheckIntervalMs: 60_000
}
