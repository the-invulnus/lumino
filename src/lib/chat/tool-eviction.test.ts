import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { deleteWorkspaceFile, listWorkspaceDir, writeWorkspaceFile } from "../fs/workspace"
import { cleanupEvictedFiles, maybeEvictToolResult } from "./tool-eviction"

vi.mock("../fs/workspace", () => ({ deleteWorkspaceFile: vi.fn(), listWorkspaceDir: vi.fn(), writeWorkspaceFile: vi.fn() }))
const now = 1793940000000
beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(Date, "now").mockReturnValue(now)
  vi.mocked(writeWorkspaceFile).mockResolvedValue(undefined)
  vi.mocked(deleteWorkspaceFile).mockResolvedValue(undefined)
})
afterEach(() => vi.restoreAllMocks())

it("writes large tool results into the hidden directory and returns the actual readable path", async () => {
  const content = "output".repeat(2000)
  const result = await maybeEvictToolResult(content, "call/1", "get_page_content")
  const path = `/.larget_tool_result/get_page_content_${now}_call_1.txt`
  expect(writeWorkspaceFile).toHaveBeenCalledWith(path, content)
  expect(result).toContain(path)
  expect(await maybeEvictToolResult("small output", "call/2", "get_page_content")).toBe("small output")
  expect(await maybeEvictToolResult(content, "call/3", "read_file")).toBe(content)
  expect(writeWorkspaceFile).toHaveBeenCalledTimes(1)
})

it("expires both current and legacy results while retaining recent files whose tool names contain underscores", async () => {
  const old = now - 2 * 60 * 60 * 1000
  const fresh = now - 30_000
  vi.mocked(listWorkspaceDir).mockResolvedValue([
    { name: `get_page_content_${old}_call.txt`, kind: "file" },
    { name: `scrape_structure_${fresh}_tab1.json`, kind: "file" },
    { name: `get_page_content_${fresh}_call.txt`, kind: "file" },
    { name: "nested", kind: "directory" }
  ])
  expect(await cleanupEvictedFiles()).toBe(3)
  for (const dir of ["/.larget_tool_result", "/large_tool_results", "/large_tool_result"]) {
    expect(deleteWorkspaceFile).toHaveBeenCalledWith(`${dir}/get_page_content_${old}_call.txt`)
  }
  expect(deleteWorkspaceFile).toHaveBeenCalledTimes(3)
})

it("continues cleaning other directories when a directory cannot be listed", async () => {
  vi.mocked(listWorkspaceDir).mockImplementation(async path => {
    if (path === "/.larget_tool_result") throw new Error("Temporarily locked")
    return [{ name: `get_page_content_${now - 7200000}_call.txt`, kind: "file" }]
  })
  expect(await cleanupEvictedFiles()).toBe(2)
})
