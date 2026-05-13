// ============================================================
// 统一 IndexedDB 数据库 — 所有模块共享同一个连接
// ============================================================

const DB_NAME = "lumino"
const DB_VERSION = 4

export const STORE_THREADS = "threads"
export const STORE_PAGE_VISITS = "page_visits"
export const STORE_BOOKMARK_CHANGES = "bookmark_changes"
export const STORE_INPUT_EVENTS = "input_events"
export const STORE_DOWNLOAD_RECORDS = "download_records"
export const STORE_COPY_RECORDS = "copy_records"

let dbPromise: Promise<IDBDatabase> | null = null

export function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise
  }

  dbPromise = new Promise((resolve, reject) => {
    // 先尝试打开 v4，如果失败则删库重建
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

      // 删除所有旧表，从零重建
      const allNames = Array.from(db.objectStoreNames)
      for (const name of allNames) {
        db.deleteObjectStore(name)
      }

      // threads
      db.createObjectStore(STORE_THREADS, { keyPath: "id" })

      // page_visits
      const pv = db.createObjectStore(STORE_PAGE_VISITS, { keyPath: "id" })
      pv.createIndex("dateKey", "dateKey", { unique: false })
      pv.createIndex("hostname", "hostname", { unique: false })
      pv.createIndex("timestamp", "timestamp", { unique: false })

      // bookmark_changes
      const bc = db.createObjectStore(STORE_BOOKMARK_CHANGES, { keyPath: "id" })
      bc.createIndex("dateKey", "dateKey", { unique: false })
      bc.createIndex("action", "action", { unique: false })
      bc.createIndex("timestamp", "timestamp", { unique: false })

      // input_events
      const ie = db.createObjectStore(STORE_INPUT_EVENTS, { keyPath: "id" })
      ie.createIndex("dateKey", "dateKey", { unique: false })
      ie.createIndex("hostname", "hostname", { unique: false })
      ie.createIndex("timestamp", "timestamp", { unique: false })

      // download_records
      const dr = db.createObjectStore(STORE_DOWNLOAD_RECORDS, { keyPath: "id" })
      dr.createIndex("dateKey", "dateKey", { unique: false })
      dr.createIndex("timestamp", "timestamp", { unique: false })

      // copy_records
      const cr = db.createObjectStore(STORE_COPY_RECORDS, { keyPath: "id" })
      cr.createIndex("dateKey", "dateKey", { unique: false })
      cr.createIndex("hostname", "hostname", { unique: false })
      cr.createIndex("timestamp", "timestamp", { unique: false })
    }
  })

  return dbPromise
}
