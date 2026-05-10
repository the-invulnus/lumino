import type { OpenAiChatMessage } from "./openai-messages"
import { openDatabase, STORE_THREADS } from "../db"

export const DEFAULT_THREAD_ID = "default"

export type ChatThreadRecord = {
  id: string
  updatedAt: number
  title?: string
  messages: OpenAiChatMessage[]
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

  return new Promise<ChatThreadRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_THREADS, "readonly")
    const req = tx.objectStore(STORE_THREADS).get(threadId)

    req.onsuccess = () => resolve(req.result as ChatThreadRecord | undefined)
    req.onerror = () => reject(req.error ?? new Error("getThread failed"))
  })
}

export async function putThread(record: ChatThreadRecord): Promise<void> {
  const db = await openDatabase()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_THREADS, "readwrite")
    tx.objectStore(STORE_THREADS).put(record)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("putThread failed"))
    tx.onabort = () => reject(tx.error ?? new Error("putThread aborted"))
  })
}

export async function listThreads(): Promise<ChatThreadRecord[]> {
  const db = await openDatabase()

  return new Promise<ChatThreadRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_THREADS, "readonly")
    const req = tx.objectStore(STORE_THREADS).getAll()

    req.onsuccess = () => {
      const rows = (req.result as ChatThreadRecord[]) ?? []
      rows.sort((a, b) => b.updatedAt - a.updatedAt)
      resolve(rows)
    }

    req.onerror = () => reject(req.error ?? new Error("listThreads failed"))
  })
}

export async function deleteThread(threadId: string): Promise<void> {
  const db = await openDatabase()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_THREADS, "readwrite")
    tx.objectStore(STORE_THREADS).delete(threadId)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("deleteThread failed"))
    tx.onabort = () => reject(tx.error ?? new Error("deleteThread aborted"))
  })
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
