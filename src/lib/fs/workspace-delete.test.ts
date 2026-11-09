import { afterEach, beforeEach, expect, it, vi } from "vitest"

let remove: ReturnType<typeof vi.fn>
let child: { removeEntry: ReturnType<typeof vi.fn> }
let workspace: { getDirectoryHandle: ReturnType<typeof vi.fn>; removeEntry: ReturnType<typeof vi.fn> }
let deleteFile: typeof import("./workspace").deleteWorkspaceFile
beforeEach(async () => {
  vi.resetModules()
  remove = vi.fn().mockResolvedValue(undefined)
  child = { removeEntry: remove }
  workspace = { getDirectoryHandle: vi.fn().mockResolvedValue(child), removeEntry: remove }
  vi.stubGlobal("navigator", { storage: { getDirectory: vi.fn().mockResolvedValue({
    getDirectoryHandle: async () => ({ getDirectoryHandle: async () => workspace })
  }) } })
  deleteFile = (await import("./workspace")).deleteWorkspaceFile
})
afterEach(() => vi.unstubAllGlobals())

it("deletes exactly the selected entry, enabling recursive deletion only when requested", async () => {
  await deleteFile("notes/report.md")
  expect(workspace.getDirectoryHandle).toHaveBeenCalledWith("notes")
  expect(remove).toHaveBeenLastCalledWith("report.md", { recursive: false })
  await deleteFile("notes", { recursive: true })
  expect(remove).toHaveBeenLastCalledWith("notes", { recursive: true })
})

it("treats a missing entry as already removed but propagates permission and lock failures", async () => {
  remove.mockRejectedValueOnce(new DOMException("Missing", "NotFoundError"))
  await expect(deleteFile("missing.md")).resolves.toBeUndefined()
  for (const name of ["NotAllowedError", "NoModificationAllowedError", "InvalidModificationError"]) {
    const error = new DOMException("Cannot delete", name)
    remove.mockRejectedValueOnce(error)
    await expect(deleteFile("file.md")).rejects.toBe(error)
  }
  workspace.getDirectoryHandle.mockRejectedValueOnce(new DOMException("Missing", "NotFoundError"))
  await expect(deleteFile("gone/file.md")).resolves.toBeUndefined()
  const denied = new DOMException("Denied", "NotAllowedError")
  workspace.getDirectoryHandle.mockRejectedValueOnce(denied)
  await expect(deleteFile("private/file.md")).rejects.toBe(denied)
})

it("rejects workspace-root and parent traversal paths before any deletion", async () => {
  for (const path of ["", "/", "..", "../file.md", "notes/../other", "."]) {
    await expect(deleteFile(path, { recursive: true })).rejects.toThrow("invalid_workspace_path")
  }
  expect(remove).not.toHaveBeenCalled()
  expect(navigator.storage.getDirectory).not.toHaveBeenCalled()
})
