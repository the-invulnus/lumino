// ============================================================
// Download Record IDB 操作 — download_records 表的读写 + 清理
// ============================================================

import type { DownloadRecord } from "./types"
import { openDatabase, STORE_DOWNLOAD_RECORDS } from "../db"

const MAX_AGE_DAYS = 90

/**
 * 追加一条下载记录。
 */
export async function insertDownloadRecord(record: DownloadRecord): Promise<void> {
  const db = await openDatabase()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_DOWNLOAD_RECORDS, "readwrite")
    tx.objectStore(STORE_DOWNLOAD_RECORDS).put(record)

    tx.oncomplete = () => resolve()
    tx.onerror = () =>
      reject(tx.error ?? new Error("insertDownloadRecord failed"))
    tx.onabort = () =>
      reject(tx.error ?? new Error("insertDownloadRecord aborted"))
  })
}

/**
 * 按 dateKey 查询某天的所有下载记录。
 */
export async function getDownloadRecordsByDateKey(
  dateKey: string
): Promise<DownloadRecord[]> {
  const db = await openDatabase()

  return new Promise<DownloadRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_DOWNLOAD_RECORDS, "readonly")
    const index = tx.objectStore(STORE_DOWNLOAD_RECORDS).index("dateKey")
    const req = index.getAll(IDBKeyRange.only(dateKey))
    req.onsuccess = () => resolve((req.result as DownloadRecord[]) ?? [])
    req.onerror = () =>
      reject(req.error ?? new Error("getDownloadRecordsByDateKey failed"))
  })
}

/**
 * 清理超过保留期的记录。
 */
export async function cleanupDownloadRecords(): Promise<number> {
  const db = await openDatabase()
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000

  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE_DOWNLOAD_RECORDS, "readwrite")
    const index = tx.objectStore(STORE_DOWNLOAD_RECORDS).index("timestamp")
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
      reject(tx.error ?? new Error("cleanupDownloadRecords failed"))
  })
}
