import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { getWorkspaceHandle, listWorkspaceDir } from "../fs/workspace"
import { uploadWorkspaceFiles } from "./uploads"

vi.mock("../fs/workspace", () => ({ getWorkspaceHandle: vi.fn(), listWorkspaceDir: vi.fn() }))
let stored: Map<string, Uint8Array>
let failures: Set<string>
let directory: { getFileHandle: ReturnType<typeof vi.fn>; removeEntry: ReturnType<typeof vi.fn> }
const aborted = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  stored = new Map()
  failures = new Set()
  let queue = Promise.resolve<unknown>(undefined)
  vi.stubGlobal("navigator", { locks: { request: vi.fn((_name, callback) => {
    const task = queue.then(callback)
    queue = task.catch(() => {})
    return task
  }) } })
  directory = {
    getFileHandle: vi.fn(async (name: string) => {
      if (!stored.has(name)) stored.set(name, new Uint8Array())
      return { createWritable: async () => {
        let pending: Blob
        return {
          write: async (data: Blob) => { pending = data },
          close: async () => {
            if (failures.has(name)) throw new DOMException("Storage full", "QuotaExceededError")
            stored.set(name, new Uint8Array(await pending.arrayBuffer()))
          },
          abort: aborted
        }
      } }
    }),
    removeEntry: vi.fn(async (name: string) => { stored.delete(name) })
  }
  vi.mocked(getWorkspaceHandle).mockResolvedValue({ getDirectoryHandle: async (name: string) => {
    expect(name).toBe("uploads")
    return directory
  } } as unknown as FileSystemDirectoryHandle)
  vi.mocked(listWorkspaceDir).mockImplementation(async path => {
    expect(path).toBe("uploads")
    return [...stored.keys()].map(name => ({ name, kind: "file" }))
  })
  aborted.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllGlobals())

it("imports multiple files with their exact bytes and avoids existing or repeated names", async () => {
  stored.set("report.pdf", new Uint8Array([42]))
  const bytes = new Uint8Array([0, 255, 128, 13, 10, 80, 68, 70])
  const result = await uploadWorkspaceFiles([
    new File([bytes], "report.pdf"), new File(["中文笔记"], "note.md"), new File([bytes], "report.pdf"), new File([], "empty.txt")
  ])
  expect(result).toEqual({ paths: ["uploads/report (2).pdf", "uploads/note.md", "uploads/report (3).pdf", "uploads/empty.txt"], failedNames: [] })
  expect(stored.get("report.pdf")).toEqual(new Uint8Array([42]))
  expect(stored.get("report (2).pdf")).toEqual(bytes)
  expect(stored.get("note.md")).toEqual(new TextEncoder().encode("中文笔记"))
  expect(stored.get("empty.txt")).toEqual(new Uint8Array())
})

it("reports failed files, removes incomplete output, and retains successful uploads", async () => {
  failures.add("broken.png")
  const result = await uploadWorkspaceFiles([new File(["broken"], "broken.png"), new File(["ok"], "good.txt")])
  expect(result).toEqual({ paths: ["uploads/good.txt"], failedNames: ["broken.png"] })
  expect(aborted).toHaveBeenCalledOnce()
  expect(stored.has("broken.png")).toBe(false)
  expect(stored.has("good.txt")).toBe(true)
})

it("keeps filenames inside uploads and coordinates simultaneous uploads", async () => {
  const [first, second] = await Promise.all([
    uploadWorkspaceFiles([new File(["one"], "same.txt")]),
    uploadWorkspaceFiles([new File(["two"], "same.txt"), new File(["safe"], "../nested\\file.txt")])
  ])
  expect(first.paths).toEqual(["uploads/same.txt"])
  expect(second.paths).toEqual(["uploads/same (2).txt", "uploads/.._nested_file.txt"])
  expect(new TextDecoder().decode(stored.get("same.txt"))).toBe("one")
  expect(new TextDecoder().decode(stored.get("same (2).txt"))).toBe("two")
})

it("does no work for a cancelled picker and surfaces storage initialization failures", async () => {
  expect(await uploadWorkspaceFiles([])).toEqual({ paths: [], failedNames: [] })
  expect(getWorkspaceHandle).not.toHaveBeenCalled()
  vi.mocked(getWorkspaceHandle).mockRejectedValue(new Error("unavailable"))
  await expect(uploadWorkspaceFiles([new File(["data"], "file.txt")])).rejects.toThrow("unavailable")
  expect(directory.getFileHandle).not.toHaveBeenCalled()
})
