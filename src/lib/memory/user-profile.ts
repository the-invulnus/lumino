// ============================================================
// 用户画像 — LLM 从浏览行为推断并持续更新用户画像
// ============================================================

import type { OpenAiChatMessage } from "../chat/openai-messages"
import { requestChatCompletion } from "../llm/openai"
import type { LlmSettings } from "../llm/types"
import { getLlmSettings, hasCompleteLlmSettings } from "../settings"
import { loadDailyMemories } from "./daily-memory"
import { getRecentEvents } from "./event-store"
import type { UserProfile } from "./types"
import { STORAGE_KEY_PROFILE } from "./types"

const DEFAULT_PROFILE: UserProfile = {
  name: "",
  language: "zh",
  interests: [],
  frequentSites: [],
  notes: "",
  updatedAt: 0
}

/**
 * 加载用户画像。
 */
export async function loadUserProfile(
  storageArea?: Pick<typeof chrome.storage.local, "get">
): Promise<UserProfile> {
  const store = storageArea ?? chrome.storage.local
  const data = await store.get(STORAGE_KEY_PROFILE)
  const raw = data[STORAGE_KEY_PROFILE] as UserProfile | undefined

  if (raw && typeof raw.language === "string") {
    return { ...DEFAULT_PROFILE, ...raw }
  }

  return { ...DEFAULT_PROFILE }
}

/**
 * 保存用户画像。
 */
export async function saveUserProfile(
  profile: UserProfile,
  storageArea?: Pick<typeof chrome.storage.local, "set">
): Promise<void> {
  const store = storageArea ?? chrome.storage.local
  await store.set({
    [STORAGE_KEY_PROFILE]: {
      ...profile,
      updatedAt: Date.now()
    }
  })
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

  const store = storageArea ?? chrome.storage.local
  await store.set({ [STORAGE_KEY_PROFILE]: updated })
  return updated
}

/**
 * 从浏览行为中提取常用站点。
 */
function extractFrequentSites(
  recentEvents: Array<{ page?: { hostname: string } }>,
  memories: Array<{ summary: string }>
): string[] {
  const hostCount = new Map<string, number>()

  for (const event of recentEvents) {
    if (event.page?.hostname) {
      const host = event.page.hostname.replace(/^www\./, "")
      hostCount.set(host, (hostCount.get(host) ?? 0) + 1)
    }
  }

  return Array.from(hostCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([host]) => host)
}

/**
 * 调用 LLM 生成/更新用户画像。
 */
export async function generateUserProfile(
  settings?: LlmSettings
): Promise<UserProfile> {
  const llmSettings = settings ?? (await getLlmSettings())
  const recentEvents = await getRecentEvents(100)
  const memories = await loadDailyMemories()
  const currentProfile = await loadUserProfile()

  // 提取常用站点（无需 LLM）
  const frequentSites = extractFrequentSites(recentEvents, memories)

  if (!hasCompleteLlmSettings(llmSettings)) {
    // LLM 不可用，只更新频繁站点
    return {
      ...currentProfile,
      frequentSites,
      updatedAt: Date.now()
    }
  }

  try {
    const systemPrompt = `你是一个用户画像分析助手。根据用户的浏览记录，推断并更新用户画像。

你需要推断：
1. 用户关注的主题/兴趣领域（interests）：列出 5-10 个
2. 用户可能使用的语言（language）："zh" 或 "en"
3. 用户昵称（name）：如果能从浏览行为中推断则填入，否则空字符串

注意：
- 从已有的画像出发，在此基础上更新
- 如果是技术相关浏览，推断技术栈偏好
- 保持画像简洁实用

当前画像：${JSON.stringify(currentProfile, null, 2)}

输出必须是 JSON 格式：
{
  "name": "...",
  "language": "zh",
  "interests": ["..."],
  "notes": "..."
}`

    const recentPages = recentEvents
      .filter((e) => e.page)
      .slice(0, 30)
      .map((e) => `${e.page!.title} — ${e.page!.url}`)
      .join("\n")

    const recentMemories = memories
      .slice(0, 14)
      .map((m) => `[${m.date}] ${m.summary}`)
      .join("\n")

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `最近浏览的页面：\n${recentPages}\n\n最近的日记忆：\n${recentMemories}`
      }
    ]

    const response = await requestChatCompletion(llmSettings, messages)

    let parsed: Partial<UserProfile> = {}
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]) as Partial<UserProfile>
      }
    } catch {
      // 解析失败时保留旧画像
    }

    return {
      name: parsed.name ?? currentProfile.name,
      language: parsed.language ?? currentProfile.language,
      interests: parsed.interests ?? currentProfile.interests,
      frequentSites,
      notes: parsed.notes ?? currentProfile.notes,
      updatedAt: Date.now()
    }
  } catch {
    return {
      ...currentProfile,
      frequentSites,
      updatedAt: Date.now()
    }
  }
}

/**
 * 生成并保存用户画像。
 */
export async function generateAndSaveProfile(): Promise<UserProfile> {
  try {
    const profile = await generateUserProfile()
    await saveUserProfile(profile)
    return profile
  } catch (error) {
    console.error("[Lumino] 用户画像生成失败", error)
    return loadUserProfile()
  }
}
