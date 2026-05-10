import { OPEN_SIDE_PANEL_MESSAGE } from "./lib/side-panel-bridge"
import {
  L1_EVENT_MESSAGE,
  REQUEST_COMPLETION_MESSAGE,
  COMPLETION_ACCEPT_MESSAGE,
  COMPLETION_REJECT_MESSAGE,
  type L1EventMessage,
  type RequestCompletionMessage,
  type CompletionAcceptMessage,
  type CompletionRejectMessage
} from "./lib/memory/types"
import { appendEvent } from "./lib/memory/event-store"
import {
  initializeAllSchedules,
  isDailyMemoryAlarm,
  isStorageCleanupAlarm,
  isProfileUpdateAlarm
} from "./lib/memory/memory-scheduler"
import { generateAndSaveDailyMemory } from "./lib/memory/daily-memory"
import { generateAndSaveProfile } from "./lib/memory/user-profile"
import {
  handleCompletionRequest,
  handleCompletionAccept,
  handleCompletionReject
} from "./lib/completion/completion-engine"

export {}

/** 当前 session 开始时间 */
let sessionStartMs = Date.now()

/** 初始化 session 时间戳 */
async function initSessionStart(): Promise<void> {
  const data = await chrome.storage.local.get("lumino_session_start")
  const stored = data["lumino_session_start"] as number | undefined

  // 如果上次 session 超过 24 小时，视为新 session
  if (!stored || Date.now() - stored > 24 * 60 * 60 * 1000) {
    sessionStartMs = Date.now()
    await chrome.storage.local.set({ lumino_session_start: sessionStartMs })
  } else {
    sessionStartMs = stored
  }
}

/** 页面访问事件：在每个 tab 导航时自动采集 */
function setupPageVisitTracking(): void {
  // 通过 chrome.tabs.onUpdated 采集页面加载事件
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete") {
      return
    }

    if (!tab.url || !tab.title) {
      return
    }

    // 跳过 chrome:// 和 extension:// 页面
    if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
      return
    }

    // 通过 content script 获取详细信息
    chrome.tabs.sendMessage(tabId, {
      type: "lumino/collect-page-visit"
    }).catch(() => {
      // Content script 可能未注入，直接从 SW 创建事件
      try {
        const hostname = new URL(tab.url!).hostname

        // 简单的隐私过滤（在 SW 侧兜底）
        import("./lib/memory/privacy-filter").then(({ isPrivacyHostname }) => {
          if (isPrivacyHostname(hostname)) {
            return
          }

          const event = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            type: "page_visit" as const,
            timestamp: Date.now(),
            tabId,
            windowId: tab.windowId,
            sessionStartMs,
            page: {
              url: tab.url!,
              title: tab.title!,
              hostname,
              textSnippet: ""
            }
          }

          appendEvent(event).catch(() => {})
        }).catch(() => {})
      } catch {
        // 无效 URL，跳过
      }
    })
  })

  // Tab 切换事件
  chrome.tabs.onActivated.addListener((activeInfo) => {
    const { tabId, windowId } = activeInfo

    chrome.tabs.get(tabId).then((tab) => {
      if (!tab.url || !tab.title) {
        return
      }

      if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
        return
      }

      try {
        const hostname = new URL(tab.url).hostname

        import("./lib/memory/privacy-filter").then(({ isPrivacyHostname }) => {
          if (isPrivacyHostname(hostname)) {
            return
          }

          const event = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            type: "tab_switch" as const,
            timestamp: Date.now(),
            tabId,
            windowId,
            sessionStartMs,
            page: {
              url: tab.url!,
              title: tab.title!,
              hostname,
              textSnippet: ""
            }
          }

          appendEvent(event).catch(() => {})
        }).catch(() => {})
      } catch {
        // 无效 URL，跳过
      }
    }).catch(() => {})
  })
}

/** 点击工具栏图标时打开 Chrome Side Panel */
function enableOpenPanelOnActionClick() {
  if (typeof chrome === "undefined" || !chrome.sidePanel?.setPanelBehavior) {
    return
  }

  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
}

/** 处理 alarms 事件 */
function setupAlarms(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (isDailyMemoryAlarm(alarm.name)) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const dateStr = yesterday.toISOString().slice(0, 10)

      generateAndSaveDailyMemory(dateStr).then((entry) => {
        if (entry) {
          console.log("[Lumino] 日记忆已生成", entry.date)
        }
      }).catch((error) => {
        console.error("[Lumino] 日记忆生成失败", error)
      })

      return
    }

    if (isStorageCleanupAlarm(alarm.name)) {
      // 清理逻辑在 event-store.ts 的 appendEvent 中自动执行
      // 这里强制触发一次清理
      import("./lib/memory/event-store").then(({ loadEvents }) => {
        loadEvents().catch(() => {})
      }).catch(() => {})
      return
    }

    if (isProfileUpdateAlarm(alarm.name)) {
      generateAndSaveProfile().then((profile) => {
        console.log("[Lumino] 用户画像已更新")
      }).catch((error) => {
        console.error("[Lumino] 用户画像更新失败", error)
      })
      return
    }
  })
}

/** 处理消息 */
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
      return true // 异步 sendResponse
    }

    // 页面访问事件收集（来自 content script 的详细信息）
    if (message?.type === "lumino/collect-page-visit" && sender.tab) {
      const tab = sender.tab
      if (tab.url && tab.id != null) {
        chrome.tabs.sendMessage(tab.id, {
          type: "lumino/page-event-response",
          tabId: tab.id,
          windowId: tab.windowId
        }).catch(() => {})
      }
      return
    }

    // Layer 1 事件上报
    if (message?.type === L1_EVENT_MESSAGE) {
      const { event } = message as L1EventMessage
      appendEvent(event).catch(() => {})
      return
    }

    // 补全请求
    if (message?.type === REQUEST_COMPLETION_MESSAGE) {
      const completionMessage = message as RequestCompletionMessage
      const senderTabId = sender.tab?.id ?? completionMessage.payload.tabId

      handleCompletionRequest(completionMessage, senderTabId).catch((error) => {
        console.error("[Lumino] 补全处理失败", error)
      })
      return
    }

    // 补全接受
    if (message?.type === COMPLETION_ACCEPT_MESSAGE) {
      const { payload } = message as CompletionAcceptMessage
      handleCompletionAccept(payload.id)
      return
    }

    // 补全拒绝
    if (message?.type === COMPLETION_REJECT_MESSAGE) {
      const { payload } = message as CompletionRejectMessage
      handleCompletionReject(payload.id)
      return
    }
  })
}

// ---- 初始化 ----

chrome.runtime.onInstalled.addListener(async () => {
  enableOpenPanelOnActionClick()
  await initSessionStart()
  await initializeAllSchedules()
})

// 每次 SW 启动时初始化（MV3 Service Worker 可能随时被终止）
async function boot(): Promise<void> {
  enableOpenPanelOnActionClick()
  await initSessionStart()
  setupPageVisitTracking()
  setupAlarms()
  setupMessageHandlers()

  // Service Worker 复活后重新注册定时任务
  try {
    await initializeAllSchedules()
  } catch {
    // alarms API 可能暂时不可用
  }
}

void boot()
