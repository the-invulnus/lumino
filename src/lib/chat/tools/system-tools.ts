export async function handleCurrentPage(
  _args: Record<string, unknown>
): Promise<string> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

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
