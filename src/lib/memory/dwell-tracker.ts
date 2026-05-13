// ============================================================
// Dwell Tracker — Background 端跟踪 tab 浏览时长
// ============================================================

import type { CollectionConfig } from "./types"
import { getCollectionConfig } from "./collection-config"
import { appendEvent } from "./event-store"
import { getEventsByDwellStatus, updateEventDwell } from "./event-store"
import { formatDateKey } from "./collection-config"

/**
 * 跟踪每个 tab 的浏览状态。
 */
interface TabDwellRecord {
  /** page_visit 事件的 ID（已写入 IDB） */
  eventId: string
  /** 页面打开时间 */
  startMs: number
  /** 页面 URL */
  url: string
  /** 页面标题 */
  title: string
  /** 是否曾经被 active 过 */
  wasActive: boolean
  /** 是否已经结算（避免重复结算） */
  settled: boolean
}

/** tabId → TabDwellRecord */
const dwellMap = new Map<number, TabDwellRecord>()

/**
 * 记录一次 page_visit 事件（从 content script 上报后调用）。
 * 写入事件时 dwellStatus = "pending"，进入跟踪队列。
 */
export function trackPageVisit(
  tabId: number,
  eventId: string,
  url: string,
  title: string
): void {
  dwellMap.set(tabId, {
    eventId,
    startMs: Date.now(),
    url,
    title,
    wasActive: false,
    settled: false
  })
}

/**
 * 标记某个 tab 被用户激活过。
 */
export function markTabActive(tabId: number): void {
  const record = dwellMap.get(tabId)
  if (record) {
    record.wasActive = true
  }
}

/**
 * 结算某个 tab 的浏览时长。
 * 当 tab 关闭、导航到新 URL 时调用。
 */
export async function settleTabDwell(
  tabId: number,
  config?: CollectionConfig
): Promise<void> {
  const record = dwellMap.get(tabId)
  if (!record || record.settled) return

  const cfg = config ?? (await getCollectionConfig())
  const rawDwellMs = Date.now() - record.startMs
  const finalDwellMs = computeEffectiveDwell(rawDwellMs, record.wasActive, cfg)

  if (finalDwellMs >= cfg.minDwellMs) {
    await updateEventDwell(record.eventId, finalDwellMs, "settled")
  } else {
    // 时长不足阈值，丢弃
    await updateEventDwell(record.eventId, 0, "discarded")
  }

  record.settled = true
  dwellMap.delete(tabId)
}

/**
 * 定时巡检：检查已超过阈值的 pending 事件，将其标记为 confirmed。
 * 由 chrome.alarms 驱动，每分钟触发一次。
 */
export async function checkDwellThresholds(
  config?: CollectionConfig
): Promise<void> {
  const cfg = config ?? (await getCollectionConfig())
  const now = Date.now()

  // 1. 检查内存中的 dwellMap
  for (const [tabId, record] of dwellMap.entries()) {
    if (record.settled) continue

    const elapsed = now - record.startMs
    const effective = computeEffectiveDwell(elapsed, record.wasActive, cfg)

    if (effective >= cfg.minDwellMs) {
      // 超过阈值，更新事件为 confirmed
      await updateEventDwell(record.eventId, effective, "confirmed")
      // 保持记录在 map 中，等 tab 关闭时做最终结算
    }
  }

  // 2. 检查 IDB 中可能存在但不在内存中的 pending 事件
  //    (Service Worker 重启后，内存丢失，需要从 IDB 恢复)
  const pendingEvents = await getEventsByDwellStatus("pending")

  for (const event of pendingEvents) {
    const elapsed = now - event.timestamp
    // 对于不在内存中的 pending 事件，无法判断 wasActive，保守处理
    const effective = computeEffectiveDwell(elapsed, false, cfg)

    if (effective >= cfg.minDwellMs) {
      await updateEventDwell(event.id, effective, "confirmed")
    }
  }
}

/**
 * SW 重启后，从 IDB 恢复跟踪状态。
 */
export async function restoreDwellState(): Promise<void> {
  // 查找所有 pending 的事件，重启内存跟踪
  const pendingEvents = await getEventsByDwellStatus("pending")

  for (const event of pendingEvents) {
    if (!dwellMap.has(event.tabId)) {
      dwellMap.set(event.tabId, {
        eventId: event.id,
        startMs: event.timestamp,
        url: event.page?.url ?? "",
        title: event.page?.title ?? "",
        wasActive: false,
        settled: false
      })
    }
  }
}

/**
 * 计算有效浏览时长。
 *
 * 规则：
 * 1. 未被 active 过的 tab，时长 × backgroundTabCoeff
 * 2. 超过 dwellDecayStartMs 的部分，超出部分 × dwellDecayRatio
 */
export function computeEffectiveDwell(
  rawDwellMs: number,
  wasActive: boolean,
  config: CollectionConfig
): number {
  let effective = rawDwellMs

  // 后台 tab 衰减
  if (!wasActive) {
    effective = Math.round(effective * config.backgroundTabCoeff)
  }

  // 超时衰减
  if (effective > config.dwellDecayStartMs) {
    const excess = effective - config.dwellDecayStartMs
    effective = config.dwellDecayStartMs + Math.round(excess * config.dwellDecayRatio)
  }

  return effective
}

/**
 * 获取当前所有 tracked tab 的统计（用于调试）。
 */
export function getDwellStats(): {
  tracked: number
  active: number
  pending: number
} {
  let active = 0
  let pending = 0

  for (const record of dwellMap.values()) {
    if (record.settled) continue
    if (record.wasActive) active++
    else pending++
  }

  return {
    tracked: dwellMap.size,
    active,
    pending
  }
}

/**
 * 生成事件 ID 并在 Background 端创建 page_visit 事件的占位记录。
 * 用于处理 content script 上报失败时的降级场景（例如 tab 背景加载没有 content script）。
 */
function generateEventId(): string {
  return `bg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function generateBackgroundPageVisit(
  tabId: number,
  url: string,
  title: string
): string {
  const eventId = generateEventId()
  dwellMap.set(tabId, {
    eventId,
    startMs: Date.now(),
    url,
    title,
    wasActive: false,
    settled: false
  })
  return eventId
}
