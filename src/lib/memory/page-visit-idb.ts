// ============================================================
// Page Visit IDB 操作 — page_visits 表的读写 + 清理
// ============================================================

import type { PageVisitRecord } from "./types"
import { openDatabase, STORE_PAGE_VISITS } from "../db"

const MAX_AGE_DAYS = 90

/**
 * 追加一条页面浏览记录。
 */
export async function insertPageVisit(record: PageVisitRecord): Promise<void> {
  const db = await openDatabase()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PAGE_VISITS, "readwrite")
    tx.objectStore(STORE_PAGE_VISITS).put(record)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("insertPageVisit failed"))
    tx.onabort = () => reject(tx.error ?? new Error("insertPageVisit aborted"))
  })
}

/**
 * 按 dateKey 查询某天的所有页面浏览记录。
 */
export async function getPageVisitsByDateKey(
  dateKey: string
): Promise<PageVisitRecord[]> {
  const db = await openDatabase()

  return new Promise<PageVisitRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_PAGE_VISITS, "readonly")
    const index = tx.objectStore(STORE_PAGE_VISITS).index("dateKey")
    const req = index.getAll(IDBKeyRange.only(dateKey))
    req.onsuccess = () => resolve((req.result as PageVisitRecord[]) ?? [])
    req.onerror = () =>
      reject(req.error ?? new Error("getPageVisitsByDateKey failed"))
  })
}

/**
 * 清理超过保留期的记录。
 */
export async function cleanupPageVisits(): Promise<number> {
  const db = await openDatabase()
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000

  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE_PAGE_VISITS, "readwrite")
    const index = tx.objectStore(STORE_PAGE_VISITS).index("timestamp")
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
      reject(tx.error ?? new Error("cleanupPageVisits failed"))
  })
}
