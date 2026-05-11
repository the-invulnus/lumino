import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent
} from "react"

import { getActiveThreadId, setActiveThreadId } from "./lib/chat/active-thread-storage"
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
import { runAgentLoop } from "./lib/chat/agent-loop"
import { registerAllTools } from "./lib/chat/tool-registry"
import type { LlmSettings } from "./lib/llm/types"
import { getLlmSettings, hasCompleteLlmSettings } from "./lib/settings"
import { loadUserProfile } from "./lib/memory/user-profile"
import { loadDailyMemories } from "./lib/memory/daily-memory"
import { readWorkspaceFile } from "./lib/fs/workspace"
import type { UserProfile, DailyMemoryEntry } from "./lib/memory/types"
import "./styles/paper.css"

registerAllTools()

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

function ChatMessageBlock({
  message,
  allMessages,
  index
}: {
  message: OpenAiChatMessage
  allMessages: OpenAiChatMessage[]
  index: number
}) {
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

    // 向前查找对应的 assistant tool_call，确定 tool name
    let toolName = ""
    let toolArgs: Record<string, unknown> = {}
    for (let i = index - 1; i >= 0; i--) {
      const prev = allMessages[i]
      if (prev.role === "assistant" && prev.tool_calls) {
        const match = prev.tool_calls.find((tc) => tc.id === id)
        if (match) {
          toolName = match.function.name
          try { toolArgs = JSON.parse(match.function.arguments || "{}") } catch { /* ignore */ }
          break
        }
      }
    }

    // 解析 tool 执行结果中的 path
    let resultPath = ""
    try {
      const parsed = JSON.parse(message.content ?? "{}")
      if (parsed.path && typeof parsed.path === "string") {
        resultPath = parsed.path
      }
    } catch { /* ignore */ }

    const showDownload = toolName === "write" && resultPath

    const handleDownload = async () => {
      try {
        const content = await readWorkspaceFile(resultPath)
        if (content === null) return
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = resultPath.split("/").pop() || "file.txt"
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 60000)
      } catch { /* ignore */ }
    }

    return (
      <div className="paper-chat-row paper-chat-row--tool">
        <div className="paper-chat-meta">
          结果 · {id.length > 10 ? `${id.slice(0, 8)}…` : id}
        </div>
        <pre className="paper-chat-tool-body">{message.content ?? ""}</pre>
        {showDownload ? (
          <button
            className="paper-secondary-button paper-secondary-button--sm"
            onClick={handleDownload}
            type="button"
            style={{ marginTop: 6 }}>
            ⬇ 下载文件
          </button>
        ) : null}
      </div>
    )
  }

  return null
}

function MemoryPanel({
  userProfile,
  dailyMemories
}: {
  userProfile: UserProfile | null
  dailyMemories: DailyMemoryEntry[]
}) {
  return (
    <section className="paper-memory-panel">
      <div className="paper-memory-section">
        <h3 className="paper-memory-title">👤 用户画像</h3>
        {userProfile ? (
          <div className="paper-memory-card">
            {userProfile.name && (
              <p className="paper-memory-row">
                <span className="paper-memory-label">名称</span> {userProfile.name}
              </p>
            )}
            <p className="paper-memory-row">
              <span className="paper-memory-label">语言</span>{" "}
              {userProfile.language === "zh" ? "中文" : "English"}
            </p>
            {userProfile.interests.length > 0 && (
              <p className="paper-memory-row">
                <span className="paper-memory-label">兴趣</span>
                <span className="paper-memory-tags">
                  {userProfile.interests.join(" · ")}
                </span>
              </p>
            )}
            {userProfile.frequentSites.length > 0 && (
              <p className="paper-memory-row">
                <span className="paper-memory-label">常用站点</span>
                <span className="paper-memory-tags">
                  {userProfile.frequentSites.slice(0, 8).join(" · ")}
                </span>
              </p>
            )}
            {userProfile.notes && (
              <p className="paper-memory-row">
                <span className="paper-memory-label">备注</span> {userProfile.notes}
              </p>
            )}
            {userProfile.updatedAt > 0 && (
              <p className="paper-memory-row paper-memory-row--meta">
                更新于 {new Date(userProfile.updatedAt).toLocaleString("zh-CN")}
              </p>
            )}
          </div>
        ) : (
          <p className="paper-memory-empty">暂无画像信息。</p>
        )}
      </div>

      <div className="paper-memory-section">
        <h3 className="paper-memory-title">📅 日记忆</h3>
        {dailyMemories.length > 0 ? (
          <div className="paper-memory-list">
            {dailyMemories.map((memory) => (
              <div className="paper-memory-card paper-memory-card--sm" key={memory.date}>
                <p className="paper-memory-row paper-memory-row--meta">
                  {memory.date}
                </p>
                <p className="paper-memory-row">{memory.summary}</p>
                {memory.keywords.length > 0 && (
                  <p className="paper-memory-row">
                    <span className="paper-memory-tags">
                      {memory.keywords.map((k) => `#${k}`).join(" ")}
                    </span>
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="paper-memory-empty">暂无日记忆。</p>
        )}
      </div>
    </section>
  )
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
  const sendInFlightRef = useRef(false)
  const draftMapRef = useRef<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<"chat" | "memory">("chat")
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [dailyMemories, setDailyMemories] = useState<DailyMemoryEntry[]>([])

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

  // 加载用户画像和记忆
  useEffect(() => {
    void (async () => {
      try {
        const [profile, memories] = await Promise.all([
          loadUserProfile(),
          loadDailyMemories()
        ])
        setUserProfile(profile)
        setDailyMemories(memories.slice(0, 14))
      } catch {
        // 加载失败不影响主流程
      }
    })()
  }, [])

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

  const selectThread = useCallback(
    async (threadId: string) => {
      if (threadId === activeThreadIdRef.current) {
        return
      }

      setError("")
      draftMapRef.current[activeThreadIdRef.current] = draftRef.current
      await setActiveThreadId(threadId)
      setActiveThreadIdState(threadId)
      const thread = await getThread(threadId)
      setMessages(cloneMessages(thread?.messages ?? []))
      setDraft(draftMapRef.current[threadId] ?? "")
      await refreshThreadList()
    },
    [refreshThreadList]
  )

  const handleNewThread = useCallback(async () => {
    setError("")

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
      const history = cloneMessages(messages)

      const next = await runAgentLoop({
        settings,
        threadId,
        historyMessages: history,
        userInput: trimmed,
        onMessagesUpdate: async (msgs) => {
          setMessages(cloneMessages(msgs))
          await saveThreadMessages(threadId, msgs)
          if (threadId === activeThreadIdRef.current) {
            await refreshThreadList()
          }
        }
      })

      setMessages(cloneMessages(next))
      await persistMessages(threadId, next)
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

            {/* Tab 切换：对话 / 记忆 */}
            <div className="paper-tabbar">
              <button
                aria-pressed={activeTab === "chat"}
                className={`paper-tab${activeTab === "chat" ? " paper-tab--active" : ""}`}
                onClick={() => setActiveTab("chat")}
                type="button">
                💬 对话
              </button>
              <button
                aria-pressed={activeTab === "memory"}
                className={`paper-tab${activeTab === "memory" ? " paper-tab--active" : ""}`}
                onClick={() => setActiveTab("memory")}
                type="button">
                🧠 记忆
              </button>
            </div>

            {activeTab === "chat" ? (
              <>
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
                          allMessages={visibleMessages}
                          index={index}
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
              </>
            ) : (
              <MemoryPanel
                userProfile={userProfile}
                dailyMemories={dailyMemories}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

export default SidePanel
