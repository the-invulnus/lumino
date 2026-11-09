import { useCallback, useEffect, useRef, useState } from "react"
import type { AgentConfig } from "../lib/chat/mode-config"
import { getBuiltinAgents } from "../lib/chat/builtin-agents"
import type { LlmSettings } from "../lib/llm/llm-types"
import { getLlmSettings, getThinkingConfig, THINKING_CONFIG_KEY, type ThinkingConfig } from "../lib/settings"
import { applyTheme, getTheme } from "../lib/theme"
import { initLocaleFromStorage } from "../lib/i18n"
import { useW } from "../lib/workbench/i18n"
import { ChatView, type ChatViewHandle } from "./ChatView"
import { IconSidebar } from "./IconSidebar"
import { HistoryPanel } from "./HistoryPanel"
import { WorkspaceView } from "./WorkspaceView"
import { TasksView } from "./TasksView"
import "../styles/workbench.css"

export function App() {
  const w = useW()
  const [view, setView] = useState<"assistant" | "workspace" | "tasks">("assistant")
  const [agent, setAgent] = useState<AgentConfig | null>(null)
  const [settings, setSettings] = useState<LlmSettings>({ baseUrl: "", apiKey: "", model: "" })
  const [thinkingConfig, setThinkingConfig] = useState<ThinkingConfig>({ modes: [], defaultModeId: "" })
  const [historyOpen, setHistoryOpen] = useState(false)
  const [threadErrors, setThreadErrors] = useState<Record<string, string>>({})
  const [draftRequest, setDraftRequest] = useState<{ id: number; prompt?: string; files?: string[]; selectTabs?: boolean; skipCurrentPage?: boolean }>()
  const [taskSeed, setTaskSeed] = useState<{ id: number; prompt: string }>()
  const [fileRequest, setFileRequest] = useState<{ id: number; path: string }>()
  const [error, setError] = useState("")
  const [running, setRunning] = useState<Set<string>>(new Set())
  const requestId = useRef(0)
  const chatRef = useRef<ChatViewHandle>(null)
  const [initVersion, setInitVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    setError("")
    async function init() {
      await initLocaleFromStorage()
      const [loaded, llm, thinking, theme] = await Promise.all([getBuiltinAgents(), getLlmSettings(), getThinkingConfig(), getTheme()])
      if (cancelled) return
      applyTheme(theme); setAgent(loaded[0]); setSettings(llm); setThinkingConfig(thinking)
    }
    void init().catch(() => { if (!cancelled) setError(w("loadError")) })
    function changed(changes: Record<string, chrome.storage.StorageChange>, area: string) {
      if (area === "sync" && changes.theme) applyTheme(changes.theme.newValue || "paper")
      if (area === "local") {
        if (["baseUrl", "apiKey", "model"].some(k => k in changes)) void getLlmSettings().then(setSettings)
        if (THINKING_CONFIG_KEY in changes) void getThinkingConfig().then(setThinkingConfig)
      }
      // Rebuild the unified prompt after language or integration settings change.
      if (area === "local" && ["lumino_locale", "obsidianEnabled", "obsidianApiKey", "obsidianBaseUrl"].some(k => k in changes)) void getBuiltinAgents().then(agents => { if (!cancelled) setAgent(agents[0]) }).catch(() => {})
    }
    chrome.storage.onChanged.addListener(changed)
    return () => { cancelled = true; chrome.storage.onChanged.removeListener(changed) }
  }, [initVersion])
  useEffect(() => {
    let cancelled = false
    void chrome.runtime.sendMessage({ type: "lumino/query-running-state" }).then(result => { if (!cancelled) setRunning(new Set(result?.runningThreadIds || [])) }).catch(() => {})
    function progress(message: { type?: string; payload?: { threadId?: string } }) {
      const id = message.payload?.threadId
      if (!id) return
      if (message.type === "lumino/agent-progress") setRunning(prev => new Set(prev).add(id))
      if (message.type === "lumino/agent-complete" || message.type === "lumino/agent-error") setRunning(prev => { const next = new Set(prev); next.delete(id); return next })
    }
    chrome.runtime.onMessage.addListener(progress)
    return () => { cancelled = true; chrome.runtime.onMessage.removeListener(progress) }
  }, [])
  const prepare = useCallback((prompt: string, selectTabs = false) => {
    setDraftRequest({ id: ++requestId.current, prompt, selectTabs }); setView("assistant")
  }, [])
  const prepareReference = useCallback((reference: { prompt?: string; files?: string[] }) => {
    setDraftRequest({ id: ++requestId.current, ...reference, skipCurrentPage: true }); setView("assistant")
  }, [])
  const openHistory = useCallback(() => setHistoryOpen(true), [])
  const previewFile = useCallback((path: string) => {
    setFileRequest({ id: ++requestId.current, path }); setView("workspace")
  }, [])
  return <div className="lm-shell lm-sidepanel wb-shell">
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
    {error && <div className="wb-error" role="alert">{error}<button type="button" className="wb-text-button" onClick={() => setInitVersion(v => v + 1)}>{w("refresh")}</button></div>}
    {agent ? <main className="wb-main">
      <div className="wb-view" hidden={view !== "assistant"}><ChatView ref={chatRef} agent={agent} onBack={() => setView("assistant")} settings={settings} thinkingConfig={thinkingConfig} onOpenHistory={openHistory} threadErrors={threadErrors} onThreadErrorsChange={setThreadErrors} draftRequest={draftRequest} onOpenFile={previewFile} onSaveTask={prompt => { setTaskSeed({ id: ++requestId.current, prompt }); setView("tasks") }} /></div>
      <div className="wb-view" hidden={view !== "workspace"}><WorkspaceView visible={view === "workspace"} fileRequest={fileRequest} onAttachFile={path => prepareReference({ files: [path] })} onFilesDeleted={(path, recursive) => chatRef.current?.removeFileReferences(path, recursive)} /></div>
      <div className="wb-view" hidden={view !== "tasks"}><TasksView visible={view === "tasks"} seed={taskSeed} onUse={prepare} /></div>
    </main> : !error && <p className="wb-muted">{w("loading")}</p>}
          </div>
          <IconSidebar
            currentView={view}
            items={[
              { id: "assistant", label: w("navAssistant"), title: w("assistant"), icon: "chat", running: running.size > 0 },
              { id: "workspace", label: w("navWorkspace"), title: w("workspace"), icon: "folder" },
              { id: "tasks", label: w("navTasks"), title: w("tasks"), icon: "automate" }
            ]}
            onSelect={id => setView(id as typeof view)}
            onOpenHistory={openHistory}
            onOpenSettings={() => chrome.runtime.openOptionsPage()}
          />
        </div>
      </div>
    </div>
    <HistoryPanel open={historyOpen} onSelect={id => { setView("assistant"); setHistoryOpen(false); void chatRef.current?.selectThread(id).catch(() => setError(w("loadError"))) }} onDelete={id => { void chatRef.current?.deleteThread(id).catch(() => setError(w("actionError"))) }} onClose={() => setHistoryOpen(false)} />
  </div>
}
