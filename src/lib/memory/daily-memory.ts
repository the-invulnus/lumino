// ============================================================
// Layer 2 日记忆 — LLM 将 Layer1 事件总结为日记忆
// ============================================================

import { requestChatCompletion } from "../llm/openai"
import type { LlmSettings } from "../llm/types"
import { getLlmSettings, hasCompleteLlmSettings } from "../settings"
import { getEventsByDate } from "./event-store"
import type { DailyMemoryEntry, Layer1Event } from "./types"
import {
  loadAllDailyMemories,
  saveDailyMemory as idbSaveDailyMemory
} from "./memory-idb"
import { writeMemoryFile } from "../fs/opfs"

export { loadAllDailyMemories as loadDailyMemories } from "./memory-idb"

/**
 * 保存日记忆条目（IndexedDB + OPFS）。
 */
export async function saveDailyMemory(entry: DailyMemoryEntry): Promise<void> {
  await idbSaveDailyMemory(entry)

  try {
    const md = dailyMemoryToMarkdown(entry)
    await writeMemoryFile(`${entry.date}.md`, md)
  } catch (error) {
    console.warn("[Lumino] OPFS 记忆文件写入失败", error)
  }
}

function dailyMemoryToMarkdown(entry: DailyMemoryEntry): string {
  const lines: string[] = [
    `# 日记忆 — ${entry.date}`,
    "",
    `生成时间：${new Date(entry.createdAt).toISOString()}`,
    "",
    "## 摘要",
    "",
    entry.summary,
    ""
  ]

  if (entry.keywords.length > 0) {
    lines.push("## 关键词")
    lines.push("")
    lines.push(entry.keywords.map((k) => `- ${k}`).join("\n"))
    lines.push("")
  }

  if (entry.manualNotes && entry.manualNotes.length > 0) {
    lines.push("## 手动笔记")
    lines.push("")
    for (const note of entry.manualNotes) {
      lines.push(`- ${note}`)
    }
    lines.push("")
  }

  if (entry.status) {
    lines.push(`## 状态：${entry.status}`)
    if (entry.statusReason) lines.push(`原因：${entry.statusReason}`)
    lines.push("")
  }

  return lines.join("\n")
}

/**
 * 将 Layer1 事件格式化为 LLM prompt 可用的文本。
 */
function formatEventsForLLM(events: Layer1Event[]): string {
  if (events.length === 0) {
    return "（今日无浏览事件）"
  }

  const pageVisits = events.filter((e) => e.type === "page_visit" && e.page)
  const inputEvents = events.filter(
    (e) => (e.type === "input_focus" || e.type === "input_type") && e.input
  )

  const lines: string[] = []

  if (pageVisits.length > 0) {
    lines.push("## 访问的页面")

    const urlCount = new Map<string, number>()
    const urlTitle = new Map<string, string>()

    for (const event of pageVisits) {
      const url = event.page!.url
      urlCount.set(url, (urlCount.get(url) ?? 0) + 1)
      if (!urlTitle.has(url)) {
        urlTitle.set(url, event.page!.title)
      }
    }

    for (const [url, count] of urlCount) {
      const title = urlTitle.get(url) ?? ""
      const suffix = count > 1 ? `（访问 ${count} 次）` : ""
      lines.push(`- ${title} — ${url} ${suffix}`)
    }
  }

  if (inputEvents.length > 0) {
    lines.push("\n## 输入交互")
    for (const event of inputEvents.slice(0, 20)) {
      const input = event.input!
      const text = input.text
        ? `"${input.text.slice(0, 80)}"`
        : "（聚焦/离开）"
      lines.push(
        `- [${event.type}] ${input.nodeType} ${input.placeholder ? `placeholder="${input.placeholder}"` : ""} ${text}`
      )
    }
  }

  return lines.join("\n")
}

/**
 * 调用 LLM 生成日记忆。
 */
export async function generateDailyMemory(
  date: string,
  settings?: LlmSettings
): Promise<DailyMemoryEntry> {
  const events = await getEventsByDate(date)

  if (events.length === 0) {
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
    const pageCount = events.filter((e) => e.type === "page_visit").length
    const inputCount = events.filter(
      (e) => e.type === "input_focus" || e.type === "input_type"
    ).length

    return {
      date,
      createdAt: Date.now(),
      summary: `今日浏览了 ${pageCount} 个页面，进行了 ${inputCount} 次输入交互。`,
      keywords: [],
      sourceEventIds: events.map((e) => e.id)
    }
  }

  try {
    const formatted = formatEventsForLLM(events)
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
      {
        role: "user",
        content: `日期：${date}\n\n浏览记录：\n${formatted}`
      }
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
      sourceEventIds: events.map((e) => e.id)
    }
  } catch (error) {
    return {
      date,
      createdAt: Date.now(),
      summary: `今日共记录 ${events.length} 个浏览事件。（LLM 摘要生成失败：${error instanceof Error ? error.message : "未知错误"}）`,
      keywords: [],
      sourceEventIds: events.map((e) => e.id)
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
