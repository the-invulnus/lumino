// ============================================================
// OPFS 文件系统工具 — 通用的 Lumino 目录读写
// ============================================================

const LUMINO_ROOT = "lumino"
const MEMORY_DIR = "memory"

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

let luminoRootCache: FileSystemDirectoryHandle | null = null

/**
 * 获取 lumino 根目录 handle。
 */
export async function getLuminoDir(): Promise<FileSystemDirectoryHandle> {
  if (luminoRootCache) {
    return luminoRootCache
  }

  const root = await navigator.storage.getDirectory()
  luminoRootCache = await ensureDir(root, LUMINO_ROOT)
  return luminoRootCache
}

let memoryPathCache: FileSystemDirectoryHandle | null = null

/**
 * 获取 /lumino/memory 目录 handle（旧接口，兼容）。
 */
export async function getMemoryPath(): Promise<FileSystemDirectoryHandle> {
  if (memoryPathCache) {
    return memoryPathCache
  }

  const luminoRoot = await getLuminoDir()
  memoryPathCache = await ensureDir(luminoRoot, MEMORY_DIR)
  return memoryPathCache
}

/**
 * 从指定目录读取文件内容。
 * 返回 null 如果文件不存在。
 */
export async function readFile(
  dir: FileSystemDirectoryHandle,
  filename: string
): Promise<string | null> {
  try {
    const fileHandle = await dir.getFileHandle(filename)
    const file = await fileHandle.getFile()
    return await file.text()
  } catch {
    return null
  }
}

/**
 * 从默认 memory 目录读取文件内容（旧接口，兼容）。
 */
export async function readMemoryFile(filename: string): Promise<string | null> {
  const dir = await getMemoryPath()
  return readFile(dir, filename)
}

/**
 * 向指定目录写入文件内容。
 */
export async function writeFile(
  dir: FileSystemDirectoryHandle,
  filename: string,
  content: string
): Promise<void> {
  const fileHandle = await dir.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

/**
 * 向默认 memory 目录写入文件（旧接口，兼容）。
 */
export async function writeMemoryFile(
  filename: string,
  content: string
): Promise<void> {
  const dir = await getMemoryPath()
  return writeFile(dir, filename, content)
}

/**
 * 列出目录中所有文件名。
 */
export async function listFiles(
  dir: FileSystemDirectoryHandle
): Promise<string[]> {
  const names: string[] = []
  for await (const [name] of (dir as any).entries()) {
    names.push(name)
  }
  return names.sort()
}

/**
 * 列出默认 memory 目录文件（旧接口，兼容）。
 */
export async function listMemoryFiles(): Promise<string[]> {
  const dir = await getMemoryPath()
  return listFiles(dir)
}

/**
 * 从指定目录删除文件。
 */
export async function deleteFile(
  dir: FileSystemDirectoryHandle,
  filename: string
): Promise<void> {
  try {
    await dir.removeEntry(filename)
  } catch {
    // file doesn't exist, nothing to do
  }
}

/**
 * 从默认 memory 目录删除文件（旧接口，兼容）。
 */
export async function deleteMemoryFile(filename: string): Promise<void> {
  const dir = await getMemoryPath()
  return deleteFile(dir, filename)
}
