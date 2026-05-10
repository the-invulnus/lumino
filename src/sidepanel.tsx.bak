import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent
} from "react"

import { getActiveThreadId, setActiveThreadId } from "./lib/chat/active-thread-storage"
import { executeLuminoToolCall, LUMINO_AGENT_TOOLS } from "./lib/chat/agent-tools"
import { cloneMessages, type OpenAiChatMessage } from "./lib/chat/openai-messages"
import {
  createEmptyThread,
  deleteThread,
  getThread,
  listThreads,
  saveThreadMessages,
  suggestTitleFromMessages,
  type ChatThreadRecord
} from "./lib/chat/thread-idb"
import { requestChatCompletionTurn } from "./lib/llm/openai"
import type { LlmSettings } from "./lib/llm/types"
import { getLlmSettings, hasCompleteLlmSettings } from "./lib/settings"
import "./styles/paper.css"

const DEFAULT_SYSTEM_PROMPT =
  "你是 Lumino，在浏览器侧栏里陪伴用户的助手。回答简洁、温暖；若用户需要事实或扩展能力，可合理使用提供的工具。"

const MAX_TOOL_ROUNDS = 8

function SendArrowIcon() {
  return (
    <svg
      aria-hidden
      className="paper-primary-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.25"
      viewBox="0 0 24 24">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  )
}

function formatMessagePreview(message: OpenAiChatMessage): string {
  if (message.role === "tool") {
    return message.content ?? ""
  }

  if (typeof message.content === "string") {
    return message.content
  }

  if (Array.isArray(message.content)) {
    return message.content.map((part) => part.text).join("\n")
  }

  return ""
}

function formatSessionTime(updatedAt: number): string {
  const diff = Date.now() - updatedAt
  if (diff < 60_000) {
    return "刚刚"
  }
  if (diff < 3600_000) {
    return `${Math.floor(diff / 60_000)} 分钟前`
  }
  if (diff < 86400_000) {
    return `${Math.floor(diff / 3600_000)} 小时前`
  }
  return new Date(updatedAt).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric"
  })
}

function threadLabel(record: ChatThreadRecord): string {
  return (
    record.title ??
    suggestTitleFromMessages(record.messages) ??
    (record.messages.length ? "会话" : "新会话")
  )
}

function ChatMessageBlock({ message }: { message: OpenAiChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="paper-chat-row paper-chat-row--user">
        <div className="paper-chat-bubble paper-chat-bubble--user">
          {formatMessagePreview(message)}
        </div>
      </div>
    )
  }

  if (message.role === "assistant") {
    const text = formatMessagePreview(message)
    const tools = message.tool_calls

    return (
      <div className="paper-chat-row paper-chat-row--assistant">
        <div className="paper-chat-bubble paper-chat-bubble--assistant">
          {text ? <div className="paper-chat-md">{text}</div> : null}
          {tools?.length ? (
            <div className="paper-chat-tools">
              <span className="paper-chat-meta">工具</span>
              <ul>
                {tools.map((call) => (
                  <li key={call.id}>
                    <code>{call.function.name}</code>
                    <pre className="paper-chat-json">{call.function.arguments}</pre>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  if (message.role === "tool") {
    const id = message.tool_call_id

    return (
      <div className="paper-chat-row paper-chat-row--tool">
        <div className="paper-chat-meta">
          结果 · {id.length > 10 ? `${id.slice(0, 8)}…` : id}
        </div>
        <pre className="paper-chat-tool-body">{message.content ?? ""}</pre>
      </div>
    )
  }

  return null
}

function SidePanel() {
  const [threads, setThreads] = useState<ChatThreadRecord[]>([])
  const [activeThreadId, setActiveThreadIdState] = useState<string>("")
  const [messages, setMessages] = useState<OpenAiChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const draftRef = useRef(draft)
  const [error, setError] = useState("")
  const [settings, setSettings] = useState<LlmSettings>({
    baseUrl: "",
    apiKey: "",
    model: ""
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [isHydrating, setIsHydrating] = useState(true)
  const scrollAnchorRef = useRef<HTMLDivElement>(null)
  const activeThreadIdRef = useRef("")
  /** 防止在 setState 生效前连点两次发送 */
  const sendInFlightRef = useRef(false)
  /** 每个会话独立的草稿 */
  const draftMapRef = useRef<Record<string, string>>({})

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId
  }, [activeThreadId])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  const refreshThreadList = useCallback(async () => {
    const rows = await listThreads()
    setThreads(rows)
    return rows
  }, [])

  useEffect(() => {
    getLlmSettings()
      .then((nextSettings) => {
        setSettings(nextSettings)
        setIsReady(true)
      })
      .catch(() => {
        setError("读取模型配置失败，请重新打开侧边栏。")
        setIsReady(true)
      })
  }, [])

  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      try {
        let rows = await listThreads()

        if (!cancelled && rows.length === 0) {
          const created = await createEmptyThread()
          await setActiveThreadId(created.id)
          rows = [created]
        }

        let nextActive = await getActiveThreadId()
        if (!nextActive || !rows.some((row) => row.id === nextActive)) {
          nextActive = rows[0]?.id ?? ""
          if (nextActive) {
            await setActiveThreadId(nextActive)
          }
        }

        if (cancelled || !nextActive) {
          return
        }

        const thread = await getThread(nextActive)

        if (!cancelled) {
          setThreads(rows)
          setActiveThreadIdState(nextActive)
          setMessages(cloneMessages(thread?.messages ?? []))
        }
      } catch {
        if (!cancelled) {
          setError("读取会话失败。")
        }
      } finally {
        if (!cancelled) {
          setIsHydrating(false)
        }
      }
    }

    void hydrate()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, isLoading, activeThreadId])

  const openOptionsPage = useCallback(async () => {
    await chrome.runtime.openOptionsPage()
  }, [])

  const persistMessages = useCallback(
    async (threadId: string, next: OpenAiChatMessage[]) => {
      await saveThreadMessages(threadId, next)
      if (threadId === activeThreadIdRef.current) {
        setMessages(cloneMessages(next))
      }
      await refreshThreadList()
    },
    [refreshThreadList]
  )

  const runAssistantTurns = useCallback(
    async (threadId: string, baseMessages: OpenAiChatMessage[]) => {
      let working = cloneMessages(baseMessages)
      let rounds = 0

      while (rounds < MAX_TOOL_ROUNDS) {
        if (!(await getThread(threadId))) {
          return
        }

        rounds += 1
        const { message: assistant } = await requestChatCompletionTurn(settings, {
          messages: working,
          tools: LUMINO_AGENT_TOOLS
        })

        if (!(await getThread(threadId))) {
          return
        }

        working.push({
          role: "assistant",
          content: assistant.content,
          tool_calls: assistant.tool_calls
        })
        await persistMessages(threadId, working)

        const calls = assistant.tool_calls
        if (!calls?.length) {
          break
        }

        for (const call of calls) {
          const content = await executeLuminoToolCall(call)
          working.push({
            role: "tool",
            tool_call_id: call.id,
            content
          })

          if (!(await getThread(threadId))) {
            return
          }

          await persistMessages(threadId, working)
        }
      }
    },
    [persistMessages, settings]
  )

  const selectThread = useCallback(
    async (threadId: string) => {
      if (threadId === activeThreadIdRef.current) {
        return
      }

      setError("")
      // 保存当前会话草稿
      draftMapRef.current[activeThreadIdRef.current] = draftRef.current
      await setActiveThreadId(threadId)
      setActiveThreadIdState(threadId)
      const thread = await getThread(threadId)
      setMessages(cloneMessages(thread?.messages ?? []))
      // 恢复目标会话草稿
      setDraft(draftMapRef.current[threadId] ?? "")
      await refreshThreadList()
    },
    [refreshThreadList]
  )

  const handleNewThread = useCallback(async () => {
    setError("")

    // 如果当前输入框为空且已有空会话（无消息），直接跳转
    const existingEmpty = threads.find(
      (t) => t.messages.length === 0 && !draftMapRef.current[t.id]
    )
    if (existingEmpty) {
      if (existingEmpty.id !== activeThreadIdRef.current) {
        draftMapRef.current[activeThreadIdRef.current] = draftRef.current
        await setActiveThreadId(existingEmpty.id)
        setActiveThreadIdState(existingEmpty.id)
        setMessages([])
        setDraft(draftMapRef.current[existingEmpty.id] ?? "")
      }
      return
    }

    draftMapRef.current[activeThreadIdRef.current] = draftRef.current
    const created = await createEmptyThread()
    await setActiveThreadId(created.id)
    setActiveThreadIdState(created.id)
    setMessages([])
    setDraft("")
    await refreshThreadList()
  }, [refreshThreadList, threads])

  const handleDeleteThread = useCallback(
    async (threadId: string, event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const wasActive = threadId === activeThreadIdRef.current
      await deleteThread(threadId)
      delete draftMapRef.current[threadId]
      const rows = await listThreads()

      if (rows.length === 0) {
        const created = await createEmptyThread()
        await setActiveThreadId(created.id)
        setActiveThreadIdState(created.id)
        setMessages([])
        setThreads([created])
        return
      }

      setThreads(rows)

      if (wasActive) {
        const nextId = rows[0].id
        await setActiveThreadId(nextId)
        setActiveThreadIdState(nextId)
        const nextThread = await getThread(nextId)
        setMessages(cloneMessages(nextThread?.messages ?? []))
      }
    },
    []
  )

  async function sendUserMessage() {
    const trimmed = draft.trim()
    const threadId = activeThreadIdRef.current

    if (!trimmed) {
      setError("请输入内容。")
      return
    }

    if (!threadId) {
      setError("请先选择或创建一个会话。")
      return
    }

    if (!hasCompleteLlmSettings(settings)) {
      setError("请先在设置页配置 Base URL、API Key 和模型。")
      return
    }

    if (sendInFlightRef.current) {
      return
    }

    sendInFlightRef.current = true
    setIsLoading(true)
    setError("")
    setDraft("")

    try {
      let next = cloneMessages(messages)

      if (!next.some((message) => message.role === "system")) {
        next = [{ role: "system", content: DEFAULT_SYSTEM_PROMPT }, ...next]
      }

      next.push({ role: "user", content: trimmed })
      await persistMessages(threadId, next)
      await runAssistantTurns(threadId, next)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "请求模型失败，请检查配置后重试。"
      )
    } finally {
      sendInFlightRef.current = false
      setIsLoading(false)
    }
  }

  const visibleMessages = messages.filter((message) => message.role !== "system")
  const isConfigured = hasCompleteLlmSettings(settings)

  return (
    <main className="paper-shell paper-sidepanel">
      <div aria-hidden className="paper-ambient">
        <div className="paper-blob paper-blob--a" />
        <div className="paper-blob paper-blob--b" />
        <div className="paper-blob paper-blob--c" />
      </div>

      <div className="paper-bezel-outer paper-bezel-outer--side">
        <div className="paper-bezel-inner paper-bezel-inner--side">
          <div className="paper-sidepanel-layout">
            <header className="paper-sp-header">
            <div className="paper-sp-brand">
              <div aria-hidden className="paper-logo paper-logo--sm">
                L
              </div>
              <div className="paper-sp-brand-text">
                <h1 className="paper-sp-title">Lumino</h1>
                <p className="paper-sp-tagline" title="多轮对话 · IndexedDB · OpenAI 兼容格式">
                  侧栏对话
                </p>
              </div>
            </div>
            <div className="paper-sp-header-actions">
              {settings.model ? (
                <span className="paper-badge paper-badge--tight" title={settings.model}>
                  {settings.model}
                </span>
              ) : null}
              <button
                className="paper-icon-text-btn"
                onClick={openOptionsPage}
                type="button">
                设置
              </button>
            </div>
            </header>

            <section className="paper-session-strip" aria-label="历史会话">
              <div className="paper-session-chips" role="list">
                {isHydrating ? (
                  <span className="paper-session-strip-hint">加载中…</span>
                ) : (
                  threads.map((row) => {
                    const selected = row.id === activeThreadId
                    const label = threadLabel(row)
                    const hint = `${label} · ${formatSessionTime(row.updatedAt)}`

                    return (
                      <div
                        className={`paper-session-chip${selected ? " paper-session-chip--active" : ""}`}
                        key={row.id}
                        role="listitem">
                        <button
                          className="paper-session-chip-main"
                          onClick={() => void selectThread(row.id)}
                          title={hint}
                          type="button">
                          {label}
                        </button>
                        <button
                          aria-label={`删除 ${label}`}
                          className="paper-session-chip-del"
                          onClick={(event) => void handleDeleteThread(row.id, event)}
                          title="删除会话"
                          type="button">
                          ×
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
              <button
                aria-label="新建会话"
                className="paper-session-add"
                disabled={isHydrating}
                onClick={() => void handleNewThread()}
                title="新建会话"
                type="button">
                ＋
              </button>
            </section>

            <section className="paper-chat-panel" aria-busy={isLoading}>
            {isReady && !isConfigured ? (
              <div className="paper-note paper-note--compact">
                <p>请先在设置中填写 Base URL、API Key 与模型。</p>
                <button
                  className="paper-secondary-button paper-secondary-button--sm"
                  onClick={openOptionsPage}
                  type="button">
                  打开设置
                </button>
              </div>
            ) : null}

            <div className="paper-chat-scroll" role="log" aria-relevant="additions">
              {isHydrating ? (
                <p className="paper-chat-hint">正在加载…</p>
              ) : visibleMessages.length === 0 ? (
                <p className="paper-chat-hint">
                  当前会话还没有消息。
                  <br />
                  在下方输入后发送即可。
                </p>
              ) : (
                visibleMessages.map((message, index) => (
                  <ChatMessageBlock
                    key={`${activeThreadId}-${index}-${message.role}`}
                    message={message}
                  />
                ))
              )}
              <div ref={scrollAnchorRef} />
            </div>

            <div className="paper-composer">
              <div className="paper-composer-row">
                <input
                  aria-label="对话输入"
                  className="paper-input paper-input--composer"
                  disabled={isLoading || !isReady || isHydrating}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void sendUserMessage()
                    }
                  }}
                  placeholder="输入消息，Enter 发送"
                  type="text"
                  value={draft}
                />
                <button
                  aria-busy={isLoading}
                  aria-label={isLoading ? "正在发送" : "发送"}
                  className="paper-composer-send"
                  disabled={!isReady || isLoading || isHydrating}
                  onClick={() => void sendUserMessage()}
                  type="button">
                  {isLoading ? (
                    <span aria-hidden className="paper-spinner paper-spinner--on-accent" />
                  ) : (
                    <SendArrowIcon />
                  )}
                </button>
              </div>

              {error ? (
                <p className="paper-error paper-error--tight" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}

export default SidePanel
