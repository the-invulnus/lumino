// ============================================================
// 统一 IndexedDB 数据库 — 所有模块共享同一个连接
// ============================================================

const DB_NAME = "lumino"
const DB_VERSION = 4

export const STORE_THREADS = "threads"

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
    }
  })

  return dbPromise
}
