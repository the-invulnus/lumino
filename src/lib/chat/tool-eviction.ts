import { writeWorkspaceFile, listWorkspaceDir, deleteWorkspaceFile } from "../fs/workspace"
import { TOOL_RESULTS_DIR as EVICT_DIR, LEGACY_TOOL_RESULT_DIRS } from "../fs/workspace-paths"

/** 不需要驱逐的工具列表（这些工具的结果对 Agent 上下文至关重要） */
export const TOOLS_EXCLUDED_FROM_EVICTION = new Set([
  "current_page",
  "tabs",
  "ls",
  "read_file",
  "rm",
  "write_file",
  "edit_file",
  "export"
])

/** 结果超过此字符数时触发驱逐（≈2500 tokens） */
export const TOOL_TOKEN_LIMIT_BEFORE_EVICT = 10_000

/** 驱逐文件的保留时间（毫秒），默认 1 小时 */
const EVICT_FILE_TTL_MS = 60 * 60 * 1000

/** Chrome alarm 名称，用于定时清理 */
export const EVICT_CLEANUP_ALARM = "lumino_evict_cleanup"

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
  const evictPath = `${EVICT_DIR}/${toolName}_${timestamp}_${sanitizedId}.txt`

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
    const evictPath = await evictToOpfs(content, toolCallId, toolName)
    const totalLines = content.split("\n").length

    return `[Large result evicted. Full output (${content.length} chars, ${totalLines} lines) written to ${evictPath}. Use read_file to read it.]`
  } catch {
    // 驱逐失败时回退返回原始结果，避免丢失工具调用结果
    return content
  }
}

/**
 * 从文件名中提取时间戳。
 * 文件名格式：{toolName}_{timestamp}_{sanitizedId}.txt
 */
function extractTimestamp(filename: string): number | null {
  // Tool names themselves contain underscores (e.g. get_page_content).
  const match = filename.match(/_(\d{13})_/)
  return match ? Number(match[1]) : null
}

/**
 * 清理过期的驱逐文件。
 * 清理新的隐藏目录与旧临时目录；旧引用在文件过期前仍可读取。
 * 由 chrome.alarms 定时触发调用。
 */
export async function cleanupEvictedFiles(): Promise<number> {
  let deletedCount = 0
  const cutoff = Date.now() - EVICT_FILE_TTL_MS

  for (const directory of [EVICT_DIR, ...LEGACY_TOOL_RESULT_DIRS]) {
    try {
      const entries = await listWorkspaceDir(directory)
      for (const entry of entries) {
        if (entry.kind !== "file") continue

        const ts = extractTimestamp(entry.name)
        if (ts === null || ts < cutoff) {
          // 无法解析时间戳的文件也一并清理（可能是旧格式）
          try {
            await deleteWorkspaceFile(`${directory}/${entry.name}`)
            deletedCount++
          } catch {
            // 删除失败忽略，下次清理再试
          }
        }
      }
    } catch {
      // 目录不存在或其他错误，静默处理
    }
  }

  return deletedCount
}
