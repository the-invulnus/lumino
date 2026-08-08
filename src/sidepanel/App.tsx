/**
 * Lumino Side Panel — App 入口
 *
 * 顶层路由：首页 / 聊天界面分发
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { AgentConfig } from "../lib/chat/mode-config"
import { getAllAgents, getBuiltinAgents } from "../lib/chat/builtin-agents"
import { getLastActiveMode, setLastActiveMode } from "../lib/chat/mode-config"
import { getThread, deleteThread } from "../lib/chat/thread-idb"
import type { LlmSettings } from "../lib/llm/llm-types"
import { getLlmSettings, getThinkingConfig, THINKING_CONFIG_KEY, type ThinkingConfig } from "../lib/settings"
import { applyTheme, getTheme } from "../lib/theme"
import { initLocaleFromStorage } from "../lib/i18n"
import { HomePage } from "./HomePage"
import { ChatView, type ChatViewHandle } from "./ChatView"
import { IconSidebar } from "./IconSidebar"
import { HistoryPanel } from "./HistoryPanel"

// 注：工具注册在 Service Worker 侧完成（background.ts），Side Panel 无需注册

export function App() {
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null)
  const [currentAgent, setCurrentAgent] = useState<AgentConfig | null>(null)
  const [settings, setSettings] = useState<LlmSettings>({ baseUrl: "", apiKey: "", model: "" })
  const [thinkingConfig, setThinkingConfig] = useState<ThinkingConfig>({ modes: [], defaultModeId: "" })
  const [runningAgentIds, setRunningAgentIds] = useState<Set<string>>(new Set())
  const [isReady, setIsReady] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pendingThreadId, setPendingThreadId] = useState<string | undefined>(undefined)
  const [recentVersion, setRecentVersion] = useState(0)
  const [threadErrors, setThreadErrors] = useState<Record<string, string>>({})
  const chatViewRef = useRef<ChatViewHandle>(null)

  // 初始化
  useEffect(() => {
    // 恢复语言（默认 en），子组件 useT() 会随事件重渲染
    void initLocaleFromStorage()
    Promise.all([getLlmSettings(), getTheme(), getAllAgents(), getThinkingConfig()])
      .then(([s, theme, loadedAgents, tconfig]) => {
        setSettings(s)
        applyTheme(theme)
        setAgents(loadedAgents)
        setThinkingConfig(tconfig)

        // 恢复上次模式
        const lastMode = getLastActiveMode()
        if (lastMode) {
          const lastAgent = loadedAgents.find(a => a.id === lastMode)
          if (lastAgent) {
            setCurrentAgentId(lastMode)
            setCurrentAgent(lastAgent)
          }
        }
      })
      .catch(() => {
        // 至少加载内置 Agent
        getBuiltinAgents().then(setAgents).catch(() => {})
      })
      .finally(() => setIsReady(true))
  }, [])

  // 监听 storage 变化（settings 更新后实时反映）
  // LLM/Obsidian 凭证存在 local（安全，不同步），theme 与自定义 Agent 存 sync
  useEffect(() => {
    const SETTINGS_KEYS = ["baseUrl", "apiKey", "model"]
    function handleChanged(changes: Record<string, chrome.storage.StorageChange>, areaName: string) {
      if (areaName === "sync") {
        if ("theme" in changes) {
          applyTheme((changes.theme.newValue as any) || "paper")
        }
        // 自定义 Agent 配置随账号同步
        if ("lumino_custom_agents" in changes) {
          getAllAgents().then(setAgents).catch(() => {})
        }
      }
      if (areaName === "local") {
        // LLM 凭证在 local
        if (SETTINGS_KEYS.some((key) => key in changes)) {
          getLlmSettings().then(setSettings).catch(() => {})
        }
        // 思考配置在 local（与模型耦合），变化时实时刷新
        if (THINKING_CONFIG_KEY in changes) {
          getThinkingConfig().then(setThinkingConfig).catch(() => {})
        }
        // 语言切换：local 中的 lumino_locale 变化时由 i18n 事件处理，此处无需额外动作
      }
    }
    chrome.storage.onChanged.addListener(handleChanged)
    return () => { chrome.storage.onChanged.removeListener(handleChanged) }
  }, [])

  // 监听 Agent 运行状态（来自 SW 的进度消息）
  useEffect(() => {
    function handleRunningState(message: unknown) {
      if (!message || typeof message !== "object") return
      const msg = message as { type?: string; payload?: { threadId: string } }
      if (msg.type === "lumino/agent-progress" && msg.payload) {
        const threadId = msg.payload.threadId
        if (threadId) {
          getThread(threadId).then((record) => {
            if (record?.mode) {
              setRunningAgentIds((prev) => new Set(prev).add(record.mode!))
            }
          }).catch(() => {})
        }
      }
      if (msg.type === "lumino/agent-complete" && msg.payload) {
        const threadId = msg.payload.threadId
        if (threadId) {
          getThread(threadId).then((record) => {
            if (record?.mode) {
              setRunningAgentIds((prev) => {
                const next = new Set(prev)
                next.delete(record.mode!)
                return next
              })
            }
          }).catch(() => {})
        }
      }
    }
    chrome.runtime.onMessage.addListener(handleRunningState)
    return () => { chrome.runtime.onMessage.removeListener(handleRunningState) }
  }, [])

  const handleSelectAgent = useCallback((agent: AgentConfig) => {
    setCurrentAgentId(agent.id)
    setCurrentAgent(agent)
    setLastActiveMode(agent.id)
    setPendingThreadId(undefined)
    // 清除该模式的运行状态通知
    setRunningAgentIds((prev) => {
      const next = new Set(prev)
      next.delete(agent.id)
      return next
    })
  }, [])

  // 从首页最近会话 / 历史面板选中某个具体会话
  const handleSelectThread = useCallback(async (threadId: string) => {
    const record = await getThread(threadId).catch(() => null)
    const mode = record?.mode
    const agent = mode ? agents.find((a) => a.id === mode) : null
    setHistoryOpen(false)
    if (!agent) return
    // 同一 agent：直接委托 ChatView 切换会话（无需重挂载）
    if (currentAgentId === agent.id && chatViewRef.current) {
      await chatViewRef.current.selectThread(threadId)
      return
    }
    // 跨 agent：切 agent + 用 initialThreadId 在重挂载时加载
    setCurrentAgentId(agent.id)
    setCurrentAgent(agent)
    setLastActiveMode(agent.id)
    setPendingThreadId(threadId)
    // 同一 agent：直接委托 ChatView 切换会话（无需重挂载）
    if (currentAgentId === agent.id && chatViewRef.current) {
      await chatViewRef.current.selectThread(threadId)
      return
    }
    // 跨 agent：切 agent + 用 initialThreadId 在重挂载时加载
    setCurrentAgentId(agent.id)
    setCurrentAgent(agent)
    setLastActiveMode(agent.id)
    setPendingThreadId(threadId)
    setRunningAgentIds((prev) => {
      const next = new Set(prev)
      next.delete(agent.id)
      return next
    })
  }, [agents, currentAgentId])

  const handleDeleteThread = useCallback(async (threadId: string) => {
    await deleteThread(threadId).catch(() => {})
    // 委托给挂载的 ChatView 同步内部状态
    chatViewRef.current?.deleteThread(threadId)
    // 刷新首页最近会话列表（HomePage 不在当前视图时无影响）
    setRecentVersion((v) => v + 1)
  }, [])

  const handleOpenHistory = useCallback(() => setHistoryOpen(true), [])

  const handleGoHome = useCallback(() => {
    setCurrentAgentId(null)
    setCurrentAgent(null)
    setLastActiveMode("")
  }, [])

  const handleOpenSettings = useCallback(() => {
    chrome.runtime.openOptionsPage()
  }, [])

  if (!isReady) return null

  return (
    <div className="lm-shell lm-sidepanel">
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
            {/* 主内容区 */}
            <div className="lm-sidepanel-layout">
              {currentAgent ? (
                <ChatView
                  key={currentAgent.id}
                  ref={chatViewRef}
                  agent={currentAgent}
                  onBack={handleGoHome}
                  settings={settings}
                  thinkingConfig={thinkingConfig}
                  initialThreadId={pendingThreadId}
                  onOpenHistory={handleOpenHistory}
                  threadErrors={threadErrors}
                  onThreadErrorsChange={setThreadErrors}
                />
              ) : (
                <HomePage
                  agents={agents}
                  refreshToken={recentVersion}
                  onSelectAgent={handleSelectAgent}
                  onSelectThread={handleSelectThread}
                  onOpenHistory={handleOpenHistory}
                />
              )}
            </div>

            {/* 右侧导航栏 */}
            <IconSidebar
              agents={agents}
              currentAgentId={currentAgentId}
              runningAgentIds={runningAgentIds}
              onSelectAgent={handleSelectAgent}
              onGoHome={handleGoHome}
              onOpenSettings={handleOpenSettings}
            />
          </div>
        </div>
      </div>

      {/* 全局历史会话面板（首页 / 聊天页均可打开） */}
      <HistoryPanel
        open={historyOpen}
        onSelect={(threadId) => { void handleSelectThread(threadId) }}
        onDelete={(threadId) => { void handleDeleteThread(threadId) }}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  )
}
