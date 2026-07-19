// ============================================================
// Lumino Content Script — 基础注入
// ============================================================

import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

// 抑制 Plasmo parcel-runtime 在 SW 回收时抛出的未捕获 "Extension context invalidated" 错误
window.addEventListener("error", (event) => {
  if (event.message?.includes("Extension context invalidated")) {
    event.preventDefault()
    event.stopPropagation()
    return false
  }
})
