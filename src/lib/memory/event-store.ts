// ============================================================
// Layer 1 事件存储 — 委托给 IndexedDB（memory-idb.ts）
// ============================================================

import type { Layer1Event } from "./types"
import {
  appendEvent as idbAppendEvent,
  appendEvents as idbAppendEvents,
  getEventsByDate as idbGetEventsByDate,
  getSessionEvents as idbGetSessionEvents,
  getRecentEvents as idbGetRecentEvents,
  loadAllEvents
} from "./memory-idb"

export { loadAllEvents as loadEvents } from "./memory-idb"

/**
 * 追加单个事件。
 */
export async function appendEvent(event: Layer1Event): Promise<void> {
  await idbAppendEvent(event)
}

/**
 * 批量追加事件。
 */
export async function appendEvents(events: Layer1Event[]): Promise<void> {
  await idbAppendEvents(events)
}

/**
 * 获取某个日期范围内的事件。
 */
export async function getEventsByDate(date: string): Promise<Layer1Event[]> {
  return idbGetEventsByDate(date)
}

/**
 * 获取当前 session 内的事件。
 */
export async function getSessionEvents(
  storageArea?: Pick<typeof chrome.storage.local, "get">
): Promise<Layer1Event[]> {
  const store = storageArea ?? chrome.storage.local
  const data = await store.get("lumino_session_start")
  const sessionStart = data["lumino_session_start"] as number | undefined

  if (!sessionStart) {
    return []
  }

  return idbGetSessionEvents(sessionStart)
}

/**
 * 获取最近 N 个事件。
 */
export async function getRecentEvents(limit = 50): Promise<Layer1Event[]> {
  return idbGetRecentEvents(limit)
}
