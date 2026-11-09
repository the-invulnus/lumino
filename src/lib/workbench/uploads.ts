import { getWorkspaceHandle, listWorkspaceDir } from "../fs/workspace"

export type UploadResult = { paths: string[]; failedNames: string[] }

function safeName(name: string): string {
  const cleaned = name.replace(/[\\/\u0000-\u001f\u007f]/g, "_").trim()
  return !cleaned || /^\.+$/.test(cleaned) ? "file" : cleaned
}

function availableName(name: string, used: Set<string>): string {
  const dot = name.lastIndexOf(".")
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ""
  let candidate = name
  for (let suffix = 2; used.has(candidate); suffix++) candidate = `${stem} (${suffix})${extension}`
  return candidate
}

/** Import the original bytes into OPFS; serialize uploads across extension panels. */
export async function uploadWorkspaceFiles(files: File[]): Promise<UploadResult> {
  if (!files.length) return { paths: [], failedNames: [] }
  return navigator.locks.request("lumino.workspace.uploads", async () => {
    const root = await getWorkspaceHandle()
    const directory = await root.getDirectoryHandle("uploads", { create: true })
    const used = new Set((await listWorkspaceDir("uploads")).map(entry => entry.name))
    const result: UploadResult = { paths: [], failedNames: [] }
    for (const file of files) {
      const name = availableName(safeName(file.name), used)
      used.add(name)
      let created = false
      let writable: FileSystemWritableFileStream | undefined
      try {
        const handle = await directory.getFileHandle(name, { create: true })
        created = true
        writable = await handle.createWritable()
        // File is a Blob: no text conversion or extra full-file buffer is needed.
        await writable.write(file)
        await writable.close()
        result.paths.push(`uploads/${name}`)
      } catch {
        if (writable) await writable.abort().catch(() => {})
        if (created) await directory.removeEntry(name).catch(() => {})
        result.failedNames.push(file.name)
      }
    }
    return result
  })
}
