// ============================================================
// 统一 IndexedDB 数据库 — 所有模块共享同一个连接
// ============================================================

const DB_NAME = "lumino"
const DB_VERSION = 3

export const STORE_THREADS = "threads"
export const STORE_EVENTS = "layer1_events"
export const STORE_DAILY = "daily_memories"
export const STORE_INSIGHTS = "insights"
export const STORE_BOOKMARK_CHANGES = "bookmark_changes"
export const STORE_PROFILE_UPDATES = "profile_updates"

let dbPromise: Promise<IDBDatabase> | null = null

export function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      dbPromise = null
      reject(request.error ?? new Error("IndexedDB open failed"))
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      const oldVersion = event.oldVersion

      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE_THREADS)) {
          db.createObjectStore(STORE_THREADS, { keyPath: "id" })
        }

        if (!db.objectStoreNames.contains(STORE_EVENTS)) {
          const es = db.createObjectStore(STORE_EVENTS, { keyPath: "id" })
          es.createIndex("timestamp", "timestamp", { unique: false })
          es.createIndex("type", "type", { unique: false })
        }

        if (!db.objectStoreNames.contains(STORE_DAILY)) {
          const ds = db.createObjectStore(STORE_DAILY, { keyPath: "date" })
          ds.createIndex("createdAt", "createdAt", { unique: false })
        }
      }

      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORE_INSIGHTS)) {
          const is = db.createObjectStore(STORE_INSIGHTS, { keyPath: "id" })
          is.createIndex("createdAt", "createdAt", { unique: false })
          is.createIndex("category", "category", { unique: false })
          is.createIndex("sourceThreadId", "sourceThreadId", { unique: false })
        }

        if (!db.objectStoreNames.contains(STORE_PROFILE_UPDATES)) {
          const ps = db.createObjectStore(STORE_PROFILE_UPDATES, { keyPath: "id" })
          ps.createIndex("timestamp", "timestamp", { unique: false })
        }
      }

      if (oldVersion < 3) {
        // --- Layer1 事件新增索引 ---
        if (db.objectStoreNames.contains(STORE_EVENTS)) {
          const tx = (event.target as IDBOpenDBRequest).transaction
          if (tx) {
            const es = tx.objectStore(STORE_EVENTS)
            if (!es.indexNames.contains("dateKey")) {
              es.createIndex("dateKey", "dateKey", { unique: false })
            }
            if (!es.indexNames.contains("dwellStatus")) {
              es.createIndex("dwellStatus", "dwellStatus", { unique: false })
            }
          }
        }

        // --- 书签变更 store ---
        if (!db.objectStoreNames.contains(STORE_BOOKMARK_CHANGES)) {
          const bs = db.createObjectStore(STORE_BOOKMARK_CHANGES, { keyPath: "id" })
          bs.createIndex("dateKey", "dateKey", { unique: false })
          bs.createIndex("timestamp", "timestamp", { unique: false })
          bs.createIndex("action", "action", { unique: false })
          bs.createIndex("bookmarkId", "bookmarkId", { unique: false })
        }
      }
    }
  })

  return dbPromise
}
