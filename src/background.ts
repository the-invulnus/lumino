// ============================================================
// Lumino Background Service Worker
// ============================================================

import { L1_EVENT_MESSAGE } from "./lib/memory/types"
import { appendEvent } from "./lib/memory/event-store"
import { setupBookmarkWatchers } from "./lib/memory/bookmark-watcher"
import {
  trackPageVisit,
  markTabActive,
  settleTabDwell,
  checkDwellThresholds,
  restoreDwellState
} from "./lib/memory/dwell-tracker"
import { OPEN_SIDE_PANEL_MESSAGE } from "./lib/side-panel-bridge"

export {}

// ---- 常量 ----

const DWELL_CHECK_ALARM = "lumino/dwell-check"
const DWELL_CHECK_INTERVAL_MINUTES = 1

// ---- 浏览器 API 初始化 ----

function enableOpenPanelOnActionClick() {
  if (typeof chrome === "undefined" || !chrome.sidePanel?.setPanelBehavior) {
    return
  }

  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
}

// ---- 消息处理 ----

function setupMessageHandlers(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Side panel 打开请求
    if (message?.type === OPEN_SIDE_PANEL_MESSAGE) {
      const tabId = sender.tab?.id
      const windowId = sender.tab?.windowId

      if (tabId != null && chrome.sidePanel?.open) {
        void chrome.sidePanel.open({ tabId })
        return
      }

      if (windowId != null && chrome.sidePanel?.open) {
        void chrome.sidePanel.open({ windowId })
      }

      return
    }

    // Content Script 查询 tab 信息
    if (message?.type === "lumino/get-tab-info") {
      sendResponse({
        tabId: sender.tab?.id,
        windowId: sender.tab?.windowId
      })
      return true
    }

    // Layer 1 事件上报（来自 content script）
    if (message?.type === L1_EVENT_MESSAGE) {
      const event = message.event
      const tabId = sender.tab?.id ?? event.tabId

      // 异步写入 IndexedDB
      appendEvent(event).catch((err) => {
        console.warn("[Lumino] Layer1 事件写入失败", err)
      })

      // 根据事件类型输出日志
      if (event.type === "page_visit" && event.page) {
        console.log("[Lumino] page_visit:", event.page.url)
        trackPageVisit(tabId, event.id, event.page.url, event.page.title)
      } else if (event.type === "input_type" && event.input) {
        console.log("[Lumino] input_type:", event.input.inputSource, event.input.text?.slice(0, 40))
      } else if (event.type === "input_focus" && event.input) {
        console.log("[Lumino] input_focus:", event.input.nodeType)
      } else if (event.type === "input_blur" && event.input) {
        console.log("[Lumino] input_blur:", event.input.nodeType)
      } else if (event.type === "page_scroll" && event.scroll) {
        // scroll 太频繁，降级为不输出日志
      } else if (event.type === "page_click" && event.click) {
        console.log("[Lumino] click:", event.click.elementType, event.click.label?.slice(0, 30))
      } else if (event.type === "page_dwell_end") {
        console.log("[Lumino] dwell_end:", event.tabId, event.dwellMs, "ms")
      } else {
        console.log("[Lumino] 事件:", event.type)
      }

      return
    }
  })
}

// ---- Tab 生命周期监听 ----

function setupTabListeners(): void {
  // Tab 激活：标记用户注意力
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    markTabActive(tabId)
  })

  // Tab URL 变化（导航到同一 tab 的新页面）：结算旧页面，准备新页面
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      // URL 变了，结算旧 dwell
      settleTabDwell(tabId).catch((err) => {
        console.warn("[Lumino] Tab dwell 结算失败", err)
      })
    }
  })

  // Tab 关闭：结算 dwell
  chrome.tabs.onRemoved.addListener((tabId) => {
    console.log("[Lumino] Tab 关闭, 开始结算 dwell:", tabId)
    settleTabDwell(tabId).catch((err) => {
      console.warn("[Lumino] Tab 关闭 dwell 结算失败", err)
    })
  })
}

// ---- Dwell 巡检定时器 ----

function setupDwellAlarms(): void {
  chrome.alarms.create(DWELL_CHECK_ALARM, {
    periodInMinutes: DWELL_CHECK_INTERVAL_MINUTES
  })
}

// ---- 主初始化 ----

chrome.runtime.onInstalled.addListener(async () => {
  enableOpenPanelOnActionClick()
  setupBookmarkWatchers()
  setupDwellAlarms()
})

async function boot(): Promise<void> {
  enableOpenPanelOnActionClick()
  setupMessageHandlers()
  setupTabListeners()
  setupBookmarkWatchers()
  setupDwellAlarms()
  console.log("[Lumino] 书签监听已启动, dwell 巡检 alarm 已注册")

  // 恢复可能因 SW 重启丢失的 dwell 状态
  await restoreDwellState()

  // 立即执行一次巡检
  await checkDwellThresholds()

  // 诊断：打印数据库状态
  try {
    const { getStorageStats } = await import("./lib/memory/memory-idb")
    const stats = await getStorageStats()
    console.log("[Lumino] IDB 存储统计:", JSON.stringify(stats, null, 2))
  } catch (e) {
    console.warn("[Lumino] IDB 诊断失败:", e)
  }

  console.log("[Lumino] Background SW 启动完成")
}

// ---- Alarm 处理 ----

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DWELL_CHECK_ALARM) {
    checkDwellThresholds().catch((err) => {
      console.warn("[Lumino] Dwell 巡检失败", err)
    })
  }
})

// ---- 启动 ----

void boot()
