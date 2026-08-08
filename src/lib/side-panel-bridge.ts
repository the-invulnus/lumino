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
    /** Side Panel 所在窗口的 ID，agent 所有浏览器操作锚定到此窗口 */
    windowId?: number
    /** Agent 模式 id，如 "chat" / "research" / custom-uuid */
    mode?: string
    /** Agent 配置（内置与自定义均传，含 isBuiltin 用于工具过滤分流） */
    agentConfig?: {
      systemPrompt: string
      tools: string[]
      isBuiltin: boolean
    }
    /** 选中的 thinking mode id（对应全局 ThinkingConfig.modes[].id）。不传则用 defaultModeId */
    thinkingModeId?: string
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

/** Side Panel → Service Worker：重试 agent（出错后从上一条消息继续） */
export const RETRY_AGENT_MESSAGE = "lumino/retry-agent" as const

export type RetryAgentMessage = {
  type: typeof RETRY_AGENT_MESSAGE
  payload: {
    threadId: string
    /** Agent 所在窗口的 ID */
    windowId?: number
    mode?: string
    agentConfig?: {
      systemPrompt: string
      tools: string[]
      isBuiltin: boolean
    }
    /** 选中的 thinking mode id（对应全局 ThinkingConfig.modes[].id）。不传则用 defaultModeId */
    thinkingModeId?: string
  }
}

/** Service Worker → 内容脚本：通知悬浮按钮全局 agent 运行状态 */
export const AGENT_RUNNING_STATE_MESSAGE = "lumino/agent-running-state" as const

export type AgentRunningStateMessage = {
  type: typeof AGENT_RUNNING_STATE_MESSAGE
  payload: { running: boolean }
}

/** Service Worker → 内容脚本：侧边栏打开/关闭状态变更 */
export const SIDEPANEL_STATE_MESSAGE = "lumino/sidepanel-state" as const

export type SidepanelStateMessage = {
  type: typeof SIDEPANEL_STATE_MESSAGE
  payload: { open: boolean }
}
