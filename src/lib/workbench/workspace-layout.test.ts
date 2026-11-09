import { beforeEach, expect, it, vi } from "vitest"
import { getWorkspaceHandle, listWorkspaceDir, statWorkspaceFile } from "../fs/workspace"
import { browseWorkspace, ensureWorkspaceFolders, listWorkspaceEntries, resolveWorkspaceDirectory, sortWorkspaceEntries, WORKSPACE_FOLDERS } from "./workspace-layout"

vi.mock("../fs/workspace", () => ({ getWorkspaceHandle: vi.fn(), listWorkspaceDir: vi.fn(), statWorkspaceFile: vi.fn() }))
beforeEach(() => vi.resetAllMocks())

it("creates the fixed directories without replacing legacy files or removing custom directories", async () => {
  const getDirectoryHandle = vi.fn()
  vi.mocked(getWorkspaceHandle).mockResolvedValue({ getDirectoryHandle } as unknown as FileSystemDirectoryHandle)
  vi.mocked(listWorkspaceDir).mockResolvedValue([{ name: "notes", kind: "file" }, { name: "my-project", kind: "directory" }])
  await ensureWorkspaceFolders()
  expect(getDirectoryHandle.mock.calls.map(([path]) => path)).toEqual(WORKSPACE_FOLDERS.filter(folder => folder.path !== "notes").map(folder => folder.path))
  expect(getDirectoryHandle).toHaveBeenCalledWith("favorite", { create: true })
})

it("loads metadata for direct children without scanning entire projects, and searches only the chosen subtree", async () => {
  vi.mocked(listWorkspaceDir).mockImplementation(async path => {
    if (path === "notes") return [{ name: "report.md", kind: "file" }, { name: "archive", kind: "directory" }]
    if (path === "notes/archive") return [{ name: "report2.md", kind: "file" }, { name: "deep", kind: "directory" }]
    if (path === "notes/archive/deep") return [{ name: "image.png", kind: "file" }]
    throw new Error("Unexpected directory: " + path)
  })
  vi.mocked(statWorkspaceFile).mockResolvedValue({ size: 2048, modifiedAt: 1000 })
  expect(await browseWorkspace("notes")).toEqual([
    { path: "notes/report.md", kind: "file", size: 2048, modifiedAt: 1000 },
    { path: "notes/archive", kind: "directory", childCount: 2 }
  ])
  expect(listWorkspaceDir).not.toHaveBeenCalledWith("notes/archive/deep")
  expect(statWorkspaceFile).toHaveBeenCalledTimes(1)
  vi.mocked(statWorkspaceFile).mockClear()
  expect((await browseWorkspace("notes", "REPORT")).map(entry => entry.path)).toEqual(["notes/report.md", "notes/archive/report2.md"])
  expect(statWorkspaceFile).toHaveBeenCalledTimes(2)
  expect(statWorkspaceFile).not.toHaveBeenCalledWith("notes/archive/deep/image.png")
})

it("finds the nearest remaining ancestor after an external directory deletion", async () => {
  vi.mocked(listWorkspaceDir).mockImplementation(async path => path === "" ? [{ name: "notes", kind: "directory" }] : [])
  expect(await resolveWorkspaceDirectory("notes/deleted/deep")).toBe("notes")
  expect(await resolveWorkspaceDirectory("removed/deep")).toBe("")
})

it("hides dot entries and legacy tool output from browsing, counts and recursive searches until explicitly enabled", async () => {
  vi.mocked(listWorkspaceDir).mockImplementation(async path => {
    if (!path) return [
      { name: ".larget_tool_result", kind: "directory" }, { name: "large_tool_results", kind: "directory" },
      { name: "notes", kind: "directory" }, { name: ".state", kind: "file" }
    ]
    if (path === "notes") return [{ name: "report.md", kind: "file" }, { name: ".draft.md", kind: "file" }]
    if (path === ".larget_tool_result" || path === "large_tool_results") return [{ name: "report.txt", kind: "file" }]
    return []
  })
  vi.mocked(statWorkspaceFile).mockResolvedValue({ size: 10, modifiedAt: 1 })
  expect(await browseWorkspace()).toEqual([{ path: "notes", kind: "directory", childCount: 1 }])
  expect((await browseWorkspace("", "report")).map(entry => entry.path)).toEqual(["notes/report.md"])
  expect(listWorkspaceDir).not.toHaveBeenCalledWith(".larget_tool_result")
  expect(listWorkspaceDir).not.toHaveBeenCalledWith("large_tool_results")
  expect((await browseWorkspace("", "report", { showHidden: true })).map(entry => entry.path)).toEqual([".larget_tool_result/report.txt", "large_tool_results/report.txt", "notes/report.md"])
  expect((await browseWorkspace("notes", "", { showHidden: true })).map(entry => entry.path)).toEqual(["notes/report.md", "notes/.draft.md"])
})

it("keeps folders first while sorting files by natural names, newest date or size", () => {
  const entries = [
    { path: "notes/report10.md", kind: "file" as const, size: 10, modifiedAt: 30 },
    { path: "notes/report2.md", kind: "file" as const, size: 20, modifiedAt: 10 },
    { path: "notes/archive", kind: "directory" as const }
  ]
  expect(sortWorkspaceEntries(entries, "name").map(entry => entry.path)).toEqual(["notes/archive", "notes/report2.md", "notes/report10.md"])
  expect(sortWorkspaceEntries(entries, "modified").map(entry => entry.path)).toEqual(["notes/archive", "notes/report10.md", "notes/report2.md"])
  expect(sortWorkspaceEntries(entries, "size")[1].path).toBe("notes/report2.md")
})

it("includes empty directories and nested files so the tree reflects the actual filesystem", async () => {
  vi.mocked(listWorkspaceDir).mockImplementation(async path => {
    if (!path) return [{ name: "uploads", kind: "directory" }, { name: "custom", kind: "directory" }, { name: "root.md", kind: "file" }]
    if (path === "custom") return [{ name: "empty", kind: "directory" }, { name: "note.md", kind: "file" }]
    return []
  })
  expect(await listWorkspaceEntries()).toEqual([
    { path: "uploads", kind: "directory" }, { path: "custom", kind: "directory" },
    { path: "custom/empty", kind: "directory" }, { path: "custom/note.md", kind: "file" }, { path: "root.md", kind: "file" }
  ])
})
