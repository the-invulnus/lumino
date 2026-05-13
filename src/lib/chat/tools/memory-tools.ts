import {
  loadAllDailyMemories,
  saveDailyMemory,
  appendManualNote
} from "../../memory/daily-memory"
import { readDailyMemoryMd, listDailyMemoryDates } from "../../memory/daily-memory-md"
import type { DailyMemoryEntry } from "../../memory/types"

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
  const memory = await readDailyMemoryMd(date)

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
      manualNotes: memory.manualNotes ?? [],
      status: memory.status ?? null,
      statusReason: memory.statusReason ?? null,
      lastModifiedBy: memory.lastModifiedBy ?? null,
      lastModifiedAt: memory.lastModifiedAt ?? null
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

  const allMemories = await loadAllDailyMemories()

  // 简单的文本匹配搜索
  const q = query.toLowerCase()
  const results = allMemories
    .map((m) => {
      let score = 0
      if (m.summary.toLowerCase().includes(q)) score += 3
      for (const kw of m.keywords) {
        if (kw.toLowerCase().includes(q)) score += 2
      }
      if (m.date.includes(q)) score += 1
      return { date: m.date, summary: m.summary, score }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return JSON.stringify(results, null, 2)
}

export async function handleMemoryAppendNote(
  date: string,
  note: string,
  source: string
): Promise<string> {
  const sensitive = checkSensitiveContent(note)
  if (sensitive) {
    return JSON.stringify({
      error: sensitive,
      message: "笔记包含敏感信息，已拒绝写入。"
    })
  }

  await appendManualNote(date, note, source as "agent" | "user")

  return JSON.stringify({
    success: true,
    date,
    message: `已追加笔记到 ${date}`
  })
}
