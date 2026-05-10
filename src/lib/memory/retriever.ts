// ============================================================
// Layer 3 检索器 — 从日记忆中检索与当前上下文相关的条目
// ============================================================

import { loadDailyMemories } from "./daily-memory"
import { getRecentEvents } from "./event-store"
import type { DailyMemoryEntry, Layer1Event, RetrievalResult } from "./types"

/**
 * 将当前 session 上下文转为关键词列表。
 * 先用简单字符串匹配，后续可升级为 embedding 向量检索。
 */
export function extractContextKeywords(
  recentEvents: Layer1Event[]
): string[] {
  const keywords = new Set<string>()

  for (const event of recentEvents) {
    if (event.page) {
      // 从页面标题和 URL 提取词
      const title = event.page.title
      const words = title
        .split(/[\s\-–—|·,.，。、：:；;！!？?()（）【】\[\]{}<>《》"「」『』\s]+/)
        .filter((w) => w.length >= 2 && w.length <= 15)

      for (const word of words) {
        keywords.add(word)
      }

      // 域名关键字
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

  return Array.from(keywords).slice(0, 30)
}

/**
 * 计算日记忆条目与关键词列表的相关性得分。
 */
function scoreDailyMemory(
  entry: DailyMemoryEntry,
  keywords: string[]
): number {
  let score = 0
  const summary = entry.summary.toLowerCase()
  const entryKeywords = entry.keywords.map((k) => k.toLowerCase())

  for (const keyword of keywords) {
    const kw = keyword.toLowerCase()

    // 关键词在摘要中出现
    if (summary.includes(kw)) {
      score += 2
    }

    // 关键词在关键词列表中出现
    if (entryKeywords.some((ek) => ek.includes(kw) || kw.includes(ek))) {
      score += 3
    }
  }

  // 最近日期的条目加分
  const age = Date.now() - entry.createdAt
  const daysAgo = age / (24 * 60 * 60 * 1000)
  if (daysAgo < 1) {
    score += 5
  } else if (daysAgo < 3) {
    score += 3
  } else if (daysAgo < 7) {
    score += 1
  }

  return score
}

/**
 * 检索与当前上下文相关的日记忆和原始事件。
 *
 * 检索策略（简单字符串匹配）：
 * 1. 从当前 session 事件提取关键词
 * 2. 用关键词在所有日记忆中做字符串匹配
 * 3. 按匹配度排序返回前 5 条
 * 4. 回退层：同时返回最近 10 条原始事件
 */
export async function retrieveContext(
  recentEvents?: Layer1Event[]
): Promise<RetrievalResult> {
  const events = recentEvents ?? (await getRecentEvents(50))
  const keywords = extractContextKeywords(events)
  const allMemories = await loadDailyMemories()

  if (keywords.length === 0) {
    return {
      dailyMemories: allMemories.slice(0, 3),
      rawEvents: events.slice(0, 10)
    }
  }

  // 计算每个日记忆的相关性得分
  const scored = allMemories.map((entry) => ({
    entry,
    score: scoreDailyMemory(entry, keywords)
  }))

  // 按得分降序，取前 5
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
