import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { activateContextTab, captureCurrentPage, getCurrentContextPage, getContextTabs, stripPageContext, listTasks, listWorkspaceFiles, saveTask, withPageContext } from "./store"
import { saveSource } from "./favorites"
vi.mock("./favorites", () => ({ saveSource: vi.fn() }))
import { listWorkspaceDir } from "../fs/workspace"
vi.mock("../fs/workspace", () => ({ listWorkspaceDir: vi.fn() }))
const get = vi.fn(), set = vi.fn(), query = vi.fn(), executeScript = vi.fn()
const updateTab = vi.fn(), createTab = vi.fn(), focusWindow = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("chrome", { storage: { local: { get, set } }, tabs: { query, update: updateTab, create: createTab }, windows: { update: focusWindow }, scripting: { executeScript } })
  set.mockResolvedValue(undefined)
  vi.mocked(saveSource).mockResolvedValue("favorite/Article.md")
})
afterEach(() => vi.unstubAllGlobals())
it("switches to the exact existing tab and its window without opening or navigating a page", async () => {
  updateTab.mockResolvedValueOnce({ id: 73, windowId: 5 })
  await activateContextTab(73)
  expect(updateTab).toHaveBeenCalledExactlyOnceWith(73, { active: true })
  expect(focusWindow).toHaveBeenCalledExactlyOnceWith(5, { focused: true })
  expect(createTab).not.toHaveBeenCalled()
})
it("does not replace a closed referenced tab with a new one", async () => {
  updateTab.mockRejectedValueOnce(new Error("No tab with id: 73"))
  await expect(activateContextTab(73)).rejects.toThrow("No tab with id: 73")
  expect(createTab).not.toHaveBeenCalled()
  expect(focusWindow).not.toHaveBeenCalled()
})
it("keeps legacy sources and settings out of shortcuts", async () => {
  get.mockResolvedValue({ apiKey: "not-a-record", "lumino_source:1": { createdAt: 1 }, "lumino_source:2": { createdAt: 2 }, "lumino_task:3": { createdAt: 3 } })
  expect(await listTasks()).toEqual([{ createdAt: 3 }])
})
it("stores shortcuts independently without replacing other records", async () => {
  const task = { id: "test", title: "Read", prompt: "Summarize", createdAt: 1 }
  await saveTask(task)
  expect(set).toHaveBeenCalledWith({ "lumino_task:test": task })
  expect(get).not.toHaveBeenCalled()
})
it("rejects browser-internal pages before script injection or saving", async () => {
  query.mockResolvedValue([{ id: 1, url: "chrome://settings" }])
  await expect(captureCurrentPage()).rejects.toThrow("no_page")
  expect(saveSource).not.toHaveBeenCalled()
  expect(executeScript).not.toHaveBeenCalled()
  expect(set).not.toHaveBeenCalled()
})
it("saves a selected excerpt and falls back to a link for restricted pages", async () => {
  query.mockResolvedValue([{ id: 1, title: "Article", url: "https://example.com" }])
  executeScript.mockResolvedValue([{ result: { text: "Selected passage", selected: true } }])
  expect(await captureCurrentPage()).toMatchObject({ kind: "selection", text: "Selected passage", url: "https://example.com" })
  expect(saveSource).toHaveBeenCalledWith(expect.objectContaining({ text: "Selected passage" }))
  expect(set).not.toHaveBeenCalled()
  executeScript.mockRejectedValue(new Error("restricted"))
  expect(await captureCurrentPage()).toMatchObject({ kind: "link", text: "" })
})
it("only offers usable tabs from the current window and preserves explicit IDs in context", async () => {
  query.mockResolvedValue([{ id: 7, title: "A\nB", url: "https://example.com" }, { id: 8, url: "chrome://extensions" }, { url: "https://example.org" }])
  const pages = await getContextTabs()
  expect(query).toHaveBeenCalledWith({ currentWindow: true })
  expect(pages).toHaveLength(1)
  expect(withPageContext("Compare", pages)).toContain('"id":7')
  expect(withPageContext("Compare", pages)).toContain('"title":"A\\nB"')
  expect(withPageContext("Hello", [])).toContain("none selected")
  expect(stripPageContext(withPageContext("Hello", []))).toBe("Hello")
  expect(stripPageContext(withPageContext("Compare", pages))).toBe("Compare")
})
it("finds agent output in nested workspace folders", async () => {
  vi.mocked(listWorkspaceDir).mockImplementation(async path => path === "notes" ? [{ name: "report.md", kind: "file" }] : [{ name: "notes", kind: "directory" }, { name: "table.csv", kind: "file" }])
  expect(await listWorkspaceFiles()).toEqual(["notes/report.md", "table.csv"])
})

it("defaults to the active readable page in the side panel window", async () => {
  query.mockResolvedValue([{ id: 9, title: "Current article", url: "https://example.com/article" }])
  expect(await getCurrentContextPage()).toEqual({ id: 9, title: "Current article", url: "https://example.com/article" })
  expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true })
  query.mockResolvedValue([{ id: 9, url: "chrome://newtab" }])
  expect(await getCurrentContextPage()).toBeNull()
})
