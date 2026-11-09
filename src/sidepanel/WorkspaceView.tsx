import { useEffect, useRef, useState } from "react"
import DOMPurify from "dompurify"
import { marked } from "marked"
import { deleteWorkspaceFile, exportWorkspaceDir, exportWorkspaceFile, isBinaryPath, listWorkspaceDir, readWorkspaceFile, writeWorkspaceFile } from "../lib/fs/workspace"
import { isHiddenWorkspaceEntry } from "../lib/fs/workspace-paths"
import { captureCurrentPage } from "../lib/workbench/store"
import { migrateLegacySources } from "../lib/workbench/favorites"
import { browseWorkspace, ensureWorkspaceFolders, entryName, isFixedWorkspaceFolder, parentDirectory, resolveWorkspaceDirectory, sortWorkspaceEntries, WORKSPACE_FOLDERS, type WorkspaceEntry, type WorkspaceSort } from "../lib/workbench/workspace-layout"
import { useW } from "../lib/workbench/i18n"
import { BrowserIcon, FileGlyph, WorkspaceFileBrowser } from "./components/WorkspaceFileBrowser"
import { mediaKind, WorkspaceMediaPreview } from "./components/WorkspaceMediaPreview"
import { useConfirmDialog } from "./components/ConfirmDialog"

type PreviewFile = { path: string; original: string; text: string }
type Location = { path: string; query: string }

export function WorkspaceView({ visible, onAttachFile, fileRequest, onFilesDeleted }: { visible: boolean; onAttachFile: (path: string) => void; fileRequest?: { id: number; path: string }; onFilesDeleted?: (path: string, recursive: boolean) => void }) {
  const w = useW()
  const { confirm, confirming, dialog } = useConfirmDialog(visible)
  const [entries, setEntries] = useState<WorkspaceEntry[]>([])
  const [history, setHistory] = useState<{ locations: Location[]; index: number }>({ locations: [{ path: "", query: "" }], index: 0 })
  const location = history.locations[history.index]
  const directory = location.path, query = location.query
  const [mode, setMode] = useState<"grid" | "list">("grid")
  const [showHidden, setShowHidden] = useState(false)
  const [sort, setSort] = useState<WorkspaceSort>("name")
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [loadError, setLoadError] = useState("")
  const [notice, setNotice] = useState("")
  const [version, setVersion] = useState(0)
  const [file, setFile] = useState<PreviewFile | null>(null)
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState<{ entry: WorkspaceEntry; x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollPositions = useRef(new Map<string, number>())
  const setup = useRef<Promise<void> | null>(null)
  const appliedFileRequest = useRef<number>()
  const fileReadVersion = useRef(0)
  const deleting = useRef(false)
  const listKey = `${directory}\n${query}\n${showHidden}`
  const sortedEntries = sortWorkspaceEntries(entries, sort)

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setLoading(true); setLoadError(""); setEntries([])
    void (async () => {
      if (!setup.current) setup.current = ensureWorkspaceFolders().then(migrateLegacySources)
      try { await setup.current }
      catch { setup.current = null; if (!cancelled) setLoadError(w("workspaceSetupError")) }
      const actualDirectory = await resolveWorkspaceDirectory(directory)
      if (cancelled) return
      if (actualDirectory !== directory) {
        setHistory(prev => ({ ...prev, locations: prev.locations.map((item, index) => index === prev.index ? { path: actualDirectory, query: "" } : item) }))
        return
      }
      const next = await browseWorkspace(directory, query, { showHidden })
      if (!cancelled) setEntries(next)
    })().catch(() => { if (!cancelled) setLoadError(w("loadError")) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [visible, directory, query, version, showHidden])

  useEffect(() => {
    if (!visible || !fileRequest || appliedFileRequest.current === fileRequest.id || deleting.current) return
    appliedFileRequest.current = fileRequest.id
    const path = fileRequest.path.replace(/^\/+/, "")
    void (async () => {
      if (await goTo(parentDirectory(path)) && appliedFileRequest.current === fileRequest.id) {
        if (isHiddenWorkspaceEntry(path)) setShowHidden(true)
        setSelected(path); await openFile(path)
      }
    })()
  }, [visible, fileRequest, busy])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = file ? 0 : scrollPositions.current.get(listKey) || 0
  }, [file?.path, listKey, loading])

  useEffect(() => {
    if (!menu) return
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus()
    function outside(event: PointerEvent) { if (!menuRef.current?.contains(event.target as Node)) setMenu(null) }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      event.preventDefault(); setMenu(null)
      const buttons = scrollRef.current?.querySelectorAll<HTMLButtonElement>(".wb-browser-entry")
      if (buttons) [...buttons].find(button => button.dataset.path === menu!.entry.path)?.focus()
    }
    document.addEventListener("pointerdown", outside)
    document.addEventListener("keydown", escape)
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape) }
  }, [menu])

  function rememberScroll() { if (!file && scrollRef.current) scrollPositions.current.set(listKey, scrollRef.current.scrollTop) }
  async function canDiscardChanges() {
    if (!file || file.text === file.original) return true
    setMenu(null)
    return confirm({ title: w("unsavedTitle"), message: w("unsaved"), detail: file.path, confirmLabel: w("discardChanges"), cancelLabel: w("keepEditing"), destructive: true })
  }
  async function closePreview() {
    if (deleting.current) return false
    if (!await canDiscardChanges()) return false
    ++fileReadVersion.current
    setBusy(false); setFile(null); setEditing(false); setMenu(null); setNotice("")
    return true
  }
  async function goTo(path: string) {
    if (!await closePreview()) return false
    pushDirectory(path)
    return true
  }
  function pushDirectory(path: string) {
    rememberScroll(); setSelected(null); setError("")
    setHistory(prev => {
      if (prev.locations[prev.index].path === path && !prev.locations[prev.index].query) return prev
      const locations = [...prev.locations.slice(0, prev.index + 1), { path, query: "" }].slice(-50)
      return { locations, index: locations.length - 1 }
    })
  }
  async function travel(direction: -1 | 1) {
    if (file && direction === -1) { await closePreview(); return }
    if (!await closePreview()) return
    rememberScroll(); setSelected(null)
    setHistory(prev => ({ ...prev, index: Math.max(0, Math.min(prev.locations.length - 1, prev.index + direction)) }))
  }
  function changeQuery(value: string) {
    rememberScroll(); setSelected(null); setMenu(null)
    setHistory(prev => ({ ...prev, locations: prev.locations.map((item, index) => index === prev.index ? { ...item, query: value } : item) }))
  }
  async function toggleHidden() {
    rememberScroll(); setSelected(null); setMenu(null)
    if (showHidden && isHiddenWorkspaceEntry(directory)) {
      let parent = directory
      while (parent && isHiddenWorkspaceEntry(parent)) parent = parentDirectory(parent)
      if (!await goTo(parent)) return
    }
    setShowHidden(value => !value)
  }
  function openEntry(entry: WorkspaceEntry) {
    if (busy) return
    setMenu(null)
    if (entry.kind === "directory") goTo(entry.path)
    else { setSelected(entry.path); void openFile(entry.path) }
  }
  async function attachFile(path: string) {
    setMenu(null)
    if (!await canDiscardChanges()) return
    if (file && file.text !== file.original) setFile({ ...file, text: file.original })
    onAttachFile(path)
  }
  async function openFile(path: string) {
    if (deleting.current) return
    rememberScroll()
    const request = ++fileReadVersion.current
    setBusy(true); setError(""); setNotice("")
    try {
      let text: string | null
      if (isBinaryPath(path)) {
        const entries = await listWorkspaceDir(parentDirectory(path))
        text = entries.some(entry => entry.kind === "file" && entry.name === entryName(path)) ? "" : null
      } else text = await readWorkspaceFile(path)
      if (text === null) throw new Error("missing_file")
      if (request === fileReadVersion.current) { setFile({ path, text, original: text }); setEditing(false) }
    } catch { if (request === fileReadVersion.current) setError(w("fileUnavailable")) }
    finally { if (request === fileReadVersion.current) setBusy(false) }
  }
  async function act(work: () => Promise<void>) {
    setMenu(null); setBusy(true); setError(""); setNotice("")
    try { await work() } catch (err) { setError(err instanceof Error && err.message === "no_page" ? w("noTabs") : w("actionError")) }
    finally { setBusy(false) }
  }
  async function download(entry: WorkspaceEntry) {
    const result = entry.kind === "directory" ? await exportWorkspaceDir(entry.path) : await exportWorkspaceFile(entry.path)
    if (!result) throw new Error("missing_file")
    const url = URL.createObjectURL(result.blob)
    try { await chrome.downloads.download({ url, filename: result.filename, saveAs: true }) }
    finally { setTimeout(() => URL.revokeObjectURL(url), 60000) }
  }
  async function deleteEntry(entry: WorkspaceEntry) {
    const path = entry.path, recursive = entry.kind === "directory"
    setMenu(null)
    if (busy || loading || deleting.current || (recursive && isFixedWorkspaceFolder(path))) return
    const contains = (candidate: string) => candidate === path || (recursive && candidate.startsWith(path + "/"))
    const unsaved = file && contains(file.path) && file.text !== file.original ? w("deleteUnsaved") : undefined
    deleting.current = true; setBusy(true)
    try {
      if (!await confirm({ title: w(recursive ? "deleteFolder" : "deleteFile"), message: w(recursive ? "confirmFolderDelete" : "confirmFileDelete"), detail: path, warning: unsaved, confirmLabel: w("delete"), destructive: true })) return
      rememberScroll(); ++fileReadVersion.current
      setError(""); setNotice("")
      await deleteWorkspaceFile(path, { recursive })
      setEntries(prev => prev.filter(item => !contains(item.path))); setSelected(null)
      if (file && contains(file.path)) { setFile(null); setEditing(false) }
      onFilesDeleted?.(path, recursive)
      setNotice(`${w(recursive ? "folderDeleted" : "fileDeleted")}: ${path}`)
      setVersion(value => value + 1)
    } catch { setError(w("deleteFailed")) }
    finally { deleting.current = false; setBusy(false) }
  }
  function showMenu(entry: WorkspaceEntry, x: number, y: number) {
    setMenu({ entry, x: Math.max(8, Math.min(x, window.innerWidth - 190)), y: Math.max(8, Math.min(y, window.innerHeight - 212)) })
  }
  const breadcrumbDirectory = file ? parentDirectory(file.path) : directory
  const crumbs = breadcrumbDirectory.split("/").filter(Boolean)
  const previewEntry: WorkspaceEntry | null = file ? { path: file.path, kind: "file" } : null
  const canEdit = file && !isBinaryPath(file.path)
  const folderDescription = WORKSPACE_FOLDERS.find(folder => folder.path === directory)?.description

  return <div className="wb-page wb-explorer" onKeyDown={event => {
    if (busy || menu || confirming || /^(INPUT|TEXTAREA|SELECT)$/.test((event.target as HTMLElement).tagName)) return
    if (event.altKey && ["ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)) {
      event.preventDefault()
      if (event.key === "ArrowUp") goTo(file ? parentDirectory(file.path) : parentDirectory(directory))
      else travel(event.key === "ArrowLeft" ? -1 : 1)
    } else if (event.key === "Escape" && file) { event.preventDefault(); closePreview() }
  }}>
    <div className="wb-page-header">
      <div className="wb-explorer-title"><h1>{w("workspace")}</h1><div className="wb-explorer-title-actions">{!file && <button type="button" className="wb-icon-button wb-hidden-toggle" title={w(showHidden ? "hideHiddenFiles" : "showHiddenFiles")} aria-label={w("showHiddenFiles")} aria-pressed={showHidden} disabled={busy} onClick={toggleHidden}><BrowserIcon name="eye"/></button>}<button type="button" className="wb-button wb-collect-button" disabled={busy || loading} onClick={async () => {
        if (!await closePreview()) return
        void act(async () => { const source = await captureCurrentPage(); pushDirectory("favorite"); setSelected(source.path); setVersion(v => v + 1); await openFile(source.path) })
      }}><BrowserIcon name="star"/>{w("collect")}</button></div></div>
      <div className="wb-explorer-toolbar">
      <div className="wb-explorer-navigation">
        <button type="button" className="wb-icon-button" title={w("back")} aria-label={w("back")} disabled={busy || deleting.current || (!file && history.index === 0)} onClick={() => travel(-1)}><BrowserIcon name="back"/></button>
        <button type="button" className="wb-icon-button" title={w("forward")} aria-label={w("forward")} disabled={!!file || busy || history.index === history.locations.length - 1} onClick={() => travel(1)}><BrowserIcon name="forward"/></button>
        <button type="button" className="wb-icon-button" title={w("parentFolder")} aria-label={w("parentFolder")} disabled={busy || deleting.current || (!directory && !file)} onClick={() => goTo(file ? parentDirectory(file.path) : parentDirectory(directory))}><BrowserIcon name="up"/></button>
        <nav className="wb-breadcrumbs" aria-label={w("location")}><button type="button" title={w("workspace")} aria-label={w("workspace")} disabled={busy || deleting.current} onClick={() => goTo("")}><BrowserIcon name="home"/></button>{crumbs.map((part, index) => <span key={index}><span aria-hidden="true">/</span><button type="button" title={crumbs.slice(0, index + 1).join("/")} aria-current={!file && index === crumbs.length - 1 ? "location" : undefined} disabled={busy || deleting.current} onClick={() => goTo(crumbs.slice(0, index + 1).join("/"))}>{part}</button></span>)}{file && <span><span aria-hidden="true">/</span><strong title={file.path}>{entryName(file.path)}</strong></span>}</nav>
        <button type="button" className="wb-icon-button" title={w("refresh")} aria-label={w("refresh")} disabled={busy || loading || !!(file && file.text !== file.original)} onClick={() => { rememberScroll(); setError(""); setVersion(v => v + 1); if (file) void openFile(file.path) }}><BrowserIcon name="refresh"/></button>
      </div>
      {!file ? <div className="wb-explorer-controls"><div className="wb-explorer-search"><BrowserIcon name="search"/><input className="wb-search" aria-label={w("fileSearch")} placeholder={`${w("searchIn")} ${entryName(directory) || w("workspace")}`} value={query} onChange={event => changeQuery(event.target.value)}/>{query && <button type="button" className="wb-icon-button" aria-label={w("clearSearch")} onClick={() => changeQuery("")}><BrowserIcon name="close"/></button>}</div>
        <select className="wb-sort-select" aria-label={w("sortBy")} value={sort} onChange={event => setSort(event.target.value as WorkspaceSort)}><option value="name">{w("sortName")}</option><option value="modified">{w("sortModified")}</option><option value="type">{w("sortType")}</option><option value="size">{w("sortSize")}</option></select>
        <div className="wb-view-switch">{(["grid", "list"] as const).map(value => <button type="button" className="wb-icon-button" key={value} title={w(value === "grid" ? "gridView" : "listView")} aria-label={w(value === "grid" ? "gridView" : "listView")} aria-pressed={mode === value} onClick={() => setMode(value)}><BrowserIcon name={value}/></button>)}</div>
      </div> : <div className="wb-preview-actions">
        {canEdit && <button type="button" className="wb-button" disabled={busy} onClick={() => setEditing(!editing)}>{w(editing ? "preview" : "edit")}</button>}
        {editing && <button className="wb-button wb-button--primary" type="button" disabled={busy || file.text === file.original} onClick={() => void act(async () => {
          const latest = await readWorkspaceFile(file.path)
          if (latest !== file.original) { setError(w("fileChanged")); return }
          await writeWorkspaceFile(file.path, file.text); setFile({ ...file, original: file.text }); setNotice(w("saved")); setVersion(v => v + 1)
        })}>{w("save")}</button>}
        <button type="button" className="wb-button" disabled={busy} onClick={() => void act(() => download(previewEntry!))}>{w("download")}</button>
        <button type="button" className="wb-button" disabled={busy} onClick={() => void attachFile(file.path)}>{w("useSource")}</button>
        <button type="button" className="wb-icon-button" title={w("moreActions")} aria-label={w("moreActions")} disabled={busy || loading} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); showMenu(previewEntry!, rect.right, rect.bottom) }}><BrowserIcon name="more"/></button>
      </div>}
      </div>
    </div>
    <div className="wb-explorer-body">
    <div className="wb-page-scroll" ref={scrollRef} onScroll={() => { if (menu) setMenu(null) }} onClick={event => { if (event.target === event.currentTarget) setSelected(null) }}>
      {(error || loadError) && <p className="wb-error" role="alert">{error || loadError}</p>}{notice && <p className="wb-notice" role="status">{notice}</p>}
      {file ? <section className="wb-detail"><header className="wb-detail-heading"><FileGlyph path={file.path}/><div><h2>{entryName(file.path)}</h2><p className="wb-path">{file.path}</p></div></header>
        {editing ? <textarea aria-label={w("edit")} className="wb-file-editor" value={file.text} onChange={event => setFile({ ...file, text: event.target.value })} spellCheck={false}/>
          : mediaKind(file.path) ? <WorkspaceMediaPreview key={`${file.path}:${version}`} path={file.path}/> : isBinaryPath(file.path) ? <div className="wb-binary-preview"><FileGlyph path={file.path}/><p className="wb-muted">{w("binary")}</p></div>
          : /\.html?$/i.test(file.path) ? <iframe title={file.path} className="wb-html-preview" sandbox="" referrerPolicy="no-referrer" srcDoc={file.text}/>
          : /\.(md|markdown)$/i.test(file.path) ? <article className="wb-document" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(file.text, { async: false }) as string) }}/>
          : <pre className="wb-document">{file.text}</pre>}
      </section> : loading ? <p className="wb-muted">{w("loading")}</p> : <section className="wb-directory-panel" onClick={event => { if (event.target === event.currentTarget) setSelected(null) }}>
        <div className="wb-directory-caption"><span>{query.trim() ? w("searchResults") : directory ? entryName(directory) : w("allFiles")}</span><span className="wb-count">{entries.length} {w("itemsCount")}</span></div>
        {folderDescription && !query.trim() && <p className="wb-directory-description">{w(folderDescription)}</p>}
        {entries.length ? <WorkspaceFileBrowser entries={sortedEntries} mode={mode} selected={selected} searching={!!query.trim()} busy={busy} onSelect={setSelected} onOpen={openEntry} onMenu={showMenu} onDelete={entry => void deleteEntry(entry)}/> : <div className="wb-empty"><FileGlyph path={directory} folder/><h2>{w(query.trim() ? "noResults" : "folderEmpty")}</h2></div>}
      </section>}
    </div>
    </div>
    {menu && <div ref={menuRef} className="wb-file-menu" role="menu" aria-label={w("moreActions")} style={{ left: menu.x, top: menu.y }} onKeyDown={event => {
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length; buttons[next]?.focus() }
      if (event.key === "Tab") setMenu(null)
    }}>
      {!file && <button type="button" role="menuitem" onClick={() => openEntry(menu.entry)}>{w("open")}</button>}
      {menu.entry.kind === "file" && <button type="button" role="menuitem" onClick={() => void attachFile(menu.entry.path)}>{w("useSource")}</button>}
      <button type="button" role="menuitem" onClick={() => void act(() => download(menu.entry))}>{w(menu.entry.kind === "directory" ? "downloadFolder" : "download")}</button>
      {query.trim() && !file && <button type="button" role="menuitem" onClick={async () => { const entry = menu.entry; if (await goTo(parentDirectory(entry.path))) setSelected(entry.path) }}>{w("showInFolder")}</button>}
      {!(menu.entry.kind === "directory" && isFixedWorkspaceFolder(menu.entry.path)) && <button className="is-danger" type="button" role="menuitem" onClick={() => void deleteEntry(menu.entry)}>{w(menu.entry.kind === "directory" ? "deleteFolder" : "deleteFile")}</button>}
    </div>}
    {dialog}
  </div>
}
