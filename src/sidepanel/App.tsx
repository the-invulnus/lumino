/**
 * Lumino Side Panel — App 入口
 *
 * 顶层路由：首页 / 聊天界面分发
 */

import { useCallback, useEffect, useState } from "react"
import type { AgentConfig } from "../lib/chat/mode-config"
import { getAllAgents, BUILTIN_AGENTS } from "../lib/chat/builtin-agents"
import { getLastActiveMode, setLastActiveMode } from "../lib/chat/mode-config"
import { registerAllTools } from "../lib/chat/tool-registry"
import { getThread } from "../lib/chat/thread-idb"
import type { LlmSettings } from "../lib/llm/types"
import { getLlmSettings } from "../lib/settings"
import { applyTheme, getTheme } from "../lib/theme"
import { HomePage } from "./HomePage"
import { ChatView } from "./ChatView"
import { IconSidebar } from "./IconSidebar"

registerAllTools().catch(() => {})

export function App() {
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null)
  const [currentAgent, setCurrentAgent] = useState<AgentConfig | null>(null)
  const [settings, setSettings] = useState<LlmSettings>({ baseUrl: "", apiKey: "", model: "" })
  const [runningAgentIds, setRunningAgentIds] = useState<Set<string>>(new Set())
  const [isReady, setIsReady] = useState(false)

  // 初始化
  useEffect(() => {
    Promise.all([getLlmSettings(), getTheme(), getAllAgents()])
      .then(([s, theme, loadedAgents]) => {
        setSettings(s)
        applyTheme(theme)
        setAgents(loadedAgents)

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
        setAgents(BUILTIN_AGENTS)
      })
      .finally(() => setIsReady(true))
  }, [])

  // 监听 storage 变化（settings 更新后实时反映）
  useEffect(() => {
    const SETTINGS_KEYS = ["baseUrl", "apiKey", "model"]
    function handleChanged(changes: Record<string, chrome.storage.StorageChange>, areaName: string) {
      if (areaName !== "sync") return
      if ("theme" in changes) {
        applyTheme((changes.theme.newValue as any) || "paper")
      }
      if (SETTINGS_KEYS.some((key) => key in changes)) {
        getLlmSettings().then(setSettings).catch(() => {})
      }
      // 检查自定义 Agent 是否变化
      if ("lumino_custom_agents" in changes) {
        getAllAgents().then(setAgents).catch(() => {})
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
    // 清除该模式的运行状态通知
    setRunningAgentIds((prev) => {
      const next = new Set(prev)
      next.delete(agent.id)
      return next
    })
  }, [])

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
                  agent={currentAgent}
                  onBack={handleGoHome}
                  settings={settings}
                />
              ) : (
                <HomePage agents={agents} onSelectAgent={handleSelectAgent} />
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
    </div>
  )
}
