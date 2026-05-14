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
import {
  OPEN_SIDE_PANEL_MESSAGE,
  START_AGENT_MESSAGE,
  STOP_AGENT_MESSAGE,
  AGENT_PROGRESS_MESSAGE,
  AGENT_COMPLETE_MESSAGE,
  AGENT_ERROR_MESSAGE,
  AGENT_RUNNING_STATE_MESSAGE,
  SIDEPANEL_STATE_MESSAGE,
  type StartAgentMessage,
  type StopAgentMessage,
  type AgentProgressMessage,
  type AgentCompleteMessage,
  type AgentErrorMessage,
  type AgentRunningStateMessage,
  type SidepanelStateMessage
} from "./lib/side-panel-bridge"
import { getLlmSettings } from "./lib/settings"
import { runAgentLoop } from "./lib/chat/agent-loop"
import type { OpenAiChatMessage } from "./lib/chat/openai-messages"
import { saveThreadMessages } from "./lib/chat/thread-idb"

export {}

// ============================================================
// Agent 执行管理（在 Service Worker 中运行，不依赖 Side Panel 生命周期）
// ============================================================

/** 当前正在执行的 agent 的 AbortController 映射 */
const runningAgents = new Map<string, AbortController>()

/** 所有正在运行的 threadId Set（用于全局状态判断） */
const runningThreadIds = new Set<string>()

/** 广播 agent 运行状态到所有 content scripts */
function broadcastAgentRunningState() {
  const running = runningThreadIds.size > 0
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, {
          type: AGENT_RUNNING_STATE_MESSAGE,
          payload: { running }
        } as AgentRunningStateMessage).catch(() => { /* tab 可能未注入 */ })
      }
    }
  })
}

/** 广播侧边栏打开/关闭状态到所有 content scripts */
function broadcastSidepanelState(open: boolean) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, {
          type: SIDEPANEL_STATE_MESSAGE,
          payload: { open }
        } as SidepanelStateMessage).catch(() => { })
      }
    }
  })
}

/** 在 Service Worker 中执行 agent loop */
async function executeAgentInBackground(
  threadId: string,
  historyMessages: OpenAiChatMessage[],
  userInput: string
) {
  const abortController = new AbortController()
  runningAgents.set(threadId, abortController)
  runningThreadIds.add(threadId)
  broadcastAgentRunningState()

  try {
    const settings = await getLlmSettings()

    const result = await runAgentLoop({
      settings,
      threadId,
      historyMessages,
      userInput,
      signal: abortController.signal,
      onMessagesUpdate: async (msgs) => {
        if (abortController.signal.aborted) return
        await saveThreadMessages(threadId, msgs)

        // 推送进度到 Side Panel
        chrome.runtime.sendMessage({
          type: AGENT_PROGRESS_MESSAGE,
          payload: { threadId, messages: msgs }
        } as AgentProgressMessage).catch(() => { /* Side Panel 可能已关闭 */ })
      }
    })

    await saveThreadMessages(threadId, result)

    // 通知 Side Panel 执行完成
    chrome.runtime.sendMessage({
      type: AGENT_COMPLETE_MESSAGE,
      payload: { threadId, messages: result }
    } as AgentCompleteMessage).catch(() => { /* ignore */ })

    return result
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // 用户主动中止，不报错
      return
    }

    const errorMsg = err instanceof Error ? err.message : "请求模型失败，请检查配置后重试。"

    chrome.runtime.sendMessage({
      type: AGENT_ERROR_MESSAGE,
      payload: { threadId, error: errorMsg }
    } as AgentErrorMessage).catch(() => { /* ignore */ })
  } finally {
    runningAgents.delete(threadId)
    runningThreadIds.delete(threadId)
    broadcastAgentRunningState()
  }
}

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
    // ---- 悬浮按钮：toggle 侧边栏 ----
    if (message?.type === OPEN_SIDE_PANEL_MESSAGE) {
      const windowId = sender.tab?.windowId
      if (windowId != null && chrome.sidePanel?.open) {
        // sidePanel.open({ windowId }) 在面板已打开时会关闭面板（Chrome 118+）
        void chrome.sidePanel.open({ windowId })
      }
      return
    }

    // ---- Side Panel → SW：启动 agent ----
    if (message?.type === START_AGENT_MESSAGE) {
      const { threadId, historyMessages, userInput } = (message as StartAgentMessage).payload

      // 如果同一个 thread 已在运行，忽略
      if (runningAgents.has(threadId)) return

      console.log("[lumino:bg]", "启动 agent, threadId:", threadId)
      void executeAgentInBackground(
        threadId,
        historyMessages as OpenAiChatMessage[],
        userInput
      )
      return
    }

    // ---- Side Panel → SW：中止 agent ----
    if (message?.type === STOP_AGENT_MESSAGE) {
      const { threadId } = (message as StopAgentMessage).payload
      const controller = runningAgents.get(threadId)
      if (controller) {
        console.log("[lumino:bg]", "中止 agent, threadId:", threadId)
        controller.abort()
        runningAgents.delete(threadId)
        runningThreadIds.delete(threadId)
        broadcastAgentRunningState()
      }
      return
    }

    // ---- 查询当前运行状态（Side Panel 打开时可以查询） ----
    if (message?.type === "lumino/query-running-state") {
      sendResponse({ runningThreadIds: Array.from(runningThreadIds) })
      return true // 保持回调
    }

    // ---- Content Script → SW：查询运行状态 ----
    if (message?.type === AGENT_RUNNING_STATE_MESSAGE) {
      const payload = (message as AgentRunningStateMessage).payload
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        for (const tab of tabs) {
          if (tab.id != null) {
            chrome.tabs.sendMessage(tab.id, {
              type: AGENT_RUNNING_STATE_MESSAGE,
              payload
            } as AgentRunningStateMessage).catch(() => { })
          }
        }
      })
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

        // 页面刷新/导航后，重新广播运行状态给 content script
        if (runningThreadIds.size > 0) {
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, {
              type: AGENT_RUNNING_STATE_MESSAGE,
              payload: { running: true }
            } as AgentRunningStateMessage).catch(() => { })
          }, 500)
        }
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

  // SW 启动后，广播当前运行状态到所有 content script
  setTimeout(() => {
    broadcastAgentRunningState()
  }, 1000)
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (isDwellCheckAlarm(alarm.name)) {
    runDwellCheck().catch((err) => {
      console.warn("[Lumino] Dwell 巡检失败", err)
    })
  }
})

void boot()
