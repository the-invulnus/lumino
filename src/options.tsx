import { useEffect, useState } from "react"

import type { LlmSettings } from "./lib/llm/types"
import type { CollectionConfig } from "./lib/memory/types"
import { DEFAULT_COLLECTION_CONFIG } from "./lib/memory/types"
import { getCollectionConfig, saveCollectionConfig } from "./lib/memory/collection-config"
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
  const [collectionConfig, setCollectionConfig] = useState<CollectionConfig>(
    DEFAULT_COLLECTION_CONFIG
  )
  const [status, setStatus] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      getLlmSettings().catch(() => ({ baseUrl: "", apiKey: "", model: "" })),
      getCollectionConfig()
    ]).then(([s, c]) => {
      setSettings(s)
      setCollectionConfig(c)
    })
  }, [])

  function updateSetting(key: keyof LlmSettings, value: string) {
    setSettings((currentSettings) => ({
      ...currentSettings,
      [key]: value
    }))
  }

  function updateCollectionConfig(
    key: keyof CollectionConfig,
    value: boolean | number | string
  ) {
    setCollectionConfig((prev) => ({ ...prev, [key]: value }))
  }

  async function saveSettings() {
    setIsSaving(true)
    setStatus("")

    try {
      await saveLlmSettings(settings)
      await saveCollectionConfig(collectionConfig)
      setSettings(await getLlmSettings())
      setCollectionConfig(await getCollectionConfig())
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
                  这里是 Lumino 的小书房：连上你喜欢的模型，控制采集开关，其余的情绪与节奏，交给我们。
                </p>
              </div>
            </div>
            <span className="paper-badge">openai-compat</span>
          </header>

          {/* === LLM 配置 === */}
          <h2 className="paper-section-title">模型连接</h2>

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

          {/* === 采集开关 === */}
          <h2 className="paper-section-title">采集开关</h2>

          <p className="paper-helper">
            控制 Lumino 采集哪些浏览行为数据。关闭项会立即停止数据采集，已采集数据不受影响。
          </p>

          <div className="paper-toggle-group">
            <label className="paper-toggle">
              <input
                type="checkbox"
                checked={collectionConfig.enablePageVisits}
                onChange={(e) => updateCollectionConfig("enablePageVisits", e.target.checked)}
              />
              <span className="paper-toggle-label">
                <strong>页面浏览</strong>
                <small>长时间浏览的页面内容（保存 90 天）</small>
              </span>
            </label>

            <label className="paper-toggle">
              <input
                type="checkbox"
                checked={collectionConfig.enableInputEvents}
                onChange={(e) => updateCollectionConfig("enableInputEvents", e.target.checked)}
              />
              <span className="paper-toggle-label">
                <strong>输入框交互</strong>
                <small>输入框内的文本输入与粘贴（保存 7 天）</small>
              </span>
            </label>

            <label className="paper-toggle">
              <input
                type="checkbox"
                checked={collectionConfig.enableCopyRecords}
                onChange={(e) => updateCollectionConfig("enableCopyRecords", e.target.checked)}
              />
              <span className="paper-toggle-label">
                <strong>复制内容</strong>
                <small>复制到剪贴板的文本内容（保存 7 天）</small>
              </span>
            </label>

            <label className="paper-toggle">
              <input
                type="checkbox"
                checked={collectionConfig.enableBookmarkChanges}
                onChange={(e) => updateCollectionConfig("enableBookmarkChanges", e.target.checked)}
              />
              <span className="paper-toggle-label">
                <strong>书签变更</strong>
                <small>新增、删除、修改书签操作（保存 90 天）</small>
              </span>
            </label>

            <label className="paper-toggle">
              <input
                type="checkbox"
                checked={collectionConfig.enableDownloadRecords}
                onChange={(e) => updateCollectionConfig("enableDownloadRecords", e.target.checked)}
              />
              <span className="paper-toggle-label">
                <strong>下载记录</strong>
                <small>文件下载记录（保存 90 天）</small>
              </span>
            </label>
          </div>

          {/* === 采集参数 === */}
          <h2 className="paper-section-title">采集参数</h2>

          <label className="paper-field">
            <span className="paper-label">最小停留时长（秒）</span>
            <input
              className="paper-input"
              type="number"
              min={1}
              max={600}
              value={Math.round(collectionConfig.minDwellMs / 1000)}
              onChange={(e) =>
                updateCollectionConfig("minDwellMs", Math.max(1000, Number(e.target.value) * 1000))
              }
            />
            <span className="paper-helper">页面停留超过此时间才会采集内容，默认 5 秒</span>
          </label>

          <label className="paper-field">
            <span className="paper-label">巡检间隔（分钟）</span>
            <input
              className="paper-input"
              type="number"
              min={0.1}
              max={60}
              step={0.5}
              value={collectionConfig.dwellCheckIntervalMs / 60000}
              onChange={(e) =>
                updateCollectionConfig(
                  "dwellCheckIntervalMs",
                  Math.max(6000, Number(e.target.value) * 60000)
                )
              }
            />
            <span className="paper-helper">页面停留达标的检查频率，默认 1 分钟</span>
          </label>

          <label className="paper-field">
            <span className="paper-label">忽略 URL 正则（每行一个）</span>
            <textarea
              className="paper-input"
              rows={4}
              placeholder={"example\\.com\nlocalhost"}
              value={collectionConfig.ignoredUrlPatterns.join("\n")}
              onChange={(e) =>
                updateCollectionConfig(
                  "ignoredUrlPatterns",
                  e.target.value.split("\n").filter(Boolean) as unknown as string
                )
              }
            />
            <span className="paper-helper">匹配这些正则的页面不会采集，用于排除隐私敏感站点</span>
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
