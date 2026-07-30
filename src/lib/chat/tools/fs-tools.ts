import {
  deleteWorkspaceFile,
  exportWorkspaceDir,
  exportWorkspaceFile,
  getWorkspaceHandle,
  isBinaryPath,
  listWorkspaceDir,
  readWorkspaceFile,
  writeWorkspaceFile
} from "../../fs/workspace"

async function resolvePath(
  root: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemDirectoryHandle | FileSystemFileHandle | null> {
  if (!relativePath || relativePath === ".") {
    return root
  }

  const parts = relativePath.replace(/^\/+/, "").split("/").filter(Boolean)
  let current: FileSystemDirectoryHandle | FileSystemFileHandle = root

  for (let i = 0; i < parts.length; i++) {
    if (current.kind === "file") {
      return null
    }
    const dirHandle = current as FileSystemDirectoryHandle
    try {
      if (i === parts.length - 1) {
        // 最后一段：先尝试当文件查找，失败则当目录查找
        try {
          current = await dirHandle.getFileHandle(parts[i])
        } catch {
          current = await dirHandle.getDirectoryHandle(parts[i])
        }
      } else {
        current = await dirHandle.getDirectoryHandle(parts[i])
      }
    } catch {
      return null
    }
  }

  return current
}

// ── ls ──

export async function handleLs(args: Record<string, unknown>): Promise<string> {
  const root = await getWorkspaceHandle()
  const path = (args.path as string) || ""

  const target = await resolvePath(root, path)
  if (!target) {
    return JSON.stringify({
      error: "not_found",
      message: `路径不存在：/${path}`
    })
  }

  if (target.kind === "file") {
    return (target as FileSystemFileHandle).name
  }

  const entries = await listWorkspaceDir(path)
  if (entries.length === 0) {
    return "(empty directory)"
  }

  return entries
    .map((e) => e.name + (e.kind === "directory" ? "/" : ""))
    .join("\n")
}

// ── read_file ──

export async function handleReadFile(
  args: Record<string, unknown>
): Promise<string> {
  const filePath = (args.file_path as string) || ""

  if (!filePath) {
    return JSON.stringify({ error: "missing_file_path", message: "缺少必填参数 file_path" })
  }

  const root = await getWorkspaceHandle()
  const target = await resolvePath(root, filePath)
  if (!target) {
    return JSON.stringify({
      error: "not_found",
      message: `文件不存在：${filePath}`
    })
  }

  if (target.kind === "directory") {
    return JSON.stringify({
      error: "is_directory",
      message: `${filePath} 是一个目录，请使用 ls。`
    })
  }

  if (isBinaryPath(filePath)) {
    return JSON.stringify({
      error: "binary_file",
      message: `${filePath} 是二进制文件（图片/字体/音视频等），read_file 无法读取。`
    })
  }

  const fileHandle = target as FileSystemFileHandle
  const file = await fileHandle.getFile()
  const content = await file.text()

  const offset = (args.offset as number) ?? 0
  const limit = (args.limit as number) ?? 100

  const allLines = content.split("\n")
  const effectiveLimit = limit === 0 ? allLines.length : limit
  const endLine = Math.min(offset + effectiveLimit, allLines.length)

  const resultLines: string[] = []
  for (let i = offset; i < endLine; i++) {
    const lineNum = (i + 1).toString().padStart(6, " ")
    resultLines.push(`${lineNum}  ${allLines[i]}`)
  }

  if (endLine < allLines.length) {
    const remaining = allLines.length - endLine
    const nextOffset = endLine
    resultLines.push(
      `[Truncated: ${remaining} more lines not shown. Use offset=${nextOffset} to continue.]`
    )
  }

  return resultLines.join("\n")
}

// ── write_file ──

export async function handleWriteFile(
  args: Record<string, unknown>
): Promise<string> {
  const filePath = args.file_path as string
  const content = args.content as string

  if (!filePath) {
    return JSON.stringify({ error: "missing_file_path", message: "缺少必填参数 file_path" })
  }
  if (content === undefined || content === null) {
    return JSON.stringify({ error: "missing_content", message: "缺少必填参数 content" })
  }

  await writeWorkspaceFile(filePath, content)

  return `文件已写入：${filePath}`
}

// ── edit_file ──

export async function handleEditFile(
  args: Record<string, unknown>
): Promise<string> {
  const filePath = (args.file_path as string) || ""
  const oldString = args.old_string as string
  const newString = args.new_string as string

  if (!filePath) {
    return JSON.stringify({ error: "missing_file_path", message: "缺少必填参数 file_path" })
  }
  if (oldString === undefined || oldString === null) {
    return JSON.stringify({ error: "missing_old_string", message: "缺少必填参数 old_string" })
  }
  if (newString === undefined || newString === null) {
    return JSON.stringify({ error: "missing_new_string", message: "缺少必填参数 new_string" })
  }

  const root = await getWorkspaceHandle()
  const target = await resolvePath(root, filePath)

  if (!target) {
    return JSON.stringify({
      error: "not_found",
      message: `文件不存在：${filePath}`
    })
  }

  if (target.kind === "directory") {
    return JSON.stringify({
      error: "is_directory",
      message: `${filePath} 是一个目录。`
    })
  }

  const fileHandle = target as FileSystemFileHandle
  const file = await fileHandle.getFile()
  const content = await file.text()

  // 检查 old_string 在文件中出现的次数（唯一性校验）
  let count = 0
  let pos = content.indexOf(oldString)
  while (pos !== -1) {
    count++
    pos = content.indexOf(oldString, pos + 1)
  }

  if (count === 0) {
    return JSON.stringify({
      error: "string_not_found",
      message: `old_string 在 ${filePath} 中未找到。请检查内容是否与文件中完全一致（包括空格和换行）。`
    })
  }

  if (count > 1) {
    return JSON.stringify({
      error: "string_not_unique",
      message: `old_string 在 ${filePath} 中出现了 ${count} 次，不唯一。请提供更长的上下文使其唯一。`
    })
  }

  const newContent = content.replace(oldString, newString)
  await writeWorkspaceFile(filePath, newContent)

  return `文件已编辑：${filePath}`
}

// ── glob ──

function matchGlob(name: string, pattern: string): boolean {
  // 将 glob 模式转换为正则表达式
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // 转义特殊字符
    .replace(/\*\*/g, "___DOUBLESTAR___") // 临时替换 **
    .replace(/\*/g, "[^/]*") // * 匹配任意非 / 字符
    .replace(/___DOUBLESTAR___/g, ".*") // ** 匹配任意字符包括 /
    .replace(/\?/g, "[^/]") // ? 匹配单个非 / 字符

  try {
    const regex = new RegExp(`^${regexStr}$`)
    return regex.test(name)
  } catch {
    return false
  }
}

async function collectAllFiles(
  dirHandle: FileSystemDirectoryHandle,
  prefix: string
): Promise<string[]> {
  const results: string[] = []
  for await (const [name, handle] of (dirHandle as any).entries()) {
    const fullPath = prefix ? `${prefix}/${name}` : name
    if (handle.kind === "directory") {
      const subResults = await collectAllFiles(
        handle as FileSystemDirectoryHandle,
        fullPath
      )
      results.push(...subResults)
    } else {
      results.push(fullPath)
    }
  }
  return results
}

export async function handleGlob(
  args: Record<string, unknown>
): Promise<string> {
  const pattern = (args.pattern as string) || "*"
  const searchPath = (args.path as string) || ""

  const root = await getWorkspaceHandle()
  const target = searchPath ? await resolvePath(root, searchPath) : root

  if (!target) {
    return JSON.stringify({
      error: "not_found",
      message: `路径不存在：${searchPath || "/"}`
    })
  }

  let allFiles: string[]

  if (target.kind === "directory") {
    allFiles = await collectAllFiles(
      target as FileSystemDirectoryHandle,
      searchPath
    )
  } else {
    allFiles = [searchPath]
  }

  // 去掉 searchPath 前缀进行匹配
  const prefix = searchPath ? searchPath + "/" : ""
  const matched = allFiles.filter((f) => {
    const relative = searchPath ? f.slice(prefix.length) : f
    return matchGlob(relative, pattern)
  })

  if (matched.length === 0) {
    return "(no matches)"
  }

  if (matched.length > 500) {
    const shown = matched.slice(0, 500).join("\n")
    return `${shown}\n[Truncated: ${matched.length - 500} more matches not shown.]`
  }

  return matched.join("\n")
}

// ── grep ──

function matchGlobFilter(name: string, globPattern: string): boolean {
  if (!globPattern) return true
  return matchGlob(name, globPattern)
}

export async function handleGrep(
  args: Record<string, unknown>
): Promise<string> {
  const root = await getWorkspaceHandle()
  const pattern = (args.pattern as string) || ""
  const searchPath = (args.path as string) || ""
  const globFilter = (args.glob as string) || ""
  const outputMode = (args.output_mode as string) || "content"

  const target = searchPath ? await resolvePath(root, searchPath) : root
  if (!target) {
    return JSON.stringify({
      error: "not_found",
      message: `路径不存在：${searchPath || "/"}`
    })
  }

  // 先尝试字面量匹配，失败后再尝试正则
  let isRegex = false
  let regex: RegExp
  try {
    regex = new RegExp(pattern, "gi")
    // 如果是简单的字面量，优先用 indexOf 匹配
    isRegex = /[.*+?^${}()|[\]\\]/.test(pattern)
  } catch {
    return JSON.stringify({
      error: "invalid_regex",
      message: `无效的正则表达式：${pattern}`
    })
  }

  const perFileMatches: Map<string, string[]> = new Map()

  async function searchDir(
    dirHandle: FileSystemDirectoryHandle,
    prefix: string
  ) {
    for await (const [name, handle] of (dirHandle as any).entries()) {
      const fullPath = prefix ? `${prefix}/${name}` : name
      if (handle.kind === "directory") {
        await searchDir(handle as FileSystemDirectoryHandle, fullPath)
      } else {
        if (globFilter && !matchGlobFilter(name, globFilter)) continue

        const fileHandle = handle as FileSystemFileHandle
        try {
          const file = await fileHandle.getFile()
          const text = await file.text()
          const lines = text.split("\n")

          const matches: string[] = []
          for (let i = 0; i < lines.length; i++) {
            let matched: boolean
            if (isRegex) {
              regex.lastIndex = 0
              matched = regex.test(lines[i])
            } else {
              matched = lines[i].toLowerCase().includes(pattern.toLowerCase())
            }

            if (matched) {
              const lineNum = (i + 1).toString().padStart(6, " ")
              matches.push(`${lineNum}  ${lines[i].slice(0, 200)}`)
            }
          }

          if (matches.length > 0) {
            perFileMatches.set(fullPath, matches)
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  if (target.kind === "directory") {
    await searchDir(target as FileSystemDirectoryHandle, searchPath)
  } else {
    const fileHandle = target as FileSystemFileHandle
    const file = await fileHandle.getFile()
    const text = await file.text()
    const lines = text.split("\n")

    if (
      !globFilter ||
      matchGlobFilter(searchPath.split("/").pop() || "", globFilter)
    ) {
      const matches: string[] = []
      for (let i = 0; i < lines.length; i++) {
        let matched: boolean
        if (isRegex) {
          regex.lastIndex = 0
          matched = regex.test(lines[i])
        } else {
          matched = lines[i].toLowerCase().includes(pattern.toLowerCase())
        }

        if (matched) {
          const lineNum = (i + 1).toString().padStart(6, " ")
          matches.push(`${lineNum}  ${lines[i].slice(0, 200)}`)
        }
      }
      if (matches.length > 0) {
        perFileMatches.set(searchPath, matches)
      }
    }
  }

  const totalMatches = Array.from(perFileMatches.values()).reduce(
    (s, m) => s + m.length,
    0
  )

  if (outputMode === "files_with_matches") {
    const filePaths = Array.from(perFileMatches.keys()).sort()
    if (filePaths.length === 0) return "(no matches)"
    return filePaths.join("\n")
  }

  if (outputMode === "count") {
    const filePaths = Array.from(perFileMatches.keys()).sort()
    if (filePaths.length === 0) return "(no matches)"
    return filePaths
      .map((fp) => {
        const count = perFileMatches.get(fp)!.length
        return `${fp}: ${count} match${count !== 1 ? "es" : ""}`
      })
      .join("\n")
  }

  // content 模式
  if (perFileMatches.size === 0) return "(no matches)"

  const lines: string[] = []
  let totalShown = 0
  const MAX_SHOWN = 50

  for (const [filePath, fileMatches] of perFileMatches) {
    for (const matchLine of fileMatches.slice(0, MAX_SHOWN - totalShown)) {
      lines.push(`${filePath}:${matchLine}`)
      totalShown++
      if (totalShown >= MAX_SHOWN) break
    }
    if (totalShown >= MAX_SHOWN) break
  }

  if (totalMatches > MAX_SHOWN) {
    lines.push(
      `[Truncated: ${totalMatches - MAX_SHOWN} more matches not shown.]`
    )
  }

  return lines.join("\n")
}

// ── rm ──

export async function handleRm(args: Record<string, unknown>): Promise<string> {
  const filePath = (args.file_path as string) || ""
  if (!filePath) {
    return JSON.stringify({
      error: "missing_path",
      message: "请提供要删除的文件路径"
    })
  }
  await deleteWorkspaceFile(filePath)

  return `已删除：${filePath}`
}

// ── export ──

export async function handleExport(
  args: Record<string, unknown>
): Promise<string> {
  const filePath = (args.file_path as string) || ""

  let result: { blob: Blob; filename: string } | null = null

  if (filePath) {
    const root = await getWorkspaceHandle()
    const parts = filePath.replace(/^\/+/, "").split("/").filter(Boolean)
    let current: FileSystemDirectoryHandle | FileSystemFileHandle = root
    let isDir = false

    for (let i = 0; i < parts.length; i++) {
      try {
        if (i === parts.length - 1) {
          const dirHandle = current as FileSystemDirectoryHandle
          try {
            current = await dirHandle.getFileHandle(parts[i])
          } catch {
            current = await dirHandle.getDirectoryHandle(parts[i])
            isDir = true
          }
        } else {
          current = await (
            current as FileSystemDirectoryHandle
          ).getDirectoryHandle(parts[i])
        }
      } catch {
        return JSON.stringify({
          error: "not_found",
          message: `路径不存在：${filePath}`
        })
      }
    }

    if (isDir || current.kind === "directory") {
      result = await exportWorkspaceDir(filePath)
    } else {
      result = await exportWorkspaceFile(filePath)
    }
  } else {
    result = await exportWorkspaceDir()
  }

  if (!result) {
    return JSON.stringify({ error: "empty", message: "没有可导出的内容。" })
  }

  try {
    // Service Worker 中没有 URL.createObjectURL，通过 FileReader 转 base64 data URL
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error("Failed to read blob"))
      reader.readAsDataURL(result!.blob)
    })

    const downloadId = await new Promise<number>((resolve, reject) => {
      chrome.downloads.download(
        {
          url: dataUrl,
          filename: result!.filename,
          saveAs: true
        },
        (id) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
          } else {
            resolve(id)
          }
        }
      )
    })

    return JSON.stringify({
      success: true,
      downloadId,
      filename: result.filename,
      message: `文件已触发下载：${result.filename}`
    })
  } catch (error) {
    return JSON.stringify({
      error: "download_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}
