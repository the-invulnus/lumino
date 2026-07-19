import type { LlmSettings } from "./llm/types"

type StorageArea = Pick<typeof chrome.storage.sync, "get" | "set">

const SETTINGS_KEYS = ["baseUrl", "apiKey", "model"] as const

// 敏感凭证（LLM API Key、Obsidian token）默认存 local：不随 Google 账号同步到云端，
// 降低账号被入侵时的凭证泄露面。
function getStorageArea(storageArea?: StorageArea) {
  return storageArea ?? chrome.storage.local
}

function normalizeSettings(settings: LlmSettings): LlmSettings {
  return {
    baseUrl: settings.baseUrl.trim().replace(/\/+$/, ""),
    apiKey: settings.apiKey.trim(),
    model: settings.model.trim()
  }
}

export async function getLlmSettings(
  storageArea?: StorageArea
): Promise<LlmSettings> {
  const data = (await getStorageArea(storageArea).get(
    SETTINGS_KEYS as unknown as string[]
  )) as Partial<LlmSettings>

  return {
    baseUrl: data.baseUrl ?? "",
    apiKey: data.apiKey ?? "",
    model: data.model ?? ""
  }
}

export async function saveLlmSettings(
  settings: LlmSettings,
  storageArea?: StorageArea
) {
  await getStorageArea(storageArea).set(normalizeSettings(settings))
}

export function hasCompleteLlmSettings(settings: LlmSettings) {
  return Boolean(
    settings.baseUrl.trim() && settings.apiKey.trim() && settings.model.trim()
  )
}

// ── Obsidian Local REST API 配置 ──

export type ObsidianSettings = {
  enabled: boolean
  apiKey: string
  /** API 基础地址，默认 http://127.0.0.1:27123（HTTP 避免自签名证书问题） */
  baseUrl: string
}

const OBSIDIAN_SETTINGS_KEYS = ["obsidianEnabled", "obsidianApiKey", "obsidianBaseUrl"] as const

export async function getObsidianSettings(
  storageArea?: StorageArea
): Promise<ObsidianSettings> {
  const data = (await getStorageArea(storageArea).get(
    OBSIDIAN_SETTINGS_KEYS as unknown as string[]
  )) as Record<string, unknown>

  return {
    enabled: data.obsidianEnabled === true,
    apiKey: (data.obsidianApiKey as string) ?? "",
    baseUrl: (data.obsidianBaseUrl as string) || "http://127.0.0.1:27123"
  }
}

export async function saveObsidianSettings(
  settings: ObsidianSettings,
  storageArea?: StorageArea
): Promise<void> {
  await getStorageArea(storageArea).set({
    obsidianEnabled: settings.enabled,
    obsidianApiKey: settings.apiKey.trim(),
    obsidianBaseUrl: settings.baseUrl.trim() || "http://127.0.0.1:27123"
  })
}

/** Obsidian 功能是否已正确配置并启用 */
export function isObsidianConfigured(settings: ObsidianSettings): boolean {
  return settings.enabled && settings.apiKey.trim().length > 0 && settings.baseUrl.trim().length > 0
}
