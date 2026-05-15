import { useEffect, useState } from "react"

import type { LlmSettings } from "./lib/llm/types"
import type { CollectionConfig } from "./lib/memory/types"
import { DEFAULT_COLLECTION_CONFIG, BUILTIN_IGNORED_PATTERNS } from "./lib/memory/types"
import {
  getCollectionConfig,
  saveCollectionConfig
} from "./lib/memory/collection-config"
import {
  getLlmSettings,
  saveLlmSettings,
  type ObsidianSettings,
  getObsidianSettings,
  saveObsidianSettings
} from "./lib/settings"
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
  // 独立管理忽略规则的文本编辑状态，避免每次渲染被 join 覆盖
  const [ignoredPatternsText, setIgnoredPatternsText] = useState("")
  const [obsidianSettings, setObsidianSettings] = useState<ObsidianSettings>({
    enabled: false,
    apiKey: "",
    baseUrl: "http://127.0.0.1:27123"
  })
  const [status, setStatus] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      getLlmSettings().catch(() => ({ baseUrl: "", apiKey: "", model: "" })),
      getCollectionConfig(),
      getObsidianSettings().catch(() => ({ enabled: false, apiKey: "", baseUrl: "http://127.0.0.1:27123" }))
    ]).then(([s, c, o]) => {
      setSettings(s)
      setCollectionConfig(c)
      setObsidianSettings(o)
      setIgnoredPatternsText(c.ignoredUrlPatterns.join("\n"))
    })
  }, [])

  function updateSetting(key: keyof LlmSettings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  function updateCollectionConfig(
    key: keyof CollectionConfig,
    value: boolean | number
  ) {
    setCollectionConfig((prev) => ({ ...prev, [key]: value }))
  }

  function handlePatternsChange(text: string) {
    setIgnoredPatternsText(text)
    // 实时同步到 collectionConfig
    setCollectionConfig((prev) => ({
      ...prev,
      ignoredUrlPatterns: text
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    }))
  }

  async function saveSettings() {
    setIsSaving(true)
    setStatus("")

    try {
      await saveLlmSettings(settings)
      await saveCollectionConfig(collectionConfig)
      await saveObsidianSettings(obsidianSettings)
      setSettings(await getLlmSettings())
      const fresh = await getCollectionConfig()
      setCollectionConfig(fresh)
      setIgnoredPatternsText(fresh.ignoredUrlPatterns.join("\n"))
      setStatus("好啦，已经收进小抽屉里了。")
      setTimeout(() => window.close(), 800)
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
                  这里是 Lumino
                  的小书房：连上你喜欢的模型，控制采集开关，其余的情绪与节奏，交给我们。
                </p>
              </div>
            </div>
            <span className="paper-badge">openai-compat</span>
          </header>

          {/* === LLM 配置 === */}
          <h2 className="paper-section-title">模型连接</h2>

          <p className="paper-helper">
            Base URL 示例：https://api.openai.com/v1
            ——填好后，弹窗里的陪伴就会一直跟着你。
          </p>

          <label className="paper-field">
            <span className="paper-label">Base URL</span>
            <input
              className="paper-input"
              onChange={(e) => updateSetting("baseUrl", e.target.value)}
              placeholder="https://api.openai.com/v1"
              value={settings.baseUrl}
            />
          </label>

          <label className="paper-field">
            <span className="paper-label">API Key</span>
            <input
              className="paper-input"
              onChange={(e) => updateSetting("apiKey", e.target.value)}
              placeholder="sk-..."
              type="password"
              value={settings.apiKey}
            />
          </label>

          <label className="paper-field">
            <span className="paper-label">Model</span>
            <input
              className="paper-input"
              onChange={(e) => updateSetting("model", e.target.value)}
              placeholder="gpt-4o-mini"
              value={settings.model}
            />
          </label>

          
          {/* === Obsidian 集成 === */}
          <h2 className="paper-section-title">Obsidian 集成</h2>

          <p className="paper-helper">
            连接 Obsidian Local REST API 插件后，Agent 可以直接读写你的 vault。
            需要先在 Obsidian 中安装并启用 Local REST API 插件，然后在下方填入 API Key。
          </p>

          <div className="paper-toggles">
            <label className="paper-toggle">
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
              <span className="paper-toggle-label">
                <strong>启用 Obsidian 集成</strong>
                <small>开启后 Agent 可读写 Obsidian vault</small>
              </span>
            </label>
          </div>

          {obsidianSettings.enabled && (
            <>
              <label className="paper-field">
                <span className="paper-label">API Base URL</span>
                <input
                  className="paper-input"
                  onChange={(e) =>
                    setObsidianSettings((prev) => ({
                      ...prev,
                      baseUrl: e.target.value
                    }))
                  }
                  placeholder="http://127.0.0.1:27123"
                  value={obsidianSettings.baseUrl}
                />
                <span className="paper-helper">
                  默认使用 HTTP（端口 27123），避免自签名证书问题
                </span>
              </label>

              <label className="paper-field">
                <span className="paper-label">API Key</span>
                <input
                  className="paper-input"
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
                <span className="paper-helper">
                  在 Obsidian 设置 → Local REST API → API Key 中复制
                </span>
              </label>
            </>
          )}

          {/* === 采集开关 === */}

          {/* === 采集开关 === */}
          <h2 className="paper-section-title">采集开关</h2>

          <p className="paper-helper">
            控制 Lumino 采集哪些浏览行为数据。关闭项会立即停止采集，已采集数据不受影响。
          </p>

          <div className="paper-toggle-group">
            <label className="paper-toggle">
              <input
                type="checkbox"
                checked={collectionConfig.enablePageVisits}
                onChange={(e) =>
                  updateCollectionConfig("enablePageVisits", e.target.checked)
                }
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
                onChange={(e) =>
                  updateCollectionConfig("enableInputEvents", e.target.checked)
                }
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
                onChange={(e) =>
                  updateCollectionConfig("enableCopyRecords", e.target.checked)
                }
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
                onChange={(e) =>
                  updateCollectionConfig(
                    "enableBookmarkChanges",
                    e.target.checked
                  )
                }
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
                onChange={(e) =>
                  updateCollectionConfig(
                    "enableDownloadRecords",
                    e.target.checked
                  )
                }
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
                updateCollectionConfig(
                  "minDwellMs",
                  Math.max(1000, Number(e.target.value) * 1000)
                )
              }
            />
            <span className="paper-helper">
              页面停留超过此时间才会采集内容，默认 5 秒
            </span>
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
            <span className="paper-helper">
              页面停留达标的检查频率，默认 1 分钟
            </span>
          </label>

          <label className="paper-field">
            <span className="paper-label">忽略 URL 正则（每行一个，可删改）</span>
            <textarea
              className="paper-input"
              rows={12}
              spellCheck={false}
              value={ignoredPatternsText}
              onChange={(e) => handlePatternsChange(e.target.value)}
            />
            <span className="paper-helper">
              匹配这些正则的页面不会采集（含页面内容/输入框/复制）。内置了
              chrome://、localhost、内网 IP、银行、政府、医疗、成人等站点规则，
              可自由删改。
            </span>
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
