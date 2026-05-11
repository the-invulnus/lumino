import { loadDailyMemories } from "../../memory/daily-memory"
import { saveDailyMemory } from "../../memory/memory-idb"
import { loadAllInsights, saveInsight } from "../../memory/memory-idb"
import {
  buildSearchIndex,
  searchIndex
} from "../../memory/search-index"
import type { DailyMemoryEntry, ConversationInsight } from "../../memory/types"

const SENSITIVE_PATTERNS = [
  /\b\d{6}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/,
  /\b\d{16,19}\b/,
  /\b\d{3,4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4,8}\b/,
  /password\s*[:=]\s*\S/i,
  /passwd\s*[:=]\s*\S/i,
  /secret\s*[:=]\s*\S/i
]

function checkSensitiveContent(text: string): string | null {
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(text)) {
      return "sensitive_content_detected"
    }
  }
  return null
}

export async function handleMemoryGet(
  args: Record<string, unknown>
): Promise<string> {
  const date = (args.date as string) || new Date().toISOString().slice(0, 10)
  const allMemories = await loadDailyMemories()
  const memory = allMemories.find((m) => m.date === date)

  if (!memory) {
    return JSON.stringify({
      date,
      found: false,
      message: `未找到 ${date} 的记忆。`
    })
  }

  return JSON.stringify(
    {
      date: memory.date,
      summary: memory.summary,
      keywords: memory.keywords,
      manualNotes: (memory as DailyMemoryEntry & { manualNotes?: string[] }).manualNotes ?? [],
      status: (memory as DailyMemoryEntry & { status?: string }).status ?? null,
      statusReason: (memory as DailyMemoryEntry & { statusReason?: string }).statusReason ?? null,
      lastModifiedBy: (memory as DailyMemoryEntry & { lastModifiedBy?: string }).lastModifiedBy ?? null,
      lastModifiedAt: (memory as DailyMemoryEntry & { lastModifiedAt?: number }).lastModifiedAt ?? null
    },
    null,
    2
  )
}

export async function handleMemorySearch(
  args: Record<string, unknown>
): Promise<string> {
  const query = (args.query as string) || ""
  const limit = (args.limit as number) || 5

  if (!query.trim()) {
    return JSON.stringify({ results: [], message: "查询词为空。" })
  }

  const allMemories = await loadDailyMemories()
  const allInsights = await loadAllInsights()

  const index = buildSearchIndex(allMemories, allInsights)
  const results = searchIndex(index, query, limit)

  return JSON.stringify(
    results.map((r) => ({
      date: r.date,
      type: r.type,
      text: r.text,
      score: Math.round(r.score * 100) / 100
    })),
    null,
    2
  )
}

export async function handleMemoryAppendNote(
  date: string,
  note: string,
  source: string
): Promise<string> {
  const sensitive = checkSensitiveContent(note)
  if (sensitive) {
    return JSON.stringify({ error: sensitive, message: "笔记包含敏感信息，已拒绝写入。" })
  }

  const allMemories = await loadDailyMemories()
  let memory = allMemories.find((m) => m.date === date)

  if (!memory) {
    memory = {
      date,
      createdAt: Date.now(),
      summary: "",
      keywords: [],
      sourceEventIds: []
    }
  }

  const extended = memory as DailyMemoryEntry & {
    manualNotes?: string[]
    lastModifiedBy?: string
    lastModifiedAt?: number
  }

  if (!extended.manualNotes) {
    extended.manualNotes = []
  }
  extended.manualNotes.push(note)
  extended.lastModifiedBy = source
  extended.lastModifiedAt = Date.now()

  await saveDailyMemory(memory)

  return JSON.stringify({
    success: true,
    date,
    message: `已追加笔记到 ${date}`
  })
}

export async function handleSaveInsight(
  insight: Omit<ConversationInsight, "id">
): Promise<string> {
  const contentText = insight.content
  const sensitive = checkSensitiveContent(contentText)
  if (sensitive) {
    return JSON.stringify({ error: sensitive, message: "洞察包含敏感信息，已拒绝写入。" })
  }

  const id = `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const full: ConversationInsight = { ...insight, id }

  await saveInsight(full)

  return JSON.stringify({
    success: true,
    id,
    message: "洞察已保存。"
  })
}
