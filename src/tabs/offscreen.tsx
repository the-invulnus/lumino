/**
 * Offscreen Document — PDF 文本提取
 *
 * Plasmo Tab Pages 入口：构建产物为 chrome-extension://<id>/tabs/offscreen.html，
 * 由 Service Worker 通过 chrome.offscreen.createDocument() 创建。
 *
 * 为什么用 offscreen：pdf.js 默认用 Web Worker 解析，Service Worker 不能 spawn
 * Web Worker；offscreen 是普通 DOM 环境，worker 正常运行，且不阻塞 SW 事件循环。
 *
 * 本页面无可见 UI（导出空 React 组件仅为满足 Plasmo 约定），所有逻辑在模块顶层：
 * 监听 chrome.runtime.onMessage，收到 {type:"parse_pdf"} 后用 pdf.js 提取文本。
 */

import * as pdfjsLib from "pdfjs-dist"
// 导入 worker entry：它会将 WorkerMessageHandler 挂到 globalThis.pdfjsWorker，
// pdf.js 检测到该全局变量后直接在主线程解析（不走 Web Worker、不走 import()、不走 Blob URL）。
// 这是 MV3 扩展 CSP 下唯一稳定的 pdf.js 加载方式——真实 Worker 会崩溃，fake worker 的
// Blob import 被 CSP 拦截。offscreen 是独立 DOM 环境，主线程解析只阻塞 offscreen 自身。
import "pdfjs-dist/build/pdf.worker.entry"
import { useEffect } from "react"

type ParseError = { error: string; message?: string }

/**
 * 用 pdf.js 逐页提取文本，返回带页码分隔的纯文本：
 *   [Page 1]
 *   <第1页文本，保留换行>
 *
 *   [Page 2]
 *   <第2页文本>
 *   ...
 * 用 TextItem.hasEOL 重建换行（PDF 原始 items 不含换行符）。
 * 空页（扫描件）该页 text 为空，仅保留 [Page N] 标记。
 */
async function parsePdf(data: Uint8Array): Promise<string> {
  // getDocument 会消费传入的 ArrayBuffer，传副本避免副作用
  const loadingTask = pdfjsLib.getDocument({ data: data.slice() })
  const pdf = await loadingTask.promise
  const parts: string[] = []
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      // 用 hasEOL 重建换行：每个 TextItem 的 str 后若 hasEOL 为 true 则补 \n
      let pageText = ""
      for (const it of content.items) {
        const item = it as { str?: unknown; hasEOL?: unknown }
        if (typeof item.str !== "string") continue // 跳过 TextMarkedContent
        pageText += item.str
        if (item.hasEOL) pageText += "\n"
      }
      parts.push(`[Page ${i}]\n${pageText}`)
      page.cleanup()
    }
  } finally {
    // destroy 在 loadingTask 上，释放 worker 与缓存
    await loadingTask.destroy()
  }
  return parts.join("\n\n")
}

/** 监听 Service Worker 的解析请求 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "parse_pdf") return false

  ;(async () => {
    try {
      let bytes: Uint8Array
      if (msg.bytes) {
        bytes = msg.bytes as Uint8Array
      } else {
        const resp = await fetch(msg.url as string)
        if (!resp.ok) {
          sendResponse({
            ok: false,
            error: "fetch_failed",
            status: resp.status,
            statusText: resp.statusText
          })
          return
        }
        bytes = new Uint8Array(await resp.arrayBuffer())
      }
      const text = await parsePdf(bytes)
      sendResponse({ ok: true, text })
    } catch (e) {
      const error: ParseError = {
        error: "parse_failed",
        message: e instanceof Error ? e.message : String(e)
      }
      sendResponse({ ok: false, ...error })
    }
  })()

  return true // 异步响应
})

export default function OffscreenPage() {
  useEffect(() => {
    /* offscreen 无 UI，逻辑在模块顶层 */
  }, [])
  return null
}
