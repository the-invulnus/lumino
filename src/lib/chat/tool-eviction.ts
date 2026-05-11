import { writeWorkspaceFile } from "../fs/workspace"

/** 不需要驱逐的工具列表（这些工具的结果对 Agent 上下文至关重要） */
export const TOOLS_EXCLUDED_FROM_EVICTION = new Set([
  "memory_get",
  "memory_search",
  "current_page",
  "tabs",
  "ls",
  "rm",
  "write_file",
  "edit_file",
  "export"
])

/** 结果超过此字符数时触发驱逐（≈20000 tokens） */
export const TOOL_TOKEN_LIMIT_BEFORE_EVICT = 80_000

/**
 * 生成大工具结果的预览摘要。
 * 对纯文本：保留前 2000 字符
 * 对带行号输出（read_file/grep content）：保留前 200 行
 */
export function createContentPreview(content: string): string {
  // 检测是否为带行号的 read_file/grep content 输出
  // 每行以 6 位右对齐数字 + 两个空格开头
  const hasLineNumbers = /^\s*\d{1,6}  /.test(content)

  if (hasLineNumbers) {
    const lines = content.split("\n")
    const previewLines = lines.slice(0, 200)
    if (previewLines.length < lines.length) {
      previewLines.push("[Preview truncated: content evicted to OPFS]")
    }
    return previewLines.join("\n")
  }

  if (content.length > 2000) {
    return content.slice(0, 2000) + "\n[Preview truncated: content evicted to OPFS]"
  }

  return content
}

/**
 * 将完整内容写入 OPFS 并返回可读的路径引用。
 */
export async function evictToOpfs(
  content: string,
  toolCallId: string,
  toolName: string
): Promise<string> {
  const sanitizedId = toolCallId.replace(/[^a-zA-Z0-9_-]/g, "_")
  const timestamp = Date.now()
  const evictPath = `/large_tool_results/${toolName}_${timestamp}_${sanitizedId}.txt`

  await writeWorkspaceFile(evictPath, content)

  return evictPath
}

/**
 * 判断工具结果是否过大，若是则驱逐到 OPFS 并返回预览 + 路径引用。
 * 返回驱逐后的内容（预览或原始内容）。
 */
export async function maybeEvictToolResult(
  content: string,
  toolCallId: string,
  toolName: string
): Promise<string> {
  if (content.length <= TOOL_TOKEN_LIMIT_BEFORE_EVICT) {
    return content
  }

  if (TOOLS_EXCLUDED_FROM_EVICTION.has(toolName)) {
    return content
  }

  try {
    const preview = createContentPreview(content)
    const evictPath = await evictToOpfs(content, toolCallId, toolName)

    return [
      preview,
      "",
      `[Large result evicted. Full output (${content.length} chars) written to ${evictPath}. Use read_file to read it.]`
    ].join("\n")
  } catch {
    // 驱逐失败时回退返回原始结果，避免丢失工具调用结果
    return content
  }
}
