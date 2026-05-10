import type { PlasmoCSConfig } from "plasmo"

import { initInputWatcher, destroyInputWatcher } from "../lib/completion/input-watcher"
import "../styles/content-inject.css"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false
}

let watcherInitialized = false

/**
 * 从 chrome.runtime 获取当前 tab 信息并初始化 watcher。
 */
async function tryInit(): Promise<void> {
  if (watcherInitialized) {
    return
  }

  try {
    // 尝试获取 tab id
    if (typeof chrome === "undefined" || !chrome.runtime?.id) {
      return
    }

    // 通过发送消息获取 tab 信息
    const tabInfo = await chrome.runtime.sendMessage({
      type: "lumino/get-tab-info"
    }).catch(() => null)

    if (!tabInfo || !tabInfo.tabId) {
      return
    }

    watcherInitialized = true
    initInputWatcher(tabInfo.tabId, tabInfo.windowId ?? 0)
  } catch {
    // 扩展上下文可能已失效
  }
}

/**
 * 页面加载完成后初始化。
 */
if (document.readyState === "complete") {
  void tryInit()
} else {
  window.addEventListener("load", () => void tryInit())
}

/**
 * 页面卸载时清理。
 */
window.addEventListener("beforeunload", () => {
  destroyInputWatcher()
})
