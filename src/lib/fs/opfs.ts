const MEMORY_ROOT = "lumino"
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

let memoryPathCache: FileSystemDirectoryHandle | null = null

export async function getMemoryPath(): Promise<FileSystemDirectoryHandle> {
  if (memoryPathCache) {
    return memoryPathCache
  }

  const root = await navigator.storage.getDirectory()
  const luminoRoot = await ensureDir(root, MEMORY_ROOT)
  memoryPathCache = await ensureDir(luminoRoot, MEMORY_DIR)
  return memoryPathCache
}

export async function readMemoryFile(filename: string): Promise<string | null> {
  try {
    const dir = await getMemoryPath()
    const fileHandle = await dir.getFileHandle(filename)
    const file = await fileHandle.getFile()
    return await file.text()
  } catch {
    return null
  }
}

export async function writeMemoryFile(
  filename: string,
  content: string
): Promise<void> {
  const dir = await getMemoryPath()
  const fileHandle = await dir.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

export async function listMemoryFiles(): Promise<string[]> {
  const dir = await getMemoryPath()
  const names: string[] = []
  for await (const [name] of (dir as any).entries()) {
    names.push(name)
  }
  return names.sort()
}

export async function deleteMemoryFile(filename: string): Promise<void> {
  const dir = await getMemoryPath()
  try {
    await dir.removeEntry(filename)
  } catch {
    // file doesn't exist, nothing to do
  }
}
