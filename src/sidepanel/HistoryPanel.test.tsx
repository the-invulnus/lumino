// @vitest-environment jsdom
import { act } from "react-dom/test-utils"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { HistoryPanel } from "./HistoryPanel"
import { listThreads, type ChatThreadRecord } from "../lib/chat/thread-idb"

vi.mock("../lib/chat/thread-idb", () => ({ listThreads: vi.fn() }))
vi.mock("../lib/i18n", () => ({ getLocale: () => "en", useT: () => (key: string) => key, t: (key: string) => key }))
let host: HTMLDivElement, root: Root
const onSelect = vi.fn(), onDelete = vi.fn(), onClose = vi.fn()
const record = (id: string, date: Date): ChatThreadRecord => ({ id, title: id, updatedAt: date.getTime(), messages: [] })
const headings = () => [...host.querySelectorAll(".lm-history-group-label")].map(node => node.textContent)
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 15, 12))
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div"); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })
async function render(open = true) { await act(async () => root.render(<HistoryPanel open={open} onSelect={onSelect} onDelete={onDelete} onClose={onClose}/>)) }
function search(value: string) {
  act(() => {
    const input = host.querySelector("input")!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

it("renders only populated groups, keeps search results grouped and opens the selected conversation", async () => {
  vi.mocked(listThreads).mockResolvedValue([
    record("older report", new Date(2026, 9, 20)), record("today report", new Date(2026, 10, 15)), record("yesterday note", new Date(2026, 10, 14))
  ])
  await render()
  expect(headings()).toEqual(["history.group.today", "history.group.yesterday", "October 2026"])
  search("report")
  expect(headings()).toEqual(["history.group.today", "October 2026"])
  const items = host.querySelectorAll<HTMLElement>(".lm-history-item")
  expect(items).toHaveLength(2)
  act(() => items[1].click())
  expect(onSelect).toHaveBeenCalledExactlyOnceWith("older report")
})

it("moves today's conversations into yesterday when local midnight passes", async () => {
  vi.setSystemTime(new Date(2026, 10, 15, 23, 59, 59, 900))
  vi.mocked(listThreads).mockResolvedValue([record("late conversation", new Date(2026, 10, 15, 23, 50))])
  await render()
  expect(headings()).toEqual(["history.group.today"])
  await act(async () => { await vi.advanceTimersByTimeAsync(200) })
  expect(headings()).toEqual(["history.group.yesterday"])
  expect(host.querySelector(".lm-history-item-date")?.textContent).toBe("23:50")
})

it("collapses groups independently and remembers their state when reopening the panel", async () => {
  vi.mocked(listThreads).mockResolvedValue([record("today", new Date(2026, 10, 15)), record("older", new Date(2026, 9, 20))])
  await render()
  const toggle = host.querySelector<HTMLButtonElement>(".lm-history-group-toggle")!
  const contentId = toggle.getAttribute("aria-controls")!
  expect(toggle.getAttribute("aria-expanded")).toBe("true")
  expect(document.getElementById(contentId)).not.toBeNull()
  act(() => toggle.click())
  expect(toggle.getAttribute("aria-expanded")).toBe("false")
  expect(document.getElementById(contentId)).toBeNull()
  expect(host.querySelector(".lm-history-group-count")).not.toBeNull()
  expect(host.querySelectorAll(".lm-history-item")).toHaveLength(1)
  expect(onSelect).not.toHaveBeenCalled()
  await render(false); await render()
  expect(toggle.getAttribute("aria-expanded")).toBe("false")
  act(() => toggle.click())
  expect(host.querySelectorAll(".lm-history-item")).toHaveLength(2)
})

it("reveals matching search results without changing the normal list's folded groups", async () => {
  vi.mocked(listThreads).mockResolvedValue([record("today report", new Date(2026, 10, 15))])
  await render()
  const toggle = host.querySelector<HTMLButtonElement>(".lm-history-group-toggle")!
  act(() => toggle.click())
  search("report")
  expect(toggle.getAttribute("aria-expanded")).toBe("true")
  expect(host.querySelectorAll(".lm-history-item")).toHaveLength(1)
  act(() => toggle.click())
  expect(toggle.getAttribute("aria-expanded")).toBe("false")
  search("")
  expect(toggle.getAttribute("aria-expanded")).toBe("false")
  search("today")
  expect(toggle.getAttribute("aria-expanded")).toBe("true")
})
