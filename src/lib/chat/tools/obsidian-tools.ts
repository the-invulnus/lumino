import { getObsidianSettings, isObsidianConfigured } from "../../settings"

// ── 辅助函数 ──

async function obsidianFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const settings = await getObsidianSettings()
  if (!isObsidianConfigured(settings)) {
    throw new Error("obsidian_not_configured")
  }

  const baseUrl = settings.baseUrl.replace(/\/+$/, "")
  const url = `${baseUrl}${path}`

  // 构建 headers：Authorization 必带，Content-Type 仅在有 body 时设置
  const requestHeaders: Record<string, string> = {
    "Authorization": `Bearer ${settings.apiKey}`
  }

  // 合并调用方传入的自定义 headers
  const customHeaders = options.headers as Record<string, string> | undefined
  if (customHeaders) {
    Object.assign(requestHeaders, customHeaders)
  }

  // 仅当有 body 且未显式设置 Content-Type 时，默认 text/plain
  if (options.body) {
    requestHeaders["Content-Type"] = customHeaders?.["Content-Type"] || "text/plain"
  }

  return fetch(url, {
    ...options,
    headers: requestHeaders
  })
}

// ── obsidian_list ──
// 列出 vault 中的文件和目录

export async function handleObsidianList(
  args: Record<string, unknown>
): Promise<string> {
  const dirPath = (args.path as string) || ""

  try {
    const res = await obsidianFetch(`/vault/${dirPath}`)
    const data = await res.json()
    return JSON.stringify(data, null, 2)
  } catch (error) {
    if (error instanceof Error && error.message === "obsidian_not_configured") {
      return JSON.stringify({ error: "obsidian_not_configured", message: "请在扩展设置中启用并配置 Obsidian API" })
    }
    return JSON.stringify({ error: "obsidian_list_failed", message: error instanceof Error ? error.message : String(error) })
  }
}

// ── obsidian_read ──
// 读取笔记内容

export async function handleObsidianRead(
  args: Record<string, unknown>
): Promise<string> {
  const filePath = args.path as string | undefined
  if (!filePath) {
    return JSON.stringify({ error: "no_path", message: "请提供文件路径" })
  }

  try {
    const res = await obsidianFetch(`/vault/${filePath}`)
    const text = await res.text()
    return text
  } catch (error) {
    if (error instanceof Error && error.message === "obsidian_not_configured") {
      return JSON.stringify({ error: "obsidian_not_configured" })
    }
    return JSON.stringify({ error: "obsidian_read_failed", message: error instanceof Error ? error.message : String(error) })
  }
}

// ── obsidian_write ──
// 创建或覆写笔记

export async function handleObsidianWrite(
  args: Record<string, unknown>
): Promise<string> {
  const filePath = args.path as string | undefined
  const content = args.content as string | undefined

  if (!filePath) return JSON.stringify({ error: "no_path", message: "请提供文件路径" })
  if (content === undefined) return JSON.stringify({ error: "no_content", message: "请提供笔记内容" })

  try {
    const res = await obsidianFetch(`/vault/${filePath}`, {
      method: "PUT",
      body: content
    })

    if (!res.ok) {
      const body = await res.text()
      return JSON.stringify({ error: "obsidian_write_failed", status: res.status, body })
    }

    return JSON.stringify({ success: true, path: filePath, content_length: content.length })
  } catch (error) {
    if (error instanceof Error && error.message === "obsidian_not_configured") {
      return JSON.stringify({ error: "obsidian_not_configured" })
    }
    return JSON.stringify({ error: "obsidian_write_failed", message: error instanceof Error ? error.message : String(error) })
  }
}

// ── obsidian_append ──
// 向笔记末尾追加内容

export async function handleObsidianAppend(
  args: Record<string, unknown>
): Promise<string> {
  const filePath = args.path as string | undefined
  const content = args.content as string | undefined

  if (!filePath) return JSON.stringify({ error: "no_path" })
  if (!content) return JSON.stringify({ error: "no_content" })

  try {
    const res = await obsidianFetch(`/vault/${filePath}`, {
      method: "POST",
      body: content
    })

    if (!res.ok) {
      const body = await res.text()
      return JSON.stringify({ error: "obsidian_append_failed", status: res.status, body })
    }

    return JSON.stringify({ success: true, path: filePath })
  } catch (error) {
    if (error instanceof Error && error.message === "obsidian_not_configured") {
      return JSON.stringify({ error: "obsidian_not_configured" })
    }
    return JSON.stringify({ error: "obsidian_append_failed", message: error instanceof Error ? error.message : String(error) })
  }
}

// ── obsidian_patch ──
// 精确定位修改（heading、frontmatter、block）

export async function handleObsidianPatch(
  args: Record<string, unknown>
): Promise<string> {
  const filePath = args.path as string | undefined
  const targetType = args.target_type as string | undefined // "heading" | "frontmatter" | "block"
  const target = args.target as string | undefined
  const operation = args.operation as string | undefined // "append" | "prepend" | "replace"
  const content = args.content as string | undefined

  if (!filePath) return JSON.stringify({ error: "no_path" })
  if (!targetType || !target || !operation) {
    return JSON.stringify({ error: "missing_params", message: "需要 target_type, target, operation" })
  }
  if (content === undefined) {
    return JSON.stringify({ error: "no_content" })
  }

  try {
    const res = await obsidianFetch(`/vault/${filePath}`, {
      method: "PATCH",
      headers: {
        "Operation": operation,
        "Target-Type": targetType,
        "Target": target,
        "Content-Type": "text/plain"
      } as Record<string, string>,
      body: content
    })

    if (!res.ok) {
      const body = await res.text()
      return JSON.stringify({ error: "obsidian_patch_failed", status: res.status, body })
    }

    return JSON.stringify({ success: true, path: filePath, target_type: targetType, target, operation })
  } catch (error) {
    if (error instanceof Error && error.message === "obsidian_not_configured") {
      return JSON.stringify({ error: "obsidian_not_configured" })
    }
    return JSON.stringify({ error: "obsidian_patch_failed", message: error instanceof Error ? error.message : String(error) })
  }
}

// ── obsidian_search ──
// 全文搜索

export async function handleObsidianSearch(
  args: Record<string, unknown>
): Promise<string> {
  const query = args.query as string | undefined
  if (!query) return JSON.stringify({ error: "no_query", message: "请提供搜索关键词" })

  try {
    const res = await obsidianFetch(`/search/simple/?query=${encodeURIComponent(query)}`, {
      method: "POST"
    })

    const data = await res.json()
    return JSON.stringify(data, null, 2)
  } catch (error) {
    if (error instanceof Error && error.message === "obsidian_not_configured") {
      return JSON.stringify({ error: "obsidian_not_configured" })
    }
    return JSON.stringify({ error: "obsidian_search_failed", message: error instanceof Error ? error.message : String(error) })
  }
}

// ── obsidian_open ──
// 在 Obsidian UI 中打开文件

export async function handleObsidianOpen(
  args: Record<string, unknown>
): Promise<string> {
  const filePath = args.path as string | undefined
  if (!filePath) return JSON.stringify({ error: "no_path" })

  try {
    const res = await obsidianFetch(`/open/${filePath}`, {
      method: "POST"
    })

    if (!res.ok) {
      return JSON.stringify({ error: "obsidian_open_failed", status: res.status })
    }

    return JSON.stringify({ success: true, path: filePath })
  } catch (error) {
    if (error instanceof Error && error.message === "obsidian_not_configured") {
      return JSON.stringify({ error: "obsidian_not_configured" })
    }
    return JSON.stringify({ error: "obsidian_open_failed", message: error instanceof Error ? error.message : String(error) })
  }
}
