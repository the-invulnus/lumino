// ============================================================
// Layer 2 日记忆 — LLM 将采集数据总结为日记忆
// ============================================================

import { requestChatCompletion } from "../llm/openai"
import type { LlmSettings } from "../llm/types"
import { getLlmSettings, hasCompleteLlmSettings } from "../settings"
import type { DailyMemoryEntry, PageVisitRecord, InputEventRecord, CopyRecord } from "./types"
import { getPageVisitsByDateKey } from "./page-visit-idb"
import { getInputEventsByDateKey } from "./input-event-idb"
import { getCopyRecordsByDateKey } from "./copy-record-idb"
import { getBookmarkChangesByDateKey } from "./memory-idb"
import {
  writeDailyMemoryMd,
  readDailyMemoryMd,
  listDailyMemoryDates,
  deleteDailyMemoryMd
} from "./daily-memory-md"

export { listDailyMemoryDates, readDailyMemoryMd, deleteDailyMemoryMd }

/**
 * 加载日记忆条目（从 OPFS MD 文件）。
 */
export async function loadDailyMemoryEntry(
  date: string
): Promise<DailyMemoryEntry | null> {
  return readDailyMemoryMd(date)
}

/**
 * 加载所有日记忆条目。
 */
export async function loadAllDailyMemories(): Promise<DailyMemoryEntry[]> {
  const dates = await listDailyMemoryDates()
  const entries: DailyMemoryEntry[] = []

  for (const date of dates) {
    const entry = await readDailyMemoryMd(date)
    if (entry) entries.push(entry)
  }

  return entries
}

/**
 * 保存日记忆条目（写入 OPFS MD 文件）。
 */
export async function saveDailyMemory(entry: DailyMemoryEntry): Promise<void> {
  await writeDailyMemoryMd(entry)
}

/**
 * 将采集数据格式化为 LLM prompt 可用的文本。
 */
function formatDataForLLM(
  pageVisits: PageVisitRecord[],
  inputEvents: InputEventRecord[],
  bookmarks: unknown[],
  copyRecords: CopyRecord[]
): string {
  const lines: string[] = []

  if (pageVisits.length > 0) {
    lines.push("## 浏览的页面")
    for (const pv of pageVisits) {
      const duration = formatDuration(pv.dwellMs)
      lines.push(`- ${pv.title} — ${pv.url}（停留 ${duration}）`)
    }
  }

  if (inputEvents.length > 0) {
    lines.push("\n## 输入交互")
    for (const ie of inputEvents.slice(0, 20)) {
      const text = ie.text ? `"${ie.text.slice(0, 80)}"` : ""
      lines.push(
        `- [${ie.inputSource}] ${ie.nodeType} ${text}`
      )
    }
  }

  if (bookmarks.length > 0) {
    lines.push("\n## 书签操作")
    for (const bm of bookmarks as Array<{ action: string; title: string }>) {
      lines.push(`- ${bm.action}: ${bm.title}`)
    }
  }

  if (copyRecords.length > 0) {
    lines.push("\n## 复制内容")
    for (const cr of copyRecords) {
      lines.push(`- [${cr.hostname}] "${cr.text.slice(0, 120)}"`)
    }
  }

  if (lines.length === 0) {
    return "（今日无采集数据）"
  }

  return lines.join("\n")
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}秒`
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.round(minutes / 60)
  return `${hours}小时${minutes % 60}分钟`
}

/**
 * 调用 LLM 生成日记忆。
 */
export async function generateDailyMemory(
  date: string,
  settings?: LlmSettings
): Promise<DailyMemoryEntry> {
  // 从各 IDB 表获取当天数据
  const [pageVisits, inputEvents, bookmarks, copyRecords] = await Promise.all([
    getPageVisitsByDateKey(date),
    getInputEventsByDateKey(date),
    getBookmarkChangesByDateKey(date),
    getCopyRecordsByDateKey(date)
  ])

  const totalEvents =
    pageVisits.length + inputEvents.length + bookmarks.length + copyRecords.length

  if (totalEvents === 0) {
    return {
      date,
      createdAt: Date.now(),
      summary: "今日没有浏览活动。",
      keywords: [],
      sourceEventIds: []
    }
  }

  const llmSettings = settings ?? (await getLlmSettings())

  if (!hasCompleteLlmSettings(llmSettings)) {
    const pagesList = pageVisits.map((pv) => pv.title).filter(Boolean)
    const topics = [...new Set(pagesList)].slice(0, 5)

    return {
      date,
      createdAt: Date.now(),
      summary: `今日浏览了 ${pageVisits.length} 个页面，进行了 ${inputEvents.length} 次输入交互。${topics.length > 0 ? `主要关注：${topics.join("、")}` : ""}`,
      keywords: topics,
      sourceEventIds: [
        ...pageVisits.map((p) => p.id),
        ...inputEvents.map((i) => i.id)
      ]
    }
  }

  try {
    const formatted = formatDataForLLM(pageVisits, inputEvents, bookmarks, copyRecords)

    const systemPrompt = `你是一个浏览行为分析助手。根据用户一天的浏览记录，生成一份简洁的日记忆摘要。

要求：
1. 用 3-5 句话总结今天用户关注的主题和活动
2. 提取 3-8 个关键词（中文或英文）
3. 如果有明显的需求或任务，标注出来

输出格式必须是 JSON：
{
  "summary": "...",
  "keywords": ["kw1", "kw2", ...]
}`

    const messages: Array<{
      role: "system" | "user" | "assistant"
      content: string
    }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `日期：${date}\n\n采集数据：\n${formatted}` }
    ]

    const response = await requestChatCompletion(llmSettings, messages)

    let parsed: { summary?: string; keywords?: string[] } = {}
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]) as {
          summary?: string
          keywords?: string[]
        }
      }
    } catch {
      // 解析失败，使用原始响应作为摘要
    }

    return {
      date,
      createdAt: Date.now(),
      summary: parsed.summary ?? response.slice(0, 500),
      keywords: parsed.keywords ?? [],
      sourceEventIds: [
        ...pageVisits.map((p) => p.id),
        ...inputEvents.map((i) => i.id)
      ]
    }
  } catch (error) {
    return {
      date,
      createdAt: Date.now(),
      summary: `今日共记录 ${totalEvents} 个事件。（LLM 摘要生成失败：${error instanceof Error ? error.message : "未知错误"}）`,
      keywords: [],
      sourceEventIds: []
    }
  }
}

/**
 * 生成并保存今日日记忆。
 */
export async function generateAndSaveDailyMemory(
  date?: string
): Promise<DailyMemoryEntry | null> {
  const today = date ?? new Date().toISOString().slice(0, 10)

  try {
    const entry = await generateDailyMemory(today)
    await saveDailyMemory(entry)
    return entry
  } catch (error) {
    console.error("[Lumino] 日记忆生成失败", error)
    return null
  }
}

/**
 * 追加手动笔记到指定日期的日记忆。
 */
export async function appendManualNote(
  date: string,
  note: string,
  source: "agent" | "user" = "agent"
): Promise<void> {
  const existing = await readDailyMemoryMd(date)

  const entry: DailyMemoryEntry = existing ?? {
    date,
    createdAt: Date.now(),
    summary: "",
    keywords: [],
    sourceEventIds: [],
    manualNotes: [note],
    lastModifiedBy: source,
    lastModifiedAt: Date.now()
  }

  if (existing) {
    if (!entry.manualNotes) entry.manualNotes = []
    entry.manualNotes.push(note)
    entry.lastModifiedBy = source
    entry.lastModifiedAt = Date.now()
  }

  await saveDailyMemory(entry)
}

/**
 * 标记某天记忆的状态。
 */
export async function markMemoryStatus(
  date: string,
  status: string,
  reason: string
): Promise<void> {
  const existing = await readDailyMemoryMd(date)
  if (!existing) return

  existing.status = status
  existing.statusReason = reason
  existing.lastModifiedBy = "agent"
  existing.lastModifiedAt = Date.now()

  await saveDailyMemory(existing)
}
