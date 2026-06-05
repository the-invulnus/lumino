/**
 * agent-window.ts
 *
 * 管理 agent 专属窗口 ID。
 * 当用户在 Side Panel 发起请求时，Service Worker 从 sender.tab.windowId 获取当前窗口 ID，
 * 写入 chrome.storage.session（内存级，Service Worker 可用，浏览器关闭自动清除）。
 * 所有浏览器工具（navigate、get_page_content 等）在执行时自动读取此 ID，
 * 确保 agent 操作始终锚定在用户发起请求的窗口内。
 *
 * 注意：不清除——chrome.storage.session 生命周期跟随浏览器会话，
 * 新请求过来时会自动覆盖。多会话并发场景下也不会互相影响。
 */

const AGENT_WINDOW_KEY = "lumino_agent_window_id"

/**
 * 保存 agent 专属窗口 ID 到 session storage。
 * 在 background.ts 收到 START_AGENT 消息时调用。
 * 多次调用会覆盖，支持用户跨窗口发起不同请求。
 */
export async function setAgentWindowId(windowId: number): Promise<void> {
  await chrome.storage.session.set({ [AGENT_WINDOW_KEY]: windowId })
}

/**
 * 获取 agent 专属窗口 ID。
 * 返回 undefined 表示尚未设置。
 */
export async function getAgentWindowId(): Promise<number | undefined> {
  const result = await chrome.storage.session.get(AGENT_WINDOW_KEY)
  return result[AGENT_WINDOW_KEY] as number | undefined
}
