// ============================================================
// 统一 IndexedDB 数据库 — 所有模块共享同一个连接
// ============================================================

const DB_NAME = "lumino"
const DB_VERSION = 1

export const STORE_THREADS = "threads"
export const STORE_EVENTS = "layer1_events"
export const STORE_DAILY = "daily_memories"

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
  })

  return dbPromise
}
