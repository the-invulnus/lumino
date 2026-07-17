import { useEffect, useState } from "react"

import type { LlmSettings } from "./lib/llm/types"
import {
  getLlmSettings,
  saveLlmSettings,
  type ObsidianSettings,
  getObsidianSettings,
  saveObsidianSettings
} from "./lib/settings"
import "./styles/components.css"
import { applyTheme, getTheme, saveTheme, type ThemeName } from "./lib/theme"

function SaveTrailIcon() {
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
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function IndexOptions() {
  const [settings, setSettings] = useState<LlmSettings>({
    baseUrl: "",
    apiKey: "",
    model: ""
  })
  const [obsidianSettings, setObsidianSettings] = useState<ObsidianSettings>({
    enabled: false,
    apiKey: "",
    baseUrl: "http://127.0.0.1:27123"
  })
  const [status, setStatus] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [theme, setTheme] = useState<ThemeName>("paper")

  useEffect(() => {
    Promise.all([
      getLlmSettings().catch(() => ({ baseUrl: "", apiKey: "", model: "" })),
      getObsidianSettings().catch(() => ({ enabled: false, apiKey: "", baseUrl: "http://127.0.0.1:27123" })),
      getTheme()
    ]).then(([s, o, t]) => {
      setSettings(s)
      setObsidianSettings(o)
      setTheme(t)
      applyTheme(t)
    })
  }, [])

  function updateSetting(key: keyof LlmSettings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  function handleThemeChange(nextTheme: ThemeName) {
    setTheme(nextTheme)
    applyTheme(nextTheme)
    saveTheme(nextTheme)
  }

  async function saveSettings() {
    setIsSaving(true)
    setStatus("")

    try {
      await saveLlmSettings(settings)
      await saveObsidianSettings(obsidianSettings)
      setSettings(await getLlmSettings())
      setStatus("设置已保存。")
      setTimeout(() => window.close(), 800)
    } catch {
      setStatus("保存失败，请稍后重试。")
    } finally {
      setIsSaving(false)
    }
  }

  const themeLabels: Record<ThemeName, { name: string; desc: string }> = {
    paper: { name: "暖调编辑", desc: "温暖奶油底色，柔和渐变，适合日常使用" },
    oryzo: { name: "暗黑电影", desc: "暗黑电影感画布，奶油色文字，极简线条" },
    fictional: { name: "俏皮贴纸", desc: "杏色活力背景，多彩卡片，俏皮趣味" }
  }

  return (
    <main className="lm-shell lm-options">
      <div aria-hidden className="lm-ambient">
        <div className="lm-blob lm-blob--a" />
        <div className="lm-blob lm-blob--b" />
        <div className="lm-blob lm-blob--c" />
      </div>

      <div className="lm-bezel-outer">
        <section className="lm-bezel-inner">
          <p className="lm-eyebrow">Lumino · 设置</p>

          <header className="lm-header">
            <div className="lm-brand">
              <div aria-hidden className="lm-logo">
                L
              </div>
              <div>
                <h1 className="lm-title">Lumino 配置</h1>
                <p className="lm-subtitle">
                  连接模型、管理偏好，所有设置会自动保存到浏览器。
                </p>
              </div>
            </div>
            <span className="lm-badge">openai-compat</span>
          </header>

          {/* === 主题选择 === */}
          <h2 className="lm-section-title">界面主题</h2>
          <p className="lm-helper">选择你喜欢的视觉风格，切换后即时生效。</p>
          <div className="lm-toggle-group">
            {(Object.keys(themeLabels) as ThemeName[]).map((t) => (
              <label key={t} className="lm-toggle">
                <input
                  type="radio"
                  name="theme"
                  value={t}
                  checked={theme === t}
                  onChange={() => handleThemeChange(t)}
                />
                <span className="lm-toggle-label">
                  <strong>{themeLabels[t].name}</strong>
                  <small>{themeLabels[t].desc}</small>
                </span>
              </label>
            ))}
          </div>

          {/* === LLM 配置 === */}
          <h2 className="lm-section-title">模型连接</h2>

          <p className="lm-helper">
            Base URL 示例：https://api.openai.com/v1
            ——配置完成后，Lumino 将通过此 API 与模型通信。
          </p>

          <label className="lm-field">
            <span className="lm-label">Base URL</span>
            <input
              className="lm-input"
              onChange={(e) => updateSetting("baseUrl", e.target.value)}
              placeholder="https://api.openai.com/v1"
              value={settings.baseUrl}
            />
          </label>

          <label className="lm-field">
            <span className="lm-label">API Key</span>
            <input
              className="lm-input"
              onChange={(e) => updateSetting("apiKey", e.target.value)}
              placeholder="sk-..."
              type="password"
              value={settings.apiKey}
            />
          </label>

          <label className="lm-field">
            <span className="lm-label">Model</span>
            <input
              className="lm-input"
              onChange={(e) => updateSetting("model", e.target.value)}
              placeholder="gpt-4o-mini"
              value={settings.model}
            />
          </label>

          {/* === Obsidian 集成 === */}
          <h2 className="lm-section-title">Obsidian 集成</h2>

          <p className="lm-helper">
            连接 Obsidian Local REST API 后，Agent 可以直接读写你的 vault。需要先在
            Obsidian 中安装并启用 Local REST API 插件，然后在下方填入 API Key。
          </p>

          <div className="lm-toggles">
            <label className="lm-toggle">
              <input
                type="checkbox"
                checked={obsidianSettings.enabled}
                onChange={(e) =>
                  setObsidianSettings((prev) => ({
                    ...prev,
                    enabled: e.target.checked
                  }))
                }
              />
              <span className="lm-toggle-label">
                <strong>启用 Obsidian 集成</strong>
                <small>开启后 Agent 可读写 Obsidian vault</small>
              </span>
            </label>
          </div>

          {obsidianSettings.enabled && (
            <>
              <label className="lm-field">
                <span className="lm-label">API Base URL</span>
                <input
                  className="lm-input"
                  onChange={(e) =>
                    setObsidianSettings((prev) => ({
                      ...prev,
                      baseUrl: e.target.value
                    }))
                  }
                  placeholder="http://127.0.0.1:27123"
                  value={obsidianSettings.baseUrl}
                />
                <span className="lm-helper">
                  默认使用 HTTP（端口 27123），避免自签名证书问题
                </span>
              </label>

              <label className="lm-field">
                <span className="lm-label">API Key</span>
                <input
                  className="lm-input"
                  onChange={(e) =>
                    setObsidianSettings((prev) => ({
                      ...prev,
                      apiKey: e.target.value
                    }))
                  }
                  placeholder="在 Obsidian → Settings → Local REST API 中获取"
                  type="password"
                  value={obsidianSettings.apiKey}
                />
                <span className="lm-helper">
                  在 Obsidian 设置 → Local REST API → API Key 中复制
                </span>
              </label>
            </>
          )}

          <div className="lm-actions">
            <button
              className="lm-primary-button"
              disabled={isSaving}
              onClick={saveSettings}
              type="button">
              <span className="lm-primary-label">
                {isSaving ? "正在保存…" : "保存设置"}
              </span>
              <span className="lm-primary-trail">
                {isSaving ? (
                  <span aria-hidden className="lm-spinner" />
                ) : (
                  <SaveTrailIcon />
                )}
              </span>
            </button>
            {status ? <span className="lm-status">{status}</span> : null}
          </div>
        </section>
      </div>
    </main>
  )
}

export default IndexOptions
