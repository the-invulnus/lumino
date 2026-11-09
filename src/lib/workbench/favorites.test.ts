import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { listWorkspaceDir, readWorkspaceFile, writeWorkspaceFile } from "../fs/workspace"
import { migrateLegacySources, saveFavoriteAnswer, saveSource, sourceMarkdown, type SavedSource } from "./favorites"

vi.mock("../fs/workspace", () => ({ listWorkspaceDir: vi.fn(), readWorkspaceFile: vi.fn(), writeWorkspaceFile: vi.fn() }))
vi.mock("../i18n", () => ({ getLocale: () => "zh" }))
let files: Map<string, string>, records: Record<string, unknown>
const set = vi.fn()
const source: SavedSource = { id: "old-source", title: "A / useful article", url: "https://example.com/article", text: "Original excerpt", kind: "selection", createdAt: 1735689600000 }
beforeEach(() => {
  vi.resetAllMocks()
  files = new Map(); records = {}
  let queue = Promise.resolve<unknown>(undefined)
  vi.stubGlobal("navigator", { locks: { request: (_name: string, callback: () => Promise<unknown>) => {
    const result = queue.then(callback); queue = result.catch(() => {}); return result
  } } })
  vi.stubGlobal("chrome", { storage: { local: { get: async () => ({ ...records }), set } } })
  set.mockImplementation(async next => { Object.assign(records, next) })
  vi.mocked(listWorkspaceDir).mockImplementation(async path => {
    expect(path).toBe("favorite")
    return [...files.keys()].map(path => ({ name: path.slice("favorite/".length), kind: "file" }))
  })
  vi.mocked(readWorkspaceFile).mockImplementation(async path => files.get(path) ?? null)
  vi.mocked(writeWorkspaceFile).mockImplementation(async (path, content) => { files.set(path, content) })
})
afterEach(() => vi.unstubAllGlobals())

it("saves pages as readable Markdown files with source and date, and saves replies in the same directory", async () => {
  const path = await saveSource(source)
  expect(path).toBe("favorite/A _ useful article.md")
  expect(files.get(path)).toContain("https://example.com/article")
  expect(files.get(path)).toContain("2025-01-01T00:00:00.000Z")
  expect(files.get(path)).toContain("Original excerpt")
  expect(files.get(path)).toContain("选中摘录")
  const reply = await saveFavoriteAnswer("Research report", "## Findings\n\n**Important**")
  expect(reply).toBe("favorite/Research report.md")
  expect(files.get(reply)).toContain("## Findings\n\n**Important**")
  expect(set).not.toHaveBeenCalled()
})

it("migrates only legacy sources once, preserving backups, later edits and intentional deletions", async () => {
  records["lumino_source:old-source"] = source
  records["lumino_task:task"] = { prompt: "Keep shortcut" }
  await migrateLegacySources()
  expect(files.size).toBe(1)
  const [path] = files.keys()
  expect(records["lumino_source:old-source"]).toEqual(source)
  files.set(path, "User edited this favorite")
  await migrateLegacySources()
  expect(files.get(path)).toBe("User edited this favorite")
  files.delete(path)
  await migrateLegacySources()
  expect(files.size).toBe(0)
  expect(records["lumino_task:task"]).toEqual({ prompt: "Keep shortcut" })
})

it("does not overwrite a same-named file and coordinates simultaneous panels", async () => {
  records["lumino_source:old-source"] = source
  files.set("favorite/A _ useful article.md", "My existing file")
  await Promise.all([migrateLegacySources(), migrateLegacySources()])
  expect(files.get("favorite/A _ useful article.md")).toBe("My existing file")
  expect(files.get("favorite/A _ useful article (2).md")).toBe(sourceMarkdown(source))
  expect(files.size).toBe(2)
})

it("recovers without duplicating files when recording migration completion fails", async () => {
  records["lumino_source:old-source"] = source
  set.mockRejectedValueOnce(new Error("Storage temporarily unavailable"))
  await expect(migrateLegacySources()).rejects.toThrow("Storage temporarily unavailable")
  expect(files.size).toBe(1)
  await migrateLegacySources()
  expect(files.size).toBe(1)
  expect(records["lumino_source_file:old-source"]).toEqual({ path: [...files.keys()][0] })
})

it("does not mark a failed write as migrated and leaves the original available for retry", async () => {
  records["lumino_source:old-source"] = source
  vi.mocked(writeWorkspaceFile).mockRejectedValueOnce(new Error("Disk full"))
  await expect(migrateLegacySources()).rejects.toThrow("Disk full")
  expect(set).not.toHaveBeenCalled()
  expect(records["lumino_source:old-source"]).toEqual(source)
  await migrateLegacySources()
  expect(files.size).toBe(1)
})
