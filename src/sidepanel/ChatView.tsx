/**
 * 聊天界面 — Agent 对话的主视图
 *
 * 从 sidepanel.tsx 拆分出的核心聊天逻辑。
 */

import {
  type MouseEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from "react"
import { cloneMessages, type OpenAiChatMessage } from "../lib/chat/openai-messages"
import {
  createEmptyThread,
  deleteThread,
  getThread,
  putThread,
  listThreads,
  saveThreadMessages,
  generateThreadTitle,
  type ChatThreadRecord
} from "../lib/chat/thread-idb"
import type { AgentConfig } from "../lib/chat/mode-config"
import type { LlmSettings } from "../lib/llm/llm-types"
import { hasCompleteLlmSettings, type ThinkingConfig } from "../lib/settings"
import { useT } from "../lib/i18n"
import { formatRelativeTime } from "../lib/format-time"
import {
  START_AGENT_MESSAGE,
  STOP_AGENT_MESSAGE,
  RETRY_AGENT_MESSAGE,
  AGENT_PROGRESS_MESSAGE,
  AGENT_COMPLETE_MESSAGE,
  AGENT_ERROR_MESSAGE,
  type StartAgentMessage,
  type StopAgentMessage,
  type RetryAgentMessage,
  type AgentProgressMessage,
  type AgentCompleteMessage,
  type AgentErrorMessage
} from "../lib/side-panel-bridge"
import { ChatMessageBlock, displayContent, formatMessagePreview } from "./components/ChatMessageBlock"
import { MessageErrorBoundary } from "./components/MessageErrorBoundary"
import { AssistantTurn } from "./components/AssistantTurn"
import { PageReferenceChip, ReferenceChips } from "./components/ReferenceChips"
import { ComposerUploadButton } from "./components/ComposerUploadButton"
import { stripCurrentTime } from "../lib/chat/message-metadata"
import lumiIcon from "data-base64:~lumi.png"

import { useW } from "../lib/workbench/i18n"
import { activateContextTab, getContextTabs, readMessageContext, withMessageContext, type PageContext } from "../lib/workbench/store"
import { usePageContext } from "../lib/workbench/use-page-context"
import { useFileContext } from "../lib/workbench/use-file-context"
import { uploadWorkspaceFiles } from "../lib/workbench/uploads"
import { saveFavoriteAnswer } from "../lib/workbench/favorites"

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
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  )
}

export type ChatViewHandle = {
  removeFileReferences: (path: string, recursive: boolean) => void
  selectThread: (threadId: string) => Promise<void>
  deleteThread: (threadId: string) => Promise<void>
  openHistory: () => void
}

export const ChatView = forwardRef<ChatViewHandle, {
  draftRequest?: { id: number; prompt?: string; files?: string[]; selectTabs?: boolean; skipCurrentPage?: boolean }
  onSaveTask: (prompt: string) => void
  onOpenFile: (path: string) => void
  agent: AgentConfig
  onBack: () => void
  settings: LlmSettings
  thinkingConfig: ThinkingConfig
  initialThreadId?: string
  onOpenHistory: () => void
  threadErrors: Record<string, string>
  onThreadErrorsChange: (updater: (prev: Record<string, string>) => Record<string, string>) => void
}>(function ChatView({
  agent,
  draftRequest,
  onSaveTask,
  onOpenFile,
  onBack,
  settings,
  thinkingConfig,
  initialThreadId,
  onOpenHistory,
  threadErrors,
  onThreadErrorsChange
}, ref) {
  const [threads, setThreads] = useState<ChatThreadRecord[]>([])
  const [activeThreadId, setActiveThreadIdState] = useState<string>("")
  const [messages, setMessages] = useState<OpenAiChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const draftRef = useRef(draft)
  // 当前选中的 thinking mode id；空 = 跟随默认（不传 → background 用 defaultModeId）
  const [selectedThinkingModeId, setSelectedThinkingModeId] = useState("")
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false)
  // thinkingConfig 变化时重置选中态，保证默认 mode 优先
  const thinkingConfigSignature = useMemo(
    () => JSON.stringify(thinkingConfig.modes.map((m) => m.id)),
    [thinkingConfig]
  )
  useEffect(() => {
    setSelectedThinkingModeId(thinkingConfig.defaultModeId ?? "")
  }, [thinkingConfigSignature, thinkingConfig.defaultModeId])
    const [loadingThreadIds, setLoadingThreadIds] = useState<Set<string>>(new Set())
  const [isHydrating, setIsHydrating] = useState(true)
  const [editingIndex, setEditingIndex] = useState<number>(-1)
  const [editingText, setEditingText] = useState("")
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const [userScrolledUp, setUserScrolledUp] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasNewMessages = useRef(false)  // 避免首次挂载就显示"新消息"按钮
  const scrollAnchorRef = useRef<HTMLDivElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const activeThreadIdRef = useRef("")
  const sendInFlightMapRef = useRef<Record<string, boolean>>({})
  const draftMapRef = useRef<Record<string, string>>({})
  const draftEpoch = useRef(0)
  const uploadInFlight = useRef(false)
  const [uploadingFiles, setUploadingFiles] = useState(false)

  const t = useT()
  const w = useW()
  const { pages: contextPages, setPages: setContextPages, remember: rememberContext, restore: restoreContext, reset: resetContext } = usePageContext()
  const { files: contextFiles, setFiles: setContextFiles, remember: rememberFiles, restore: restoreFiles, reset: resetFiles, appendSaved: appendSavedFiles, removePath: removeFileReferences } = useFileContext()
  const [availableTabs, setAvailableTabs] = useState<PageContext[]>([])
  const [tabPicker, setTabPicker] = useState(false)
  const tabPickerRef = useRef<HTMLElement>(null)
  const tabPickerTriggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!tabPicker) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (tabPickerRef.current?.contains(target) || tabPickerTriggerRef.current?.contains(target)) return
      setTabPicker(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      event.preventDefault()
      setTabPicker(false)
      tabPickerTriggerRef.current?.focus()
    }
    document.addEventListener("pointerdown", handlePointerDown, true)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [tabPicker])
  const [contextError, setContextError] = useState("")
  const [savedNotice, setSavedNotice] = useState("")
  const [savingAnswer, setSavingAnswer] = useState(false)
  const appliedRequest = useRef<number>()
  const sendGuard = useRef(false)
  async function uploadFiles(files: File[]) {
    if (uploadInFlight.current || !files.length) return
    uploadInFlight.current = true
    const origin = { threadId: activeThreadIdRef.current, epoch: draftEpoch.current }
    const stillOnOrigin = () => origin.threadId
      ? activeThreadIdRef.current === origin.threadId
      : !activeThreadIdRef.current && draftEpoch.current === origin.epoch
    setUploadingFiles(true); setContextError(""); setSavedNotice("")
    try {
      const result = await uploadWorkspaceFiles(files)
      if (stillOnOrigin()) {
        setContextFiles(prev => [...prev, ...result.paths])
        if (result.failedNames.length) setContextError(t("chat.filesUploadFailed", { names: result.failedNames.join(", ") }))
        composerRef.current?.focus()
      } else if (origin.threadId) {
        appendSavedFiles(origin.threadId, result.paths)
      }
    } catch {
      if (stillOnOrigin()) setContextError(t("chat.filesUploadFailed", { names: files.map(file => file.name).join(", ") }))
    } finally {
      uploadInFlight.current = false
      setUploadingFiles(false)
    }
  }
  async function showTabPicker() {
    setTabPicker(true); setContextError("")
    try { setAvailableTabs(await getContextTabs()) } catch { setContextError(w("loadError")) }
  }
  async function switchToContextPage(page: PageContext) {
    setTabPicker(false); setContextError("")
    try { await activateContextTab(page.id) }
    catch { setContextError(t("chat.pageReferenceUnavailable")) }
  }
  useEffect(() => {
    if (isHydrating || !draftRequest || appliedRequest.current === draftRequest.id) return
    appliedRequest.current = draftRequest.id
    ++draftEpoch.current
    draftMapRef.current[activeThreadIdRef.current] = draftRef.current
    rememberContext(activeThreadIdRef.current)
    rememberFiles(activeThreadIdRef.current)
    activeThreadIdRef.current = ""
    setActiveThreadIdState(""); setMessages([])
    resetContext({ includeCurrentPage: !draftRequest.skipCurrentPage })
    setContextFiles(draftRequest.files ?? [])
    setDraft(draftRequest.prompt ?? ""); setSavedNotice(""); setContextError(""); setEditingIndex(-1)
    setTabPicker(false)
    if (draftRequest.selectTabs) void showTabPicker()
    composerRef.current?.focus()
  }, [draftRequest, isHydrating, rememberContext, resetContext, setContextFiles, rememberFiles])

  const triggerCopyFeedback = useCallback((id: string) => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    setCopiedId(id)
    copyTimerRef.current = setTimeout(() => setCopiedId(null), 1500)
  }, [])

  // 自动增高：重置为 auto 再取 scrollHeight，受 min/max-height 约束。
  // 抽成函数 + layoutEffect 在 draft 变化时统一调用，保证首屏、输入、
  // 切换会话、发送清空等所有路径下高度一致，避免「输入瞬间上边缘抖动」。
  // 单行时锁定 overflow hidden（无滚动条、无晃动），多行时开启 auto 滚动（滚动条隐藏）。
  const autoSizeComposer = useCallback(() => {
    const el = composerRef.current
    if (!el) return
    const maxH = 160
    el.style.height = "auto"
    const scrollH = el.scrollHeight
    // 内容超过 max-height 时锁定高度 + 开启滚动；否则自动撑高
    if (scrollH > maxH) {
      el.style.height = `${maxH}px`
      el.classList.add("lm-input--composer--scrollable")
    } else {
      el.style.height = `${scrollH}px`
      el.classList.remove("lm-input--composer--scrollable")
    }
  }, [])

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId
  }, [activeThreadId])

  useEffect(() => {
    draftRef.current = draft
    // draft 变化（含清空）统一走 autoSize，保证空态/有内容态高度算法一致，
    // 避免「清空用默认高度、输入用 scrollHeight」造成的高度跳变。
    autoSizeComposer()
  }, [draft, autoSizeComposer])

  const refreshThreadList = useCallback(async () => {
    const rows = await listThreads()
    setThreads(rows)
    return rows
  }, [agent.id])

  // 首次加载（不自动创建空会话）
  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      try {
        const rows = await listThreads()
        if (cancelled) return
        setThreads(rows)

        // 查询 SW 中正在运行的会话，恢复 loading 状态
        try {
          const resp = await chrome.runtime.sendMessage({ type: "lumino/query-running-state" })
          if (resp?.runningThreadIds && !cancelled) {
            const runningSet = new Set<string>()
            for (const tid of resp.runningThreadIds) {
              if (rows.some((r) => r.id === tid)) {
                runningSet.add(tid)
              }
            }
            if (runningSet.size > 0) {
              setLoadingThreadIds(runningSet)
              for (const tid of runningSet) {
                sendInFlightMapRef.current[tid] = true
              }
            }
          }
        } catch {
          // SW 未响应，忽略
        }

        // 有会话就选（优先 initialThreadId），否则展示空状态等待用户发送消息
        if (rows.length > 0) {
          const targetId = initialThreadId && rows.some((r) => r.id === initialThreadId)
            ? initialThreadId
            : rows[0].id
          const thread = await getThread(targetId)
          if (!cancelled) {
            setActiveThreadIdState(targetId)
            setMessages(cloneMessages(thread?.messages ?? []))
          }
        }
      } catch {
        if (!cancelled) onThreadErrorsChange(prev => ({ ...prev, [initialThreadId ?? activeThreadId]: t("chat.error.read") }))
      } finally {
        if (!cancelled) setIsHydrating(false)
      }
    }
    void hydrate()
    return () => { cancelled = true }
  }, [agent.id])

  // 自动滚动到底部（仅当用户在底部/未手动上滚时）
  useEffect(() => {
    if (messages.length === 0) {
      if (chatScrollRef.current) chatScrollRef.current.scrollTop = 0
      hasNewMessages.current = false
      return
    }
    if (!userScrolledUp) {
      scrollAnchorRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "end" })
    }
    hasNewMessages.current = userScrolledUp
  }, [messages, loadingThreadIds, activeThreadId, userScrolledUp])

  // 监听用户滚动：滚到底部重置 userScrolledUp，滚离底部则设为 true
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    const handle = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32
      setUserScrolledUp((prev) => atBottom ? false : prev || !atBottom)
    }
    el.addEventListener("scroll", handle, { passive: true })
    return () => el.removeEventListener("scroll", handle)
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
      if (threadId === activeThreadIdRef.current) return
      ++draftEpoch.current
      draftMapRef.current[activeThreadIdRef.current] = draftRef.current
      rememberContext(activeThreadIdRef.current)
      rememberFiles(activeThreadIdRef.current)
      activeThreadIdRef.current = threadId
      setActiveThreadIdState(threadId)
      restoreContext(threadId)
      restoreFiles(threadId)
      setContextError(""); setSavedNotice(""); setEditingIndex(-1)
      const thread = await getThread(threadId)
      if (activeThreadIdRef.current !== threadId) return
      setMessages(cloneMessages(thread?.messages ?? []))
      setDraft(draftMapRef.current[threadId] ?? "")
    },
    [rememberContext, restoreContext, rememberFiles, restoreFiles]
  )

  const handleNewThread = useCallback(async () => {
    ++draftEpoch.current
    // 保存当前草稿
    if (activeThreadIdRef.current) {
      draftMapRef.current[activeThreadIdRef.current] = draftRef.current
    }
    rememberContext(activeThreadIdRef.current)
    rememberFiles(activeThreadIdRef.current)
    activeThreadIdRef.current = ""
    setActiveThreadIdState("")
    setMessages([])
    setDraft("")
    resetContext(); resetFiles(); setContextError(""); setSavedNotice(""); setEditingIndex(-1)
  }, [rememberContext, resetContext, rememberFiles, resetFiles])

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      const wasActive = threadId === activeThreadIdRef.current
      if (wasActive) ++draftEpoch.current
      await deleteThread(threadId)
      delete draftMapRef.current[threadId]
      const rows = await listThreads()
      setThreads(rows)
      if (rows.length === 0) {
        resetContext()
        resetFiles()
        setActiveThreadIdState("")
        setMessages([])
        return
      }
      if (wasActive) {
        const nextId = rows[0].id
        restoreContext(nextId)
        restoreFiles(nextId)
        setActiveThreadIdState(nextId)
        const nextThread = await getThread(nextId)
        setMessages(cloneMessages(nextThread?.messages ?? []))
      }
    },
    [agent, resetContext, restoreContext, resetFiles, restoreFiles]
  )

  // 暴露给父组件（App 层 HistoryPanel 操作）
  useImperativeHandle(ref, () => ({
    removeFileReferences,
    selectThread: (threadId: string) => selectThread(threadId),
    deleteThread: (threadId: string) => handleDeleteThread(threadId),
    openHistory: () => onOpenHistory()
  }), [selectThread, handleDeleteThread, onOpenHistory, removeFileReferences])

  async function doSend(historyMessages: OpenAiChatMessage[], userInput: string) {
    // Regeneration keeps reference pages but must not resend the old timestamp.
    userInput = stripCurrentTime(userInput)
    const threadId = activeThreadIdRef.current
    if (!threadId) return
    sendInFlightMapRef.current[threadId] = true
    setLoadingThreadIds((prev) => new Set(prev).add(threadId))
    onThreadErrorsChange(prev => { const next = {...prev}; delete next[threadId]; return next })
    setEditingIndex(-1)
    setEditingText("")

    const userMsg: OpenAiChatMessage = { role: "user", content: userInput }
    const baseMessages = [...historyMessages, userMsg]
    setMessages(cloneMessages(baseMessages))
    saveThreadMessages(threadId, baseMessages).catch(() => {})

    const win = await chrome.windows.getCurrent()

    // 构建 agentConfig（传递给 SW 用于系统提示词和工具过滤）
    const agentConfigPayload = {
      systemPrompt: agent.systemPrompt,
      tools: agent.tools,
      isBuiltin: agent.isBuiltin
    }

    const startPayload = {
      type: START_AGENT_MESSAGE,
      payload: {
        threadId,
        historyMessages,
        userInput,
        windowId: win.id,
        mode: agent.id,
        agentConfig: agentConfigPayload,
        thinkingModeId: selectedThinkingModeId || undefined
      }
    } as StartAgentMessage

    async function sendStartWithRetry(): Promise<void> {
      try {
        await chrome.runtime.sendMessage(startPayload)
      } catch {
        await new Promise((r) => setTimeout(r, 500))
        try {
          await chrome.runtime.sendMessage(startPayload)
        } catch {
          console.warn("[lumino:sidepanel]", "启动 agent 失败")
          onThreadErrorsChange(prev => ({ ...prev, [threadId]: t("chat.error.start") }))
          delete sendInFlightMapRef.current[threadId]
          setLoadingThreadIds(prev => { const next = new Set(prev); next.delete(threadId); return next })
        }
      }
    }
    sendStartWithRetry()
  }

  async function sendUserMessage() {
    const trimmed = draft.trim()
    const attachedFiles = [...contextFiles]
    if (sendGuard.current || uploadInFlight.current) return
    if (!trimmed && !attachedFiles.length) return
    if (!hasCompleteLlmSettings(settings)) { onThreadErrorsChange(prev => ({ ...prev, [activeThreadId]: t("chat.error.config") })); return }

    sendGuard.current = true
    try {
    // 没有活跃会话：创建新的
    if (!activeThreadIdRef.current) {
      const created = await createEmptyThread()
      created.mode = agent.id
      created.agentName = agent.isBuiltin ? undefined : agent.name
      // 直接 put 整个 record，确保 mode 被写入
      await putThread(created)
      rememberContext(created.id)
      rememberFiles(created.id)
      setActiveThreadIdState(created.id)
      setThreads((prev) => [created, ...prev])
      activeThreadIdRef.current = created.id
    }

    if (sendInFlightMapRef.current[activeThreadIdRef.current]) return
    setDraft("")
    resetFiles()
    // 发送后重置滚动状态，确保新的回复消息能自动滚到底
    setUserScrolledUp(false)

    await doSend(cloneMessages(messages), withMessageContext(trimmed, contextPages, attachedFiles))
    } catch {
      setDraft(trimmed)
      setContextFiles(prev => [...attachedFiles, ...prev])
      onThreadErrorsChange(prev => ({ ...prev, [activeThreadIdRef.current]: t("chat.error.start") }))
      delete sendInFlightMapRef.current[activeThreadIdRef.current]
      setLoadingThreadIds(prev => { const next = new Set(prev); next.delete(activeThreadIdRef.current); return next })
    } finally { sendGuard.current = false }
  }

  const handleStop = useCallback(() => {
    const threadId = activeThreadIdRef.current
    chrome.runtime.sendMessage({
      type: STOP_AGENT_MESSAGE,
      payload: { threadId }
    } as StopAgentMessage).catch(() => {})
  }, [])

  // 新会话：Agent 完整回复后生成标题
  const generateTitleIfNew = useCallback(async (threadId: string, msgs: OpenAiChatMessage[]) => {
    const userMsg = msgs.find((m) => m.role === "user")
    const assistantMsg = [...msgs].reverse().find((m) => m.role === "assistant" && typeof m.content === "string" && m.content)
    if (!userMsg || !assistantMsg) return
    const existing = await getThread(threadId)
    if (existing?.title) return
    const userInputRaw = typeof userMsg.content === "string" ? userMsg.content : ""
    const references = readMessageContext(stripCurrentTime(userInputRaw))
    const userInput = references.text || references.files.join(", ") || references.pages.map(page => page.title).join(", ")
    const reply = typeof assistantMsg.content === "string" ? assistantMsg.content : ""
    generateThreadTitle(userInput, reply, settings).then(async (title) => {
      const record = await getThread(threadId)
      if (record) {
        record.title = title
        await putThread(record)
        setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, title } : t)))
      }
    }).catch(() => {})
  }, [settings])

  // 监听 agent 进度/完成/错误消息
  useEffect(() => {
    function handleAgentProgress(message: unknown) {
      if (!message || typeof message !== "object") return
      const msg = message as AgentProgressMessage
      if (msg.type === AGENT_PROGRESS_MESSAGE) {
        const { threadId, messages: msgs } = msg.payload
        if (threadId === activeThreadIdRef.current) {
          setMessages(cloneMessages(msgs as OpenAiChatMessage[]))
        }
        saveThreadMessages(threadId, msgs as OpenAiChatMessage[]).catch(() => {})
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
          refreshThreadList().catch(() => {})
        }
        saveThreadMessages(threadId, msgs as OpenAiChatMessage[]).catch(() => {})
        // 新会话：Agent 完整回复后生成标题
        generateTitleIfNew(threadId, msgs as OpenAiChatMessage[])
        return
      }
      const errorMsg = message as AgentErrorMessage
      if (errorMsg.type === AGENT_ERROR_MESSAGE) {
        const { threadId, error: errMsg } = errorMsg.payload
        delete sendInFlightMapRef.current[threadId]
        setLoadingThreadIds((prev) => {
          const next = new Set(prev)
          next.delete(threadId)
          return next
        })
        if (threadId === activeThreadIdRef.current) {
          onThreadErrorsChange(prev => ({ ...prev, [threadId]: errMsg }))
        }
      }
    }
    chrome.runtime.onMessage.addListener(handleAgentProgress)
    return () => { chrome.runtime.onMessage.removeListener(handleAgentProgress) }
  }, [refreshThreadList, generateTitleIfNew, onThreadErrorsChange])

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
  const isLoading = loadingThreadIds.has(activeThreadId)
  const currentThread = threads.find((t) => t.id === activeThreadId)
  const displayTitle = currentThread?.title || t("thread.defaultTitle")

  async function saveThreadTitle(newTitle: string) {
    if (!activeThreadId || !newTitle.trim()) return
    const record = await getThread(activeThreadId)
    if (record) {
      record.title = newTitle.trim()
      await putThread(record)
      await refreshThreadList()
    }
  }

  function startEditTitle() {
    setTitleDraft(displayTitle)
    setEditingTitle(true)
  }

  function commitTitle() {
    setEditingTitle(false)
    if (titleDraft.trim() && titleDraft.trim() !== displayTitle) {
      saveThreadTitle(titleDraft.trim())
    }
  }

  return (
    <div className="lm-chat-view">
      {/* Header */}
      <div className="lm-chat-view-header">
        <div className="lm-chat-view-header-left">
          <img
            aria-hidden
            className="lm-logo-cat lm-logo-cat--sm"
            src={lumiIcon}
            alt="Lumi"
          />
          {editingTitle ? (
            <input
              className="lm-chat-view-title-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle()
                if (e.key === "Escape") setEditingTitle(false)
              }}
              autoFocus
            />
          ) : (
            <span
              className="lm-chat-view-mode-name"
              title={t("chat.tooltip.rename")}
              onClick={startEditTitle}
            >
              {displayTitle}
            </span>
          )}
        </div>
        <div className="lm-chat-view-header-actions">
          {/* 删除整个对话（有历史消息时才显示） */}
          {messages.length > 0 && (
            <button
              className="lm-chat-view-delete-btn"
              title={t("chat.tooltip.deleteThread")}
              onClick={() => setShowDeleteConfirm(true)}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
          <button
            className="lm-chat-view-new-btn"
            title={t("chat.tooltip.newThread")}
            onClick={() => void handleNewThread()}
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            className="lm-chat-view-history-btn"
            title={t("chat.tooltip.history")}
            onClick={onOpenHistory}
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Chat Panel */}
      <section className="lm-chat-panel" aria-busy={isLoading}>
        {!isConfigured ? (
          <div className="lm-note lm-note--compact">
            <p>{t("chat.notConfigured")}</p>
            <button
              className="lm-secondary-button lm-secondary-button--sm"
              onClick={() => chrome.runtime.openOptionsPage()}
              type="button">
              {t("chat.openSettings")}
            </button>
          </div>
        ) : null}

        <div className="lm-chat-scroll" role="log" aria-relevant="additions" ref={chatScrollRef}>
          {isHydrating ? (
            <p className="lm-chat-hint">{t("chat.loading")}</p>
          ) : visibleMessages.length === 0 ? (
            <div className="wb-chat-empty">
              <p className="wb-chat-empty-title">{w("chatEmptyTitle")}</p>
              <p className="wb-chat-empty-hint">{w("chatEmptyHint")}</p>
              <p className="wb-chat-empty-context">{w("chatEmptyContext")}</p>
            </div>
          ) : (
            mergedMessages.map((item, gIdx) => {
              if (Array.isArray(item)) {
                const group = item as OpenAiChatMessage[]
                return (
                  <div
                    key={`${activeThreadId}-group-${gIdx}`}
                    className="lm-chat-row-wrapper lm-chat-row-wrapper--assistant"
                    style={{ "--lumi-msg-index": gIdx } as React.CSSProperties}
                  >
                    <div className="lm-chat-row lm-chat-row--assistant">
                      <div className="lm-chat-bubble lm-chat-bubble--assistant">
                        <AssistantTurn messages={group} running={isLoading && gIdx === mergedMessages.length - 1} />
                      </div>
                    </div>
                    <div className="lm-chat-actions">
                      <button type="button" className="lm-chat-action-btn" title={w("saveAnswer")} aria-label={w("saveAnswer")} disabled={savingAnswer || isLoading} onClick={async () => {
                        const answer = [...group].reverse().find(m => m.role === "assistant" && typeof m.content === "string" && m.content)
                        if (!answer || typeof answer.content !== "string") return
                        setSavingAnswer(true)
                        try { await saveFavoriteAnswer(displayTitle, displayContent(answer.content)); setSavedNotice(w("noteSaved")) }
                        catch { setContextError(w("actionError")) } finally { setSavingAnswer(false) }
                      }}>
                        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 3 14.78 8.63 21 9.54 16.5 13.93 17.56 20.12 12 17.2 6.44 20.12 7.5 13.93 3 9.54 9.22 8.63 12 3" />
                        </svg>
                      </button>
                      <button aria-label={t("chat.action.regenerate")} className="lm-chat-action-btn"
                        disabled={sendInFlightMapRef.current[activeThreadId]}
                        onClick={() => {
                          const groupStart = messages.indexOf(group[0])
                          if (groupStart < 0) return
                          let prevUserIdx = groupStart - 1
                          while (prevUserIdx >= 0 && messages[prevUserIdx].role !== "user") prevUserIdx--
                          if (prevUserIdx < 0) return
                          const prevUser = messages[prevUserIdx]
                          const newHistory = messages.slice(0, prevUserIdx)
                          saveThreadMessages(activeThreadId, newHistory).catch(() => {})
                          doSend(newHistory, formatMessagePreview(prevUser))
                        }}
                        title={t("chat.action.regenerate")} type="button"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 4 23 10 17 10" />
                          <polyline points="1 20 1 14 7 14" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                      </button>
                      <button aria-label={t("chat.action.copyMessage")} className={`lm-chat-action-btn${copiedId === `group-${gIdx}` ? " lm-chat-action-btn--copied" : ""}`}
                        onClick={() => {
                          let text = ""
                          for (let i = group.length - 1; i >= 0; i--) {
                            const m = group[i]
                            if (m.role === "assistant" && typeof m.content === "string" && m.content) {
                              text = displayContent(m.content)
                              break
                            }
                          }
                          if (text) {
                            navigator.clipboard.writeText(text).catch(() => {})
                            triggerCopyFeedback(`group-${gIdx}`)
                          }
                        }}
                        title={t("chat.action.copy")} type="button"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                      <button aria-label={t("chat.action.deleteMessage")} className="lm-chat-action-btn"
                        onClick={() => {
                          setMessages((prev) => {
                            const next = [...prev]
                            const delStart = prev.indexOf(group[0])
                            if (delStart >= 0) {
                              next.splice(delStart, next.length - delStart)
                            }
                            saveThreadMessages(activeThreadId, next).catch(() => {})
                            return next
                          })
                        }}
                        title={t("chat.action.delete")} type="button"
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
              const messageContext = readMessageContext(stripCurrentTime(formatMessagePreview(msg)))
              return (
                <div
                  key={`${activeThreadId}-${gIdx}-${msg.role}`}
                  className={`lm-chat-row-wrapper lm-chat-row-wrapper--${msg.role === "user" ? "user" : "assistant"}`}
                  style={{ "--lumi-msg-index": gIdx } as React.CSSProperties}
                >
                  {isEditingThis ? (
                    <div className="lm-chat-row lm-chat-row--user" style={{ width: "100%" }}>
                      <ReferenceChips pages={messageContext.pages} files={messageContext.files} onOpenFile={onOpenFile} className="wb-message-references" />
                      <div className="lm-chat-bubble lm-chat-bubble--user lm-edit-bubble">
                        <textarea
                          className="lm-edit-textarea"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                              e.preventDefault()
                              const trimmed = editingText.trim()
                              if (!trimmed && !messageContext.files.length && !messageContext.pages.length) return
                              if (sendInFlightMapRef.current[activeThreadId]) return
                              const newHistory = messages.slice(0, msgIndex)
                              saveThreadMessages(activeThreadId, newHistory).catch(() => {})
                              doSend(newHistory, withMessageContext(trimmed, messageContext.pages, messageContext.files))
                            }
                            if (e.key === "Escape") { setEditingIndex(-1); setEditingText("") }
                          }}
                          autoFocus
                          rows={3}
                        />
                        <div className="lm-edit-hint">{t("chat.editHint")}</div>
                      </div>
                    </div>
                  ) : (
                    <MessageErrorBoundary>
                      <ChatMessageBlock message={msg} allMessages={visibleMessages} index={msgIndex} onOpenFile={onOpenFile} />
                    </MessageErrorBoundary>
                  )}
                  <div className="lm-chat-actions">
                    {msg.role === "user" && !isEditingThis ? (
                      <button aria-label={t("chat.action.editMessage")} className="lm-chat-action-btn"
                        disabled={sendInFlightMapRef.current[activeThreadId]}
                        onClick={() => { setEditingIndex(msgIndex); setEditingText(displayContent(formatMessagePreview(msg))) }}
                        title={t("chat.action.edit")} type="button"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    ) : null}
                    {msg.role === "user" && !isEditingThis ? (
                      <button aria-label={t("chat.action.regenerate")} className="lm-chat-action-btn"
                        disabled={sendInFlightMapRef.current[activeThreadId]}
                        onClick={() => {
                          // 保留当前 user 消息及以上的所有消息，删除其后内容，用此 user 消息重新请求
                          const newHistory = messages.slice(0, msgIndex)
                          saveThreadMessages(activeThreadId, newHistory).catch(() => {})
                          doSend(newHistory, formatMessagePreview(msg))
                        }}
                        title={t("chat.action.regenerate")} type="button"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 4 23 10 17 10" />
                          <polyline points="1 20 1 14 7 14" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                      </button>
                    ) : null}
                    <button aria-label={t("chat.action.copyMessage")} className={`lm-chat-action-btn${copiedId === `msg-${gIdx}` ? " lm-chat-action-btn--copied" : ""}`}
                      onClick={() => {
                        const text = displayContent(formatMessagePreview(msg))
                        if (text) {
                          navigator.clipboard.writeText(text).catch(() => {})
                          triggerCopyFeedback(`msg-${gIdx}`)
                        }
                      }}
                      title={t("chat.action.copy")} type="button"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                    <button aria-label={t("chat.action.deleteMessage")} className="lm-chat-action-btn"
                      onClick={() => {
                        setMessages((prev) => {
                          const next = [...prev]
                          next.splice(msgIndex, next.length - msgIndex)
                          saveThreadMessages(activeThreadId, next).catch(() => {})
                          return next
                        })
                      }}
                      title={t("chat.action.delete")} type="button"
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
          {isLoading && (
            <div className="lumi-running-indicator">
              <span className="lumi-running-dot" />
              <span className="lumi-running-dot" />
              <span className="lumi-running-dot" />
            </div>
          )}
          {userScrolledUp && hasNewMessages.current && !isLoading && (
            <button
              className="lm-scroll-bottom-btn"
              type="button"
              onClick={() => {
                setUserScrolledUp(false)
                // 下次 useEffect 触发 scrollIntoView，先立即执行一次
                setTimeout(() => scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 20)
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
          <div ref={scrollAnchorRef} />
        </div>

        {threadErrors[activeThreadId] ? (
          <div className="lm-chat-error" role="alert">
            <p className="lm-chat-error__msg">{threadErrors[activeThreadId]}</p>
            <button
              className="lm-chat-error__retry"
              onClick={() => {
                onThreadErrorsChange(prev => { const next = {...prev}; delete next[activeThreadId]; return next })
                if (!activeThreadId) return
                void chrome.windows.getCurrent().then((win) => {
                  const payload = {
                    type: RETRY_AGENT_MESSAGE,
                    payload: {
                      threadId: activeThreadId,
                      windowId: win.id,
                      mode: agent.id,
                      agentConfig: { systemPrompt: agent.systemPrompt, tools: agent.tools, isBuiltin: agent.isBuiltin },
                      thinkingModeId: selectedThinkingModeId || undefined
                    }
                  } as RetryAgentMessage
                  chrome.runtime.sendMessage(payload).catch(() => {})
                })
                sendInFlightMapRef.current[activeThreadId] = true
                setLoadingThreadIds((prev) => new Set(prev).add(activeThreadId))
              }}
              type="button"
            >
              {t("chat.action.retry")}
            </button>
          </div>
        ) : null}

        <div className="lm-composer">
          {savedNotice && <p className="wb-notice" role="status">{savedNotice}</p>}
          {contextError && <p className="wb-error" role="alert">{contextError}</p>}
          <div className="wb-context-bar" aria-label={w("context")}>
            {contextPages.map(page => <PageReferenceChip
              key={page.id}
              page={page}
              onOpen={page => void switchToContextPage(page)}
              onRemove={page => setContextPages(prev => prev.filter(p => p.id !== page.id))}
            />)}
            <button ref={tabPickerTriggerRef} type="button" className="wb-context-add" title={w("selectTabs")} aria-label={w("selectTabs")} aria-expanded={tabPicker} onClick={() => { if (tabPicker) setTabPicker(false); else void showTabPicker() }}>＋</button>
          </div>
          {tabPicker && <section ref={tabPickerRef} className="wb-tab-picker" aria-label={w("selectTabs")}><div className="wb-section-heading"><strong>{w("tabHint")}</strong><button type="button" className="wb-text-button" onClick={() => setTabPicker(false)}>{w("done")}</button></div>{availableTabs.length ? availableTabs.map(page => <label className="wb-tab-choice" key={page.id}><input type="checkbox" checked={contextPages.some(p => p.id === page.id)} onChange={e => setContextPages(prev => e.target.checked ? [...prev, page] : prev.filter(p => p.id !== page.id))} /><span><strong>{page.title}</strong><small>{new URL(page.url).hostname}</small></span></label>) : <p className="wb-muted">{w("noTabs")}</p>}</section>}
          <div className="lm-composer__shell">
            <ReferenceChips files={contextFiles} className="wb-composer-files" onOpenFile={onOpenFile} onRemoveFile={path => setContextFiles(prev => prev.filter(file => file !== path))} />
            <textarea
              ref={composerRef}
              aria-label={t("chat.composerAria")}
              className="lm-input lm-input--composer"
              disabled={isHydrating}
              onChange={(event) => {
                setDraft(event.target.value)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  void sendUserMessage()
                }
              }}
              placeholder={t("chat.placeholder")}
              rows={1}
              value={draft}
            />
            <div className="lm-composer__toolbar">
              <ComposerUploadButton busy={uploadingFiles} disabled={isHydrating} onUpload={files => void uploadFiles(files)} />
              {draft.trim() && <button type="button" className="wb-composer-icon-button" title={w("saveTask")} aria-label={w("saveTask")} onClick={() => onSaveTask(draft)}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg></button>}
              <div className="lm-composer__spacer" />
              {thinkingConfig.modes.length > 0 && (
                <div className="lm-composer-thinking">
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={thinkingMenuOpen}
                    className="lm-composer-thinking__trigger"
                    onClick={() => setThinkingMenuOpen((v) => !v)}
                  >
                    <span className="lm-composer-thinking__value">
                      {thinkingConfig.modes.find((m) => m.id === selectedThinkingModeId)?.label ?? thinkingConfig.defaultModeId}
                    </span>
                    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  {thinkingMenuOpen && (
                    <>
                      <div className="lm-composer-thinking__overlay" onClick={() => setThinkingMenuOpen(false)} />
                      <div className="lm-composer-thinking__menu" role="listbox">
                        {thinkingConfig.modes.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            role="option"
                            aria-selected={m.id === selectedThinkingModeId}
                            className={`lm-composer-thinking__item${m.id === selectedThinkingModeId ? " lm-composer-thinking__item--active" : ""}`}
                            onClick={() => {
                              setSelectedThinkingModeId(m.id)
                              setThinkingMenuOpen(false)
                            }}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              <button
                aria-busy={isLoading}
                aria-label={isLoading ? t("chat.stop") : t("chat.send")}
                className={`lm-composer-send${isLoading ? " lm-composer-send--stop" : ""}`}
                disabled={isHydrating || (!isLoading && (uploadingFiles || (!draft.trim() && !contextFiles.length)))}
                onClick={() => { isLoading ? handleStop() : void sendUserMessage() }}
                type="button">
                {isLoading ? (
                  <svg aria-hidden className="lm-stop-icon" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1.5" />
                  </svg>
                ) : (
                  <SendArrowIcon />
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 删除确认弹窗（始终挂载，靠 class 切换进出动画） */}
      <div
        className={`lm-confirm-overlay${showDeleteConfirm ? " lm-confirm-overlay--active" : ""}`}
        onClick={() => showDeleteConfirm && setShowDeleteConfirm(false)}
      >
        <div className="lm-confirm-card" onClick={(e) => e.stopPropagation()}>
          <p className="lm-confirm-msg">{t("chat.confirmDeleteThread")}</p>
          <div className="lm-confirm-actions">
            <button
              className="lm-primary-button lm-agent-form-btn"
              onClick={() => setShowDeleteConfirm(false)}
              type="button"
            >
              {t("option.agents.cancel")}
            </button>
            <button
              className="lm-agent-card-btn lm-agent-form-btn lm-confirm-delete-btn"
              onClick={() => {
                setShowDeleteConfirm(false)
                handleDeleteThread(activeThreadId)
              }}
              type="button"
            >
              {t("option.agents.delete")}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})
