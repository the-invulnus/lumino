import { getWorkspaceHandle, listWorkspaceDir, statWorkspaceFile } from "../fs/workspace"
import { isHiddenWorkspaceEntry } from "../fs/workspace-paths"

export const WORKSPACE_FOLDERS = [
  { path: "favorite", description: "folderFavorite" },
  { path: "uploads", description: "folderUploads" },
  { path: "downloads", description: "folderDownloads" },
  { path: "screenshots", description: "folderScreenshots" },
  { path: "notes", description: "folderNotes" },
  { path: "projects", description: "folderProjects" }
] as const

export type WorkspaceEntry = { path: string; kind: "file" | "directory"; size?: number; modifiedAt?: number; childCount?: number }
export const isFixedWorkspaceFolder = (path: string) => WORKSPACE_FOLDERS.some(folder => folder.path === path)

/** Real directories, including empty ones. Never replace an existing root file. */
export async function ensureWorkspaceFolders(): Promise<void> {
  const root = await getWorkspaceHandle()
  const files = new Set((await listWorkspaceDir()).filter(entry => entry.kind === "file").map(entry => entry.name))
  for (const folder of WORKSPACE_FOLDERS) {
    if (!files.has(folder.path)) await root.getDirectoryHandle(folder.path, { create: true })
  }
}

export async function listWorkspaceEntries(dir = "", { showHidden = true }: { showHidden?: boolean } = {}): Promise<WorkspaceEntry[]> {
  const entries = (await listWorkspaceDir(dir)).filter(entry => showHidden || !isHiddenWorkspaceEntry(dir ? `${dir}/${entry.name}` : entry.name))
  const nested = await Promise.all(entries.map(async entry => {
    const path = dir ? `${dir}/${entry.name}` : entry.name
    const item: WorkspaceEntry = { path, kind: entry.kind }
    return entry.kind === "directory" ? [item, ...await listWorkspaceEntries(path, { showHidden })] : [item]
  }))
  return nested.flat()
}

export const parentDirectory = (path: string) => path.split("/").slice(0, -1).join("/")
export const entryName = (path: string) => path.split("/").pop() || path

/** Browsing reads one level. Only an explicit search walks descendants. */
export async function browseWorkspace(dir = "", query = "", { showHidden = false }: { showHidden?: boolean } = {}): Promise<WorkspaceEntry[]> {
  const term = query.trim().toLowerCase()
  const entries: WorkspaceEntry[] = term
    ? (await listWorkspaceEntries(dir, { showHidden })).filter(entry => entry.path.slice(dir ? dir.length + 1 : 0).toLowerCase().includes(term))
    : (await listWorkspaceDir(dir)).map(entry => ({ path: dir ? `${dir}/${entry.name}` : entry.name, kind: entry.kind })).filter(entry => showHidden || !isHiddenWorkspaceEntry(entry.path))
  const result: WorkspaceEntry[] = []
  for (let start = 0; start < entries.length; start += 32) {
    result.push(...await Promise.all(entries.slice(start, start + 32).map(async entry => entry.kind === "directory"
      ? { ...entry, childCount: (await listWorkspaceDir(entry.path)).filter(child => showHidden || !isHiddenWorkspaceEntry(`${entry.path}/${child.name}`)).length }
      : { ...entry, ...await statWorkspaceFile(entry.path) })))
  }
  return result
}

/** Recover to the nearest remaining ancestor if another task removed a folder. */
export async function resolveWorkspaceDirectory(path: string): Promise<string> {
  let current = ""
  for (const name of path.split("/").filter(Boolean)) {
    if (!(await listWorkspaceDir(current)).some(entry => entry.kind === "directory" && entry.name === name)) break
    current = current ? `${current}/${name}` : name
  }
  return current
}

export type WorkspaceSort = "name" | "modified" | "type" | "size"
export function sortWorkspaceEntries(entries: WorkspaceEntry[], sort: WorkspaceSort): WorkspaceEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1
    if (a.kind === "directory") {
      const rank = (path: string) => { const index = WORKSPACE_FOLDERS.findIndex(folder => folder.path === path); return index < 0 ? WORKSPACE_FOLDERS.length : index }
      const order = rank(a.path) - rank(b.path)
      if (order) return order
    }
    const order = sort === "modified" ? (b.modifiedAt || 0) - (a.modifiedAt || 0)
      : sort === "size" ? (b.size || 0) - (a.size || 0)
      : sort === "type" ? fileExtension(a.path).localeCompare(fileExtension(b.path)) : 0
    return order || entryName(a.path).localeCompare(entryName(b.path), undefined, { numeric: true })
  })
}

export function fileExtension(path: string): string {
  const name = entryName(path), dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : ""
}
export function formatFileSize(size?: number): string {
  if (size == null) return "—"
  if (size < 1024) return `${size} B`
  const unit = Math.min(Math.floor(Math.log(size) / Math.log(1024)), 3)
  return `${(size / 1024 ** unit).toFixed(1).replace(/\.0$/, "")} ${["B", "KB", "MB", "GB"][unit]}`
}
