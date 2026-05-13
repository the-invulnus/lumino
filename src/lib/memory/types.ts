// ============================================================
// Lumino 数据采集系统 — 类型定义
// ============================================================

// --- IDB 表：page_visits ---

export type PageVisitRecord = {
  id: string
  dateKey: string
  timestamp: number
  url: string
  title: string
  hostname: string
  markdownContent: string
  dwellMs: number
  rawDwellMs: number
  wasActive: boolean
}

// --- IDB 表：bookmark_changes ---

export type BookmarkChangeRecord = {
  id: string
  action: "added" | "removed" | "changed"
  timestamp: number
  dateKey: string
  bookmarkId: string
  title: string
  url?: string
  parentId?: string
  index?: number
}

// --- IDB 表：input_events ---

export type InputEventRecord = {
  id: string
  dateKey: string
  timestamp: number
  hostname: string
  nodeType: string
  text: string
  inputSource: "typing" | "paste"
  pastedLength?: number
}

// --- IDB 表：download_records ---

export type DownloadRecord = {
  id: string
  dateKey: string
  timestamp: number
  fileName: string
  url: string
  fileSize: number
  mime: string
}

// --- IDB 表：copy_records ---

export type CopyRecord = {
  id: string
  dateKey: string
  timestamp: number
  hostname: string
  text: string
}

// --- 用户画像（OPFS profile.md）---

export type UserProfile = {
  name: string
  language: string
  interests: string[]
  frequentSites: string[]
  notes: string
  updatedAt: number
}

// --- 日记忆（OPFS memory-YYYY-MM-DD.md）---

export type DailyMemoryEntry = {
  date: string
  createdAt: number
  summary: string
  keywords: string[]
  sourceEventIds: string[]
  manualNotes?: string[]
  status?: string
  statusReason?: string
  lastModifiedBy?: string
  lastModifiedAt?: number
}

// --- Chrome Storage keys ---

export const STORAGE_KEY_TAB_TIMERS = "lumino_tab_timers" as const
export const STORAGE_KEY_PROFILE = "lumino_user_profile" as const
export const STORAGE_KEY_COLLECTION_CONFIG = "lumino_collection_config" as const

// --- 消息类型 ---

export const TAB_OPEN_MESSAGE = "lumino/tab-open" as const
export const INPUT_EVENT_MESSAGE = "lumino/input-event" as const
export const COPY_EVENT_MESSAGE = "lumino/copy-event" as const

/** Background → Content Script: 请求采集当前页面 Markdown */
export const CAPTURE_PAGE_MESSAGE = "lumino/capture-page" as const

/** Content Script → Background: 返回页面 Markdown 采集结果 */
export const CAPTURE_PAGE_RESULT_MESSAGE = "lumino/capture-page-result" as const

export type TabOpenMessage = {
  type: typeof TAB_OPEN_MESSAGE
  payload: {
    url: string
    title: string
    hostname: string
  }
}

export type InputEventMessage = {
  type: typeof INPUT_EVENT_MESSAGE
  payload: {
    hostname: string
    nodeType: string
    text: string
    inputSource: "typing" | "paste"
    pastedLength?: number
  }
}

export type CopyEventMessage = {
  type: typeof COPY_EVENT_MESSAGE
  payload: {
    hostname: string
    text: string
  }
}

export type CapturePageMessage = {
  type: typeof CAPTURE_PAGE_MESSAGE
}

export type CapturePageResultMessage = {
  type: typeof CAPTURE_PAGE_RESULT_MESSAGE
  payload: {
    markdown: string
    title: string
    url: string
  }
}

// --- 采集配置 ---

export type CollectionConfig = {
  enablePageVisits: boolean
  enableInputEvents: boolean
  enableCopyRecords: boolean
  enableBookmarkChanges: boolean
  enableDownloadRecords: boolean
  minDwellMs: number
  dwellDecayStartMs: number
  dwellDecayRatio: number
  backgroundTabCoeff: number
  dwellCheckIntervalMs: number
  ignoredUrlPatterns: string[]
}

export const DEFAULT_COLLECTION_CONFIG: CollectionConfig = {
  enablePageVisits: true,
  enableInputEvents: true,
  enableCopyRecords: true,
  enableBookmarkChanges: true,
  enableDownloadRecords: true,
  minDwellMs: 5000,
  dwellDecayStartMs: 30 * 60 * 1000,
  dwellDecayRatio: 0.3,
  backgroundTabCoeff: 0.1,
  dwellCheckIntervalMs: 60_000,
  ignoredUrlPatterns: []
}
