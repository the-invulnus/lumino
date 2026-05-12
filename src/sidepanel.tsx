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
import { exportWorkspaceFile } from "./lib/fs/workspace"
import "./styles/paper.css"
import blackCatGif from "data-base64:~black_cat.gif"

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

  // 检测工具结果是否为错误
  let toolError: string | null = null
  if (hasResult) {
    try {
      const parsed = JSON.parse(result!)
      if (parsed && typeof parsed === "object" && parsed.error) {
        toolError = parsed.error
        // 尝试获取更友好的错误消息
        if (parsed.message) toolError = `${parsed.error}: ${parsed.message}`
      }
    } catch {
      // 不是 JSON，忽略
    }
  }
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
            (toolError
              ? " lumi-tool-call__icon--error"
              : hasResult
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
          ) : toolError ? (
            <svg className="lumi-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: "var(--lumi-error, #e5484d)"}}>
              <circle cx="12" cy="12" r="10" />
              <line x1="15" x2="9" y1="9" y2="15" />
              <line x1="9" x2="15" y1="9" y2="15" />
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
        {toolError && (
          <span className="lumi-tool-call__error-badge" title={toolError}>!</span>
        )}
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
            <div className="lumi-tool-call__detail-label-row">
              <span className="lumi-tool-call__detail-label">Arguments:</span>
              {(call.function.name === "read_file" || call.function.name === "write_file") && (() => {
                let filePath: string | null = null
                try {
                  const args = JSON.parse(call.function.arguments)
                  filePath = args.file_path || null
                } catch { /* ignore */ }
                if (!filePath) return null
                return (
                <button
                  type="button"
                  className="lumi-tool-call__download"
                  title={`下载 ${filePath}`}
                  onClick={async (e) => {
                    e.stopPropagation()
                    const exported = await exportWorkspaceFile(filePath!)
                    if (!exported) return
                    const url = URL.createObjectURL(exported.blob)
                    const a = document.createElement("a")
                    a.href = url
                    a.download = exported.filename
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" x2="12" y1="15" y2="3" />
                  </svg>
                </button>
                )
              })()}
            </div>
            <pre>{argsDisplay}</pre>
          </div>
          <div className="lumi-tool-call__detail-section">
            <div className="lumi-tool-call__detail-label">Result:</div>
            <pre className={toolError ? "lumi-tool-call__result--error" : ""}>{result}</pre>
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
  /** 每个 thread 独立跟踪是否正在发送请求 */
  const sendInFlightMapRef = useRef<Record<string, boolean>>({})
  /** 每个 thread 的 AbortController，切换 tab 时 cancel 旧请求 */
  const abortMapRef = useRef<Record<string, AbortController>>({})
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

    // 仅阻止当前 thread 重复发送，不阻止其他 thread
    if (sendInFlightMapRef.current[threadId]) {
      return
    }

    // 切换 tab 时取消旧的未完成请求
    sendInFlightMapRef.current[threadId] = true
    setIsLoading(true)
    setError("")
    setDraft("")

    // 将 agent 状态输出到 console 以便调试
    const statusLog = (...args: unknown[]) => {
      console.log("[lumino:sidepanel]", ...args)
      setError("")  // 清除旧错误
    }
    statusLog("开始请求，当前消息数:", messages.length)

    try {
      const history = cloneMessages(messages)

      // 先乐观添加用户消息（同步 push 到本地数组，再一次性 setMessages）
      const userMsg: OpenAiChatMessage = { role: "user", content: trimmed }
      const baseMessages = [...history, userMsg]
      setMessages(cloneMessages(baseMessages))

      // 保持一份同步引用，避免 React setState 异步导致流式 delta 拼错消息
      let streamingContent = ""

      // 流式期间累积的工具调用
      let streamingToolCalls: Array<{ id: string; name: string; arguments: string }> = []

      const next = await runAgentLoop({
        settings,
        threadId,
        historyMessages: history,
        userInput: trimmed,
        onStreamChunk: ({ delta, tool_calls }) => {
          if (activeThreadIdRef.current !== threadId) return
          streamingContent += delta
          // 合并工具调用增量（按 index 去重聚合）
          if (tool_calls) {
            for (const tc of tool_calls) {
              // 使用 tool_calls 在数组中的隐式顺序作为 key
              const key = tc.name || tc.id || `tool_${streamingToolCalls.length}`
              const existing = streamingToolCalls.find(
                (t) => (tc.id && t.id === tc.id) || (!tc.id && t.name === tc.name)
              )
              if (existing) {
                // 更新 arguments（流式累积）和 id
                if (tc.id) existing.id = tc.id
                existing.arguments += tc.arguments
              } else {
                streamingToolCalls.push(tc)
              }
            }
          }
          // 直接基于 baseMessages 构造，不依赖 prev（避免 React 批处理竞态）
          const msgs = cloneMessages(baseMessages)
          msgs.push({
            role: "assistant",
            content: streamingContent,
            tool_calls: streamingToolCalls.length > 0
              ? streamingToolCalls.map((tc) => ({
                  id: tc.id || `call_streaming`,
                  type: "function" as const,
                  function: { name: tc.name, arguments: tc.arguments }
                }))
              : undefined
          })
          setMessages(msgs)
        },
        onMessagesUpdate: async (msgs) => {
          // 工具调用完成后的完整更新 —— 仅在仍是当前 tab 时更新 UI
          if (threadId === activeThreadIdRef.current) {
            setMessages(cloneMessages(msgs))
          }
          await saveThreadMessages(threadId, msgs)
          if (threadId === activeThreadIdRef.current) {
            await refreshThreadList()
          }
        }
      })

      // 用完整 messages 替换流式累积的中间状态 —— 仅在仍是当前 tab
      if (threadId === activeThreadIdRef.current) {
        setMessages(cloneMessages(next))
      }
      await persistMessages(threadId, next)
    } catch (requestError) {
      if (threadId === activeThreadIdRef.current) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "请求模型失败，请检查配置后重试。"
        )
      }
    } finally {
      delete sendInFlightMapRef.current[threadId]
      if (threadId === activeThreadIdRef.current) {
        setIsLoading(false)
      }
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
          <div className="paper-sidepanel-layout-row">
          <div className="paper-sidepanel-layout">
            <header className="paper-sp-header">
              <div className="paper-sp-brand">
                <img
                  aria-hidden
                  className="paper-logo-cat"
                  src={blackCatGif}
                  alt="Lumi"
                />
                <div className="paper-sp-brand-text">
                  <h1 className="paper-sp-title">Lumi Knows You</h1>
                </div>
              </div>
              <div className="paper-sp-header-actions">
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
                          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
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

          {/* 右侧导航栏 */}
          <nav className="paper-side-nav" aria-label="功能导航">
            {/* Chat - 激活态 */}
            <button className="paper-side-nav-btn paper-side-nav-btn--active" type="button" title="Chat">
              <span className="paper-side-nav-btn-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <span className="paper-side-nav-btn-label">Chat</span>
            </button>
          </nav>
          </div>
        </div>
      </div>
    </main>
  )
}

export default SidePanel
