import type { LlmSettings } from "./llm/types"

type StorageArea = Pick<typeof chrome.storage.sync, "get" | "set">

const SETTINGS_KEYS = ["baseUrl", "apiKey", "model"] as const

function getStorageArea(storageArea?: StorageArea) {
  return storageArea ?? chrome.storage.sync
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
