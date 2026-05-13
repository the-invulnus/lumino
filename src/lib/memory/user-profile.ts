// ============================================================
// 用户画像 — OPFS profile.md 自由格式 Markdown + chrome.storage.local 缓存
// ============================================================

import type { UserProfile } from "./types"
import { STORAGE_KEY_PROFILE } from "./types"
import { getLuminoDir, readFile, writeFile } from "../fs/opfs"

const PROFILE_FILENAME = "profile.md"

const DEFAULT_PROFILE: UserProfile = {
  name: "",
  language: "zh",
  interests: [],
  frequentSites: [],
  notes: "",
  updatedAt: 0
}

/**
 * 将 UserProfile 序列化为 Markdown。
 */
export function profileToMarkdown(profile: UserProfile): string {
  const lines: string[] = [
    "# 用户画像",
    "",
    `- **昵称**：${profile.name || "（未设置）"}`,
    `- **语言**：${profile.language}`,
    `- **最后更新**：${new Date(profile.updatedAt).toISOString()}`,
    ""
  ]

  if (profile.interests.length > 0) {
    lines.push("## 关注领域")
    lines.push("")
    for (const interest of profile.interests) {
      lines.push(`- ${interest}`)
    }
    lines.push("")
  }

  if (profile.frequentSites.length > 0) {
    lines.push("## 常用站点")
    lines.push("")
    for (const site of profile.frequentSites) {
      lines.push(`- ${site}`)
    }
    lines.push("")
  }

  if (profile.notes) {
    lines.push("## 补充信息")
    lines.push("")
    lines.push(profile.notes)
    lines.push("")
  }

  return lines.join("\n")
}

/**
 * 从 Markdown 解析 UserProfile。
 */
export function parseProfileMarkdown(markdown: string): UserProfile {
  const lines = markdown.split("\n")
  let name = ""
  let language = "zh"
  const interests: string[] = []
  const frequentSites: string[] = []
  const notesLines: string[] = []
  let updatedAt = 0
  let section = ""

  for (const line of lines) {
    const trimmed = line.trim()

    // 解析字段
    const nameMatch = trimmed.match(/^\*\*昵称\*\*[：:]\s*(.*)$/)
    if (nameMatch) {
      const v = nameMatch[1].trim()
      if (v && v !== "（未设置）") name = v
      continue
    }

    const langMatch = trimmed.match(/^\*\*语言\*\*[：:]\s*(.*)$/)
    if (langMatch) {
      language = langMatch[1].trim() || "zh"
      continue
    }

    const timeMatch = trimmed.match(/^\*\*最后更新\*\*[：:]\s*(.*)$/)
    if (timeMatch) {
      const parsed = new Date(timeMatch[1].trim()).getTime()
      if (!isNaN(parsed)) updatedAt = parsed
      continue
    }

    if (trimmed === "## 关注领域") {
      section = "interests"
      continue
    }
    if (trimmed === "## 常用站点") {
      section = "sites"
      continue
    }
    if (trimmed === "## 补充信息") {
      section = "notes"
      continue
    }
    if (trimmed.startsWith("##")) {
      section = ""
      continue
    }

    if (section === "interests" && trimmed.startsWith("- ")) {
      interests.push(trimmed.slice(2).trim())
    } else if (section === "sites" && trimmed.startsWith("- ")) {
      frequentSites.push(trimmed.slice(2).trim())
    } else if (section === "notes" && trimmed) {
      notesLines.push(trimmed)
    }
  }

  return {
    name,
    language,
    interests,
    frequentSites,
    notes: notesLines.join("\n"),
    updatedAt: updatedAt || Date.now()
  }
}

/**
 * 从 OPFS 加载用户画像。
 * 优先读 OPFS profile.md，不存在则读 chrome.storage.local 兜底。
 */
export async function loadUserProfile(
  storageArea?: Pick<typeof chrome.storage.local, "get">
): Promise<UserProfile> {
  // 先尝试 OPFS
  try {
    const luminoDir = await getLuminoDir()
    const md = await readFile(luminoDir, PROFILE_FILENAME)
    if (md) {
      return parseProfileMarkdown(md)
    }
  } catch {
    // OPFS 不可用，fall through to storage
  }

  // 回退到 chrome.storage.local
  const store = storageArea ?? chrome.storage.local
  const data = await store.get(STORAGE_KEY_PROFILE)
  const raw = data[STORAGE_KEY_PROFILE] as UserProfile | undefined

  if (raw && typeof raw.language === "string") {
    return { ...DEFAULT_PROFILE, ...raw }
  }

  return { ...DEFAULT_PROFILE }
}

/**
 * 保存用户画像到 OPFS profile.md + chrome.storage.local 缓存。
 */
export async function saveUserProfile(
  profile: UserProfile,
  storageArea?: Pick<typeof chrome.storage.local, "set">
): Promise<void> {
  const updated = { ...profile, updatedAt: Date.now() }

  // 写入 OPFS
  const luminoDir = await getLuminoDir()
  const md = profileToMarkdown(updated)
  await writeFile(luminoDir, PROFILE_FILENAME, md)

  // 同时更新 chrome.storage.local 缓存
  const store = storageArea ?? chrome.storage.local
  await store.set({ [STORAGE_KEY_PROFILE]: updated })
}

/**
 * 手动更新部分画像字段。
 */
export async function updateUserProfile(
  partial: Partial<UserProfile>,
  storageArea?: Pick<typeof chrome.storage.local, "get" | "set">
): Promise<UserProfile> {
  const current = await loadUserProfile(storageArea)
  const updated: UserProfile = {
    ...current,
    ...partial,
    updatedAt: Date.now()
  }

  await saveUserProfile(updated, storageArea)
  return updated
}
