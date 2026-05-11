import { OPEN_SIDE_PANEL_MESSAGE } from "./lib/side-panel-bridge"

export {}

/** 点击工具栏图标时打开 Chrome Side Panel */
function enableOpenPanelOnActionClick() {
  if (typeof chrome === "undefined" || !chrome.sidePanel?.setPanelBehavior) {
    return
  }

  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
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

    // ============================================================
    // 以下主动 AI 功能已禁用（临时）：
    //   - 页面访问追踪 & Layer1 事件采集
    //   - AI 自动补全（请求/接受/拒绝）
    // ============================================================

    // // 页面访问事件收集（来自 content script 的详细信息）
    // if (message?.type === "lumino/collect-page-visit" && sender.tab) { ... }

    // // Layer 1 事件上报
    // if (message?.type === L1_EVENT_MESSAGE) { ... }

    // // 补全请求
    // if (message?.type === REQUEST_COMPLETION_MESSAGE) { ... }

    // // 补全接受
    // if (message?.type === COMPLETION_ACCEPT_MESSAGE) { ... }

    // // 补全拒绝
    // if (message?.type === COMPLETION_REJECT_MESSAGE) { ... }
  })
}

// ---- 初始化 ----

chrome.runtime.onInstalled.addListener(async () => {
  enableOpenPanelOnActionClick()
})

// 每次 SW 启动时初始化（MV3 Service Worker 可能随时被终止）
async function boot(): Promise<void> {
  enableOpenPanelOnActionClick()
  setupMessageHandlers()

  // ============================================================
  // 以下主动 AI 功能已禁用（临时）：
  //   - 页面访问追踪 (setupPageVisitTracking)
  //   - memory scheduler 定时任务 (setupAlarms + initializeAllSchedules)
  // ============================================================
}

void boot()
