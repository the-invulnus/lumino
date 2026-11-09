import { useRef, type KeyboardEvent } from "react"
import { useW } from "../../lib/workbench/i18n"
import { entryName, fileExtension, formatFileSize, parentDirectory, WORKSPACE_FOLDERS, type WorkspaceEntry } from "../../lib/workbench/workspace-layout"

function FolderMark({ name }: { name: typeof WORKSPACE_FOLDERS[number]["path"] }) {
  const marks = {
    favorite: <path d="m12 3 2.8 5.6 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.5l6.2-.9Z" fill="currentColor" fillOpacity=".18"/>,
    uploads: <path d="M12 16V4m-5 5 5-5 5 5M5 16v4h14v-4"/>,
    downloads: <path d="M12 3v12m-5-5 5 5 5-5M5 17v3h14v-3"/>,
    screenshots: <><path d="M4 7h4l2-3h4l2 3h4a1 1 0 0 1 1 1v11H3V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="4"/></>,
    notes: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    projects: <path d="m7 7-5 5 5 5m10-10 5 5-5 5M14 4l-4 16"/>
  }
  return <g className="wb-folder-mark" transform="translate(16 15)" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{marks[name]}</g>
}

export function FileGlyph({ path, folder = false }: { path: string; folder?: boolean }) {
  const extension = fileExtension(path)
  const builtin = folder ? WORKSPACE_FOLDERS.find(item => item.path === path) : undefined
  return <span className={`wb-file-glyph${folder ? " is-folder" : ""}${builtin ? ` is-folder-${builtin.path}` : ""}`} aria-hidden="true">
    {folder ? <svg viewBox="0 0 56 44" fill="none"><path d="M3 11V7a4 4 0 0 1 4-4h14l5 5h23a4 4 0 0 1 4 4v25a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" fill="currentColor" opacity=".55"/><path d="M3 16a4 4 0 0 1 4-4h42a4 4 0 0 1 4 4v21a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" fill="currentColor"/><path d="M5 17a3 3 0 0 1 3-3h40" stroke="white" strokeOpacity=".35" strokeWidth="1.5"/>{builtin && <FolderMark name={builtin.path}/>}</svg>
      : <><svg viewBox="0 0 44 52" fill="none"><path d="M8 2h18l12 12v34a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="currentColor" opacity=".09" stroke="currentColor" strokeWidth="1.4"/><path d="M26 2v10a2 2 0 0 0 2 2h10M13 22h18M13 27h13" stroke="currentColor" strokeWidth="1.4" opacity=".5"/></svg><span>{extension.slice(0, 5) || "FILE"}</span></>}
  </span>
}

export function BrowserIcon({ name }: { name: "back" | "forward" | "up" | "grid" | "list" | "more" | "refresh" | "home" | "close" | "star" | "eye" | "search" }) {
  const paths = {
    back: <path d="m14 5-7 7 7 7"/>, forward: <path d="m10 5 7 7-7 7"/>, up: <path d="m5 12 7-7 7 7M12 5v15"/>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
    list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    refresh: <path d="M20 7v5h-5M19 12a7 7 0 1 0-2 5"/>,
    home: <path d="m3 10 9-7 9 7M5 9v11h14V9M9 20v-7h6v7"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
    star: <path d="m12 3 2.8 5.6 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.5l6.2-.9Z"/>
  }
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

export function WorkspaceFileBrowser({ entries, mode, selected, searching, busy, onSelect, onOpen, onMenu, onDelete }: {
  entries: WorkspaceEntry[]; mode: "grid" | "list"; selected: string | null; searching: boolean; busy: boolean
  onSelect: (path: string | null) => void; onOpen: (entry: WorkspaceEntry) => void
  onMenu: (entry: WorkspaceEntry, x: number, y: number) => void; onDelete: (entry: WorkspaceEntry) => void
}) {
  const w = useW()
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  function keydown(event: KeyboardEvent<HTMLButtonElement>, entry: WorkspaceEntry, index: number) {
    if (event.altKey || event.metaKey || event.ctrlKey) return
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      onSelect(entry.path); onMenu(entry, rect.left + rect.width / 2, rect.bottom)
      return
    }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(entry); return }
    if (event.key === "Escape") { onSelect(null); return }
    if (event.key === "Delete") { event.preventDefault(); onDelete(entry); return }
    let next = index
    if (event.key === "Home") next = 0
    else if (event.key === "End") next = entries.length - 1
    else if (event.key === "ArrowRight") next++
    else if (event.key === "ArrowLeft") next--
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const direction = event.key === "ArrowDown" ? 1 : -1
      const row = event.currentTarget.getBoundingClientRect()
      const candidates = entries.map((item, position) => ({ position, rect: buttons.current.get(item.path)?.getBoundingClientRect() }))
        .filter(item => item.rect && (item.rect.top - row.top) * direction > 1)
        .sort((a, b) => Math.abs(a.rect!.top - row.top) - Math.abs(b.rect!.top - row.top) || Math.abs(a.rect!.left - row.left) - Math.abs(b.rect!.left - row.left))
      next = candidates[0]?.position ?? index + direction
    } else return
    event.preventDefault()
    const target = entries[Math.max(0, Math.min(next, entries.length - 1))]
    onSelect(target.path); buttons.current.get(target.path)?.focus()
  }
  return <div className={`wb-file-browser is-${mode}`} aria-label={w("allFiles")} onClick={event => { if (event.target === event.currentTarget) onSelect(null) }}>
    {mode === "list" && <div className="wb-browser-columns" aria-hidden="true"><span>{w("fileName")}</span><span>{w("fileSize")}</span><span>{w("fileModified")}</span></div>}
    {entries.map((entry, index) => {
      const folder = entry.kind === "directory"
      const fixed = folder ? WORKSPACE_FOLDERS.find(item => item.path === entry.path) : undefined
      const location = searching ? parentDirectory(entry.path) || w("workspace") : null
      return <div key={entry.path} className={`wb-browser-item${selected === entry.path ? " is-selected" : ""}`} onContextMenu={event => { event.preventDefault(); if (!busy) { onSelect(entry.path); onMenu(entry, event.clientX, event.clientY) } }}>
        <button type="button" className="wb-browser-entry" data-path={entry.path} title={fixed ? `${entry.path} — ${w(fixed.description)}` : entry.path} aria-pressed={selected === entry.path} disabled={busy}
          ref={node => { if (node) buttons.current.set(entry.path, node); else buttons.current.delete(entry.path) }}
          tabIndex={selected === entry.path || (!entries.some(item => item.path === selected) && index === 0) ? 0 : -1}
          onClick={() => onSelect(entry.path)} onDoubleClick={() => onOpen(entry)} onKeyDown={event => keydown(event, entry, index)}>
          <FileGlyph path={entry.path} folder={folder}/>
          <span className="wb-browser-label"><span className="wb-browser-name">{entryName(entry.path)}</span>{location && <span className="wb-browser-meta">{location}</span>}</span>
          {mode === "list" && <><span className="wb-browser-size">{folder ? "—" : formatFileSize(entry.size)}</span><time className="wb-browser-date" title={entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleString() : undefined}>{entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" }) : "—"}</time></>}
        </button>
      </div>
    })}
  </div>
}
