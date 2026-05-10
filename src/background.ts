import { OPEN_SIDE_PANEL_MESSAGE } from "./lib/side-panel-bridge"

export {}

/** 点击工具栏图标时打开 Chrome Side Panel */
function enableOpenPanelOnActionClick() {
  if (typeof chrome === "undefined" || !chrome.sidePanel?.setPanelBehavior) {
    return
  }

  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
}

chrome.runtime.onInstalled.addListener(enableOpenPanelOnActionClick)
enableOpenPanelOnActionClick()

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== OPEN_SIDE_PANEL_MESSAGE) {
    return
  }

  const tabId = sender.tab?.id
  const windowId = sender.tab?.windowId

  if (tabId != null && chrome.sidePanel?.open) {
    void chrome.sidePanel.open({ tabId })
    return
  }

  if (windowId != null && chrome.sidePanel?.open) {
    void chrome.sidePanel.open({ windowId })
  }
})
