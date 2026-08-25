import { useEffect, useState, type FormEvent } from "react"

import type { LlmSettings } from "./lib/llm/llm-types"
import {
  getLlmSettings,
  saveLlmSettings,
  type ObsidianSettings,
  getObsidianSettings,
  saveObsidianSettings,
  DEFAULT_THINKING_CONFIG,
  getThinkingConfig,
  saveThinkingConfig,
  type ThinkingConfig
} from "./lib/settings"
import "./styles/components.css"
import { applyTheme, getTheme } from "./lib/theme"
import type { AgentConfig } from "./lib/chat/mode-config"
import { loadCustomAgents, saveCustomAgents } from "./lib/chat/mode-config"
import { NavIcon, AVAILABLE_ICONS } from "./sidepanel/IconSidebar"
import { listThreads, deleteThread } from "./lib/chat/thread-idb"
import { useT, setStoredLocale, getLocale, type Locale } from "./lib/i18n"
import { initLocaleFromStorage } from "./lib/i18n"

// 工具组：label 和每条 tool 的 desc 都存 i18n key，展示时由 t() 解析
const TOOL_GROUPS: { labelKey: string; tools: { name: string; descKey: string }[] }[] = [
  {
    labelKey: "toolgroup.fs",
    tools: [
      { name: "ls", descKey: "tool.ls.desc" },
      { name: "read_file", descKey: "tool.read_file.desc" },
      { name: "write_file", descKey: "tool.write_file.desc" },
      { name: "edit_file", descKey: "tool.edit_file.desc" },
      { name: "glob", descKey: "tool.glob.desc" },
      { name: "grep", descKey: "tool.grep.desc" },
      { name: "rm", descKey: "tool.rm.desc" },
      { name: "export", descKey: "tool.export.desc" }
    ]
  },
  {
    labelKey: "toolgroup.browser",
    tools: [
      { name: "current_page", descKey: "tool.current_page.desc" },
      { name: "tabs", descKey: "tool.tabs.desc" },
      { name: "get_page_content", descKey: "tool.get_page_content.desc" },
      { name: "inspect_element", descKey: "tool.inspect_element.desc" },
      { name: "fill_form", descKey: "tool.fill_form.desc" },
      { name: "click_element", descKey: "tool.click_element.desc" },
      { name: "screenshot", descKey: "tool.screenshot.desc" },
      { name: "scroll", descKey: "tool.scroll.desc" },
      { name: "press_key", descKey: "tool.press_key.desc" },
      { name: "navigate", descKey: "tool.navigate.desc" },
      { name: "close_tab", descKey: "tool.close_tab.desc" }
    ]
  },
  {
    labelKey: "toolgroup.scrape",
    tools: [
      { name: "scrape_structure", descKey: "tool.scrape_structure.desc" },
      { name: "scrape_styles", descKey: "tool.scrape_styles.desc" },
      { name: "scrape_resources", descKey: "tool.scrape_resources.desc" },
      { name: "fetch_resource", descKey: "tool.fetch_resource.desc" }
    ]
  },
  {
    labelKey: "toolgroup.pdf",
    tools: [
      { name: "read_pdf", descKey: "tool.read_pdf.desc" }
    ]
  }
]

function IndexOptions() {
  const [settings, setSettings] = useState<LlmSettings>({ baseUrl: "", apiKey: "", model: "" })
  const [obsidianSettings, setObsidianSettings] = useState<ObsidianSettings>({ enabled: false, apiKey: "", baseUrl: "http://127.0.0.1:27123" })
  const [thinkingConfig, setThinkingConfig] = useState<ThinkingConfig>(DEFAULT_THINKING_CONFIG)
  const [thinkingDirty, setThinkingDirty] = useState(false)
  const [thinkingBodyError, setThinkingBodyError] = useState<string | null>(null)
  /** 正在重命名的 mode 下标（-1 = 无） */
  const [editingNameIndex, setEditingNameIndex] = useState(-1)
  const [nameDraft, setNameDraft] = useState("")
  /** 正在编辑 JSON body 的 mode 下标（-1 = 无，>0 时显示模态框） */
  const [editingBodyIndex, setEditingBodyIndex] = useState(-1)
  const [bodyDraft, setBodyDraft] = useState("")
  /** 重置思考配置的确认弹框 */
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [status, setStatus] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [customAgents, setCustomAgents] = useState<AgentConfig[]>([])
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null)
  const [showAgentForm, setShowAgentForm] = useState(false)
  const [activeSection, setActiveSection] = useState("general")

  const [agentName, setAgentName] = useState("")
  const [agentIcon, setAgentIcon] = useState("chat")
  const [agentPrompt, setAgentPrompt] = useState("")
  const [agentTools, setAgentTools] = useState<string[]>([])
  // 工具描述自定义 tooltip（原生 title 延迟太大，改用即时浮层）
  const [hoveredTool, setHoveredTool] = useState<{ desc: string; x: number; y: number } | null>(null)

  const t = useT()
  const [locale, setLocale] = useState<Locale>(getLocale())

  useEffect(() => {
    // 恢复 locale（默认 en），再加载其余设置
    initLocaleFromStorage().then((lc) => setLocale(lc))
    Promise.all([
      getLlmSettings().catch(() => ({ baseUrl: "", apiKey: "", model: "" })),
      getObsidianSettings().catch(() => ({ enabled: false, apiKey: "", baseUrl: "http://127.0.0.1:27123" })),
      getTheme(),
      loadCustomAgents(),
      getThinkingConfig()
    ]).then(([s, o, theme, agents, tc]) => {
      setSettings(s)
      setObsidianSettings(o)
      applyTheme(theme)
      setCustomAgents(agents)
      setThinkingConfig(tc)
    })
  }, [])

  async function saveAll() {
    setIsSaving(true)
    setStatus("")
    try {
      await saveLlmSettings(settings)
      await saveObsidianSettings(obsidianSettings)
      await saveThinkingConfig(thinkingConfig)
      setThinkingDirty(false)
      setSettings(await getLlmSettings())
      setStatus(t("option.saved"))
      setTimeout(() => setStatus(""), 2000)
    } catch {
      setStatus(t("option.saveFailed"))
    } finally {
      setIsSaving(false)
    }
  }

  async function changeLocale(next: Locale) {
    setLocale(next)
    await setStoredLocale(next)
  }

  // ── 思考配置（thinking mode）编辑 ──

  function updateThinkingMode(index: number, patch: Partial<ThinkingConfig["modes"][number]>) {
    setThinkingConfig((prev) => {
      const modes = prev.modes.map((m, i) => (i === index ? { ...m, ...patch } : m))
      return { ...prev, modes }
    })
    setThinkingDirty(true)
  }

  /** 重命名：提交后退出编辑态 */
  function commitRename(index: number) {
    const label = nameDraft.trim()
    if (label) updateThinkingMode(index, { label })
    setEditingNameIndex(-1)
    setNameDraft("")
  }

  /** 打开 JSON body 编辑模态 */
  function openBodyEditor(index: number) {
    const body = thinkingConfig.modes[index]?.body ?? {}
    setBodyDraft(JSON.stringify(body, null, 2))
    setThinkingBodyError(null)
    setEditingBodyIndex(index)
  }

  /** 保存 JSON body：合法且为对象才写入 */
  function commitBody() {
    if (editingBodyIndex < 0) return
    const trimmed = bodyDraft.trim()
    setThinkingBodyError(null)
    if (trimmed === "") {
      updateThinkingMode(editingBodyIndex, { body: {} })
      setEditingBodyIndex(-1)
      return
    }
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        updateThinkingMode(editingBodyIndex, { body: parsed as Record<string, unknown> })
        setEditingBodyIndex(-1)
      } else {
        setThinkingBodyError("option.thinking.bodyMustObject")
      }
    } catch {
      setThinkingBodyError("option.thinking.bodyInvalidJson")
    }
  }

  function cancelBody() {
    setEditingBodyIndex(-1)
    setThinkingBodyError(null)
  }

  function addThinkingMode() {
    setThinkingConfig((prev) => {
      const base = "thinking-extra"
      let id = base
      let n = 2
      while (prev.modes.some((m) => m.id === id)) { id = `${base}-${n++}` }
      return {
        modes: [...prev.modes, { id, label: toTitleCase(id), body: { thinking: { type: "enabled" } } }],
        defaultModeId: prev.defaultModeId
      }
    })
    setThinkingDirty(true)
  }

  /** 首字母大写：thinking-extra → Thinking-Extra */
  function toTitleCase(s: string): string {
    return s
      .split("-")
      .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
      .join("-")
  }

  function removeThinkingMode(index: number) {
    setThinkingConfig((prev) => {
      const removed = prev.modes[index]
      const modes = prev.modes.filter((_, i) => i !== index)
      if (modes.length === 0) return { ...DEFAULT_THINKING_CONFIG }
      // 移除默认档位时回退到第一个（保留 defaultModeId 数据字段，UI 不再暴露）
      const defaultModeId = prev.defaultModeId === removed?.id
        ? modes[0].id
        : prev.defaultModeId
      return { modes, defaultModeId }
    })
    setThinkingDirty(true)
  }

  /** 打开重置确认弹框 */
  function resetThinkingConfig() {
    setShowResetConfirm(true)
  }

  /** 确认重置为默认配置（覆盖现有自定义档位） */
  function doResetThinkingConfig() {
    setThinkingConfig(structuredClone(DEFAULT_THINKING_CONFIG))
    setThinkingBodyError(null)
    setEditingNameIndex(-1)
    setEditingBodyIndex(-1)
    setThinkingDirty(true)
    setShowResetConfirm(false)
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
      key: "general", label: t("option.nav.general"),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
    },
    {
      key: "llm", label: t("option.nav.llm"),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
    },
    {
      key: "obsidian", label: t("option.nav.obsidian"),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
    },
    {
      key: "agents", label: t("option.nav.agents"),
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
            {isSaving ? t("option.saving") : t("option.saveSettings")}
          </button>
        </nav>

        {/* 右侧内容 */}
        <div className="lm-options-content">
          {/* General */}
          {activeSection === "general" && (
            <div className="lm-options-panel">
              <h2 className="lm-options-panel-title">{t("option.nav.general")}</h2>
              <label className="lm-field">
                <span className="lm-label">{t("option.language")}</span>
                <div className="lm-segmented">
                  <button type="button" className={`lm-segmented-btn${locale === "en" ? " lm-segmented-btn--active" : ""}`} onClick={() => changeLocale("en")}>
                    {t("option.languageEn")}
                  </button>
                  <button type="button" className={`lm-segmented-btn${locale === "zh" ? " lm-segmented-btn--active" : ""}`} onClick={() => changeLocale("zh")}>
                    {t("option.languageZh")}
                  </button>
                </div>
              </label>
            </div>
          )}

          {/* LLM */}
          {activeSection === "llm" && (
            <div className="lm-options-panel">
              <h2 className="lm-options-panel-title">{t("option.llm.title")}</h2>
              <p className="lm-options-panel-desc">{t("option.llm.desc")}</p>
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

              {/* 思考配置（thinking mode）：默认 4 档，可增删，每个 mode 的 body 直接编辑 JSON */}
              <div className="lm-options-divider" />
              <div className="lm-thinking-header">
                <h3 className="lm-options-subtitle">{t("option.thinking.title")}</h3>
                <button
                  type="button"
                  className="lm-thinking-reset"
                  onClick={resetThinkingConfig}
                >
                  {t("option.thinking.reset")}
                </button>
              </div>
              <p className="lm-options-panel-desc">{t("option.thinking.desc")}</p>

              <div className="lm-thinking-modes">
                {thinkingConfig.modes.map((mode, i) => (
                  <div key={mode.id} className="lm-thinking-mode">
                    <span className="lm-thinking-mode__dot" aria-hidden />
                    {editingNameIndex === i ? (
                      <input
                        autoFocus
                        className="lm-input lm-thinking-mode__name"
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onBlur={() => commitRename(i)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(i)
                          if (e.key === "Escape") { setEditingNameIndex(-1); setNameDraft("") }
                        }}
                      />
                    ) : (
                      <span className="lm-thinking-mode__label">{mode.label}</span>
                    )}
                    <div className="lm-thinking-mode__actions">
                      <button
                        type="button"
                        className="lm-thinking-mode__btn"
                        title={t("option.thinking.rename")}
                        aria-label={t("option.thinking.rename")}
                        onClick={() => { setEditingNameIndex(i); setNameDraft(mode.label) }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="lm-thinking-mode__btn"
                        title={t("option.thinking.configure")}
                        aria-label={t("option.thinking.configure")}
                        onClick={() => openBodyEditor(i)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="16 18 22 12 16 6" />
                          <polyline points="8 6 2 12 8 18" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="lm-thinking-mode__btn lm-thinking-mode__btn--danger"
                        title={t("option.thinking.remove")}
                        aria-label={t("option.thinking.remove")}
                        onClick={() => removeThinkingMode(i)}
                        disabled={thinkingConfig.modes.length <= 1}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="lm-thinking-mode__add"
                  title={t("option.thinking.add")}
                  aria-label={t("option.thinking.add")}
                  onClick={addThinkingMode}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </button>
              </div>

              {status ? <span className="lm-options-status">{status}</span> : null}
            </div>
          )}

          {/* Obsidian */}
          {activeSection === "obsidian" && (
            <div className="lm-options-panel">
              <h2 className="lm-options-panel-title">{t("option.obsidian.title")}</h2>
              <p className="lm-options-panel-desc">{t("option.obsidian.desc")}</p>

              <div className="lm-note lm-note--compact">
                <strong>{t("option.obsidian.whatTitle")}</strong>
                <p>{t("option.obsidian.whatDesc")}</p>
              </div>

              <div className="lm-note lm-note--compact">
                <strong>{t("option.obsidian.setupTitle")}</strong>
                <ol className="lm-steps">
                  <li>{t("option.obsidian.step1")}</li>
                  <li>{t("option.obsidian.step2")}</li>
                  <li>{t("option.obsidian.step3")}</li>
                  <li>{t("option.obsidian.step4")}</li>
                </ol>
              </div>

              <label className="lm-toggle">
                <input type="checkbox" checked={obsidianSettings.enabled} onChange={(e) => setObsidianSettings((p) => ({ ...p, enabled: e.target.checked }))} />
                <span className="lm-toggle-label"><strong>{t("option.obsidian.enable")}</strong></span>
              </label>
              {obsidianSettings.enabled && (
                <>
                  <label className="lm-field">
                    <span className="lm-label">API Base URL</span>
                    <input className="lm-input" onChange={(e) => setObsidianSettings((p) => ({ ...p, baseUrl: e.target.value }))} placeholder="http://127.0.0.1:27123" value={obsidianSettings.baseUrl} />
                  </label>
                  <label className="lm-field">
                    <span className="lm-label">API Key</span>
                    <input className="lm-input" onChange={(e) => setObsidianSettings((p) => ({ ...p, apiKey: e.target.value }))} placeholder={t("option.obsidian.apiKeyPlaceholder")} type="password" value={obsidianSettings.apiKey} />
                  </label>
                </>
              )}
              {status ? <span className="lm-options-status">{status}</span> : null}
            </div>
          )}

          {/* 自定义智能体 */}
          {activeSection === "agents" && (
            <div className="lm-options-panel">
              <h2 className="lm-options-panel-title">{t("option.agents.title")}</h2>
              <p className="lm-options-panel-desc">{t("option.agents.desc")}</p>

              {customAgents.length > 0 && (
                <div className="lm-custom-agents-list">
                  {customAgents.map((agent) => (
                    <div key={agent.id} className="lm-agent-card">
                      <div className="lm-agent-card-body">
                        <span className="lm-agent-card-icon"><NavIcon icon={agent.icon} /></span>
                        <div>
                          <strong>{agent.name}</strong>
                          <small>{agent.tools.length === 0 ? t("option.agents.noTools") : t("option.agents.toolCount", { n: agent.tools.length })}</small>
                        </div>
                      </div>
                      <div className="lm-agent-card-actions">
                        <button className="lm-agent-card-btn" onClick={() => startEditAgent(agent)} type="button">{t("option.agents.edit")}</button>
                        <button className="lm-agent-card-btn lm-agent-card-btn--danger" onClick={() => handleDeleteAgent(agent.id)} type="button">{t("option.agents.delete")}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!showAgentForm ? (
                <button className="lm-agent-add-btn" onClick={() => setShowAgentForm(true)} type="button">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  {t("option.agents.new")}
                </button>
              ) : (
                <form className="lm-agent-form" onSubmit={handleSaveAgent}>
                  <h3 className="lm-agent-form-title">{editingAgent ? t("option.agents.editTitle") : t("option.agents.newTitle")}</h3>

                  <label className="lm-field">
                    <span className="lm-label">{t("option.agents.name")}</span>
                    <input className="lm-input" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder={t("option.agents.namePlaceholder")} required />
                  </label>

                  <div className="lm-field">
                    <span className="lm-label">{t("option.agents.icon")}</span>
                    <div className="lm-icon-picker">
                      {AVAILABLE_ICONS.map((iconKey) => (
                        <button key={iconKey} type="button" className={`lm-icon-picker-btn${agentIcon === iconKey ? " lm-icon-picker-btn--active" : ""}`} onClick={() => setAgentIcon(iconKey)} title={iconKey}>
                          <NavIcon icon={iconKey} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="lm-field">
                    <span className="lm-label">{t("option.agents.prompt")}</span>
                    <textarea className="lm-textarea" value={agentPrompt} onChange={(e) => setAgentPrompt(e.target.value)} placeholder={t("option.agents.promptPlaceholder")} rows={5} required />
                  </label>

                  <div className="lm-field">
                    <span className="lm-label">{t("option.agents.tools")}</span>
                    <div className="lm-tool-selector">
                      {TOOL_GROUPS.map((group) => (
                        <div key={group.labelKey} className="lm-tool-group">
                          <span className="lm-tool-group-label">{t(group.labelKey)}</span>
                          <div className="lm-tool-group-items">
                            {group.tools.map((tool) => (
                              <label
                                key={tool.name}
                                className="lm-tool-checkbox"
                                onMouseEnter={(e) => setHoveredTool({ desc: t(tool.descKey), x: e.clientX, y: e.clientY })}
                                onMouseLeave={() => setHoveredTool(null)}
                              >
                                <input type="checkbox" checked={agentTools.includes(tool.name)} onChange={() => handleToggleTool(tool.name)} />
                                <span className="lm-tool-checkbox-name">{tool.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {hoveredTool && (
                    <div
                      className="lm-tool-tooltip"
                      style={{ left: hoveredTool.x, top: hoveredTool.y }}
                    >
                      {hoveredTool.desc}
                    </div>
                  )}

                  <div className="lm-agent-form-actions">
                    <button className="lm-primary-button lm-agent-form-btn" type="submit">
                      {editingAgent ? t("option.agents.update") : t("option.agents.create")}
                    </button>
                    <button className="lm-agent-card-btn lm-agent-form-btn" type="button" onClick={resetAgentForm}>{t("option.agents.cancel")}</button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* thinking mode body JSON 编辑模态 */}
      {editingBodyIndex >= 0 && (
        <div className="lm-confirm-overlay lm-confirm-overlay--active" onClick={cancelBody}>
          <div className="lm-confirm-card lm-thinking-modal" onClick={(e) => e.stopPropagation()}>
            <textarea
              autoFocus
              className="lm-textarea lm-thinking-mode__body"
              rows={7}
              spellCheck={false}
              value={bodyDraft}
              onChange={(e) => setBodyDraft(e.target.value)}
              onKeyDown={(e) => {
                // Tab 插入缩进（JSON 用 2 空格），避免焦点跳到下一个控件
                if (e.key === "Tab") {
                  e.preventDefault()
                  const el = e.currentTarget
                  const start = el.selectionStart
                  const end = el.selectionEnd
                  const next = bodyDraft.slice(0, start) + "  " + bodyDraft.slice(end)
                  setBodyDraft(next)
                  requestAnimationFrame(() => {
                    el.selectionStart = el.selectionEnd = start + 2
                  })
                }
              }}
            />
            {thinkingBodyError ? (
              <p className="lm-options-error">{t(thinkingBodyError)}</p>
            ) : null}
            <div className="lm-confirm-actions">
              <button type="button" className="lm-confirm-btn lm-confirm-btn--cancel" onClick={cancelBody}>
                {t("option.thinking.cancel")}
              </button>
              <button type="button" className="lm-confirm-btn lm-confirm-btn--primary" onClick={commitBody}>
                {t("option.thinking.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 重置思考配置确认弹框 */}
      <div
        className={`lm-confirm-overlay${showResetConfirm ? " lm-confirm-overlay--active" : ""}`}
        onClick={() => showResetConfirm && setShowResetConfirm(false)}
      >
        <div className="lm-confirm-card" onClick={(e) => e.stopPropagation()}>
          <p className="lm-confirm-msg">{t("option.thinking.resetConfirm")}</p>
          <div className="lm-confirm-actions">
            <button
              type="button"
              className="lm-confirm-btn lm-confirm-btn--cancel"
              onClick={() => setShowResetConfirm(false)}
            >
              {t("option.thinking.cancel")}
            </button>
            <button
              type="button"
              className="lm-confirm-btn lm-confirm-btn--danger"
              onClick={doResetThinkingConfig}
            >
              {t("option.thinking.reset")}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

export default IndexOptions
