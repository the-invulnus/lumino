// ============================================================
// Lumino Background Service Worker
// ============================================================

import {
  OPEN_SIDE_PANEL_MESSAGE,
  START_AGENT_MESSAGE,
  STOP_AGENT_MESSAGE,
  RETRY_AGENT_MESSAGE,
  AGENT_PROGRESS_MESSAGE,
  AGENT_COMPLETE_MESSAGE,
  AGENT_ERROR_MESSAGE,
  AGENT_RUNNING_STATE_MESSAGE,
  SIDEPANEL_STATE_MESSAGE,
  type StartAgentMessage,
  type StopAgentMessage,
  type RetryAgentMessage,
  type AgentProgressMessage,
  type AgentCompleteMessage,
  type AgentErrorMessage,
  type AgentRunningStateMessage,
  type SidepanelStateMessage
} from "./lib/side-panel-bridge"
import { getLlmSettings, getThinkingConfig, resolveThinkingBody } from "./lib/settings"
import { runAgentLoop } from "./lib/chat/agent-loop"
import { registerAllTools } from "./lib/chat/tool-registry"
import { cleanupEvictedFiles, EVICT_CLEANUP_ALARM } from "./lib/chat/tool-eviction"
import type { OpenAiChatMessage } from "./lib/chat/openai-messages"
import { getThread, saveThreadMessages } from "./lib/chat/thread-idb"
import { setAgentWindowId } from "./lib/chat/tools/agent-window"
import { t, initLocaleFromStorage } from "./lib/i18n"

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
  userInput: string,
  mode?: string,
  agentConfig?: { systemPrompt: string; tools: string[]; isBuiltin: boolean },
  thinkingModeId?: string
) {
  const abortController = new AbortController()
  await registerAllTools()
  runningAgents.set(threadId, abortController)
  runningThreadIds.add(threadId)
  broadcastAgentRunningState()

  try {
    // 重试模式：historyMessages 为空时从 DB 加载最新的消息
    let msgs = historyMessages
    if (msgs.length === 0 && !userInput) {
      const record = await getThread(threadId)
      msgs = record?.messages ?? []
    }

    const settings = await getLlmSettings()
    const thinkingConfig = await getThinkingConfig()
    const thinkingBody = resolveThinkingBody(thinkingConfig, thinkingModeId)

    const result = await runAgentLoop({
      settings,
      threadId,
      historyMessages: msgs,
      userInput,
      signal: abortController.signal,
      mode,
      agentConfig,
      thinkingBody,
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

    const errorMsg = err instanceof Error ? err.message : t("chat.error.modelRequest")
    // 打印完整错误详情（包括 stack、status 等）
    console.error("[lumino:bg] agent error:", err)
    if (err instanceof Error && (err as any).status) {
      console.error("[lumino:bg] error status:", (err as any).status)
    }

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
      const { threadId, historyMessages, userInput, windowId, mode, agentConfig, thinkingModeId } = (message as StartAgentMessage).payload

      if (windowId != null) {
        void setAgentWindowId(windowId)
      }

      // 如果同一个 thread 已在运行，忽略重复请求并确认收到
      if (runningAgents.has(threadId)) {
        sendResponse({ received: true, duplicate: true })
        return
      }

      // 立即确认消息已收到，避免 SW 休眠后 sendMessage 的 Promise 被 reject
      sendResponse({ received: true })
      void executeAgentInBackground(
        threadId,
        historyMessages as OpenAiChatMessage[],
        userInput,
        mode,
        agentConfig,
        thinkingModeId
      )
      return
    }

    // ---- Side Panel → SW：重试 agent（错误后从上一条消息继续） ----
    if (message?.type === RETRY_AGENT_MESSAGE) {
      const { threadId, windowId, mode, agentConfig, thinkingModeId } = (message as RetryAgentMessage).payload

      if (runningAgents.has(threadId)) {
        sendResponse({ received: true, duplicate: true })
        return
      }

      if (windowId != null) {
        void setAgentWindowId(windowId)
      }

      sendResponse({ received: true })
      void executeAgentInBackground(threadId, [], "", mode, agentConfig, thinkingModeId)
      return
    }

    // ---- Side Panel → SW：中止 agent ----
    if (message?.type === STOP_AGENT_MESSAGE) {
      const { threadId } = (message as StopAgentMessage).payload
      const controller = runningAgents.get(threadId)
      if (controller) {
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
  // 恢复 locale（错误消息等用 t() 渲染，默认 en）
  void initLocaleFromStorage()
  enableOpenPanelOnActionClick()
  setupMessageHandlers()
  setupTabListeners()

  // 注册驱逐文件定时清理（每 30 分钟）
  chrome.alarms.create(EVICT_CLEANUP_ALARM, { periodInMinutes: 30 })
  // 启动时立即清理一次
  cleanupEvictedFiles().catch((err) => console.warn("[Lumino] 驱逐文件清理失败:", err))

  // SW 启动后，广播当前运行状态到所有 content script
  setTimeout(() => {
    broadcastAgentRunningState()
  }, 1000)
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === EVICT_CLEANUP_ALARM) {
    cleanupEvictedFiles()
      .catch((err) => console.warn("[Lumino] 驱逐文件清理失败:", err))
  }
})

void boot()
