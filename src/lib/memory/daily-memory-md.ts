// ============================================================
// OPFS 日记忆文件读写 — memory-YYYY-MM-DD.md
// ============================================================

import type { DailyMemoryEntry } from "./types"
import { getLuminoDir, readFile, writeFile, listFiles, deleteFile } from "../fs/opfs"

const MEMORIES_DIR = "memories"
const MEMORY_FILE_PREFIX = "memory-"
const FILE_EXT = ".md"

/**
 * 获取 memories 子目录 handle。
 * 路径：/lumino/memories/
 */
async function getMemoriesDir(): Promise<FileSystemDirectoryHandle> {
  const luminoRoot = await getLuminoDir()
  try {
    return await luminoRoot.getDirectoryHandle(MEMORIES_DIR, { create: true })
  } catch {
    return await luminoRoot.getDirectoryHandle(MEMORIES_DIR)
  }
}

/**
 * 构建文件名：memory-YYYY-MM-DD.md
 */
function buildFileName(date: string): string {
  return `${MEMORY_FILE_PREFIX}${date}${FILE_EXT}`
}

/**
 * 将 DailyMemoryEntry 序列化为 Markdown。
 */
export function dailyMemoryToMarkdown(entry: DailyMemoryEntry): string {
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
 * 从 Markdown 解析回 DailyMemoryEntry（基础字段）。
 */
export function parseDailyMemoryMarkdown(
  markdown: string,
  date: string
): DailyMemoryEntry {
  const lines = markdown.split("\n")
  const keywords: string[] = []
  const manualNotes: string[] = []
  let summary = ""
  let inSection = ""
  let createdAt = Date.now()
  let status: string | undefined
  let statusReason: string | undefined

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith("生成时间：")) {
      const iso = trimmed.replace("生成时间：", "")
      const parsed = new Date(iso).getTime()
      if (!isNaN(parsed)) createdAt = parsed
      continue
    }

    if (trimmed === "## 摘要") {
      inSection = "summary"
      continue
    }
    if (trimmed === "## 关键词") {
      inSection = "keywords"
      continue
    }
    if (trimmed === "## 手动笔记") {
      inSection = "notes"
      continue
    }
    if (trimmed.startsWith("## 状态：")) {
      inSection = "status"
      status = trimmed.replace("## 状态：", "").trim()
      continue
    }
    if (trimmed.startsWith("## 状态")) {
      inSection = "status"
      continue
    }
    if (trimmed.startsWith("原因：")) {
      statusReason = trimmed.replace("原因：", "").trim()
      continue
    }
    if (trimmed.startsWith("##")) {
      inSection = ""
      continue
    }

    if (inSection === "summary" && trimmed) {
      if (summary) summary += "\n"
      summary += trimmed
    } else if (inSection === "keywords" && trimmed.startsWith("- ")) {
      keywords.push(trimmed.slice(2).trim())
    } else if (inSection === "notes" && trimmed.startsWith("- ")) {
      manualNotes.push(trimmed.slice(2).trim())
    }
  }

  return {
    date,
    createdAt,
    summary,
    keywords,
    sourceEventIds: [],
    manualNotes: manualNotes.length > 0 ? manualNotes : undefined,
    status,
    statusReason
  }
}

/**
 * 写入日记忆文件到 OPFS。
 */
export async function writeDailyMemoryMd(
  entry: DailyMemoryEntry
): Promise<void> {
  const dir = await getMemoriesDir()
  const fileName = buildFileName(entry.date)
  const markdown = dailyMemoryToMarkdown(entry)
  await writeFile(dir, fileName, markdown)
}

/**
 * 读取指定日期的日记忆文件。
 * 返回 null 如果文件不存在。
 */
export async function readDailyMemoryMd(
  date: string
): Promise<DailyMemoryEntry | null> {
  const dir = await getMemoriesDir()
  const fileName = buildFileName(date)
  const content = await readFile(dir, fileName)

  if (content === null) return null
  return parseDailyMemoryMarkdown(content, date)
}

/**
 * 列出所有日记忆文件的日期列表。
 */
export async function listDailyMemoryDates(): Promise<string[]> {
  const dir = await getMemoriesDir()
  const files = await listFiles(dir)

  return files
    .filter((f) => f.startsWith(MEMORY_FILE_PREFIX) && f.endsWith(FILE_EXT))
    .map((f) => f.slice(MEMORY_FILE_PREFIX.length, -FILE_EXT.length))
    .sort()
}

/**
 * 删除指定日期的日记忆文件。
 */
export async function deleteDailyMemoryMd(date: string): Promise<void> {
  const dir = await getMemoriesDir()
  const fileName = buildFileName(date)
  await deleteFile(dir, fileName)
}

/**
 * 清理超过保留期的日记忆文件。
 * @param maxAgeDays 最大保留天数，默认 90
 */
export async function cleanupDailyMemoryMd(
  maxAgeDays = 90
): Promise<string[]> {
  const dates = await listDailyMemoryDates()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - maxAgeDays)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const deleted: string[] = []
  for (const date of dates) {
    if (date < cutoffStr) {
      await deleteDailyMemoryMd(date)
      deleted.push(date)
    }
  }

  return deleted
}
