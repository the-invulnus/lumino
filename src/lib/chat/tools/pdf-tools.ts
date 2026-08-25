/**
 * read_pdf 工具 handler
 *
 * 用 pdf.js 在 offscreen document 中提取 PDF 文本。两种来源二选一：
 *   - path：OPFS 工作区内 PDF 路径（相对 lumino/workspace/ 根），由 SW 从 OPFS 读字节
 *   - url ：PDF 链接（http/https），由 offscreen 内 fetch
 * 都给则优先 path。
 *
 * 全量提取，大结果由 executeToolCall 的 maybeEvictToolResult 自动驱逐到 OPFS。
 */

import { readWorkspaceFileBytes } from "../../fs/workspace"
import { parsePdfViaOffscreen } from "../../offscreen-pdf-bridge"

export async function handleReadPdf(
  args: Record<string, unknown>
): Promise<string> {
  const path = args.path as string | undefined
  const url = args.url as string | undefined

  if (!path && !url) {
    return JSON.stringify({
      error: "missing_source",
      message: "需提供 path（OPFS 内 PDF 路径）或 url（PDF 链接），二选一。"
    })
  }

  try {
    let payload: { url?: string; bytes?: Uint8Array }

    if (path) {
      const bytes = await readWorkspaceFileBytes(path)
      if (!bytes) {
        return JSON.stringify({ error: "not_found", path })
      }
      payload = { bytes }
    } else {
      payload = { url: url! }
    }

    const result = await parsePdfViaOffscreen(payload)
    // 成功：result 是纯文本（带 [Page N] 分隔，保留换行），直接返回。
    // executeToolCall 会自动调 maybeEvictToolResult——大结果写到 OPFS 成 .txt，
    // agent 可用 read_file 按行续读。
    // 失败：result 是 {error,...} 对象，JSON.stringify 返回。
    if (typeof result === "string") {
      return result
    }
    return JSON.stringify(result)
  } catch (error) {
    return JSON.stringify({
      error: "read_pdf_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}
