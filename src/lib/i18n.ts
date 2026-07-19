/**
 * Lumino i18n — 轻量翻译核心（零依赖）
 *
 * 设计：
 * - 当前 locale 是模块级变量，启动时从 chrome.storage.local 异步恢复（默认 "en"）
 * - t() 同步查字典，未命中时回退到 en，再回退到 key 本身
 * - React 组件用 useT()：监听 "lumino-locale-change" 事件，locale 变化时重渲染
 * - content script / background.ts 无 React，直接用模块级 t() / getLocale()
 *
 * 跨页面同步：options 页和 side panel 是独立页面，window 事件不互通。
 * 因此 setStoredLocale 写入 chrome.storage.local 后，通过 chrome.storage.onChanged
 * 广播到所有页面，各页面收到后调用 applyLocale 派发各自的 window 事件，触发重渲染。
 *
 * locale 存 chrome.storage.local（与安全决策一致：不随 Google 账号同步）。
 */

import { useEffect, useReducer } from "react"
import { en } from "./i18n/en"
import { zh } from "./i18n/zh"

export type Locale = "en" | "zh"

export const DEFAULT_LOCALE: Locale = "en"

export const LOCALE_STORAGE_KEY = "lumino_locale"

const LOCALE_EVENT = "lumino-locale-change"

const DICTS: Record<Locale, Record<string, string>> = { en, zh }

// 内存中当前 locale。启动时为默认值，initLocaleFromStorage() 会从 storage 恢复。
let currentLocale: Locale = DEFAULT_LOCALE

/** 读取当前 locale（同步，模块级） */
export function getLocale(): Locale {
  return currentLocale
}

/** 是否合法 locale */
function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "zh"
}

/**
 * 翻译函数。支持 {name} 占位符插值。
 * 未命中当前 locale → 回退 en → 回退 key 本身。
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let raw = DICTS[currentLocale]?.[key] ?? DICTS.en[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      raw = raw.replace(new RegExp(`\\{${k}\\}`, "g"), String(v))
    }
  }
  return raw
}

/** 设置 document.documentElement.lang 并广播 locale 变化事件（当前 window） */
export function applyLocale(locale: Locale): void {
  if (locale === currentLocale) return
  currentLocale = locale
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LOCALE_EVENT, { detail: locale }))
  }
}

/** 从 chrome.storage.local 读取并应用 locale（启动时调用） */
export async function initLocaleFromStorage(): Promise<Locale> {
  try {
    const data = await chrome.storage.local.get(LOCALE_STORAGE_KEY)
    const stored = data[LOCALE_STORAGE_KEY]
    if (isLocale(stored)) {
      applyLocale(stored)
      return stored
    }
  } catch {
    // storage 不可用（极端情况），保持默认
  }
  applyLocale(DEFAULT_LOCALE)
  return DEFAULT_LOCALE
}

/**
 * 持久化切换 locale。
 * 写入 storage → storage.onChanged 广播到所有页面（含发起方）→ 各页面 applyLocale
 * → 派发各自 window 事件 → useT 重渲染。
 * 不在这里直接 applyLocale：让 onChanged 统一驱动，保证所有页面（含本页）同步切换。
 * onChanged 回调只调 applyLocale，不回写 storage，无循环风险。
 */
export async function setStoredLocale(locale: Locale): Promise<void> {
  try {
    await chrome.storage.local.set({ [LOCALE_STORAGE_KEY]: locale })
  } catch {
    // 持久化失败则回退到立即应用本页
    applyLocale(locale)
  }
}

// ── 跨页面同步：监听 storage 变化 ──
// 任意页面 setStoredLocale 写入 lumino_locale → 所有页面（含发起方）的 onChanged 触发 →
// applyLocale 更新内存 locale 并派发 window 事件 → useT 重渲染。
if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return
    const change = changes[LOCALE_STORAGE_KEY]
    if (!change) return
    const next = change.newValue
    if (isLocale(next)) {
      applyLocale(next)
    }
  })
}

// ── React hook ──

/** 监听 locale 变化，locale 切换时强制重渲染 */
function useLocale(): Locale {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    const handler = () => force()
    window.addEventListener(LOCALE_EVENT, handler)
    return () => window.removeEventListener(LOCALE_EVENT, handler)
  }, [])
  return currentLocale
}

/** 组合 hook：返回绑定当前 locale 的 t。组件顶部 const t = useT() */
export function useT(): (key: string, params?: Record<string, string | number>) => string {
  useLocale()
  return t
}
