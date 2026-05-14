/** 内容脚本 → Service Worker：在当前标签所在窗口打开扩展 Side Panel */
export const OPEN_SIDE_PANEL_MESSAGE = "lumino/open-side-panel" as const

export type OpenSidePanelMessage = {
  type: typeof OPEN_SIDE_PANEL_MESSAGE
}

/** Side Panel → Service Worker：发起 agent 执行 */
export const START_AGENT_MESSAGE = "lumino/start-agent" as const

export type StartAgentMessage = {
  type: typeof START_AGENT_MESSAGE
  payload: {
    threadId: string
    historyMessages: unknown[] // OpenAiChatMessage[]
    userInput: string
  }
}

/** Side Panel → Service Worker：中止 agent 执行 */
export const STOP_AGENT_MESSAGE = "lumino/stop-agent" as const

export type StopAgentMessage = {
  type: typeof STOP_AGENT_MESSAGE
  payload: { threadId: string }
}

/** Service Worker → Side Panel：agent 消息更新 */
export const AGENT_PROGRESS_MESSAGE = "lumino/agent-progress" as const

export type AgentProgressMessage = {
  type: typeof AGENT_PROGRESS_MESSAGE
  payload: {
    threadId: string
    messages: unknown[] // OpenAiChatMessage[]
  }
}

/** Service Worker → Side Panel：agent 执行完成 */
export const AGENT_COMPLETE_MESSAGE = "lumino/agent-complete" as const

export type AgentCompleteMessage = {
  type: typeof AGENT_COMPLETE_MESSAGE
  payload: {
    threadId: string
    messages: unknown[] // OpenAiChatMessage[]
  }
}

/** Service Worker → Side Panel：agent 执行出错 */
export const AGENT_ERROR_MESSAGE = "lumino/agent-error" as const

export type AgentErrorMessage = {
  type: typeof AGENT_ERROR_MESSAGE
  payload: {
    threadId: string
    error: string
  }
}

/** Service Worker → 内容脚本：通知悬浮按钮全局 agent 运行状态 */
export const AGENT_RUNNING_STATE_MESSAGE = "lumino/agent-running-state" as const

export type AgentRunningStateMessage = {
  type: typeof AGENT_RUNNING_STATE_MESSAGE
  payload: { running: boolean }
}
