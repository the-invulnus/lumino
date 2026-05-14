/** 内容脚本 → Service Worker：在当前标签所在窗口打开扩展 Side Panel */
export const OPEN_SIDE_PANEL_MESSAGE = "lumino/open-side-panel" as const

export type OpenSidePanelMessage = {
  type: typeof OPEN_SIDE_PANEL_MESSAGE
}

/** Service Worker → 内容脚本：通知悬浮按钮 agent 运行状态 */
export const AGENT_RUNNING_STATE_MESSAGE = "lumino/agent-running-state" as const

export type AgentRunningStateMessage = {
  type: typeof AGENT_RUNNING_STATE_MESSAGE
  payload: { running: boolean }
}
