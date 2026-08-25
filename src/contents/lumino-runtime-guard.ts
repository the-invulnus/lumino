// ============================================================
// Lumino Runtime Guard — 抑制 Plasmo 运行时噪音
// ============================================================
// 职责：
// 1. 抑制 SW 回收时 Plasmo parcel-runtime 抛出的未捕获错误
// 2. 隐藏 "context invalidated press to reload" 覆盖层（SW 会在下次通信时自动唤醒）
// ============================================================

import type { PlasmoCSConfig } from "plasmo"

// import { mountFloatingButton } from "../content/floating-button"
import "../styles/content-inject.css"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

// 抑制 Plasmo parcel-runtime 在 SW 回收时抛出的未捕获 "Extension context invalidated" 错误
// Plasmo 的 script-runtime 每 24s 通过 chrome.runtime.connect 重连，SW 空闲回收时 connect 会断开
// 错误来自 @plasmohq/parcel-runtime 的 setInterval(R, 24e3)，其外层 try-catch 只保护了首次调用
window.addEventListener("error", (event) => {
  if (event.message?.includes("Extension context invalidated")) {
    event.preventDefault()
    event.stopPropagation()
    return false
  }
})

// 抑制 Plasmo parcel-runtime 的 "context invalidated press to reload" 覆盖层
// SW 被回收后 script-runtime 的 onDisconnect 会调用 M.show({reloadButton:true})，通过
// opacity 属性控制显示/隐藏（div 只创建一次，不会通过 childList 触发 MutationObserver）。
// 对于 Lumino 来说 SW 会在下次通信时自动唤醒，无需手动刷新。
const OVERLAY_KEYWORDS = /content invalidated|press to reload/i
const OBSERVE_TARGET = document.documentElement || document.body

if (OBSERVE_TARGET) {
  // 监听属性变化：覆盖层通过 opacity 切换显隐
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "style") {
        const el = m.target as HTMLElement
        if (el.tagName === "DIV" && el.textContent && OVERLAY_KEYWORDS.test(el.textContent)) {
          if (el.style.opacity !== "0") {
            el.style.opacity = "0"
          }
        }
      }
      // 也处理 childList：覆盖层首次创建时加入属性监听
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) {
          const el = node as HTMLElement
          if (el.tagName === "DIV" && el.textContent && OVERLAY_KEYWORDS.test(el.textContent)) {
            el.style.opacity = "0"
            observer.observe(el, { attributes: true, attributeFilter: ["style"] })
          }
        }
      }
    }
  })

  // 对已存在的覆盖层立即隐藏
  for (const div of OBSERVE_TARGET.querySelectorAll("div")) {
    if (div.textContent && OVERLAY_KEYWORDS.test(div.textContent)) {
      ;(div as HTMLElement).style.opacity = "0"
      observer.observe(div, { attributes: true, attributeFilter: ["style"] })
    }
  }

  observer.observe(OBSERVE_TARGET, { childList: true, subtree: true })
}

// TODO: 后续需要悬浮按钮时取消注释即可恢复
// mountFloatingButton()
