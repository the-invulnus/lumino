// ============================================================
// 记忆系统 IndexedDB 操作 — threads + bookmark_changes
// ============================================================

import type { BookmarkChangeRecord } from "./types"
import {
  openDatabase,
  STORE_THREADS,
  STORE_BOOKMARK_CHANGES
} from "../db"

const MAX_BOOKMARK_AGE_DAYS = 90

// ---- Threads ----

export async function loadAllThreads(): Promise<unknown[]> {
  const db = await openDatabase()

  return new Promise<unknown[]>((resolve, reject) => {
    const tx = db.transaction(STORE_THREADS, "readonly")
    const req = tx.objectStore(STORE_THREADS).getAll()

    req.onsuccess = () => resolve((req.result as unknown[]) ?? [])
    req.onerror = () => reject(req.error ?? new Error("loadAllThreads failed"))
  })
}

export async function saveThread(thread: Record<string, unknown>): Promise<void> {
  const db = await openDatabase()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_THREADS, "readwrite")
    tx.objectStore(STORE_THREADS).put(thread)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("saveThread failed"))
    tx.onabort = () => reject(tx.error ?? new Error("saveThread aborted"))
  })
}

export async function deleteThread(id: string): Promise<void> {
  const db = await openDatabase()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_THREADS, "readwrite")
    tx.objectStore(STORE_THREADS).delete(id)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("deleteThread failed"))
    tx.onabort = () => reject(tx.error ?? new Error("deleteThread aborted"))
  })
}

// ---- Bookmark Changes ----

export async function appendBookmarkChange(
  event: BookmarkChangeRecord
): Promise<void> {
  const db = await openDatabase()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKMARK_CHANGES, "readwrite")
    tx.objectStore(STORE_BOOKMARK_CHANGES).put(event)

    tx.oncomplete = () => resolve()
    tx.onerror = () =>
      reject(tx.error ?? new Error("appendBookmarkChange failed"))
    tx.onabort = () =>
      reject(tx.error ?? new Error("appendBookmarkChange aborted"))
  })
}

export async function getBookmarkChangesByDateKey(
  dateKey: string
): Promise<BookmarkChangeRecord[]> {
  const db = await openDatabase()

  return new Promise<BookmarkChangeRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKMARK_CHANGES, "readonly")
    const index = tx.objectStore(STORE_BOOKMARK_CHANGES).index("dateKey")

    if (!index) {
      resolve([])
      return
    }

    const req = index.getAll(IDBKeyRange.only(dateKey))
    req.onsuccess = () =>
      resolve((req.result as BookmarkChangeRecord[]) ?? [])
    req.onerror = () =>
      reject(req.error ?? new Error("getBookmarkChangesByDateKey failed"))
  })
}

/**
 * 清理超过保留期的书签变更记录。
 */
export async function cleanupBookmarkChanges(): Promise<number> {
  const db = await openDatabase()
  const cutoff = Date.now() - MAX_BOOKMARK_AGE_DAYS * 24 * 60 * 60 * 1000

  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKMARK_CHANGES, "readwrite")
    const index = tx.objectStore(STORE_BOOKMARK_CHANGES).index("timestamp")
    const range = IDBKeyRange.upperBound(cutoff)
    let deletedCount = 0

    index.openCursor(range).onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
      if (cursor) {
        cursor.delete()
        deletedCount++
        cursor.continue()
      }
    }

    tx.oncomplete = () => resolve(deletedCount)
    tx.onerror = () =>
      reject(tx.error ?? new Error("cleanupBookmarkChanges failed"))
  })
}

// ---- 诊断 / 调试 ----

export async function getStorageStats(): Promise<{
  dbName: string
  dbVersion: number
  stores: Record<string, number>
}> {
  const db = await openDatabase()
  const storeNames = Array.from(db.objectStoreNames) as string[]
  const stores: Record<string, number> = {}

  for (const name of storeNames) {
    try {
      const tx = db.transaction(name, "readonly")
      const count = await new Promise<number>((resolve, reject) => {
        const req = tx.objectStore(name).count()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      stores[name] = count
    } catch {
      stores[name] = -1
    }
  }

  return {
    dbName: db.name,
    dbVersion: db.version,
    stores
  }
}
