// @vitest-environment jsdom
import { act } from "react-dom/test-utils"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { usePageContext } from "./use-page-context"
import { getCurrentContextPage, getContextTabs, type PageContext } from "./store"
vi.mock("./store", () => ({ getCurrentContextPage: vi.fn(), getContextTabs: vi.fn() }))
const first = { id: 1, title: "First", url: "https://example.com/1" }
const second = { id: 2, title: "Second", url: "https://example.com/2" }
let host: HTMLDivElement, root: Root, hook: ReturnType<typeof usePageContext>
let activated: () => void, updated: (id: number, change: chrome.tabs.TabChangeInfo) => void
const remove = vi.fn()
function Harness() { hook = usePageContext(); return <div>{hook.pages.map(page => page.title).join(",")}</div> }
beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal("chrome", { tabs: {
    onActivated: { addListener: (listener: typeof activated) => { activated = listener }, removeListener: remove },
    onUpdated: { addListener: (listener: typeof updated) => { updated = listener }, removeListener: remove },
    onRemoved: { addListener: vi.fn(), removeListener: remove }
  } })
  vi.mocked(getCurrentContextPage).mockResolvedValue(first)
  vi.mocked(getContextTabs).mockResolvedValue([first, second])
  host = document.createElement("div"); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })
async function mount() { await act(async () => { root.render(<Harness />) }) }
it("shows and follows the current page until explicitly removed; resets for a new conversation", async () => {
  await mount()
  expect(hook.pages).toEqual([first])
  vi.mocked(getCurrentContextPage).mockResolvedValue(second)
  await act(async () => { activated() })
  expect(hook.pages).toEqual([second])
  act(() => hook.setPages([]))
  await act(async () => { activated(); updated(2, { title: "Updated" }) })
  expect(hook.pages).toEqual([])
  await act(async () => { hook.reset() })
  expect(hook.pages).toEqual([second])
})
it("keeps explicit selections and removals independent between conversations", async () => {
  await mount()
  act(() => { hook.setPages([first, second, second]); hook.remember("a") })
  expect(hook.pages).toEqual([first, second])
  act(() => { hook.setPages([]); hook.remember("b") })
  await act(async () => { hook.restore("a") })
  expect(hook.pages).toEqual([first, second])
  await act(async () => { hook.restore("b") })
  expect(hook.pages).toEqual([])
})
it("does not let a delayed current-page lookup restore a deleted chip", async () => {
  await mount()
  let finish!: (page: PageContext) => void
  vi.mocked(getCurrentContextPage).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  act(() => activated())
  act(() => hook.setPages([]))
  await act(async () => { finish(second) })
  expect(hook.pages).toEqual([])
})
it("refreshes selected page titles and removes closed tabs without adding other pages", async () => {
  await mount()
  act(() => hook.setPages([first, second]))
  vi.mocked(getCurrentContextPage).mockResolvedValue({ ...first, title: "Renamed" })
  vi.mocked(getContextTabs).mockResolvedValue([{ ...first, title: "Renamed" }])
  await act(async () => { updated(1, { title: "Renamed" }) })
  expect(hook.pages).toEqual([{ ...first, title: "Renamed" }])
})

it("switches the automatic chip after removal without losing manually added pages", async () => {
  const third = { id: 3, title: "Third", url: "https://example.com/3" }
  vi.mocked(getContextTabs).mockResolvedValue([first, second, third])
  await mount()
  act(() => hook.setPages([first, third]))
  act(() => hook.setPages([third]))
  await act(async () => { updated(1, { status: "complete" }) })
  expect(hook.pages).toEqual([third])
  vi.mocked(getCurrentContextPage).mockResolvedValue(second)
  await act(async () => { activated() })
  expect(hook.pages).toEqual([second, third])
  vi.mocked(getCurrentContextPage).mockResolvedValue(first)
  await act(async () => { activated() })
  expect(hook.pages).toEqual([first, third])
})
it("deduplicates the active chip when switching to a manually added page", async () => {
  await mount()
  act(() => hook.setPages([first, second]))
  vi.mocked(getCurrentContextPage).mockResolvedValue(second)
  await act(async () => { activated() })
  expect(hook.pages).toEqual([second])
  vi.mocked(getCurrentContextPage).mockResolvedValue(first)
  await act(async () => { activated() })
  expect(hook.pages).toEqual([first, second])
})

it("starts a reference conversation without pages, then follows later tab switches", async () => {
  await mount()
  act(() => { hook.setPages([first, second]); hook.remember("old") })
  await act(async () => { hook.reset({ includeCurrentPage: false }) })
  expect(hook.pages).toEqual([])
  await act(async () => { updated(first.id, { title: "Updated", status: "complete" }) })
  expect(hook.pages).toEqual([])
  vi.mocked(getCurrentContextPage).mockResolvedValue(second)
  await act(async () => { activated() })
  expect(hook.pages).toEqual([second])
  vi.mocked(getCurrentContextPage).mockResolvedValue(first)
  await act(async () => { activated() })
  expect(hook.pages).toEqual([first])
  await act(async () => { hook.restore("old") })
  expect(hook.pages).toEqual([first, second])
})

it("allows manually selecting the initially omitted page", async () => {
  await mount()
  await act(async () => { hook.reset({ includeCurrentPage: false }) })
  act(() => hook.setPages([first]))
  await act(async () => { updated(first.id, { status: "complete" }) })
  expect(hook.pages).toEqual([first])
})

it("does not suppress a new tab or restore old pages when the initial lookup finishes late", async () => {
  await mount()
  let finish!: (page: PageContext) => void
  vi.mocked(getCurrentContextPage).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  act(() => hook.reset({ includeCurrentPage: false }))
  expect(hook.pages).toEqual([])
  vi.mocked(getCurrentContextPage).mockResolvedValue(second)
  await act(async () => { activated() })
  expect(hook.pages).toEqual([second])
  await act(async () => { finish(first) })
  expect(hook.pages).toEqual([second])
})
