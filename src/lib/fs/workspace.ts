import JSZip from "jszip"

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

/** 以二进制读取文件（用于图片等非文本资源） */
export async function readWorkspaceFileBytes(
  path: string
): Promise<Uint8Array | null> {
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
    const buf = await file.arrayBuffer()
    return new Uint8Array(buf)
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

/** 以二进制写入文件（用于图片等非文本资源） */
export async function writeWorkspaceFileBytes(
  path: string,
  bytes: Uint8Array
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
  await writable.write(bytes)
  await writable.close()
}

/** 判断路径是否为二进制资源（按扩展名） */
export function isBinaryPath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase()
  return [
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "ico",
    "bmp",
    "woff",
    "woff2",
    "ttf",
    "otf",
    "eot",
    "mp3",
    "wav",
    "mp4",
    "webm",
    "ogg",
    "pdf",
    "zip",
    "gz",
    "tar",
    "wasm"
  ].includes(ext || "")
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

function mimeTypeForFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase()
  const map: Record<string, string> = {
    js: "application/javascript",
    mjs: "application/javascript",
    ts: "application/typescript",
    tsx: "application/typescript",
    jsx: "application/javascript",
    json: "application/json",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    ico: "image/x-icon",
    pdf: "application/pdf",
    xml: "application/xml",
    md: "text/markdown",
    yaml: "text/yaml",
    yml: "text/yaml",
    toml: "text/plain",
    csv: "text/csv",
    sh: "text/x-shellscript",
    bash: "text/x-shellscript",
    zsh: "text/x-shellscript",
    py: "text/x-python",
    rb: "text/x-ruby",
    rs: "text/x-rust",
    go: "text/x-go",
    java: "text/x-java",
    c: "text/x-c",
    h: "text/x-c",
    cpp: "text/x-c++",
    hpp: "text/x-c++",
    sql: "application/sql",
    wasm: "application/wasm",
    zip: "application/zip",
    gz: "application/gzip",
    tar: "application/x-tar",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    webm: "video/webm",
    woff2: "font/woff2",
    woff: "font/woff",
    ttf: "font/ttf",
    txt: "text/plain",
    log: "text/plain"
  }
  return map[ext || ""] || "application/octet-stream"
}

export async function exportWorkspaceFile(
  path: string
): Promise<{ blob: Blob; filename: string } | null> {
  const parts = path.replace(/^\/+/, "").split("/")
  const filename = parts.pop() || "export.txt"
  const mimeType = mimeTypeForFilename(filename)

  // 二进制资源按 bytes 读写，避免文本编码损坏
  if (isBinaryPath(path)) {
    const bytes = await readWorkspaceFileBytes(path)
    if (bytes === null) return null
    const blob = new Blob([bytes], { type: mimeType })
    return { blob, filename }
  }

  const content = await readWorkspaceFile(path)
  if (content === null) return null
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })

  return { blob, filename }
}

export async function exportWorkspaceDir(
  dirPath: string = ""
): Promise<{ blob: Blob; filename: string } | null> {
  const entries = await listWorkspaceDir(dirPath)
  if (entries.length === 0) return null

  const baseDir = dirPath.replace(/^\/+/, "") || "workspace"
  const zip = new JSZip()

  async function addToZip(zipDir: JSZip, localPath: string) {
    const dirEntries = await listWorkspaceDir(localPath)
    for (const entry of dirEntries) {
      const fullPath = localPath ? `${localPath}/${entry.name}` : entry.name
      if (entry.kind === "directory") {
        const subDir = zipDir.folder(entry.name)!
        await addToZip(subDir, fullPath)
      } else if (isBinaryPath(fullPath)) {
        const bytes = await readWorkspaceFileBytes(fullPath)
        if (bytes !== null) {
          zipDir.file(entry.name, bytes)
        }
      } else {
        const content = await readWorkspaceFile(fullPath)
        if (content !== null) {
          zipDir.file(entry.name, content)
        }
      }
    }
  }

  await addToZip(zip, dirPath)

  const zipBlob = await zip.generateAsync({ type: "blob" })
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const filename = `${baseDir}_${timestamp}.zip`

  return { blob: zipBlob, filename }
}
