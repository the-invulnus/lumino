const WORKSPACE_ROOT = "lumino"
const WORKSPACE_DIR = "workspace"

async function ensureDir(
  root: FileSystemDirectoryHandle,
  name: string
): Promise<FileSystemDirectoryHandle> {
  try {
    return await root.getDirectoryHandle(name, { create: true })
  } catch {
    return await root.getDirectoryHandle(name)
  }
}

let workspaceCache: FileSystemDirectoryHandle | null = null

export async function getWorkspaceHandle(): Promise<FileSystemDirectoryHandle> {
  if (workspaceCache) {
    return workspaceCache
  }

  const root = await navigator.storage.getDirectory()
  const luminoRoot = await ensureDir(root, WORKSPACE_ROOT)
  workspaceCache = await ensureDir(luminoRoot, WORKSPACE_DIR)
  return workspaceCache
}

export async function readWorkspaceFile(path: string): Promise<string | null> {
  try {
    const dir = await getWorkspaceHandle()
    const parts = path.replace(/^\/+/, "").split("/")
    const fileName = parts.pop()!
    let current = dir

    for (const part of parts) {
      current = await current.getDirectoryHandle(part)
    }

    const fileHandle = await current.getFileHandle(fileName)
    const file = await fileHandle.getFile()
    return await file.text()
  } catch {
    return null
  }
}

export async function writeWorkspaceFile(
  path: string,
  content: string
): Promise<void> {
  const dir = await getWorkspaceHandle()
  const parts = path.replace(/^\/+/, "").split("/")
  const fileName = parts.pop()!
  let current = dir

  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true })
  }

  const fileHandle = await current.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

export async function deleteWorkspaceFile(path: string): Promise<void> {
  const dir = await getWorkspaceHandle()
  const parts = path.replace(/^\/+/, "").split("/")
  const fileName = parts.pop()!
  let current = dir

  for (const part of parts) {
    try {
      current = await current.getDirectoryHandle(part)
    } catch {
      return
    }
  }

  try {
    await current.removeEntry(fileName)
  } catch {
    // file doesn't exist
  }
}

export async function listWorkspaceDir(
  dirPath: string = ""
): Promise<Array<{ name: string; kind: "file" | "directory" }>> {
  const root = await getWorkspaceHandle()

  let current = root
  if (dirPath) {
    const parts = dirPath.replace(/^\/+/, "").split("/").filter(Boolean)
    for (const part of parts) {
      try {
        current = await current.getDirectoryHandle(part)
      } catch {
        return []
      }
    }
  }

  const entries: Array<{ name: string; kind: "file" | "directory" }> = []
  for await (const [name, handle] of (current as any).entries()) {
    entries.push({ name, kind: handle.kind })
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

export async function exportWorkspaceFile(
  path: string
): Promise<{ blob: Blob; filename: string } | null> {
  const content = await readWorkspaceFile(path)
  if (content === null) return null

  const parts = path.replace(/^\/+/, "").split("/")
  const filename = parts.pop() || "export.txt"
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })

  return { blob, filename }
}

export async function exportWorkspaceDir(
  dirPath: string = ""
): Promise<{ blob: Blob; filename: string } | null> {
  const entries = await listWorkspaceDir(dirPath)
  if (entries.length === 0) return null

  const parts: string[] = []
  const baseDir = dirPath || "workspace"

  for (const entry of entries) {
    const fullPath = dirPath ? `${dirPath}/${entry.name}` : entry.name
    if (entry.kind === "directory") {
      parts.push(`${fullPath}/`)
      const subEntries = await listWorkspaceDir(fullPath)
      for (const sub of subEntries) {
        const subPath = `${fullPath}/${sub.name}`
        parts.push(sub.kind === "directory" ? `${subPath}/` : subPath)
      }
    } else {
      const content = await readWorkspaceFile(fullPath)
      if (content !== null) {
        parts.push(`--- ${fullPath} ---`)
        parts.push(content)
        parts.push("")
      }
    }
  }

  if (parts.length === 0) return null

  const text = parts.join("\n")
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const filename = `${baseDir}_${timestamp}.txt`
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" })

  return { blob, filename }
}
