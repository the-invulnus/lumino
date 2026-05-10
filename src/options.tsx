import { useEffect, useState } from "react"

import type { LlmSettings } from "./lib/llm/types"
import { getLlmSettings, saveLlmSettings } from "./lib/settings"
import "./styles/paper.css"

function SaveTrailIcon() {
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
  const [status, setStatus] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    getLlmSettings()
      .then(setSettings)
      .catch(() => setStatus("读取配置失败。"))
  }, [])

  function updateSetting(key: keyof LlmSettings, value: string) {
    setSettings((currentSettings) => ({
      ...currentSettings,
      [key]: value
    }))
  }

  async function saveSettings() {
    setIsSaving(true)
    setStatus("")

    try {
      await saveLlmSettings(settings)
      setSettings(await getLlmSettings())
      setStatus("好啦，已经收进小抽屉里了。")
    } catch {
      setStatus("保存失败，请稍后重试。")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="paper-shell paper-options">
      <div aria-hidden className="paper-ambient">
        <div className="paper-blob paper-blob--a" />
        <div className="paper-blob paper-blob--b" />
        <div className="paper-blob paper-blob--c" />
      </div>

      <div className="paper-bezel-outer">
        <section className="paper-bezel-inner">
          <p className="paper-eyebrow">Lumino · gentle setup</p>

          <header className="paper-header">
            <div className="paper-brand">
              <div aria-hidden className="paper-logo">
                L
              </div>
              <div>
                <h1 className="paper-title">把门轻轻推开</h1>
                <p className="paper-subtitle">
                  这里是 Lumino 的小书房：连上你喜欢的模型，其余的情绪与节奏，交给我们。
                </p>
              </div>
            </div>
            <span className="paper-badge">openai-compat</span>
          </header>

          <p className="paper-helper">
            配置会悄悄躺在浏览器的同步存储里。Base URL 示例：https://api.openai.com/v1
            ——填好后，弹窗里的陪伴就会一直跟着你。
          </p>

          <label className="paper-field">
            <span className="paper-label">Base URL</span>
            <input
              className="paper-input"
              onChange={(event) => updateSetting("baseUrl", event.target.value)}
              placeholder="https://api.openai.com/v1"
              value={settings.baseUrl}
            />
          </label>

          <label className="paper-field">
            <span className="paper-label">API Key</span>
            <input
              className="paper-input"
              onChange={(event) => updateSetting("apiKey", event.target.value)}
              placeholder="sk-..."
              type="password"
              value={settings.apiKey}
            />
          </label>

          <label className="paper-field">
            <span className="paper-label">Model</span>
            <input
              className="paper-input"
              onChange={(event) => updateSetting("model", event.target.value)}
              placeholder="gpt-4o-mini"
              value={settings.model}
            />
          </label>

          <div className="paper-actions">
            <button
              className="paper-primary-button"
              disabled={isSaving}
              onClick={saveSettings}
              type="button">
              <span className="paper-primary-label">
                {isSaving ? "正在收好…" : "保存这份默契"}
              </span>
              <span className="paper-primary-trail">
                {isSaving ? (
                  <span aria-hidden className="paper-spinner" />
                ) : (
                  <SaveTrailIcon />
                )}
              </span>
            </button>
            {status ? <span className="paper-status">{status}</span> : null}
          </div>
        </section>
      </div>
    </main>
  )
}

export default IndexOptions
