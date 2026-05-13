// ============================================================
// Lumino Background Service Worker
// ============================================================

import {
  TAB_OPEN_MESSAGE,
  INPUT_EVENT_MESSAGE,
  COPY_EVENT_MESSAGE,
  type TabOpenMessage,
  type InputEventMessage,
  type CopyEventMessage
} from "./lib/memory/types"
import {
  getCollectionConfig,
  formatDateKey
} from "./lib/memory/collection-config"
import {
  registerTabOpen,
  markTabActive,
  settleAndRemoveTabTimer,
  runDwellCheck,
  setupDwellAlarm,
  isDwellCheckAlarm
} from "./lib/memory/dwell-checker"
import { insertInputEvent } from "./lib/memory/input-event-idb"
import { insertCopyRecord } from "./lib/memory/copy-record-idb"
import { insertDownloadRecord } from "./lib/memory/download-record-idb"
import { setupBookmarkWatchers } from "./lib/memory/bookmark-watcher"
import { OPEN_SIDE_PANEL_MESSAGE } from "./lib/side-panel-bridge"

export {}

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

    if (message?.type === TAB_OPEN_MESSAGE) {
      const payload = (message as TabOpenMessage).payload
      const tabId = sender.tab?.id

      if (tabId != null && payload.url) {
        registerTabOpen(tabId, payload.url, payload.title).catch((err) =>
          console.warn("[Lumino] registerTabOpen 失败:", err)
        )
        console.log("[Lumino] tab-open:", payload.url)
      }
      return
    }

    if (message?.type === INPUT_EVENT_MESSAGE) {
      const payload = (message as InputEventMessage).payload

      getCollectionConfig().then((cfg) => {
        if (!cfg.enableInputEvents) return

        const now = Date.now()
        const record = {
          id: `ie-${now}-${Math.random().toString(36).slice(2, 7)}`,
          dateKey: formatDateKey(now),
          timestamp: now,
          hostname: payload.hostname,
          nodeType: payload.nodeType,
          text: payload.text,
          inputSource: payload.inputSource,
          pastedLength: payload.pastedLength
        }

        insertInputEvent(record).catch((err) =>
          console.warn("[Lumino] insertInputEvent 失败:", err)
        )
        console.log(
          "[Lumino] input-event:",
          payload.inputSource,
          payload.text?.slice(0, 40)
        )
      })
      return
    }

    if (message?.type === COPY_EVENT_MESSAGE) {
      const payload = (message as CopyEventMessage).payload

      getCollectionConfig().then((cfg) => {
        if (!cfg.enableCopyRecords) return

        const now = Date.now()
        const record = {
          id: `cr-${now}-${Math.random().toString(36).slice(2, 7)}`,
          dateKey: formatDateKey(now),
          timestamp: now,
          hostname: payload.hostname,
          text: payload.text
        }

        insertCopyRecord(record).catch((err) =>
          console.warn("[Lumino] insertCopyRecord 失败:", err)
        )
        console.log("[Lumino] copy-event:", payload.text?.slice(0, 40))
      })
      return
    }
  })
}

// ---- Tab 生命周期监听 ----

function setupTabListeners(): void {
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    markTabActive(tabId).catch((err) =>
      console.warn("[Lumino] markTabActive 失败:", err)
    )
  })

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && tab.url) {
      const url = tab.url
      if (
        url &&
        !url.startsWith("chrome://") &&
        !url.startsWith("chrome-extension://")
      ) {
        registerTabOpen(tabId, url, tab.title ?? "").catch((err) =>
          console.warn("[Lumino] registerTabOpen 失败:", err)
        )
      }
    }
  })

  chrome.tabs.onRemoved.addListener((tabId) => {
    settleAndRemoveTabTimer(tabId).catch((err) =>
      console.warn("[Lumino] settleAndRemoveTabTimer 失败:", err)
    )
  })
}

// ---- 下载事件监听 ----

function setupDownloadListeners(): void {
  if (typeof chrome === "undefined" || !chrome.downloads) {
    console.warn("[Lumino] chrome.downloads API 不可用")
    return
  }

  chrome.downloads.onCreated.addListener((downloadItem) => {
    getCollectionConfig().then((cfg) => {
      if (!cfg.enableDownloadRecords) return

      const now = Date.now()
      const record = {
        id: `dl-${now}-${Math.random().toString(36).slice(2, 7)}`,
        dateKey: formatDateKey(now),
        timestamp: now,
        fileName:
          downloadItem.filename.split("/").pop() ?? downloadItem.filename,
        url: downloadItem.url,
        fileSize: downloadItem.fileSize ?? 0,
        mime: downloadItem.mime ?? ""
      }

      insertDownloadRecord(record).catch((err) =>
        console.warn("[Lumino] insertDownloadRecord 失败:", err)
      )
      console.log("[Lumino] download:", record.fileName)
    })
  })
}

// ---- 主初始化 ----

chrome.runtime.onInstalled.addListener(async () => {
  enableOpenPanelOnActionClick()
  setupBookmarkWatchers()
  await setupDwellAlarm()
})

async function boot(): Promise<void> {
  enableOpenPanelOnActionClick()
  setupMessageHandlers()
  setupTabListeners()
  setupBookmarkWatchers()
  setupDownloadListeners()
  await setupDwellAlarm()

  console.log("[Lumino] Background SW 启动完成")
  console.log("[Lumino] 书签监听已启动, dwell 巡检 alarm 已注册")

  await runDwellCheck()

  try {
    const { getStorageStats } = await import("./lib/memory/memory-idb")
    const stats = await getStorageStats()
    console.log("[Lumino] IDB 存储统计:", JSON.stringify(stats, null, 2))
  } catch (e) {
    console.warn("[Lumino] IDB 诊断失败:", e)
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (isDwellCheckAlarm(alarm.name)) {
    runDwellCheck().catch((err) => {
      console.warn("[Lumino] Dwell 巡检失败", err)
    })
  }
})

void boot()
