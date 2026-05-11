// ============================================================
// Layer 3 检索器 — BM25 记忆搜索 + temporal decay
// ============================================================

import { loadDailyMemories } from "./daily-memory"
import { loadAllInsights } from "./memory-idb"
import { getRecentEvents } from "./event-store"
import { tokenize } from "./tokenizer"
import { buildTermIndex, scoreDocument } from "./bm25"
import type { DailyMemoryEntry, Layer1Event, RetrievalResult } from "./types"

const HALF_LIFE_DAYS = 14
const MAX_KEYWORDS = 30

/**
 * 将当前 session 上下文转为关键词列表。
 */
export function extractContextKeywords(
  recentEvents: Layer1Event[]
): string[] {
  const keywords = new Set<string>()

  for (const event of recentEvents) {
    if (event.page) {
      const title = event.page.title
      const words = title
        .split(/[\s\-–—|·,.，。、：:；;！!？?()（）【】\[\]{}<>《》"「」『』\s]+/)
        .filter((w) => w.length >= 2 && w.length <= 15)

      for (const word of words) {
        keywords.add(word)
      }

      const hostname = event.page.hostname
      const domainParts = hostname.split(".")
      for (const part of domainParts) {
        if (part.length >= 3 && part !== "www" && part !== "com" && part !== "org") {
          keywords.add(part)
        }
      }
    }

    if (event.input && event.input.text) {
      const text = event.input.text
      const words = text
        .split(/[\s\-–—|·,.，。、：:；;！!？?()（）【】\[\]{}<>《》"「」『』\s]+/)
        .filter((w) => w.length >= 2 && w.length <= 15)

      for (const word of words) {
        keywords.add(word)
      }
    }
  }

  return Array.from(keywords).slice(0, MAX_KEYWORDS)
}

function temporalDecay(createdAt: number): number {
  const ageDays = (Date.now() - createdAt) / (24 * 60 * 60 * 1000)
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
}

/**
 * 使用 BM25 检索与当前上下文相关的日记忆和原始事件。
 *
 * 检索策略（BM25 + temporal decay）：
 * 1. 从当前 session 事件提取关键词
 * 2. 用 BM25 在所有日记忆中评分
 * 3. 应用 temporal decay（14 天半衰期）
 * 4. 返回 top-5
 * 5. 回退层：同时返回最近 10 条原始事件
 */
export async function retrieveContext(
  recentEvents?: Layer1Event[]
): Promise<RetrievalResult> {
  const events = recentEvents ?? (await getRecentEvents(50))
  const keywords = extractContextKeywords(events)
  const allMemories = await loadDailyMemories()
  const allInsights = await loadAllInsights()

  if (keywords.length === 0) {
    return {
      dailyMemories: allMemories.slice(0, 3),
      rawEvents: events.slice(0, 10)
    }
  }

  const queryText = keywords.join(" ")
  const queryTokens = tokenize(queryText)

  if (queryTokens.length === 0) {
    return {
      dailyMemories: allMemories.slice(0, 3),
      rawEvents: events.slice(0, 10)
    }
  }

  const docs = allMemories.map((m) => ({
    id: `mem_${m.date}`,
    tokens: tokenize([m.summary, ...m.keywords].join(" "))
  }))

  const index = buildTermIndex(docs)

  const scored = allMemories.map((entry) => {
    const docId = `mem_${entry.date}`
    const docTokens = tokenize([entry.summary, ...entry.keywords].join(" "))
    const bm25 = scoreDocument(docId, docTokens, queryTokens, index)
    const decay = temporalDecay(entry.createdAt)
    return { entry, score: bm25 * decay }
  })

  const topMemories = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.entry)

  return {
    dailyMemories: topMemories,
    rawEvents: events.slice(0, 10)
  }
}

/**
 * 将检索结果格式化为 LLM prompt 可用的文本。
 */
export function formatRetrievalResult(result: RetrievalResult): string {
  const parts: string[] = []

  if (result.dailyMemories.length > 0) {
    parts.push("## 相关历史记忆")
    for (const memory of result.dailyMemories) {
      parts.push(`- [${memory.date}] ${memory.summary}`)
    }
  }

  if (result.rawEvents.length > 0) {
    parts.push("\n## 最近浏览活动")
    const seen = new Set<string>()

    for (const event of result.rawEvents) {
      if (event.page && !seen.has(event.page.url)) {
        seen.add(event.page.url)
        parts.push(`- ${event.page.title} — ${event.page.url}`)
      }

      if (event.input && event.input.text && seen.size < 20) {
        parts.push(`  ↳ 输入: "${event.input.text.slice(0, 60)}"`)
      }
    }
  }

  return parts.join("\n") || "（暂无相关历史记录）"
}
