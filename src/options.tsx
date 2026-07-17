import { useEffect, useState, type FormEvent } from "react"

import type { LlmSettings } from "./lib/llm/types"
import {
  getLlmSettings,
  saveLlmSettings,
  type ObsidianSettings,
  getObsidianSettings,
  saveObsidianSettings
} from "./lib/settings"
import "./styles/components.css"
import { applyTheme, getTheme } from "./lib/theme"
import type { AgentConfig } from "./lib/chat/mode-config"
import { loadCustomAgents, saveCustomAgents } from "./lib/chat/mode-config"
import { NavIcon, AVAILABLE_ICONS } from "./sidepanel/IconSidebar"
import { listThreads, deleteThread } from "./lib/chat/thread-idb"

const TOOL_GROUPS: { label: string; tools: { name: string; desc: string }[] }[] = [
  {
    label: "文件系统",
    tools: [
      { name: "ls", desc: "列出工作区目录中的文件和子目录" },
      { name: "read_file", desc: "读取工作区中的文件内容，支持分页" },
      { name: "write_file", desc: "在工作区中创建或覆写文件" },
      { name: "edit_file", desc: "对文件执行精确的字符串替换编辑" },
      { name: "glob", desc: "根据 glob 模式查找匹配的文件" },
      { name: "grep", desc: "在工作区文件中搜索文本" },
      { name: "rm", desc: "删除工作区中的文件或空目录" },
      { name: "export", desc: "将工作区文件或目录导出到本地下载目录" }
    ]
  },
  {
    label: "浏览器系统",
    tools: [
      { name: "current_page", desc: "获取当前活跃标签页的 URL 和标题" },
      { name: "tabs", desc: "列出浏览器中所有打开的标签页" },
      { name: "get_active_tab_id", desc: "获取当前活跃标签页的 ID" }
    ]
  },
  {
    label: "页面阅读",
    tools: [
      { name: "get_page_content", desc: "读取当前页面的可见文本内容" },
      { name: "take_selection", desc: "获取用户在页面中选中的文本" }
    ]
  },
  {
    label: "浏览器交互",
    tools: [
      { name: "inspect_element", desc: "探查页面可交互元素的 DOM 结构" },
      { name: "fill_form", desc: "在页面中自动填充表单" },
      { name: "click_element", desc: "点击页面中的指定元素" },
      { name: "screenshot", desc: "对当前页面进行截图" },
      { name: "scroll", desc: "在页面中滚动到指定位置或元素" },
      { name: "press_key", desc: "在页面中模拟按键操作" },
      { name: "navigate", desc: "在新标签页中打开指定 URL" },
      { name: "close_tab", desc: "关闭指定的标签页" }
    ]
  },
  {
    label: "页面爬取",
    tools: [
      { name: "scrape_structure", desc: "提取当前页面的运行时 DOM 结构" },
      { name: "scrape_styles", desc: "获取页面元素的完整计算样式" },
      { name: "scrape_resources", desc: "发现页面引用的外部资源 URL" },
      { name: "fetch_resource", desc: "通过 SW 获取资源内容，无 CORS 限制" }
    ]
  }
]

function IndexOptions() {
  const [settings, setSettings] = useState<LlmSettings>({ baseUrl: "", apiKey: "", model: "" })
  const [obsidianSettings, setObsidianSettings] = useState<ObsidianSettings>({ enabled: false, apiKey: "", baseUrl: "http://127.0.0.1:27123" })
  const [status, setStatus] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [customAgents, setCustomAgents] = useState<AgentConfig[]>([])
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null)
  const [showAgentForm, setShowAgentForm] = useState(false)
  const [activeSection, setActiveSection] = useState("llm")

  const [agentName, setAgentName] = useState("")
  const [agentIcon, setAgentIcon] = useState("chat")
  const [agentPrompt, setAgentPrompt] = useState("")
  const [agentTools, setAgentTools] = useState<string[]>([])

  useEffect(() => {
    Promise.all([
      getLlmSettings().catch(() => ({ baseUrl: "", apiKey: "", model: "" })),
      getObsidianSettings().catch(() => ({ enabled: false, apiKey: "", baseUrl: "http://127.0.0.1:27123" })),
      getTheme(),
      loadCustomAgents()
    ]).then(([s, o, t, agents]) => {
      setSettings(s)
      setObsidianSettings(o)
      applyTheme(t)
      setCustomAgents(agents)
    })
  }, [])

  async function saveAll() {
    setIsSaving(true)
    setStatus("")
    try {
      await saveLlmSettings(settings)
      await saveObsidianSettings(obsidianSettings)
      setSettings(await getLlmSettings())
      setStatus("已保存")
      setTimeout(() => setStatus(""), 2000)
    } catch {
      setStatus("保存失败")
    } finally {
      setIsSaving(false)
    }
  }

  function resetAgentForm() {
    setAgentName("")
    setAgentIcon("chat")
    setAgentPrompt("")
    setAgentTools([])
    setEditingAgent(null)
    setShowAgentForm(false)
  }

  function startEditAgent(agent: AgentConfig) {
    setAgentName(agent.name)
    setAgentIcon(agent.icon)
    setAgentPrompt(agent.systemPrompt)
    setAgentTools(agent.tools)
    setEditingAgent(agent)
    setShowAgentForm(true)
  }

  function handleToggleTool(toolName: string) {
    setAgentTools((prev) =>
      prev.includes(toolName) ? prev.filter((t) => t !== toolName) : [...prev, toolName]
    )
  }

  async function handleSaveAgent(e: FormEvent) {
    e.preventDefault()
    if (!agentName.trim() || !agentPrompt.trim()) return
    const agent: AgentConfig = {
      id: editingAgent?.id || crypto.randomUUID(),
      name: agentName.trim(), description: "",
      icon: agentIcon, isBuiltin: false,
      systemPrompt: agentPrompt.trim(), tools: agentTools, order: 100
    }
    const updated = editingAgent
      ? customAgents.map((a) => (a.id === editingAgent.id ? agent : a))
      : [...customAgents, agent]
    await saveCustomAgents(updated)
    setCustomAgents(updated)
    resetAgentForm()
  }

  async function handleDeleteAgent(id: string) {
    // 删除该 Agent 下的所有会话
    const threads = await listThreads(id)
    for (const t of threads) {
      await deleteThread(t.id)
    }
    const updated = customAgents.filter((a) => a.id !== id)
    await saveCustomAgents(updated)
    setCustomAgents(updated)
  }

  const NAV_ITEMS = [
    {
      key: "llm", label: "模型连接",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
    },
    {
      key: "obsidian", label: "Obsidian",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
    },
    {
      key: "agents", label: "智能体",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
    }
  ]

  return (
    <main className="lm-options-root">
      <div aria-hidden className="lm-ambient">
        <div className="lm-blob lm-blob--a" />
        <div className="lm-blob lm-blob--b" />
      </div>

      <div className="lm-options-shell">
        {/* 左侧导航 */}
        <nav className="lm-options-nav">
          <div className="lm-options-nav-brand">Lumino</div>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`lm-options-nav-item${activeSection === item.key ? " lm-options-nav-item--active" : ""}`}
              onClick={() => setActiveSection(item.key)}
              type="button"
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
          <div className="lm-options-nav-spacer" />
          <button className="lm-options-save-btn" disabled={isSaving} onClick={saveAll} type="button">
            {isSaving ? "保存中..." : "保存设置"}
          </button>
        </nav>

        {/* 右侧内容 */}
        <div className="lm-options-content">
          {/* LLM */}
          {activeSection === "llm" && (
            <div className="lm-options-panel">
              <h2 className="lm-options-panel-title">模型连接</h2>
              <p className="lm-options-panel-desc">配置 OpenAI 兼容 API，连接完成后 Agent 将通过此 API 与模型通信。</p>
              <label className="lm-field">
                <span className="lm-label">Base URL</span>
                <input className="lm-input" onChange={(e) => setSettings((p) => ({ ...p, baseUrl: e.target.value }))} placeholder="https://api.openai.com/v1" value={settings.baseUrl} />
              </label>
              <label className="lm-field">
                <span className="lm-label">API Key</span>
                <input className="lm-input" onChange={(e) => setSettings((p) => ({ ...p, apiKey: e.target.value }))} placeholder="sk-..." type="password" value={settings.apiKey} />
              </label>
              <label className="lm-field">
                <span className="lm-label">Model</span>
                <input className="lm-input" onChange={(e) => setSettings((p) => ({ ...p, model: e.target.value }))} placeholder="gpt-4o-mini" value={settings.model} />
              </label>
              {status ? <span className="lm-options-status">{status}</span> : null}
            </div>
          )}

          {/* Obsidian */}
          {activeSection === "obsidian" && (
            <div className="lm-options-panel">
              <h2 className="lm-options-panel-title">Obsidian 集成</h2>
              <p className="lm-options-panel-desc">连接 Obsidian Local REST API 后，Agent 可以直接读写你的 vault。</p>
              <label className="lm-toggle">
                <input type="checkbox" checked={obsidianSettings.enabled} onChange={(e) => setObsidianSettings((p) => ({ ...p, enabled: e.target.checked }))} />
                <span className="lm-toggle-label"><strong>启用 Obsidian 集成</strong></span>
              </label>
              {obsidianSettings.enabled && (
                <>
                  <label className="lm-field">
                    <span className="lm-label">API Base URL</span>
                    <input className="lm-input" onChange={(e) => setObsidianSettings((p) => ({ ...p, baseUrl: e.target.value }))} placeholder="http://127.0.0.1:27123" value={obsidianSettings.baseUrl} />
                  </label>
                  <label className="lm-field">
                    <span className="lm-label">API Key</span>
                    <input className="lm-input" onChange={(e) => setObsidianSettings((p) => ({ ...p, apiKey: e.target.value }))} placeholder="在 Obsidian 设置中获取" type="password" value={obsidianSettings.apiKey} />
                  </label>
                </>
              )}
              {status ? <span className="lm-options-status">{status}</span> : null}
            </div>
          )}

          {/* 自定义智能体 */}
          {activeSection === "agents" && (
            <div className="lm-options-panel">
              <h2 className="lm-options-panel-title">自定义智能体</h2>
              <p className="lm-options-panel-desc">创建你自己的 AI 智能体，配置专属系统提示词和可用工具。</p>

              {customAgents.length > 0 && (
                <div className="lm-custom-agents-list">
                  {customAgents.map((agent) => (
                    <div key={agent.id} className="lm-agent-card">
                      <div className="lm-agent-card-body">
                        <span className="lm-agent-card-icon"><NavIcon icon={agent.icon} /></span>
                        <div>
                          <strong>{agent.name}</strong>
                          <small>{agent.tools.length === 0 ? "无工具" : `${agent.tools.length} 个工具`}</small>
                        </div>
                      </div>
                      <div className="lm-agent-card-actions">
                        <button className="lm-agent-card-btn" onClick={() => startEditAgent(agent)} type="button">编辑</button>
                        <button className="lm-agent-card-btn lm-agent-card-btn--danger" onClick={() => handleDeleteAgent(agent.id)} type="button">删除</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!showAgentForm ? (
                <button className="lm-agent-add-btn" onClick={() => setShowAgentForm(true)} type="button">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  新建智能体
                </button>
              ) : (
                <form className="lm-agent-form" onSubmit={handleSaveAgent}>
                  <h3 className="lm-agent-form-title">{editingAgent ? "编辑智能体" : "新建智能体"}</h3>

                  <label className="lm-field">
                    <span className="lm-label">名称</span>
                    <input className="lm-input" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="我的助手" required />
                  </label>

                  <div className="lm-field">
                    <span className="lm-label">图标</span>
                    <div className="lm-icon-picker">
                      {AVAILABLE_ICONS.map((iconKey) => (
                        <button key={iconKey} type="button" className={`lm-icon-picker-btn${agentIcon === iconKey ? " lm-icon-picker-btn--active" : ""}`} onClick={() => setAgentIcon(iconKey)} title={iconKey}>
                          <NavIcon icon={iconKey} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="lm-field">
                    <span className="lm-label">系统提示词</span>
                    <textarea className="lm-textarea" value={agentPrompt} onChange={(e) => setAgentPrompt(e.target.value)} placeholder="你是一个..." rows={5} required />
                  </label>

                  <div className="lm-field">
                    <span className="lm-label">可用工具（不选 = 无工具）</span>
                    <div className="lm-tool-selector">
                      {TOOL_GROUPS.map((group) => (
                        <div key={group.label} className="lm-tool-group">
                          <span className="lm-tool-group-label">{group.label}</span>
                          <div className="lm-tool-group-items">
                            {group.tools.map((t) => (
                              <label key={t.name} className="lm-tool-checkbox" title={t.desc}>
                                <input type="checkbox" checked={agentTools.includes(t.name)} onChange={() => handleToggleTool(t.name)} />
                                <span className="lm-tool-checkbox-name">{t.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="lm-agent-form-actions">
                    <button className="lm-primary-button" type="submit" style={{ minWidth: "auto", padding: "8px 20px", fontSize: "13px" }}>
                      {editingAgent ? "更新" : "创建"}
                    </button>
                    <button className="lm-agent-card-btn" type="button" onClick={resetAgentForm}>取消</button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

export default IndexOptions
