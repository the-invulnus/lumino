// ============================================================
// 统一 IndexedDB 数据库 — 所有模块共享同一个连接
// ============================================================

const DB_NAME = "lumino"
const DB_VERSION = 4

export const STORE_THREADS = "threads"

let dbPromise: Promise<IDBDatabase> | null = null

/**
 * 打开指定版本的数据库。
 * version 省略时以现有版本打开（不会触发升级）。
 */
function openWithVersion(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = version === undefined
      ? indexedDB.open(DB_NAME)
      : indexedDB.open(DB_NAME, version)

    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB open failed"))
    }

    request.onblocked = () => {
      // 其他上下文（Side Panel / Options / Service Worker）仍持有旧连接
      console.warn("[lumino:db] upgrade blocked by another open connection")
    }

    request.onupgradeneeded = () => {
      const db = request.result

      // 只做增量建表/迁移，绝不删除已有表。
      // 历史教训：旧实现在升级时 deleteObjectStore 删掉全部表再重建，
      // 任何 DB_VERSION 提升都会静默清空用户的全部历史会话。
      if (!db.objectStoreNames.contains(STORE_THREADS)) {
        db.createObjectStore(STORE_THREADS, { keyPath: "id" })
      }

      // 以后的 schema 变更按 event.oldVersion 分支追加，例如：
      // if (event.oldVersion < 5) { /* 迁移数据，不删表 */ }
    }

    request.onsuccess = () => {
      const db = request.result

      // 其他上下文请求升级时主动关闭当前连接，避免阻塞（onblocked）
      db.onversionchange = () => {
        db.close()
        if (dbPromise) dbPromise = null
      }

      resolve(db)
    }
  })
}

export function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise
  }

  dbPromise = (async () => {
    try {
      return await openWithVersion(DB_VERSION)
    } catch (err) {
      // 现有库版本高于当前代码（例如装过更新的开发版后回退）：
      // 不删库，按现有版本打开，保证历史数据仍可读
      if ((err as { name?: string })?.name === "VersionError") {
        console.warn("[lumino:db] existing DB is newer than code; opening it as-is")
        return await openWithVersion()
      }
      throw err
    }
  })().catch((err) => {
    dbPromise = null
    throw err
  })

  return dbPromise
}
