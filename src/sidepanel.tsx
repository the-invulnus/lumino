import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
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
// agent loop 现在在 Service Worker 中运行
import { registerAllTools } from "./lib/chat/tool-registry"
import type { LlmSettings } from "./lib/llm/types"
import { getLlmSettings, hasCompleteLlmSettings } from "./lib/settings"
import { exportWorkspaceFile } from "./lib/fs/workspace"
import {
  START_AGENT_MESSAGE,
  STOP_AGENT_MESSAGE,
  AGENT_PROGRESS_MESSAGE,
  AGENT_COMPLETE_MESSAGE,
  AGENT_ERROR_MESSAGE,
  type StartAgentMessage,
  type StopAgentMessage,
  type AgentProgressMessage,
  type AgentCompleteMessage,
  type AgentErrorMessage
} from "./lib/side-panel-bridge"
import "./styles/components.css"
import { applyTheme, getTheme, type ThemeName } from "./lib/theme"
import blackCatGif from "data-base64:~black_cat.gif"
import { marked } from "marked"

registerAllTools().catch(() => { })

function SendArrowIcon() {
  return (
    <svg
      aria-hidden
      className="lm-primary-icon"
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

function renderMarkdown(text: string): JSX.Element {
  const html = marked.parse(text, { async: false }) as string
  return (
    <div
      className="lm-chat-md"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const target = e.target as HTMLElement
        const anchor = target.closest("a")
        if (anchor) {
          e.preventDefault()
          const href = anchor.getAttribute("href")
          if (href) {
            chrome.tabs.create({ url: href }).catch(() => {})
          }
        }
      }}
    />
  )
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
            <svg className="lumi-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--lumi-error, #e5484d)" }}>
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
  index,
  inGroup = false
}: {
  message: OpenAiChatMessage
  allMessages: OpenAiChatMessage[]
  index: number
  inGroup?: boolean
}) {
  if (message.role === "user") {
    if (inGroup) return <>{formatMessagePreview(message)}</>
    return (
      <div className="lm-chat-row lm-chat-row--user">
        <div className="lm-chat-bubble lm-chat-bubble--user">
          {formatMessagePreview(message)}
        </div>
      </div>
    )
  }

  if (message.role === "assistant") {
    const text = formatMessagePreview(message)
    const toolCalls = message.tool_calls

    // 收集后续 tool results（遍历所有后续消息，不因非 tool 消息 break,
    // 因为 AI SDK 可能在不同 step 中交错传递 toolCalls 和 toolResults）
    const toolResults: Record<string, string> = {}
    for (let j = index + 1; j < allMessages.length; j++) {
      const next = allMessages[j]
      if (next.role === "tool" && next.tool_call_id) {
        if (!(next.tool_call_id in toolResults)) {
          toolResults[next.tool_call_id] = next.content ?? ""
        }
      }
    }

    const hasContent = !!text
    const hasTools = toolCalls && toolCalls.length > 0
    const paragraphs = hasContent
      ? text.split(/\n{2,}/).filter((p) => p.trim().length > 0)
      : []

    const inner = hasTools ? (
      <div className="lumi-sequence-stack">
        {toolCalls!.map((call, i) => (
          <Fragment key={call.id}>
            {i < paragraphs.length ? (
              renderMarkdown(paragraphs[i])
            ) : null}
            <LumiToolCall
              call={call}
              result={toolResults[call.id] ?? null}
            />
          </Fragment>
        ))}
        {paragraphs.slice(toolCalls!.length).map((part, i) => (
          <Fragment key={`md-${i}`}>{renderMarkdown(part)}</Fragment>
        ))}
      </div>
    ) : (
      renderMarkdown(text)
    )

    if (inGroup) return <>{inner}</>
    return (
      <div className="lm-chat-row lm-chat-row--assistant">
        <div className="lm-chat-bubble lm-chat-bubble--assistant">
          {inner}
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

    if (inGroup) return null
    return (
      <div className="lm-chat-row lm-chat-row--tool">
        <div className="lm-chat-meta">
          结果 · {toolName || id.slice(0, 8)}
        </div>
        <pre className="lm-chat-tool-body">{message.content ?? ""}</pre>
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
  const [isReady, setIsReady] = useState(false)
  /** 每个 thread 独立的加载状态 */
  const [loadingThreadIds, setLoadingThreadIds] = useState<Set<string>>(new Set())
  const [isHydrating, setIsHydrating] = useState(true)
  const scrollAnchorRef = useRef<HTMLDivElement>(null)
  const activeThreadIdRef = useRef("")
  /** 每个 thread 独立跟踪是否正在发送请求 */
  const sendInFlightMapRef = useRef<Record<string, boolean>>({})
  /** 每个 thread 的 AbortController，切换 tab 时 cancel 旧请求 */
  const abortMapRef = useRef<Record<string, AbortController>>({})
  const draftMapRef = useRef<Record<string, string>>({})
  /** 正在编辑的消息在 messages 数组中的索引，-1 表示无 */
  const [editingIndex, setEditingIndex] = useState<number>(-1)
  const [editingText, setEditingText] = useState("")


  useEffect(() => {
    activeThreadIdRef.current = activeThreadId
  }, [activeThreadId])

  useEffect(() => {
    draftRef.current = draft
    // 当 draft 被清空（发送后），重置 textarea 高度
    if (!draft) {
      const ta = document.querySelector('.lm-input--composer') as HTMLTextAreaElement | null
      if (ta) {
        ta.style.height = ''
      }
    }
  }, [draft])

  const refreshThreadList = useCallback(async () => {
    const rows = await listThreads()
    setThreads(rows)
    return rows
  }, [])

  useEffect(() => {
    Promise.all([getLlmSettings(), getTheme()])
      .then(([nextSettings, theme]) => {
        setSettings(nextSettings)
        applyTheme(theme)
        setIsReady(true)
      })
      .catch(() => {
        setError("读取模型配置失败，请重新打开侧边栏。")
        setIsReady(true)
      })
  }, [])

  // 监听 chrome.storage 变化，options 页面保存后实时更新配置
  useEffect(() => {
    const SETTINGS_KEYS = ["baseUrl", "apiKey", "model"]

    function handleChanged(
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) {
      if (areaName !== "sync") return

      if ("theme" in changes) {
        const newTheme = (changes.theme.newValue as ThemeName) || "paper"
        applyTheme(newTheme)
      }

      const hasSettingsChange = SETTINGS_KEYS.some((key) => key in changes)
      if (!hasSettingsChange) return

      getLlmSettings()
        .then((nextSettings) => {
          setSettings(nextSettings)
        })
        .catch(() => {
          /* 静默忽略 */
        })
    }

    chrome.storage.onChanged.addListener(handleChanged)

    return () => {
      chrome.storage.onChanged.removeListener(handleChanged)
    }
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
    scrollAnchorRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "end" })
  }, [messages, loadingThreadIds, activeThreadId])

  const openOptionsPage = useCallback(async () => {
    await chrome.runtime.openOptionsPage()
  }, [])

  const handleStop = useCallback(() => {
    const threadId = activeThreadIdRef.current
    chrome.runtime.sendMessage({
      type: STOP_AGENT_MESSAGE,
      payload: { threadId }
    } as StopAgentMessage).catch(() => { /* ignore */ })
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

  /** 通用发送：将 history + userInput 发给 agent，同时更新 messages 状态 */
  async function doSend(historyMessages: OpenAiChatMessage[], userInput: string) {
    const threadId = activeThreadIdRef.current
    if (!threadId) return

    sendInFlightMapRef.current[threadId] = true
    setLoadingThreadIds((prev) => new Set(prev).add(threadId))
    setError("")
    setEditingIndex(-1)
    setEditingText("")

    const userMsg: OpenAiChatMessage = { role: "user", content: userInput }
    const baseMessages = [...historyMessages, userMsg]
    setMessages(cloneMessages(baseMessages))
    // 立即持久化用户消息，确保输入不丢失
    saveThreadMessages(threadId, baseMessages).catch(() => {})

    const win = await chrome.windows.getCurrent()
    const startPayload = {
      type: START_AGENT_MESSAGE,
      payload: { threadId, historyMessages, userInput, windowId: win.id }
    } as StartAgentMessage

    async function sendStartWithRetry(): Promise<void> {
      try {
        await chrome.runtime.sendMessage(startPayload)
      } catch (firstErr) {
        await new Promise((r) => setTimeout(r, 500))
        try {
          await chrome.runtime.sendMessage(startPayload)
        } catch {
          console.warn("[lumino:sidepanel]", "启动 agent 失败:", firstErr)
          setError("启动失败，请重试。")
        }
      }
    }
    sendStartWithRetry()
  }

  async function sendUserMessage() {
    const trimmed = draft.trim()
    if (!trimmed) { setError("请输入内容。"); return }
    if (!activeThreadIdRef.current) { setError("请先选择或创建一个会话。"); return }
    if (!hasCompleteLlmSettings(settings)) { setError("请先在设置页配置 Base URL、API Key 和模型。"); return }
    if (sendInFlightMapRef.current[activeThreadIdRef.current]) return

    setDraft("")
    await doSend(cloneMessages(messages), trimmed)
  }


  // 监听来自 Service Worker 的 agent 进度/完成/错误消息
  useEffect(() => {
    function handleAgentProgress(message: unknown) {
      if (!message || typeof message !== "object") return

      const msg = message as AgentProgressMessage
      if (msg.type === AGENT_PROGRESS_MESSAGE) {
        const { threadId, messages: msgs } = msg.payload
        if (threadId === activeThreadIdRef.current) {
          setMessages(cloneMessages(msgs as OpenAiChatMessage[]))
        }
        saveThreadMessages(threadId, msgs as OpenAiChatMessage[]).catch(() => { })
        return
      }

      const completeMsg = message as AgentCompleteMessage
      if (completeMsg.type === AGENT_COMPLETE_MESSAGE) {
        const { threadId, messages: msgs } = completeMsg.payload
        delete sendInFlightMapRef.current[threadId]
        setLoadingThreadIds((prev) => {
          const next = new Set(prev)
          next.delete(threadId)
          return next
        })
        if (threadId === activeThreadIdRef.current) {
          setMessages(cloneMessages(msgs as OpenAiChatMessage[]))
          refreshThreadList().catch(() => { })
        }
        saveThreadMessages(threadId, msgs as OpenAiChatMessage[]).catch(() => { })
        return
      }

      const errorMsg = message as AgentErrorMessage
      if (errorMsg.type === AGENT_ERROR_MESSAGE) {
        const { threadId, error } = errorMsg.payload
        // 只有当前会话正在发送中才展示错误，避免残留消息干扰
        if (!sendInFlightMapRef.current[threadId]) {
          console.warn("[lumino:sidepanel]", "忽略非活跃会话的错误:", threadId, error)
          return
        }
        delete sendInFlightMapRef.current[threadId]
        setLoadingThreadIds((prev) => {
          const next = new Set(prev)
          next.delete(threadId)
          return next
        })
        if (threadId === activeThreadIdRef.current) {
          setError(error)
        }
      }
    }

    chrome.runtime.onMessage.addListener(handleAgentProgress)
    return () => {
      chrome.runtime.onMessage.removeListener(handleAgentProgress)
    }
  }, [refreshThreadList])

  const visibleMessages = messages.filter((message) => message.role !== "system")
  const mergedMessages = useMemo(() => {
    const out: Array<OpenAiChatMessage | OpenAiChatMessage[]> = []
    let i = 0
    while (i < visibleMessages.length) {
      const msg = visibleMessages[i]
      if (msg.role === "user") { out.push(msg); i++; continue }
      const group: OpenAiChatMessage[] = []
      while (i < visibleMessages.length && visibleMessages[i].role !== "user") {
        group.push(visibleMessages[i]); i++
      }
      out.push(group)
    }
    return out
  }, [visibleMessages])
  const isConfigured = hasCompleteLlmSettings(settings)

  return (
    <main className="lm-shell lm-sidepanel">
      <div aria-hidden className="lm-ambient">
        <div className="lm-blob lm-blob--a" />
        <div className="lm-blob lm-blob--b" />
        <div className="lm-blob lm-blob--c" />
        <div className="lm-blob lm-blob--d" />
        <div className="lm-blob lm-blob--e" />
      </div>

      <div className="lm-bezel-outer lm-bezel-outer--side">
        <div className="lm-bezel-inner lm-bezel-inner--side">
          <div className="lm-sidepanel-layout-row">
            <div className="lm-sidepanel-layout">
              <header className="lm-sp-header">
                <div className="lm-sp-brand">
                  <img
                    aria-hidden
                    className="lm-logo-cat"
                    src={blackCatGif}
                    alt="Lumi"
                  />
                  <div className="lm-sp-brand-text">
                    <h1 className="lm-sp-title">Lumi Knows</h1>
                  </div>
                </div>
              </header>

              <section className="lm-session-strip" aria-label="历史会话">
                <div className="lm-session-chips" role="list">
                  {isHydrating ? (
                    <span className="lm-session-strip-hint">加载中…</span>
                  ) : (
                    threads.map((row) => {
                      const selected = row.id === activeThreadId
                      const label = threadLabel(row)
                      const hint = `${label} · ${formatSessionTime(row.updatedAt)}`

                      return (
                        <div
                          className={`lm-session-chip${selected ? " lm-session-chip--active" : ""}`}
                          key={row.id}
                          role="listitem">
                          <button
                            className="lm-session-chip-main"
                            onClick={() => void selectThread(row.id)}
                            title={hint}
                            type="button">
                            {label}
                          </button>
                          <button
                            aria-label={`删除 ${label}`}
                            className="lm-session-chip-del"
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
                  className="lm-session-add"
                  disabled={isHydrating}
                  onClick={() => void handleNewThread()}
                  title="新建会话"
                  type="button">
                  ＋
                </button>
              </section>

              <section className="lm-chat-panel" aria-busy={loadingThreadIds.has(activeThreadId)}>
                {isReady && !isConfigured ? (
                  <div className="lm-note lm-note--compact">
                    <p>请先在设置中填写 Base URL、API Key 与模型。</p>
                    <button
                      className="lm-secondary-button lm-secondary-button--sm"
                      onClick={openOptionsPage}
                      type="button">
                      打开设置
                    </button>
                  </div>
                ) : null}

                <div className="lm-chat-scroll" role="log" aria-relevant="additions">
                  {isHydrating ? (
                    <p className="lm-chat-hint">正在加载…</p>
                  ) : visibleMessages.length === 0 ? (
                    <p className="lm-chat-hint">
                      当前会话还没有消息。
                      <br />
                      在下方输入后发送即可。
                    </p>
                  ) : (
                    mergedMessages.map((item, gIdx) => {
                      if (Array.isArray(item)) {
                        const group = item as OpenAiChatMessage[]
                        const groupText = group
                          .map(m => typeof m.content === 'string' ? m.content : '')
                          .filter(Boolean)
                          .join('\n\n')
                        return (
                          <div
                            key={`${activeThreadId}-group-${gIdx}`}
                            className="lm-chat-row-wrapper lm-chat-row-wrapper--assistant"
                            style={{ "--lumi-msg-index": gIdx } as React.CSSProperties}
                          >
                            <div className="lm-chat-row lm-chat-row--assistant">
                              <div className="lm-chat-bubble lm-chat-bubble--assistant">
                                <div className="lumi-sequence-stack">
                                  {group.map((msg, si) => (
                                    <ChatMessageBlock
                                      key={si}
                                      message={msg}
                                      allMessages={visibleMessages}
                                      index={visibleMessages.indexOf(msg)}
                                      inGroup
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="lm-chat-actions">
                              <button
                                aria-label="重新生成"
                                className="lm-chat-action-btn"
                                disabled={sendInFlightMapRef.current[activeThreadId]}
                                onClick={() => {
                                  const groupStart = messages.indexOf(group[0])
                                  if (groupStart < 0) return
                                  // 找到该 assistant group 前面最近的 user 消息
                                  let prevUserIdx = groupStart - 1
                                  while (prevUserIdx >= 0 && messages[prevUserIdx].role !== "user") {
                                    prevUserIdx--
                                  }
                                  if (prevUserIdx < 0) return
                                  const prevUser = messages[prevUserIdx]
                                  // 删除当前 assistant group 及之后的消息
                                  const newHistory = messages.slice(0, prevUserIdx)
                                  saveThreadMessages(activeThreadId, newHistory).catch(() => {})
                                  doSend(newHistory, formatMessagePreview(prevUser))
                                }}
                                title="重新生成"
                                type="button"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="23 4 23 10 17 10" />
                                  <polyline points="1 20 1 14 7 14" />
                                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                                </svg>
                              </button>
                              <button
                                aria-label="复制消息内容"
                                className="lm-chat-action-btn"
                                onClick={() => {
                                  navigator.clipboard.writeText(groupText).catch(() => {})
                                }}
                                title="复制"
                                type="button"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              </button>
                              <button
                                aria-label="删除此消息"
                                className="lm-chat-action-btn"
                                onClick={() => {
                                  setMessages((prev) => {
                                    const next = [...prev]
                                    const delStart = prev.indexOf(group[0])
                                    const delEnd = prev.indexOf(group[group.length - 1])
                                    if (delStart >= 0 && delEnd >= delStart) {
                                      next.splice(delStart, delEnd - delStart + 1)
                                    }
                                    saveThreadMessages(activeThreadId, next).catch(() => {})
                                    return next
                                  })
                                }}
                                title="删除"
                                type="button"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  <line x1="10" y1="11" x2="10" y2="17" />
                                  <line x1="14" y1="11" x2="14" y2="17" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )
                      }
                      const msg = item as OpenAiChatMessage
                      const msgIndex = visibleMessages.indexOf(msg)
                      const isEditingThis = msg.role === "user" && editingIndex === msgIndex
                      return (
                        <div
                          key={`${activeThreadId}-${gIdx}-${msg.role}`}
                          className={`lm-chat-row-wrapper lm-chat-row-wrapper--${msg.role === "user" ? "user" : "assistant"}`}
                          style={{ "--lumi-msg-index": gIdx } as React.CSSProperties}
                        >
                          {isEditingThis ? (
                            <div className="lm-chat-row lm-chat-row--user" style={{ width: "100%" }}>
                              <div className="lm-chat-bubble lm-chat-bubble--user lm-edit-bubble">
                                <textarea
                                  className="lm-edit-textarea"
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      e.preventDefault()
                                      const trimmed = editingText.trim()
                                      if (!trimmed) return
                                      if (sendInFlightMapRef.current[activeThreadId]) return
                                      // Delete this user message + everything after
                                      const newHistory = messages.slice(0, msgIndex)
                                      saveThreadMessages(activeThreadId, newHistory).catch(() => {})
                                      doSend(newHistory, trimmed)
                                    }
                                    if (e.key === "Escape") {
                                      setEditingIndex(-1)
                                      setEditingText("")
                                    }
                                  }}
                                  autoFocus
                                  rows={3}
                                />
                                <div className="lm-edit-hint">
                                  Enter 发送 · Shift+Enter 换行 · Esc 取消
                                </div>
                              </div>
                            </div>
                          ) : (
                            <ChatMessageBlock
                              message={msg}
                              allMessages={visibleMessages}
                              index={msgIndex}
                            />
                          )}
                          <div className="lm-chat-actions">
                            {msg.role === "user" && !isEditingThis ? (
                              <button
                                aria-label="编辑消息"
                                className="lm-chat-action-btn"
                                disabled={sendInFlightMapRef.current[activeThreadId]}
                                onClick={() => {
                                  setEditingIndex(msgIndex)
                                  setEditingText(formatMessagePreview(msg))
                                }}
                                title="编辑"
                                type="button"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                            ) : null}
                            <button
                              aria-label="复制消息内容"
                              className="lm-chat-action-btn"
                              onClick={() => {
                                const text = typeof msg.content === "string"
                                  ? msg.content
                                  : ""
                                navigator.clipboard.writeText(text).catch(() => {})
                              }}
                              title="复制"
                              type="button"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                            </button>
                            <button
                              aria-label="删除此消息"
                              className="lm-chat-action-btn"
                              onClick={() => {
                                setMessages((prev) => {
                                  const next = [...prev]
                                  const target = next[msgIndex]
                                  if (target.role === "assistant" && target.tool_calls) {
                                    let i2 = msgIndex + 1
                                    while (i2 < next.length && next[i2].role === "tool") {
                                      i2++
                                    }
                                    next.splice(msgIndex, i2 - msgIndex)
                                  } else {
                                    next.splice(msgIndex, 1)
                                  }
                                  saveThreadMessages(activeThreadId, next).catch(() => {})
                                  return next
                                })
                              }}
                              title="删除"
                              type="button"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={scrollAnchorRef} />
                </div>

                {loadingThreadIds.has(activeThreadId) && (
                  <div className="lumi-running-indicator">
                    <span className="lumi-running-dot" />
                    <span className="lumi-running-dot" />
                    <span className="lumi-running-dot" />
                    <span>运行中…</span>
                    <button
                      aria-label="停止生成"
                      className="lumi-stop-btn"
                      onClick={handleStop}
                      type="button">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                )}

                <div className="lm-composer">
                    <textarea
                      aria-label="对话输入"
                      className="lm-input lm-input--composer"
                      disabled={loadingThreadIds.has(activeThreadId) || !isReady || isHydrating}
                      onChange={(event) => {
                        setDraft(event.target.value)
                        // 自动调整高度
                        const el = event.target
                        el.style.height = "auto"
                        el.style.height = el.scrollHeight + "px"
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                          event.preventDefault()
                          void sendUserMessage()
                        }
                      }}
                      placeholder="Enter 发送，Shift+Enter 换行"
                      rows={1}
                      value={draft}
                    />
                    <button
                      aria-busy={loadingThreadIds.has(activeThreadId)}
                      aria-label={loadingThreadIds.has(activeThreadId) ? "正在发送" : "发送"}
                      className="lm-composer-send"
                      disabled={!isReady || loadingThreadIds.has(activeThreadId) || isHydrating}
                      onClick={() => void sendUserMessage()}
                      type="button">
                      {loadingThreadIds.has(activeThreadId) ? (
                        <span aria-hidden className="lm-spinner lm-spinner--on-accent" />
                      ) : (
                        <SendArrowIcon />
                      )}
                    </button>

                  {error ? (
                    <p className="lm-error lm-error--tight" role="alert">
                      {error}
                    </p>
                  ) : null}
                </div>
              </section>
            </div>

            {/* 右侧导航栏 */}
            <nav className="lm-side-nav" aria-label="功能导航">
              {/* Chat - 激活态 */}
              <button className="lm-side-nav-btn lm-side-nav-btn--active" type="button" title="Chat">
                <span className="lm-side-nav-btn-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </span>
              </button>
            </nav>
          </div>
        </div>
      </div>
    </main>
  )
}

export default SidePanel
