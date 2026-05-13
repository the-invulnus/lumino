// ============================================================
// Dwell Checker — 巡检逻辑 + alarm 管理
// ============================================================

import type { CollectionConfig, PageVisitRecord, CapturePageResultMessage } from "./types"
import {
  STORAGE_KEY_TAB_TIMERS,
  CAPTURE_PAGE_MESSAGE,
  CAPTURE_PAGE_RESULT_MESSAGE
} from "./types"
import { getCollectionConfig, formatDateKey } from "./collection-config"
import { insertPageVisit } from "./page-visit-idb"

const DWELL_CHECK_ALARM = "lumino/dwell-check"

interface TabTimer {
  startMs: number
  url: string
  title: string
  hostname: string
  wasActive: boolean
}

/**
 * 注册一个 tab 打开的计时器。
 * 如果同 tabId 已有旧 timer（页面跳转），先结算旧页面再写入新的。
 */
export async function registerTabOpen(
  tabId: number,
  url: string,
  title: string
): Promise<void> {
  const hostname = extractHostname(url)
  const data = await chrome.storage.local.get(STORAGE_KEY_TAB_TIMERS)
  const timers: Record<string, TabTimer> =
    (data[STORAGE_KEY_TAB_TIMERS] as Record<string, TabTimer>) ?? {}

  // 同 tab 跳转到新页面，先结算旧页面
  const oldTimer = timers[String(tabId)]
  if (oldTimer && oldTimer.url !== url) {
    await settleTimer(tabId, oldTimer, Date.now())
  }

  timers[String(tabId)] = {
    startMs: Date.now(),
    url,
    title,
    hostname,
    wasActive: false
  }

  await chrome.storage.local.set({ [STORAGE_KEY_TAB_TIMERS]: timers })
}

/**
 * 结算一个 timer：通过消息让 content script 采集 turndown Markdown，写入 IDB。
 */
async function settleTimer(
  tabId: number,
  timer: TabTimer,
  settledAt: number
): Promise<void> {
  const cfg = await getCollectionConfig()
  if (!cfg.enablePageVisits) return

  const rawDwellMs = settledAt - timer.startMs
  const effective = computeEffectiveDwell(rawDwellMs, timer.wasActive, cfg)

  if (effective < cfg.minDwellMs) {
    console.log(
      `[Lumino] 页面停留不足阈值 (${effective}ms < ${cfg.minDwellMs}ms)，丢弃: ${timer.url}`
    )
    return
  }

  if (
    !timer.url ||
    timer.url.startsWith("chrome://") ||
    timer.url.startsWith("chrome-extension://")
  ) {
    return
  }

  try {
    // 向 content script 请求采集页面 Markdown
    const response = await chrome.tabs.sendMessage(tabId, {
      type: CAPTURE_PAGE_MESSAGE
    })

    const result = response as CapturePageResultMessage | null | undefined
    const markdown = result?.payload?.markdown ?? ""
    const title = result?.payload?.title || timer.title

    const record: PageVisitRecord = {
      id: `pv-${settledAt}-${tabId}-${Math.random().toString(36).slice(2, 7)}`,
      dateKey: formatDateKey(timer.startMs),
      timestamp: timer.startMs,
      url: timer.url,
      title,
      hostname: timer.hostname,
      markdownContent: markdown,
      dwellMs: effective,
      rawDwellMs,
      wasActive: timer.wasActive
    }

    await insertPageVisit(record)
    console.log(
      `[Lumino] page_visit 写入 IDB: ${record.title} (${record.dwellMs}ms)`
    )
  } catch (error) {
    console.warn(`[Lumino] Tab ${tabId} 页面采集失败:`, error)
  }
}

/**
 * 标记某个 tab 被用户激活过。
 */
export async function markTabActive(tabId: number): Promise<void> {
  const data = await chrome.storage.local.get(STORAGE_KEY_TAB_TIMERS)
  const timers: Record<string, TabTimer> =
    (data[STORAGE_KEY_TAB_TIMERS] as Record<string, TabTimer>) ?? {}

  const timer = timers[String(tabId)]
  if (timer) {
    timer.wasActive = true
    await chrome.storage.local.set({ [STORAGE_KEY_TAB_TIMERS]: timers })
  }
}

/**
 * Tab 关闭时结算并清理计时器。
 */
export async function settleAndRemoveTabTimer(tabId: number): Promise<void> {
  const data = await chrome.storage.local.get(STORAGE_KEY_TAB_TIMERS)
  const timers: Record<string, TabTimer> =
    (data[STORAGE_KEY_TAB_TIMERS] as Record<string, TabTimer>) ?? {}

  const timer = timers[String(tabId)]
  if (timer) {
    await settleTimer(tabId, timer, Date.now())
    delete timers[String(tabId)]
    await chrome.storage.local.set({ [STORAGE_KEY_TAB_TIMERS]: timers })
  }
}

/**
 * 计算有效浏览时长。
 */
export function computeEffectiveDwell(
  rawDwellMs: number,
  wasActive: boolean,
  config: CollectionConfig
): number {
  let effective = rawDwellMs
  if (!wasActive) {
    effective = Math.round(effective * config.backgroundTabCoeff)
  }
  if (effective > config.dwellDecayStartMs) {
    const excess = effective - config.dwellDecayStartMs
    effective =
      config.dwellDecayStartMs + Math.round(excess * config.dwellDecayRatio)
  }
  return effective
}

/**
 * 定时巡检：遍历当前打开的 tab 和 timer，结算已达标的页面。
 */
export async function runDwellCheck(config?: CollectionConfig): Promise<void> {
  const cfg = config ?? (await getCollectionConfig())
  if (!cfg.enablePageVisits) return

  const now = Date.now()
  const data = await chrome.storage.local.get(STORAGE_KEY_TAB_TIMERS)
  const timers: Record<string, TabTimer> =
    (data[STORAGE_KEY_TAB_TIMERS] as Record<string, TabTimer>) ?? {}

  const tabs = await chrome.tabs.query({})
  const openTabIds = new Set(tabs.map((t) => String(t.id)))
  const openTabUrls = new Map(
    tabs.filter((t) => t.id != null).map((t) => [String(t.id), t.url ?? ""])
  )

  // 清理已关闭 tab + URL 已变化的 tab
  let changed = false
  for (const tabIdStr of Object.keys(timers)) {
    const timer = timers[tabIdStr]
    const currentUrl = openTabUrls.get(tabIdStr)

    if (!openTabIds.has(tabIdStr)) {
      await settleTimer(Number(tabIdStr), timer, now)
      delete timers[tabIdStr]
      changed = true
    } else if (currentUrl && currentUrl !== timer.url) {
      await settleTimer(Number(tabIdStr), timer, now)
      delete timers[tabIdStr]
      changed = true
    }
  }
  if (changed) {
    await chrome.storage.local.set({ [STORAGE_KEY_TAB_TIMERS]: timers })
  }

  // 对仍存活且 URL 未变的 timer，检查是否达到阈值
  for (const tab of tabs) {
    const tabId = tab.id
    if (tabId == null) continue

    const timer = timers[String(tabId)]
    if (!timer) continue

    const elapsed = now - timer.startMs
    const effective = computeEffectiveDwell(elapsed, timer.wasActive, cfg)
    if (effective < cfg.minDwellMs) continue

    await settleTimer(tabId, timer, now)
    delete timers[String(tabId)]
  }

  await chrome.storage.local.set({ [STORAGE_KEY_TAB_TIMERS]: timers })
}

export async function setupDwellAlarm(intervalMs?: number): Promise<void> {
  const cfg = await getCollectionConfig()
  const interval = intervalMs ?? cfg.dwellCheckIntervalMs
  const periodInMinutes = Math.max(0.1, interval / 60_000)

  await chrome.alarms.clear(DWELL_CHECK_ALARM)
  chrome.alarms.create(DWELL_CHECK_ALARM, { periodInMinutes })
}

export function isDwellCheckAlarm(name: string): boolean {
  return name === DWELL_CHECK_ALARM
}

export async function getTabTimers(): Promise<Record<string, TabTimer>> {
  const data = await chrome.storage.local.get(STORAGE_KEY_TAB_TIMERS)
  return (data[STORAGE_KEY_TAB_TIMERS] as Record<string, TabTimer>) ?? {}
}

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ""
  }
}
