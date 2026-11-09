// @vitest-environment jsdom
import { act } from "react-dom/test-utils"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { WorkspaceView } from "./WorkspaceView"
import { captureCurrentPage } from "../lib/workbench/store"
import { browseWorkspace, ensureWorkspaceFolders, resolveWorkspaceDirectory, parentDirectory, WORKSPACE_FOLDERS, type WorkspaceEntry } from "../lib/workbench/workspace-layout"
import { migrateLegacySources } from "../lib/workbench/favorites"
import { deleteWorkspaceFile, isBinaryPath, listWorkspaceDir, readWorkspaceFile, writeWorkspaceFile } from "../lib/fs/workspace"
import { isHiddenWorkspaceEntry } from "../lib/fs/workspace-paths"
import { installDialogMock } from "../test-support/dialog"
vi.mock("../lib/i18n", () => ({ useT: () => (key: string) => key }))
vi.mock("../lib/workbench/i18n", () => ({ useW: () => (key: string) => key }))
vi.mock("../lib/workbench/store", () => ({ captureCurrentPage: vi.fn() }))
vi.mock("../lib/workbench/favorites", () => ({ migrateLegacySources: vi.fn() }))
vi.mock("../lib/workbench/workspace-layout", async importOriginal => ({ ...await importOriginal<typeof import("../lib/workbench/workspace-layout")>(), browseWorkspace: vi.fn(), resolveWorkspaceDirectory: vi.fn(), ensureWorkspaceFolders: vi.fn() }))
vi.mock("../lib/fs/workspace", () => ({ deleteWorkspaceFile: vi.fn(), readWorkspaceFile: vi.fn(), writeWorkspaceFile: vi.fn(), isBinaryPath: vi.fn(), listWorkspaceDir: vi.fn(), exportWorkspaceFile: vi.fn(), exportWorkspaceDir: vi.fn() }))
let host: HTMLDivElement, root: Root, allEntries: WorkspaceEntry[], restoreDialog: () => void
const onAttachFile = vi.fn(), onFilesDeleted = vi.fn()
function mockFiles(paths: string[]) {
  const folders = new Set<string>(WORKSPACE_FOLDERS.map(folder => folder.path))
  for (const path of paths) {
    const parts = path.split("/")
    for (let index = 1; index < parts.length; index++) folders.add(parts.slice(0, index).join("/"))
  }
  allEntries = [
    ...[...folders].map(path => ({ path, kind: "directory" as const, childCount: paths.filter(file => parentDirectory(file) === path).length })),
    ...paths.map((path, index) => ({ path, kind: "file" as const, size: (index + 1) * 1024, modifiedAt: 1735689600000 + index * 86400000 }))
  ]
}
function button(label: string) { return [...host.querySelectorAll<HTMLButtonElement>("button")].find(item => item.getAttribute("aria-label") === label || item.textContent === label)! }
function entryButton(path: string) { return [...host.querySelectorAll<HTMLButtonElement>(".wb-browser-entry")].find(item => item.dataset.path === path)! }
async function click(label: string) { await act(async () => button(label).click()) }
async function openEntry(path: string) { await act(async () => entryButton(path).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))) }
async function search(value: string) {
  await act(async () => {
    const input = host.querySelector<HTMLInputElement>(".wb-search")!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
async function menu(path: string) { await act(async () => entryButton(path).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 80, clientY: 100 }))) }
function edit(value: string) {
  act(() => {
    const textarea = host.querySelector("textarea")!
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value)
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
beforeEach(() => {
  vi.resetAllMocks()
  restoreDialog = installDialogMock()
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  vi.mocked(migrateLegacySources).mockResolvedValue(undefined)
  vi.mocked(ensureWorkspaceFolders).mockResolvedValue(undefined)
  vi.mocked(resolveWorkspaceDirectory).mockImplementation(async path => path)
  vi.mocked(browseWorkspace).mockImplementation(async (dir = "", query = "", { showHidden = false } = {}) => allEntries.filter(entry => showHidden || !isHiddenWorkspaceEntry(entry.path)).filter(entry => query.trim()
    ? (!dir || entry.path.startsWith(dir + "/")) && entry.path.slice(dir ? dir.length + 1 : 0).toLowerCase().includes(query.toLowerCase())
    : parentDirectory(entry.path) === dir))
  mockFiles(["notes/report.md"])
  vi.mocked(readWorkspaceFile).mockResolvedValue("# Original")
  vi.mocked(isBinaryPath).mockReturnValue(false)
  vi.mocked(listWorkspaceDir).mockResolvedValue([])
  vi.mocked(writeWorkspaceFile).mockResolvedValue(undefined)
  vi.mocked(deleteWorkspaceFile).mockResolvedValue(undefined)
  host = document.createElement("div"); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); restoreDialog(); vi.restoreAllMocks() })
async function render(fileRequest?: { id: number; path: string }) {
  await act(async () => root.render(<WorkspaceView visible onAttachFile={onAttachFile} onFilesDeleted={onFilesDeleted} fileRequest={fileRequest}/>))
}
async function openFile() { await render(); await openEntry("notes"); await openEntry("notes/report.md") }

it("browses one directory at a time, with single-click selection and double-click opening", async () => {
  mockFiles(["README.md", "notes/2026/report.md"])
  await render()
  expect([...host.querySelectorAll<HTMLButtonElement>(".wb-browser-entry")].map(item => item.dataset.path)).toEqual(["favorite", "uploads", "downloads", "screenshots", "notes", "projects", "README.md"])
  act(() => entryButton("notes").click())
  expect(entryButton("notes").getAttribute("aria-pressed")).toBe("true")
  expect(entryButton("notes/2026")).toBeUndefined()
  await openEntry("notes")
  expect(entryButton("notes/2026")).toBeDefined()
  expect(entryButton("notes/2026/report.md")).toBeUndefined()
  expect(entryButton("uploads")).toBeUndefined()
  await openEntry("notes/2026")
  expect(entryButton("notes/2026/report.md")).toBeDefined()
  await act(async () => host.querySelector<HTMLButtonElement>('.wb-breadcrumbs button[title="notes"]')!.click())
  expect(entryButton("notes/2026")).toBeDefined()
})

it("supports directory history, forward navigation, up and home", async () => {
  mockFiles(["notes/2026/report.md"])
  await render(); await openEntry("notes"); await openEntry("notes/2026")
  await click("back")
  expect(entryButton("notes/2026")).toBeDefined()
  await click("forward")
  expect(entryButton("notes/2026/report.md")).toBeDefined()
  await click("parentFolder")
  expect(entryButton("notes/2026")).toBeDefined()
  await click("workspace")
  expect(entryButton("notes")).toBeDefined()
})

it("shows hidden files on request and returns to a visible parent when hiding the current directory", async () => {
  mockFiles([".larget_tool_result/tool.txt", "large_tool_results/old.txt", "projects/readme.md"])
  await render()
  expect(entryButton(".larget_tool_result")).toBeUndefined()
  expect(entryButton("large_tool_results")).toBeUndefined()
  expect(entryButton("screenshots")).toBeDefined()
  await click("showHiddenFiles")
  expect(button("showHiddenFiles").getAttribute("aria-pressed")).toBe("true")
  expect(entryButton(".larget_tool_result")).toBeDefined()
  await openEntry(".larget_tool_result")
  expect(entryButton(".larget_tool_result/tool.txt")).toBeDefined()
  await click("showHiddenFiles")
  expect(entryButton(".larget_tool_result")).toBeUndefined()
  expect(entryButton("projects")).toBeDefined()
  expect(button("showHiddenFiles").getAttribute("aria-pressed")).toBe("false")
})

it("still opens explicitly referenced hidden files and makes their parent browsable", async () => {
  mockFiles([".larget_tool_result/tool.txt"])
  await render({ id: 1, path: ".larget_tool_result/tool.txt" })
  expect(host.querySelector(".wb-path")?.textContent).toBe(".larget_tool_result/tool.txt")
  await click("back")
  expect(entryButton(".larget_tool_result/tool.txt")).toBeDefined()
  expect(button("showHiddenFiles").getAttribute("aria-pressed")).toBe("true")
})

it("returns from a preview to the same selection, query and scroll position", async () => {
  await render(); await openEntry("notes"); await search("report")
  host.querySelector<HTMLDivElement>(".wb-page-scroll")!.scrollTop = 180
  await openEntry("notes/report.md")
  expect(host.querySelector("article h1")?.textContent).toBe("Original")
  await click("useSource")
  expect(onAttachFile).toHaveBeenCalledWith("notes/report.md")
  await click("back")
  expect(host.querySelector<HTMLInputElement>(".wb-search")?.value).toBe("report")
  expect(entryButton("notes/report.md").getAttribute("aria-pressed")).toBe("true")
  expect(host.querySelector(".wb-page-scroll")!.scrollTop).toBe(180)
})

it("switches to a metadata list, sorts files and opens with the keyboard", async () => {
  mockFiles(["notes/report2.md", "notes/report10.md"])
  await render(); await openEntry("notes"); await click("listView")
  expect(host.querySelector(".wb-file-browser.is-list")).not.toBeNull()
  expect(host.querySelector(".wb-browser-size")?.textContent).toBe("1 KB")
  await act(async () => {
    const select = host.querySelector("select")!; select.value = "modified"; select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  expect(host.querySelector<HTMLButtonElement>(".wb-browser-entry")?.dataset.path).toBe("notes/report10.md")
  await act(async () => entryButton("notes/report10.md").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })))
  expect(entryButton("notes/report2.md").getAttribute("aria-pressed")).toBe("true")
  await act(async () => entryButton("notes/report2.md").dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })))
  expect(readWorkspaceFile).toHaveBeenLastCalledWith("notes/report2.md")
})

it("searches descendants of the current directory and can reveal the containing folder", async () => {
  mockFiles(["notes/deep/report.md", "uploads/report.pdf"])
  await render(); await openEntry("notes"); await search("REPORT")
  expect(entryButton("notes/deep/report.md")).toBeDefined()
  expect(entryButton("uploads/report.pdf")).toBeUndefined()
  expect(entryButton("notes/deep/report.md").textContent).toContain("notes/deep")
  await menu("notes/deep/report.md"); await click("showInFolder")
  expect(host.querySelector<HTMLInputElement>(".wb-search")?.value).toBe("")
  expect(entryButton("notes/deep/report.md").getAttribute("aria-pressed")).toBe("true")
  await search("missing")
  expect(host.querySelector(".wb-empty")?.textContent).toContain("noResults")
  await click("clearSearch")
  expect(entryButton("notes/deep/report.md")).toBeDefined()
})

it("dismisses the context menu outside or with Escape and protects fixed root folders", async () => {
  await render(); await menu("favorite")
  expect(host.querySelector('[role="menu"]')).not.toBeNull()
  expect(button("deleteFolder")).toBeUndefined()
  act(() => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })))
  expect(host.querySelector('[role="menu"]')).toBeNull()
  await menu("notes")
  act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
  expect(host.querySelector('[role="menu"]')).toBeNull()
  await openEntry("uploads")
  expect(host.querySelector(".wb-empty")?.textContent).toContain("folderEmpty")
})

it("refuses to overwrite newer file contents and confirms unsaved changes once on navigation", async () => {
  await openFile(); await click("edit"); edit("# Updated")
  vi.mocked(readWorkspaceFile).mockResolvedValue("# Changed by agent")
  await click("save")
  expect(writeWorkspaceFile).not.toHaveBeenCalled()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("fileChanged")
  await click("workspace")
  expect(host.querySelector("textarea")?.value).toBe("# Updated")
  expect(host.querySelectorAll("dialog[open]")).toHaveLength(1)
  expect(host.querySelector(".wb-confirm-detail")?.textContent).toBe("notes/report.md")
  await click("keepEditing")
  vi.mocked(readWorkspaceFile).mockResolvedValue("# Original")
  await click("save")
  expect(writeWorkspaceFile).toHaveBeenCalledWith("notes/report.md", "# Updated")
  await click("back")
  expect(host.querySelector("dialog")).toBeNull()
})

it("opens external file references in their parent folder and honors only the newest read", async () => {
  let finish!: (value: string) => void
  vi.mocked(readWorkspaceFile).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await render({ id: 1, path: "notes/old.md" })
  vi.mocked(readWorkspaceFile).mockResolvedValue("# Latest")
  await render({ id: 2, path: "notes/report.md" })
  await act(async () => finish("# Old"))
  expect(host.querySelector("article h1")?.textContent).toBe("Latest")
  expect(host.querySelector(".wb-path")?.textContent).toBe("notes/report.md")
  await click("back")
  expect(entryButton("notes/report.md")).toBeDefined()
  await render({ id: 3, path: "notes/report.md" })
  expect(host.querySelector("article h1")?.textContent).toBe("Latest")
})

it("discards edits only after an in-app decision before handing a file to the assistant or navigating", async () => {
  await openFile(); await click("edit"); edit("Unsaved edits")
  await click("useSource")
  expect(onAttachFile).not.toHaveBeenCalled()
  await click("keepEditing")
  expect(host.querySelector("textarea")?.value).toBe("Unsaved edits")
  await click("useSource"); await click("discardChanges")
  expect(onAttachFile).toHaveBeenCalledExactlyOnceWith("notes/report.md")
  expect(host.querySelector("textarea")?.value).toBe("# Original")
  edit("More changes")
  await click("workspace")
  expect(host.querySelector(".wb-detail")).not.toBeNull()
  await click("discardChanges")
  expect(host.querySelector(".wb-detail")).toBeNull()
  expect(entryButton("notes")).toBeDefined()
})

it("reports missing text and binary references without creating an empty preview", async () => {
  vi.mocked(readWorkspaceFile).mockResolvedValue(null)
  await render({ id: 1, path: "missing.md" })
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("fileUnavailable")
  expect(host.querySelector(".wb-detail")).toBeNull()
  vi.mocked(isBinaryPath).mockReturnValue(true)
  await render({ id: 2, path: "uploads/missing.pdf" })
  expect(listWorkspaceDir).toHaveBeenCalledWith("uploads")
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("fileUnavailable")
  expect(host.querySelector(".wb-detail")).toBeNull()
})

it("opens a newly collected page in favorite and attaches it as a file", async () => {
  await render()
  vi.mocked(captureCurrentPage).mockResolvedValue({ id: "saved", title: "Article", text: "Excerpt", url: "https://example.com", kind: "page", createdAt: 1, path: "favorite/Article.md" })
  vi.mocked(readWorkspaceFile).mockResolvedValue("# Article\n\nExcerpt")
  mockFiles(["favorite/Article.md"])
  await click("collect")
  expect(host.querySelector("article h1")?.textContent).toBe("Article")
  await click("useSource")
  expect(onAttachFile).toHaveBeenCalledWith("favorite/Article.md")
  await click("back")
  expect(entryButton("favorite/Article.md")).toBeDefined()
})

it("keeps files available after migration errors and recovers to an existing parent after a directory disappears", async () => {
  vi.mocked(migrateLegacySources).mockRejectedValueOnce(new Error("Storage unavailable"))
  await render()
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("workspaceSetupError")
  await openEntry("notes")
  expect(entryButton("notes/report.md")).toBeDefined()
  vi.mocked(resolveWorkspaceDirectory).mockResolvedValueOnce("")
  await click("refresh")
  expect(entryButton("notes")).toBeDefined()
})

it("deletes selected files only after confirmation and does not open them", async () => {
  await render(); await openEntry("notes"); await menu("notes/report.md"); await click("deleteFile")
  expect(deleteWorkspaceFile).not.toHaveBeenCalled()
  expect(readWorkspaceFile).not.toHaveBeenCalled()
  expect(host.querySelector(".wb-confirm-detail")?.textContent).toBe("notes/report.md")
  await click("cancel")
  expect(entryButton("notes/report.md")).toBeDefined()
  await menu("notes/report.md"); await click("deleteFile")
  mockFiles([]); await click("delete")
  expect(deleteWorkspaceFile).toHaveBeenCalledWith("notes/report.md", { recursive: false })
  expect(onFilesDeleted).toHaveBeenCalledWith("notes/report.md", false)
  expect(host.querySelector(".wb-empty")?.textContent).toContain("folderEmpty")
})

it("deletes a nested folder recursively without removing a similarly named sibling", async () => {
  mockFiles(["notes/archive/a.md", "notes/archive/deep/b.md", "notes/archive-backup/a.md"])
  await render(); await openEntry("notes"); await menu("notes/archive")
  await click("deleteFolder")
  expect(host.querySelector(".wb-confirm-detail")?.textContent).toBe("notes/archive")
  expect(deleteWorkspaceFile).not.toHaveBeenCalled()
  mockFiles(["notes/archive-backup/a.md"]); await click("delete")
  expect(deleteWorkspaceFile).toHaveBeenCalledWith("notes/archive", { recursive: true })
  expect(entryButton("notes/archive")).toBeUndefined()
  expect(entryButton("notes/archive-backup")).toBeDefined()
  expect(onFilesDeleted).toHaveBeenCalledWith("notes/archive", true)
})

it("retains unsaved edits after failed deletion and closes the preview after successful deletion", async () => {
  await openFile(); await click("edit"); edit("Unsaved edits")
  vi.mocked(deleteWorkspaceFile).mockRejectedValueOnce(new Error("Locked"))
  await click("moreActions"); await click("deleteFile")
  expect(host.querySelector(".wb-confirm-warning")?.textContent).toBe("deleteUnsaved")
  await click("delete")
  expect(host.querySelector("textarea")?.value).toBe("Unsaved edits")
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("deleteFailed")
  expect(onFilesDeleted).not.toHaveBeenCalled()
  await click("moreActions"); await click("deleteFile"); mockFiles([]); await click("delete")
  expect(host.querySelector(".wb-detail")).toBeNull()
  expect(host.querySelector(".wb-empty")?.textContent).toContain("folderEmpty")
})
