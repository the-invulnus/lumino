import {
  getWorkspaceHandle,
  listWorkspaceDir,
  readWorkspaceFile,
  writeWorkspaceFile,
  deleteWorkspaceFile
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
        const fileHandle = await dirHandle.getFileHandle(parts[i])
        current = fileHandle
      } else {
        current = await dirHandle.getDirectoryHandle(parts[i])
      }
    } catch {
      return null
    }
  }

  return current
}

export async function handleLs(
  args: Record<string, unknown>
): Promise<string> {
  const root = await getWorkspaceHandle()
  const path = (args.path as string) || ""

  const target = await resolvePath(root, path)
  if (!target) {
    return JSON.stringify({ error: "not_found", message: `路径不存在：${path}` })
  }

  if (target.kind === "file") {
    return JSON.stringify({ path: path || "/", entries: [(target as FileSystemFileHandle).name] })
  }

  const entries = await listWorkspaceDir(path)
  const result = entries.map((e) => e.name + (e.kind === "directory" ? "/" : ""))

  return JSON.stringify({ path: path || "/", entries: result })
}

export async function handleRead(
  args: Record<string, unknown>
): Promise<string> {
  const root = await getWorkspaceHandle()
  const path = args.path as string

  const target = await resolvePath(root, path)
  if (!target) {
    return JSON.stringify({ error: "not_found", message: `文件不存在：${path}` })
  }

  if (target.kind === "directory") {
    return JSON.stringify({ error: "is_directory", message: `${path} 是一个目录，请使用 ls。` })
  }

  const fileHandle = target as FileSystemFileHandle
  const file = await fileHandle.getFile()
  const content = await file.text()

  return JSON.stringify({ path, content })
}

export async function handleWrite(
  args: Record<string, unknown>
): Promise<string> {
  const path = args.path as string
  const content = args.content as string

  await writeWorkspaceFile(path, content)

  return JSON.stringify({
    success: true,
    path,
    message: `文件已写入：${path}`
  })
}

export async function handleGrep(
  args: Record<string, unknown>
): Promise<string> {
  const root = await getWorkspaceHandle()
  const pattern = (args.pattern as string) || ""
  const searchPath = (args.path as string) || ""

  const target = searchPath ? await resolvePath(root, searchPath) : root
  if (!target) {
    return JSON.stringify({ error: "not_found", message: `路径不存在：${searchPath}` })
  }

  const results: Array<{ file: string; line: number; content: string }> = []
  let regex: RegExp
  try {
    regex = new RegExp(pattern, "gi")
  } catch {
    return JSON.stringify({ error: "invalid_regex", message: `无效的正则表达式：${pattern}` })
  }

  async function searchDir(dirHandle: FileSystemDirectoryHandle, prefix: string) {
    for await (const [name, handle] of (dirHandle as any).entries()) {
      const fullPath = prefix ? `${prefix}/${name}` : name
      if (handle.kind === "directory") {
        await searchDir(handle as FileSystemDirectoryHandle, fullPath)
      } else {
        const fileHandle = handle as FileSystemFileHandle
        try {
          const file = await fileHandle.getFile()
          const text = await file.text()
          const lines = text.split("\n")
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              regex.lastIndex = 0
              results.push({
                file: fullPath,
                line: i + 1,
                content: lines[i].slice(0, 200)
              })
            }
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
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        regex.lastIndex = 0
        results.push({
          file: searchPath,
          line: i + 1,
          content: lines[i].slice(0, 200)
        })
      }
    }
  }

  return JSON.stringify({
    pattern,
    matches: results.length,
    results: results.slice(0, 50)
  })
}

export async function handleRm(
  args: Record<string, unknown>
): Promise<string> {
  const path = args.path as string
  await deleteWorkspaceFile(path)

  return JSON.stringify({
    success: true,
    path,
    message: `已删除：${path}`
  })
}

export async function handleExport(
  args: Record<string, unknown>
): Promise<string> {
  const path = (args.path as string) || ""

  const { exportWorkspaceFile, exportWorkspaceDir } = await import("../../fs/workspace")

  let result: { blob: Blob; filename: string } | null = null

  if (path) {
    const root = await (await import("../../fs/workspace")).getWorkspaceHandle()
    const parts = path.replace(/^\/+/, "").split("/").filter(Boolean)
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
          current = await (current as FileSystemDirectoryHandle).getDirectoryHandle(parts[i])
        }
      } catch {
        return JSON.stringify({ error: "not_found", message: `路径不存在：${path}` })
      }
    }

    if (isDir || current.kind === "directory") {
      result = await exportWorkspaceDir(path)
    } else {
      result = await exportWorkspaceFile(path)
    }
  } else {
    result = await exportWorkspaceDir()
  }

  if (!result) {
    return JSON.stringify({ error: "empty", message: "没有可导出的内容。" })
  }

  try {
    const url = URL.createObjectURL(result.blob)
    const downloadId = await new Promise<number>((resolve, reject) => {
      chrome.downloads.download(
        {
          url,
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

    setTimeout(() => URL.revokeObjectURL(url), 60000)

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
