/**
 * Service Worker ↔ Offscreen Document 通信桥
 *
 * read_pdf 工具在 SW 中调用，pdf.js 解析在 offscreen document（src/tabs/offscreen.tsx）
 * 中执行。本模块封装 offscreen document 的按需创建与消息收发。
 */

type ParseFailure = { error: string; message?: string; status?: number; statusText?: string }

/** 解析成功返回纯文本（带 [Page N] 分隔），失败返回 error 对象 */
export type ParsePdfResult = string | ParseFailure

/** offscreen document 已创建的内存标记（SW 重启后失效，下次按需重建） */
let offscreenReady = false

/**
 * 确保 offscreen document 存在。已创建则直接返回，否则创建。
 * MV3 offscreen document 可能被 Chrome 回收，因此每次都 hasDocument() 检查。
 */
export async function ensureOffscreenDocument(): Promise<void> {
  if (offscreenReady) {
    // 标记存在仍需校验实际是否存活（SW 长时间未调用时 document 可能已关闭）
    try {
      const alive = await chrome.offscreen.hasDocument()
      if (alive) return
    } catch {
      /* hasDocument 在某些版本可能抛错，降级走重建路径 */
    }
  }

  try {
    const exists = await chrome.offscreen.hasDocument()
    if (!exists) {
      await chrome.offscreen.createDocument({
        url: "tabs/offscreen.html",
        reasons: [chrome.offscreen.Reason.DOM_PARSER],
        justification: "Extract text from PDF files for the read_pdf tool"
      })
    }
    offscreenReady = true
  } catch (e) {
    // 并发场景下可能两个调用同时 createDocument，第二个报"已存在"错误，忽略
    offscreenReady = true
    if (!(e instanceof Error) || !/existing|already/i.test(e.message)) {
      throw e
    }
  }
}

/**
 * 通过 offscreen document 解析 PDF。
 * @param payload.url  - PDF 链接，由 offscreen 内 fetch
 * @param payload.bytes - PDF 字节（path 模式由 SW 从 OPFS 读出后传入）
 */
export async function parsePdfViaOffscreen(
  payload: { url?: string; bytes?: Uint8Array }
): Promise<ParsePdfResult> {
  await ensureOffscreenDocument()

  let resp: { ok: boolean; text?: string } & ParseFailure
  try {
    resp = (await chrome.runtime.sendMessage({
      type: "parse_pdf",
      ...payload
    })) as { ok: boolean; text?: string } & ParseFailure
  } catch (e) {
    return {
      error: "offscreen_message_failed",
      message: e instanceof Error ? e.message : String(e)
    }
  }

  if (!resp || !resp.ok) {
    return {
      error: resp?.error || "unknown",
      message: resp?.message,
      status: resp?.status,
      statusText: resp?.statusText
    }
  }

  return resp.text!
}
