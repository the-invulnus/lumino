// ============================================================
// 采集配置 — 读写 chrome.storage.local 中的采集参数
// ============================================================

import type { CollectionConfig } from "./types"
import { DEFAULT_COLLECTION_CONFIG, STORAGE_KEY_COLLECTION_CONFIG } from "./types"

/**
 * 读取采集配置。
 * 如果从未保存过，返回默认配置并自动写入 storage。
 */
export async function getCollectionConfig(): Promise<CollectionConfig> {
  const data = await chrome.storage.local.get(STORAGE_KEY_COLLECTION_CONFIG)
  const raw = data[STORAGE_KEY_COLLECTION_CONFIG] as CollectionConfig | undefined

  if (raw && typeof raw.minDwellMs === "number") {
    // 合并默认值，确保新增字段有兜底
    return { ...DEFAULT_COLLECTION_CONFIG, ...raw }
  }

  // 首次使用，写入默认值
  await chrome.storage.local.set({
    [STORAGE_KEY_COLLECTION_CONFIG]: DEFAULT_COLLECTION_CONFIG
  })
  return { ...DEFAULT_COLLECTION_CONFIG }
}

/**
 * 保存采集配置。
 */
export async function saveCollectionConfig(
  config: Partial<CollectionConfig>
): Promise<CollectionConfig> {
  const current = await getCollectionConfig()
  const merged: CollectionConfig = { ...current, ...config }
  await chrome.storage.local.set({
    [STORAGE_KEY_COLLECTION_CONFIG]: merged
  })
  return merged
}

/**
 * 格式化日期 key，如 "2026-05-12"。
 */
export function formatDateKey(timestamp: number): string {
  const d = new Date(timestamp)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
