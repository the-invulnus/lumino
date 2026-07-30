import { getAgentWindowId } from "./agent-window"

async function queryAgentWindow(queryBase: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  const agentWid = await getAgentWindowId()
  if (agentWid != null) {
    return chrome.tabs.query({ ...queryBase, windowId: agentWid })
  }
  return chrome.tabs.query(queryBase)
}


export async function handleCurrentPage(
  _args: Record<string, unknown>
): Promise<string> {
  try {
    const [tab] = await queryAgentWindow({ active: true, currentWindow: true })

    if (!tab) {
      return JSON.stringify({ error: "no_active_tab", message: "无法获取当前标签页信息。" })
    }

    return JSON.stringify({
      url: tab.url ?? "",
      title: tab.title ?? "",
      id: tab.id
    })
  } catch (error) {
    return JSON.stringify({
      error: "tabs_query_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

export async function handleTabs(
  _args: Record<string, unknown>
): Promise<string> {
  try {
    const tabs = await chrome.tabs.query({})

    const result = tabs.map((tab) => ({
      id: tab.id,
      title: tab.title ?? "",
      url: tab.url ?? "",
      active: tab.active,
      windowId: tab.windowId
    }))

    return JSON.stringify({ count: result.length, tabs: result }, null, 2)
  } catch (error) {
    return JSON.stringify({
      error: "tabs_query_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

// ── get_active_tab_id ──
// 已合并入 current_page（两者底层一致，current_page 已返回 id）。

