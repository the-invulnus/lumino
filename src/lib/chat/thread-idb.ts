import type { OpenAiChatMessage } from "./openai-messages"

const DB_NAME = "lumino_chat"
const DB_VERSION = 1
const STORE = "threads"

/** 兼容旧数据：早期单线程使用的 id */
export const DEFAULT_THREAD_ID = "default"

export type ChatThreadRecord = {
  id: string
  updatedAt: number
  /** 列表展示用；缺省时由首条用户消息推导 */
  title?: string
  messages: OpenAiChatMessage[]
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB open failed"))
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" })
      }
    }
  })
}

export function suggestTitleFromMessages(
  messages: OpenAiChatMessage[]
): string | undefined {
  const user = messages.find((message) => message.role === "user")
  if (!user || typeof user.content !== "string") {
    return undefined
  }

  const text = user.content.trim().replace(/\s+/g, " ")
  if (!text) {
    return undefined
  }

  return text.length > 26 ? `${text.slice(0, 25)}…` : text
}

export async function getThread(threadId: string): Promise<ChatThreadRecord | undefined> {
  const db = await openDatabase()

  try {
    return await new Promise<ChatThreadRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly")
      const store = tx.objectStore(STORE)
      const getReq = store.get(threadId)

      getReq.onsuccess = () => {
        resolve(getReq.result as ChatThreadRecord | undefined)
      }

      getReq.onerror = () => {
        reject(getReq.error ?? new Error("getThread failed"))
      }
    })
  } finally {
    db.close()
  }
}

export async function putThread(record: ChatThreadRecord): Promise<void> {
  const db = await openDatabase()

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      const store = tx.objectStore(STORE)
      store.put(record)

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error("putThread failed"))
      tx.onabort = () => reject(tx.error ?? new Error("putThread aborted"))
    })
  } finally {
    db.close()
  }
}

export async function listThreads(): Promise<ChatThreadRecord[]> {
  const db = await openDatabase()

  try {
    return await new Promise<ChatThreadRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly")
      const store = tx.objectStore(STORE)
      const req = store.getAll()

      req.onsuccess = () => {
        const rows = (req.result as ChatThreadRecord[]) ?? []
        rows.sort((a, b) => b.updatedAt - a.updatedAt)
        resolve(rows)
      }

      req.onerror = () => {
        reject(req.error ?? new Error("listThreads failed"))
      }
    })
  } finally {
    db.close()
  }
}

export async function deleteThread(threadId: string): Promise<void> {
  const db = await openDatabase()

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.objectStore(STORE).delete(threadId)

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error("deleteThread failed"))
      tx.onabort = () => reject(tx.error ?? new Error("deleteThread aborted"))
    })
  } finally {
    db.close()
  }
}

export async function createEmptyThread(): Promise<ChatThreadRecord> {
  const id = crypto.randomUUID()
  const record: ChatThreadRecord = {
    id,
    updatedAt: Date.now(),
    title: "新会话",
    messages: []
  }

  await putThread(record)
  return record
}

export async function loadDefaultThread(): Promise<ChatThreadRecord> {
  const existing = await getThread(DEFAULT_THREAD_ID)
  if (existing) {
    return existing
  }

  return {
    id: DEFAULT_THREAD_ID,
    updatedAt: Date.now(),
    title: "默认",
    messages: []
  }
}

export async function saveThreadMessages(
  threadId: string,
  messages: OpenAiChatMessage[]
): Promise<void> {
  const existing = await getThread(threadId)
  const derived = suggestTitleFromMessages(messages)
  const title =
    derived ?? existing?.title ?? (threadId === DEFAULT_THREAD_ID ? "默认" : "新会话")

  await putThread({
    id: threadId,
    updatedAt: Date.now(),
    title,
    messages
  })
}
