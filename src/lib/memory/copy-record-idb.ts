// ============================================================
// Copy Record IDB 操作 — copy_records 表的读写 + 清理
// ============================================================

import type { CopyRecord } from "./types"
import { openDatabase, STORE_COPY_RECORDS } from "../db"

const MAX_AGE_DAYS = 7

/**
 * 追加一条复制记录。
 */
export async function insertCopyRecord(record: CopyRecord): Promise<void> {
  const db = await openDatabase()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_COPY_RECORDS, "readwrite")
    tx.objectStore(STORE_COPY_RECORDS).put(record)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("insertCopyRecord failed"))
    tx.onabort = () => reject(tx.error ?? new Error("insertCopyRecord aborted"))
  })
}

/**
 * 按 dateKey 查询某天的所有复制记录。
 */
export async function getCopyRecordsByDateKey(
  dateKey: string
): Promise<CopyRecord[]> {
  const db = await openDatabase()

  return new Promise<CopyRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_COPY_RECORDS, "readonly")
    const index = tx.objectStore(STORE_COPY_RECORDS).index("dateKey")
    const req = index.getAll(IDBKeyRange.only(dateKey))
    req.onsuccess = () => resolve((req.result as CopyRecord[]) ?? [])
    req.onerror = () =>
      reject(req.error ?? new Error("getCopyRecordsByDateKey failed"))
  })
}

/**
 * 清理超过保留期的记录。
 */
export async function cleanupCopyRecords(): Promise<number> {
  const db = await openDatabase()
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000

  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE_COPY_RECORDS, "readwrite")
    const index = tx.objectStore(STORE_COPY_RECORDS).index("timestamp")
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
      reject(tx.error ?? new Error("cleanupCopyRecords failed"))
  })
}
