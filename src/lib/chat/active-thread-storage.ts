const ACTIVE_THREAD_KEY = "lumino_active_thread_id"

export async function getActiveThreadId(): Promise<string | undefined> {
  const data = await chrome.storage.local.get(ACTIVE_THREAD_KEY)
  const value = data[ACTIVE_THREAD_KEY]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

export async function setActiveThreadId(threadId: string): Promise<void> {
  await chrome.storage.local.set({ [ACTIVE_THREAD_KEY]: threadId })
}
