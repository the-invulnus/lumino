import type { PlasmoCSConfig } from "plasmo"

// import { mountFloatingButton } from "../content/floating-button"
import "../styles/content-inject.css"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

// 抑制 Plasmo parcel-runtime 在 SW 回收时抛出的未捕获 "Extension context invalidated" 错误
// Plasmo 的 script-runtime 每 24s 通过 chrome.runtime.connect 重连，SW 空闲回收时 connect 会失败
// 错误来自 @plasmohq/parcel-runtime 的 setInterval(R, 24e3)，其外层 try-catch 只保护了首次调用
window.addEventListener("error", (event) => {
  if (event.message?.includes("Extension context invalidated")) {
    event.preventDefault()
    event.stopPropagation()
    return false
  }
})

// TODO: 后续需要悬浮按钮时取消注释即可恢复
// mountFloatingButton()
