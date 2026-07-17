// ============================================================
// Lumino Background Service Worker
// ============================================================

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
import { registerAllTools } from "./lib/chat/tool-registry"
import { cleanupEvictedFiles, EVICT_CLEANUP_ALARM } from "./lib/chat/tool-eviction"
import type { OpenAiChatMessage } from "./lib/chat/openai-messages"
import { getThread, saveThreadMessages } from "./lib/chat/thread-idb"
import { setAgentWindowId } from "./lib/chat/tools/agent-window"

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
  await registerAllTools()
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
      // 用户主动中止：读取 DB 中已保存的最新消息（包含 onMessagesUpdate 写入的进度），
      // 避免用 historyMessages 覆盖已输出的内容
      getThread(threadId).then((record) => {
        const lastMessages = record?.messages ?? historyMessages
        chrome.runtime.sendMessage({
          type: AGENT_COMPLETE_MESSAGE,
          payload: { threadId, messages: lastMessages }
        } as AgentCompleteMessage).catch(() => { /* Side Panel 可能已关闭 */ })
      }).catch(() => {
        chrome.runtime.sendMessage({
          type: AGENT_COMPLETE_MESSAGE,
          payload: { threadId, messages: historyMessages }
        } as AgentCompleteMessage).catch(() => { /* Side Panel 可能已关闭 */ })
      })
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
      const { threadId, historyMessages, userInput, windowId } = (message as StartAgentMessage).payload

      if (windowId != null) {
        void setAgentWindowId(windowId)
      }

      // 如果同一个 thread 已在运行，忽略重复请求并确认收到
      if (runningAgents.has(threadId)) {
        sendResponse({ received: true, duplicate: true })
        return
      }

      console.log("[lumino:bg]", "启动 agent, threadId:", threadId)
      // 立即确认消息已收到，避免 SW 休眠后 sendMessage 的 Promise 被 reject
      sendResponse({ received: true })
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
      sendResponse({ received: true })
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
  })
}

// ---- Tab 生命周期监听 ----

function setupTabListeners(): void {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && tab.url) {
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
  })
}

// ---- 主初始化 ----

chrome.runtime.onInstalled.addListener(async () => {
  enableOpenPanelOnActionClick()
})

async function boot(): Promise<void> {
  enableOpenPanelOnActionClick()
  setupMessageHandlers()
  setupTabListeners()

  // 注册驱逐文件定时清理（每 30 分钟）
  chrome.alarms.create(EVICT_CLEANUP_ALARM, { periodInMinutes: 30 })
  // 启动时立即清理一次
  cleanupEvictedFiles().catch((err) => console.warn("[Lumino] 驱逐文件清理失败:", err))

  console.log("[Lumino] Background SW 启动完成")

  // SW 启动后，广播当前运行状态到所有 content script
  setTimeout(() => {
    broadcastAgentRunningState()
  }, 1000)
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === EVICT_CLEANUP_ALARM) {
    cleanupEvictedFiles()
      .then((deleted) => {
        if (deleted > 0) console.log(`[Lumino] 清理了 ${deleted} 个过期驱逐文件`)
      })
      .catch((err) => console.warn("[Lumino] 驱逐文件清理失败:", err))
  }
})

void boot()
