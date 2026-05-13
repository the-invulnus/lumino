// ============================================================
// 记忆系统 IndexedDB 操作 — 使用统一的 db.ts 连接
// ============================================================

import type { Layer1Event, DailyMemoryEntry, ConversationInsight, BookmarkChangeEvent } from "./types"
import { openDatabase, STORE_EVENTS, STORE_DAILY, STORE_INSIGHTS, STORE_BOOKMARK_CHANGES } from "../db"

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

// ---- 按 dateKey 查询事件 ----

export async function getEventsByDateKey(
  dateKey: string
): Promise<Layer1Event[]> {
  const db = await openDatabase()

  return new Promise<Layer1Event[]>((resolve, reject) => {
    const tx = db.transaction(STORE_EVENTS, "readonly")
    const index = tx.objectStore(STORE_EVENTS).index("dateKey")

    if (!index) {
      resolve([])
      return
    }

    const req = index.getAll(IDBKeyRange.only(dateKey))
    req.onsuccess = () => resolve((req.result as Layer1Event[]) ?? [])
    req.onerror = () => reject(req.error ?? new Error("getEventsByDateKey failed"))
  })
}

export async function getEventsByDateKeyAndStatus(
  dateKey: string,
  dwellStatus: string
): Promise<Layer1Event[]> {
  const all = await getEventsByDateKey(dateKey)
  return all.filter((e) => e.dwellStatus === dwellStatus)
}

// ---- 按 dwellStatus 查询事件 ----

export async function getEventsByDwellStatus(
  status: string
): Promise<Layer1Event[]> {
  const db = await openDatabase()

  return new Promise<Layer1Event[]>((resolve, reject) => {
    const tx = db.transaction(STORE_EVENTS, "readonly")
    const index = tx.objectStore(STORE_EVENTS).index("dwellStatus")

    if (!index) {
      resolve([])
      return
    }

    const req = index.getAll(IDBKeyRange.only(status))
    req.onsuccess = () => resolve((req.result as Layer1Event[]) ?? [])
    req.onerror = () => reject(req.error ?? new Error("getEventsByDwellStatus failed"))
  })
}

// ---- 更新 dwell 信息 ----

export async function updateEventDwell(
  eventId: string,
  dwellMs: number,
  dwellStatus: "confirmed" | "settled" | "discarded"
): Promise<void> {
  const db = await openDatabase()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_EVENTS, "readwrite")
    const store = tx.objectStore(STORE_EVENTS)
    const getReq = store.get(eventId)

    getReq.onsuccess = () => {
      const event = getReq.result as Layer1Event | undefined
      if (!event) {
        resolve()
        return
      }

      event.dwellMs = dwellMs
      event.dwellStatus = dwellStatus
      store.put(event)
    }

    getReq.onerror = () => reject(getReq.error ?? new Error("updateEventDwell get failed"))

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("updateEventDwell failed"))
  })
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

// ---- 对话洞察 ----

export async function loadAllInsights(): Promise<ConversationInsight[]> {
  const db = await openDatabase()

  return new Promise<ConversationInsight[]>((resolve, reject) => {
    const tx = db.transaction(STORE_INSIGHTS, "readonly")
    const req = tx.objectStore(STORE_INSIGHTS).getAll()

    req.onsuccess = () => resolve((req.result as ConversationInsight[]) ?? [])
    req.onerror = () => reject(req.error ?? new Error("loadAllInsights failed"))
  })
}

export async function saveInsight(insight: ConversationInsight): Promise<void> {
  const db = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_INSIGHTS, "readwrite")
    tx.objectStore(STORE_INSIGHTS).put(insight)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("saveInsight failed"))
    tx.onabort = () => reject(tx.error ?? new Error("saveInsight aborted"))
  })
}

export async function appendManualNote(
  date: string,
  note: string,
  source: "agent" | "user" = "agent"
): Promise<void> {
  const all = await loadAllDailyMemories()
  let entry = all.find((m) => m.date === date)

  if (!entry) {
    entry = {
      date,
      createdAt: Date.now(),
      summary: "",
      keywords: [],
      sourceEventIds: [],
      manualNotes: [note],
      lastModifiedBy: source,
      lastModifiedAt: Date.now()
    }
  } else {
    if (!entry.manualNotes) entry.manualNotes = []
    entry.manualNotes.push(note)
    entry.lastModifiedBy = source
    entry.lastModifiedAt = Date.now()
  }

  await saveDailyMemory(entry)
}

export async function markMemoryStatus(
  date: string,
  status: string,
  reason: string
): Promise<void> {
  const all = await loadAllDailyMemories()
  const entry = all.find((m) => m.date === date)

  if (!entry) return

  entry.status = status
  entry.statusReason = reason
  entry.lastModifiedBy = "agent"
  entry.lastModifiedAt = Date.now()

  await saveDailyMemory(entry)
}

// ---- 书签变更事件 ----

export async function appendBookmarkChange(
  event: BookmarkChangeEvent
): Promise<void> {
  const db = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKMARK_CHANGES, "readwrite")
    tx.objectStore(STORE_BOOKMARK_CHANGES).put(event)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("appendBookmarkChange failed"))
    tx.onabort = () => reject(tx.error ?? new Error("appendBookmarkChange aborted"))
  })
}

export async function getBookmarkChangesByDateKey(
  dateKey: string
): Promise<BookmarkChangeEvent[]> {
  const db = await openDatabase()

  return new Promise<BookmarkChangeEvent[]>((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKMARK_CHANGES, "readonly")
    const index = tx.objectStore(STORE_BOOKMARK_CHANGES).index("dateKey")

    if (!index) {
      resolve([])
      return
    }

    const req = index.getAll(IDBKeyRange.only(dateKey))
    req.onsuccess = () => resolve((req.result as BookmarkChangeEvent[]) ?? [])
    req.onerror = () => reject(req.error ?? new Error("getBookmarkChangesByDateKey failed"))
  })
}

// ---- 诊断 / 调试 ----

/**
 * 获取 IndexedDB 存储统计信息。
 * 用于在 sidepanel 或控制台调试时调用。
 */
export async function getStorageStats(): Promise<{
  dbName: string
  dbVersion: number
  stores: Record<string, number>
  layer1EventCount: number
  bookmarkChangeCount: number
  pendingDwellCount: number
  confirmedDwellCount: number
}> {
  const db = await openDatabase()
  const storeNames = Array.from(db.objectStoreNames) as string[]
  const stores: Record<string, number> = {}

  let layer1EventCount = 0
  let bookmarkChangeCount = 0
  let pendingDwellCount = 0
  let confirmedDwellCount = 0

  for (const name of storeNames) {
    try {
      const tx = db.transaction(name, "readonly")
      const count = await new Promise<number>((resolve, reject) => {
        const req = tx.objectStore(name).count()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      stores[name] = count

      if (name === STORE_EVENTS) {
        layer1EventCount = count

        // 统计 dwellStatus 分布
        try {
          const statTx = db.transaction(STORE_EVENTS, "readonly")
          const statStore = statTx.objectStore(STORE_EVENTS)
          const allEvents = await new Promise<unknown[]>((resolve, reject) => {
            const req = statStore.getAll()
            req.onsuccess = () => resolve(req.result as unknown[])
            req.onerror = () => reject(req.error)
          })

          pendingDwellCount = (allEvents as Array<{ dwellStatus?: string }>)
            .filter((e) => e.dwellStatus === "pending").length
          confirmedDwellCount = (allEvents as Array<{ dwellStatus?: string }>)
            .filter((e) => e.dwellStatus === "confirmed").length
        } catch {
          // ignore stat errors
        }
      }

      if (name === STORE_BOOKMARK_CHANGES) {
        bookmarkChangeCount = count
      }
    } catch {
      stores[name] = -1
    }
  }

  return {
    dbName: db.name,
    dbVersion: db.version,
    stores,
    layer1EventCount,
    bookmarkChangeCount,
    pendingDwellCount,
    confirmedDwellCount
  }
}
