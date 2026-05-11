import { tokenize } from "./tokenizer"
import { buildTermIndex, scoreDocument } from "./bm25"
import type { DailyMemoryEntry, ConversationInsight } from "./types"

type SearchDoc = {
  id: string
  tokens: string[]
}

type SearchResult = {
  date: string
  type: "daily_memory" | "insight"
  text: string
  score: number
}

const HALF_LIFE_DAYS = 14

function temporalDecay(createdAt: number): number {
  const ageDays = (Date.now() - createdAt) / (24 * 60 * 60 * 1000)
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
}

export function buildSearchIndex(
  memories: DailyMemoryEntry[],
  insights: ConversationInsight[]
): ReturnType<typeof buildTermIndex> {
  const docs: Array<{ id: string; tokens: string[] }> = []

  for (const m of memories) {
    const text = [m.summary, ...m.keywords].join(" ")
    docs.push({
      id: `mem_${m.date}`,
      tokens: tokenize(text)
    })
  }

  for (const ins of insights) {
    docs.push({
      id: `ins_${ins.id}`,
      tokens: tokenize(ins.content)
    })
  }

  return buildTermIndex(docs)
}

export function searchIndex(
  index: ReturnType<typeof buildTermIndex>,
  query: string,
  limit = 5,
  memories: DailyMemoryEntry[] = [],
  insights: ConversationInsight[] = []
): SearchResult[] {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []

  const memoryMap = new Map(memories.map((m) => [`mem_${m.date}`, m]))
  const insightMap = new Map(insights.map((i) => [`ins_${i.id}`, i]))

  const results: SearchResult[] = []

  for (const [docId] of index.docLengths) {
    const isMemory = docId.startsWith("mem_")
    const entry = isMemory
      ? memoryMap.get(docId)
      : insightMap.get(docId)

    if (!entry) continue

    const text = isMemory
      ? (entry as DailyMemoryEntry).summary
      : (entry as ConversationInsight).content

    const tokens = tokenize(text)
    const bm25Score = scoreDocument(docId, tokens, queryTokens, index)

    if (bm25Score <= 0) continue

    const createdAt = isMemory
      ? (entry as DailyMemoryEntry).createdAt
      : (entry as ConversationInsight).createdAt

    const decay = temporalDecay(createdAt)
    const finalScore = bm25Score * decay

    results.push({
      date: isMemory ? (entry as DailyMemoryEntry).date : new Date(createdAt).toISOString().slice(0, 10),
      type: isMemory ? "daily_memory" : "insight",
      text: text.slice(0, 300),
      score: finalScore
    })
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
