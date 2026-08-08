import type { LlmSettings } from "./llm/llm-types"

type StorageArea = Pick<typeof chrome.storage.sync, "get" | "set">

const SETTINGS_KEYS = ["baseUrl", "apiKey", "model"] as const

// 敏感凭证（LLM API Key、Obsidian token）默认存 local：不随 Google 账号同步到云端，
// 降低账号被入侵时的凭证泄露面。
function getStorageArea(storageArea?: StorageArea) {
  return storageArea ?? chrome.storage.local
}

function normalizeSettings(settings: LlmSettings): LlmSettings {
  return {
    baseUrl: settings.baseUrl.trim().replace(/\/+$/, ""),
    apiKey: settings.apiKey.trim(),
    model: settings.model.trim()
  }
}

export async function getLlmSettings(
  storageArea?: StorageArea
): Promise<LlmSettings> {
  const data = (await getStorageArea(storageArea).get(
    SETTINGS_KEYS as unknown as string[]
  )) as Partial<LlmSettings>

  return {
    baseUrl: data.baseUrl ?? "",
    apiKey: data.apiKey ?? "",
    model: data.model ?? ""
  }
}

export async function saveLlmSettings(
  settings: LlmSettings,
  storageArea?: StorageArea
) {
  await getStorageArea(storageArea).set(normalizeSettings(settings))
}

export function hasCompleteLlmSettings(settings: LlmSettings) {
  return Boolean(
    settings.baseUrl.trim() && settings.apiKey.trim() && settings.model.trim()
  )
}

// ── Obsidian Local REST API 配置 ──

export type ObsidianSettings = {
  enabled: boolean
  apiKey: string
  /** API 基础地址，默认 http://127.0.0.1:27123（HTTP 避免自签名证书问题） */
  baseUrl: string
}

const OBSIDIAN_SETTINGS_KEYS = ["obsidianEnabled", "obsidianApiKey", "obsidianBaseUrl"] as const

export async function getObsidianSettings(
  storageArea?: StorageArea
): Promise<ObsidianSettings> {
  const data = (await getStorageArea(storageArea).get(
    OBSIDIAN_SETTINGS_KEYS as unknown as string[]
  )) as Record<string, unknown>

  return {
    enabled: data.obsidianEnabled === true,
    apiKey: (data.obsidianApiKey as string) ?? "",
    baseUrl: (data.obsidianBaseUrl as string) || "http://127.0.0.1:27123"
  }
}

export async function saveObsidianSettings(
  settings: ObsidianSettings,
  storageArea?: StorageArea
): Promise<void> {
  await getStorageArea(storageArea).set({
    obsidianEnabled: settings.enabled,
    obsidianApiKey: settings.apiKey.trim(),
    obsidianBaseUrl: settings.baseUrl.trim() || "http://127.0.0.1:27123"
  })
}

/** Obsidian 功能是否已正确配置并启用 */
export function isObsidianConfigured(settings: ObsidianSettings): boolean {
  return settings.enabled && settings.apiKey.trim().length > 0 && settings.baseUrl.trim().length > 0
}

// ── 模型思考配置（Thinking Mode）──

/**
 * 一个思考档位：选中该 mode 时，其 body 会被浅合并进 LLM 请求体。
 * 空 body `{}` = 不注入任何字段（等价 auto，跟随模型默认）。
 * 不做任何基于域名/模型的自动推荐——字段名、取值、档位数量全部由用户显式配置。
 */
export type ThinkingMode = {
  /** 稳定机器 id（用户可增删，须唯一） */
  id: string
  /** 用户可读标签，如 "thinking·low" */
  label: string
  /** 请求体附加字段（用户直接编辑的 JSON） */
  body: Record<string, unknown>
}

/** 模型的思考配置（全局一份，挂在当前 LLM 设置下） */
export type ThinkingConfig = {
  modes: ThinkingMode[]
  /** 请求未带 modeId 或 id 无效时使用的默认档位 */
  defaultModeId: string
}

/** 思考配置存储 key（chrome.storage.local，独立于 LLM 三键） */
export const THINKING_CONFIG_KEY = "lumino_thinking_config"

/**
 * 默认 4 档（DeepSeek 风格起始值，用户可改可增删）。
 * 用 reasoning_effort 区分力度（deepseek 思考长度预算未提供）。
 */
export const DEFAULT_THINKING_CONFIG: ThinkingConfig = {
  modes: [
    { id: "non-thinking", label: "Non-Thinking", body: { thinking: { type: "disabled" } } },
    { id: "thinking-low", label: "Thinking·Low", body: { thinking: { type: "enabled" }, reasoning_effort: "low" } },
    { id: "thinking-high", label: "Thinking·High", body: { thinking: { type: "enabled" }, reasoning_effort: "high" } },
    { id: "thinking-max", label: "Thinking·Max", body: { thinking: { type: "enabled" }, reasoning_effort: "max" } }
  ],
  defaultModeId: "thinking-high"
}

function isThinkingMode(v: unknown): v is ThinkingMode {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as ThinkingMode).id === "string" &&
    typeof (v as ThinkingMode).label === "string" &&
    typeof (v as ThinkingMode).body === "object" &&
    (v as ThinkingMode).body !== null
  )
}

/** 防御脏数据：形状非法 / 空 modes → 默认值；defaultModeId 指向已删 mode → 回退第一个 */
function normalizeThinkingConfig(raw: unknown): ThinkingConfig {
  if (typeof raw !== "object" || raw === null) return DEFAULT_THINKING_CONFIG
  const modes = Array.isArray((raw as ThinkingConfig).modes)
    ? (raw as ThinkingConfig).modes.filter(isThinkingMode)
    : []
  if (modes.length === 0) return DEFAULT_THINKING_CONFIG

  const requestedDefault = (raw as ThinkingConfig).defaultModeId
  const defaultModeId =
    typeof requestedDefault === "string" &&
    modes.some((m) => m.id === requestedDefault)
      ? requestedDefault
      : modes[0].id

  return { modes, defaultModeId }
}

export async function getThinkingConfig(
  storageArea?: StorageArea
): Promise<ThinkingConfig> {
  const data = await getStorageArea(storageArea).get(THINKING_CONFIG_KEY)
  return normalizeThinkingConfig(data[THINKING_CONFIG_KEY])
}

export async function saveThinkingConfig(
  config: ThinkingConfig,
  storageArea?: StorageArea
): Promise<void> {
  await getStorageArea(storageArea).set({ [THINKING_CONFIG_KEY]: config })
}

/**
 * 解析 modeId → 请求体附加字段（纯函数，可单测）。
 * - modeId 缺省 → 用 defaultModeId
 * - 找不到 / body 为空对象 → 返回 undefined（= 不注入任何字段，等价 auto）
 */
export function resolveThinkingBody(
  config: ThinkingConfig,
  modeId?: string
): Record<string, unknown> | undefined {
  const target =
    config.modes.find((m) => m.id === (modeId ?? config.defaultModeId)) ??
    config.modes.find((m) => m.id === config.defaultModeId)
  const body = target?.body
  if (!body || Object.keys(body).length === 0) return undefined
  return body
}
