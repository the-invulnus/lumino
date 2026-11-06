// @vitest-environment jsdom
import { act } from "react-dom/test-utils"
import { createRoot, type Root } from "react-dom/client"
import { createElement } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { ObsidianConnectionStatus } from "./ObsidianConnectionStatus"
import { testObsidianConnection } from "./lib/obsidian-connection"

vi.mock("./lib/obsidian-connection", () => ({ testObsidianConnection: vi.fn() }))
vi.mock("./lib/i18n", () => ({ useT: () => (key: string) => key }))
let host: HTMLDivElement
let root: Root
const settings = { enabled: true, baseUrl: "http://localhost:27123", apiKey: "test-key" }

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(testObsidianConnection).mockReset()
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

it("automatically checks, displays success and supports manual retesting", async () => {
  vi.mocked(testObsidianConnection).mockResolvedValue(3)
  act(() => root.render(createElement(ObsidianConnectionStatus, { settings })))
  expect(host.querySelector("[data-state='checking']")).not.toBeNull()
  await act(async () => { await vi.advanceTimersByTimeAsync(400) })
  expect(host.querySelector("[data-state='connected']")).not.toBeNull()
  vi.mocked(testObsidianConnection).mockRejectedValue(new Error("MCP HTTP 401"))
  act(() => host.querySelector("button")!.click())
  await act(async () => { await vi.advanceTimersByTimeAsync(400) })
  expect(host.querySelector("[data-state='failed']")).not.toBeNull()
  expect(host.textContent).toContain("MCP HTTP 401")
})

it("ignores a stale success after settings change and does not test when disabled", async () => {
  let finishOldCheck!: (count: number) => void
  vi.mocked(testObsidianConnection).mockImplementationOnce(() => new Promise((resolve) => { finishOldCheck = resolve }))
  act(() => root.render(createElement(ObsidianConnectionStatus, { settings })))
  await act(async () => { await vi.advanceTimersByTimeAsync(400) })
  const disabled = { ...settings, enabled: false }
  act(() => root.render(createElement(ObsidianConnectionStatus, { settings: disabled })))
  await act(async () => { finishOldCheck(3); await vi.advanceTimersByTimeAsync(400) })
  expect(host.querySelector("[data-state='disabled']")).not.toBeNull()
  expect(testObsidianConnection).toHaveBeenCalledOnce()
  expect(host.querySelector("button")!.disabled).toBe(true)
})
