import {
  Fragment,
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


function LumiToolCall({
  call,
  result
}: {
  call: { id: string; type: "function"; function: { name: string; arguments: string } }
  result: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const hasResult = result !== null
  const isReadFileSkill =
    call.function.name === "read_file" &&
    (call.function.arguments || "").includes("SKILL.md")
  const isRunning = !hasResult

  let argsDisplay = call.function.arguments
  try {
    argsDisplay = JSON.stringify(JSON.parse(call.function.arguments), null, 2)
  } catch { /* keep raw */ }

  const handleToggle = () => {
    if (isReadFileSkill || isRunning) return
    setExpanded((prev) => !prev)
  }

  let skillName = ""
  if (isReadFileSkill) {
    const nm = call.function.arguments.match(/"name"\\s*:\\s*"([^"]+)"/)
    const fp = call.function.arguments.match(/"file_path"\\s*:\\s*"([^"]+)"/)
    skillName = nm?.[1] || fp?.[1] || "skill"
  }

  const label = isReadFileSkill
    ? `加载技能：${skillName}`
    : call.function.name

  return (
    <div className={`lumi-tool-call${isReadFileSkill ? " lumi-tool-call--skill" : ""}`}>
      <button
        type="button"
        className={
          "lumi-tool-call__trigger" +
          (expanded ? " lumi-tool-call__trigger--expanded" : "") +
          (isReadFileSkill || isRunning ? " lumi-tool-call__trigger--disabled" : "")
        }
        disabled={isReadFileSkill || isRunning}
        onClick={handleToggle}
      >
        <span
          className={
            "lumi-tool-call__icon" +
            (hasResult
              ? " lumi-tool-call__icon--ok"
              : isRunning
                ? " lumi-tool-call__icon--running"
                : "")
          }
        >
          {isReadFileSkill ? (
            <svg className="lumi-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16.5 9.4 7.55 4.24a1 1 0 0 0-1.45.9v13.72a1 1 0 0 0 1.45.9L16.5 14.6a1 1 0 0 0 0-1.72Z" />
              <line x1="3" x2="3" y1="22" y2="2" />
              <line x1="21" x2="21" y1="22" y2="2" />
            </svg>
          ) : isRunning ? (
            <svg className="lumi-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          ) : hasResult ? (
            <svg className="lumi-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          ) : (
            <svg className="lumi-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          )}
        </span>
        <span className="lumi-tool-call__name">{label}</span>
        {isRunning && (
          <span className="lumi-tool-call__running-label">running</span>
        )}
        {!isReadFileSkill && !isRunning && (
          <span className={`lumi-tool-call__chevron${expanded ? " lumi-tool-call__chevron--open" : ""}`}>
            <svg className="lumi-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        )}
      </button>
      {hasResult && (
        <div className={`lumi-tool-call__detail${expanded ? " lumi-tool-call__detail--open" : ""}`}>
          <div className="lumi-tool-call__detail-section">
            <div className="lumi-tool-call__detail-label">Arguments:</div>
            <pre>{argsDisplay}</pre>
          </div>
          <div className="lumi-tool-call__detail-section">
            <div className="lumi-tool-call__detail-label">Result:</div>
            <pre>{result}</pre>
          </div>
        </div>
      )}
    </div>
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
    const toolCalls = message.tool_calls

    // 收集后续 tool results
    const toolResults: Record<string, string> = {}
    for (let j = index + 1; j < allMessages.length; j++) {
      const next = allMessages[j]
      if (next.role === "tool" && next.tool_call_id) {
        toolResults[next.tool_call_id] = next.content ?? ""
      } else if (next.role !== "tool") {
        break
      }
    }

    const hasContent = !!text
    const hasTools = toolCalls && toolCalls.length > 0
    const paragraphs = hasContent ? text.split(/\n{2,}/) : []

    return (
      <div className="paper-chat-row paper-chat-row--assistant">
        <div className="paper-chat-bubble paper-chat-bubble--assistant">
          {hasTools ? (
            <div className="lumi-sequence-stack">
              {/* 文本段落与工具调用交错 */}
              {toolCalls!.map((call, i) => (
                <Fragment key={call.id}>
                  {i < paragraphs.length ? (
                    <div className="paper-chat-md">{paragraphs[i]}</div>
                  ) : null}
                  <LumiToolCall
                    call={call}
                    result={toolResults[call.id] ?? null}
                  />
                </Fragment>
              ))}
              {/* 剩余文本段落 */}
              {paragraphs.slice(toolCalls!.length).map((part, i) => (
                <div className="paper-chat-md" key={`md-${i}`}>{part}</div>
              ))}
            </div>
          ) : (
            <div className="paper-chat-md">{text}</div>
          )}
        </div>
      </div>
    )
  }

  // 独立 tool 结果：避免与 assistant 中已展示的重复
  if (message.role === "tool") {
    const id = message.tool_call_id

    let handled = false
    for (let i = index - 1; i >= 0; i--) {
      const prev = allMessages[i]
      if (prev.role === "assistant" && prev.tool_calls) {
        if (prev.tool_calls.some((tc) => tc.id === id)) {
          handled = true
        }
        break
      }
      if (prev.role !== "tool") break
    }
    if (handled) return null

    let toolName = ""
    for (let i = index - 1; i >= 0; i--) {
      const prev = allMessages[i]
      if (prev.role === "assistant" && prev.tool_calls) {
        const match = prev.tool_calls.find((tc) => tc.id === id)
        if (match) { toolName = match.function.name; break }
      }
    }

    return (
      <div className="paper-chat-row paper-chat-row--tool">
        <div className="paper-chat-meta">
          结果 · {toolName || id.slice(0, 8)}
        </div>
        <pre className="paper-chat-tool-body">{message.content ?? ""}</pre>
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
