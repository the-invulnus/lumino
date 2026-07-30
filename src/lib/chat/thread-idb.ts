import type { OpenAiChatMessage } from "./openai-messages"
import { openDatabase, STORE_THREADS } from "../db"
import { t } from "../i18n"

export const DEFAULT_THREAD_ID = "default"

export type ChatThreadRecord = {
  id: string
  updatedAt: number
  title?: string
  messages: OpenAiChatMessage[]
  /** Agent 模式 id（"chat" | "research" | "replicate" | "automate" | custom-uuid） */
  mode?: string
  /** 自定义 Agent 名称（内置模式为 undefined） */
  agentName?: string
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

export async function listThreads(modeFilter?: string): Promise<ChatThreadRecord[]> {
  const db = await openDatabase()

  return new Promise<ChatThreadRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_THREADS, "readonly")
    const req = tx.objectStore(STORE_THREADS).getAll()

    req.onsuccess = () => {
      let rows = (req.result as ChatThreadRecord[]) ?? []
      if (modeFilter) {
        rows = rows.filter((r) => r.mode === modeFilter || (!r.mode && modeFilter === "chat"))
      }
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
    // 标题留空，前端展示时用 i18n 的 thread.defaultTitle 兜底（随语言切换）
    title: undefined,
    messages: []
  }

  await putThread(record)
  return record
}

/**
 * 用 LLM 根据第一条用户消息生成简短会话标题。
 * 失败时兜底截取用户输入前 20 字符。
 */
export async function generateThreadTitle(
  userInput: string,
  assistantReply: string,
  llmSettings: { baseUrl: string; apiKey: string; model: string }
): Promise<string> {
  const text = userInput.trim().replace(/\s+/g, " ")
  if (!text) return t("thread.defaultTitle")

  const replySnippet = assistantReply.trim().replace(/\s+/g, " ").slice(0, 300)

  const prompt = `User: ${text.slice(0, 200)}\nAssistant: ${replySnippet}\n\nGenerate a short title for this conversation (under 10 characters), in the SAME language as the user's message. Output only the title.`

  const url = `${llmSettings.baseUrl}/chat/completions`

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llmSettings.apiKey}`
      },
      body: JSON.stringify({
        model: llmSettings.model,
        messages: [
          { role: "system", content: "You are a title generator. Based on the user's question and the assistant's reply, generate a short conversation title. The title MUST be in the SAME language as the user's question (English question → English title; Chinese question → Chinese title; etc.). Output only the title — no quotes, punctuation, or any other text. The title MUST not only contain the core concepts, but also reflect the user's intent, making it easily recognized from a groups of titles. Keep it short and concise." },
          { role: "user", content: prompt }
        ],
        max_tokens: 30,
        temperature: 0.3,
        thinking: { type: "disabled" }
      })
    })

    if (!res.ok) {
      console.warn("[lumino:title] HTTP", res.status)
      return text.slice(0, 20)
    }

    const data = await res.json() as { choices?: { message?: { content?: string } }[] }
    const raw = (data.choices?.[0]?.message?.content ?? "").trim()
    const title = raw.replace(/^["'「『]|["'」』]$/g, "").replace(/[。，、！？,.!?]/g, "").trim()
    return title.slice(0, 20) || text.slice(0, 20)
  } catch (err) {
    console.warn("[lumino:title] 异常:", err)
    return text.slice(0, 20)
  }
}

export async function saveThreadMessages(
  threadId: string,
  messages: OpenAiChatMessage[]
): Promise<void> {
  const existing = await getThread(threadId)
  // 标题由 generateTitleIfNew 在 agent 完整回复后生成，这里只保留已有标题；
  // 未生成前留空，前端用 i18n 的 thread.defaultTitle 兜底（随语言切换）
  const title = existing?.title

  await putThread({
    id: threadId,
    updatedAt: Date.now(),
    title,
    messages,
    mode: existing?.mode,
    agentName: existing?.agentName
  })
}
