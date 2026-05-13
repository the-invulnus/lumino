// ============================================================
// Input Event IDB 操作 — input_events 表的读写 + 清理
// ============================================================

import type { InputEventRecord } from "./types"
import { openDatabase, STORE_INPUT_EVENTS } from "../db"

const MAX_AGE_DAYS = 7

/**
 * 追加一条输入事件记录。
 */
export async function insertInputEvent(record: InputEventRecord): Promise<void> {
  const db = await openDatabase()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_INPUT_EVENTS, "readwrite")
    tx.objectStore(STORE_INPUT_EVENTS).put(record)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("insertInputEvent failed"))
    tx.onabort = () => reject(tx.error ?? new Error("insertInputEvent aborted"))
  })
}

/**
 * 按 dateKey 查询某天的所有输入事件。
 */
export async function getInputEventsByDateKey(
  dateKey: string
): Promise<InputEventRecord[]> {
  const db = await openDatabase()

  return new Promise<InputEventRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_INPUT_EVENTS, "readonly")
    const index = tx.objectStore(STORE_INPUT_EVENTS).index("dateKey")
    const req = index.getAll(IDBKeyRange.only(dateKey))
    req.onsuccess = () => resolve((req.result as InputEventRecord[]) ?? [])
    req.onerror = () =>
      reject(req.error ?? new Error("getInputEventsByDateKey failed"))
  })
}

/**
 * 清理超过保留期的记录。
 */
export async function cleanupInputEvents(): Promise<number> {
  const db = await openDatabase()
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000

  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE_INPUT_EVENTS, "readwrite")
    const index = tx.objectStore(STORE_INPUT_EVENTS).index("timestamp")
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
      reject(tx.error ?? new Error("cleanupInputEvents failed"))
  })
}
