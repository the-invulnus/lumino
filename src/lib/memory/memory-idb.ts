// ============================================================
// 记忆系统 IndexedDB 操作 — 使用统一的 db.ts 连接
// ============================================================

import type { Layer1Event, DailyMemoryEntry } from "./types"
import { openDatabase, STORE_EVENTS, STORE_DAILY } from "../db"

const MAX_EVENT_AGE_DAYS = 7
const MAX_EVENTS = 5000
const MAX_DAILY_AGE_DAYS = 90

// ---- Layer 1 事件 ----

export async function loadAllEvents(): Promise<Layer1Event[]> {
  const db = await openDatabase()

  return new Promise<Layer1Event[]>((resolve, reject) => {
    const tx = db.transaction(STORE_EVENTS, "readonly")
    const req = tx.objectStore(STORE_EVENTS).getAll()

    req.onsuccess = () => resolve((req.result as Layer1Event[]) ?? [])
    req.onerror = () => reject(req.error ?? new Error("loadAllEvents failed"))
  })
}

export async function appendEvent(event: Layer1Event): Promise<void> {
  const db = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_EVENTS, "readwrite")
    tx.objectStore(STORE_EVENTS).put(event)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("appendEvent failed"))
    tx.onabort = () => reject(tx.error ?? new Error("appendEvent aborted"))
  })

  await cleanupEvents()
}

export async function appendEvents(events: Layer1Event[]): Promise<void> {
  if (events.length === 0) return

  const db = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_EVENTS, "readwrite")
    const store = tx.objectStore(STORE_EVENTS)

    for (const event of events) {
      store.put(event)
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("appendEvents failed"))
    tx.onabort = () => reject(tx.error ?? new Error("appendEvents aborted"))
  })

  await cleanupEvents()
}

export async function getEventsByDate(date: string): Promise<Layer1Event[]> {
  const db = await openDatabase()
  const dayStart = new Date(date + "T00:00:00").getTime()
  const dayEnd = new Date(date + "T23:59:59.999").getTime()

  return new Promise<Layer1Event[]>((resolve, reject) => {
    const tx = db.transaction(STORE_EVENTS, "readonly")
    const index = tx.objectStore(STORE_EVENTS).index("timestamp")
    const req = index.getAll(IDBKeyRange.bound(dayStart, dayEnd))

    req.onsuccess = () => resolve((req.result as Layer1Event[]) ?? [])
    req.onerror = () => reject(req.error ?? new Error("getEventsByDate failed"))
  })
}

export async function getSessionEvents(sessionStartMs: number): Promise<Layer1Event[]> {
  const db = await openDatabase()

  return new Promise<Layer1Event[]>((resolve, reject) => {
    const tx = db.transaction(STORE_EVENTS, "readonly")
    const index = tx.objectStore(STORE_EVENTS).index("timestamp")
    const req = index.getAll(IDBKeyRange.bound(sessionStartMs, Date.now()))

    req.onsuccess = () => resolve((req.result as Layer1Event[]) ?? [])
    req.onerror = () => reject(req.error ?? new Error("getSessionEvents failed"))
  })
}

export async function getRecentEvents(limit = 50): Promise<Layer1Event[]> {
  const all = await loadAllEvents()
  return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit)
}

async function cleanupEvents(): Promise<void> {
  const all = await loadAllEvents()
  if (all.length === 0) return

  const cutoff = Date.now() - MAX_EVENT_AGE_DAYS * 24 * 60 * 60 * 1000
  const expired = all.filter((e) => e.timestamp < cutoff)
  const excess = all.length - MAX_EVENTS

  let toDelete: string[] = expired.map((e) => e.id)

  if (excess > 0) {
    const stillValid = all
      .filter((e) => e.timestamp >= cutoff)
      .sort((a, b) => a.timestamp - b.timestamp)
    toDelete = toDelete.concat(stillValid.slice(0, excess).map((e) => e.id))
  }

  if (toDelete.length === 0) return

  const db = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_EVENTS, "readwrite")
    const store = tx.objectStore(STORE_EVENTS)

    for (const id of toDelete) {
      store.delete(id)
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("cleanupEvents failed"))
    tx.onabort = () => reject(tx.error ?? new Error("cleanupEvents aborted"))
  })
}

// ---- 日记忆 ----

export async function loadAllDailyMemories(): Promise<DailyMemoryEntry[]> {
  const db = await openDatabase()

  return new Promise<DailyMemoryEntry[]>((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, "readonly")
    const req = tx.objectStore(STORE_DAILY).getAll()

    req.onsuccess = () => resolve((req.result as DailyMemoryEntry[]) ?? [])
    req.onerror = () => reject(req.error ?? new Error("loadAllDailyMemories failed"))
  })
}

export async function saveDailyMemory(entry: DailyMemoryEntry): Promise<void> {
  const db = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, "readwrite")
    tx.objectStore(STORE_DAILY).put(entry)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("saveDailyMemory failed"))
    tx.onabort = () => reject(tx.error ?? new Error("saveDailyMemory aborted"))
  })

  await cleanupDailyMemories()
}

async function cleanupDailyMemories(): Promise<void> {
  const all = await loadAllDailyMemories()
  if (all.length <= MAX_DAILY_AGE_DAYS) return

  const sorted = all.sort((a, b) => a.createdAt - b.createdAt)
  const toDelete = sorted.slice(0, all.length - MAX_DAILY_AGE_DAYS)

  const db = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, "readwrite")
    const store = tx.objectStore(STORE_DAILY)

    for (const entry of toDelete) {
      store.delete(entry.date)
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("cleanupDailyMemories failed"))
    tx.onabort = () => reject(tx.error ?? new Error("cleanupDailyMemories aborted"))
  })
}
