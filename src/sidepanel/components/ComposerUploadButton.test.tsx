// @vitest-environment jsdom
import { act } from "react-dom/test-utils"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { ComposerUploadButton } from "./ComposerUploadButton"
vi.mock("../../lib/i18n", () => ({ useT: () => (key: string) => key }))
let host: HTMLDivElement, root: Root
const upload = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div"); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
function render(busy = false) { act(() => root.render(<ComposerUploadButton busy={busy} disabled={false} onUpload={upload} />)) }

it("opens a multiple-file picker and resets it so the same file can be selected again", () => {
  render()
  const input = host.querySelector("input")!
  const click = vi.spyOn(input, "click")
  act(() => host.querySelector("button")!.click())
  expect(click).toHaveBeenCalledOnce()
  expect(input.multiple).toBe(true)
  const files = [new File(["A"], "a.txt"), new File(["B"], "b.txt")]
  Object.defineProperty(input, "files", { value: files, configurable: true })
  act(() => input.dispatchEvent(new Event("change", { bubbles: true })))
  expect(upload).toHaveBeenLastCalledWith(files)
  expect(input.value).toBe("")
  act(() => input.dispatchEvent(new Event("change", { bubbles: true })))
  expect(upload).toHaveBeenCalledTimes(2)
})

it("ignores picker cancellation and prevents a second upload while busy", () => {
  render()
  act(() => host.querySelector("input")!.dispatchEvent(new Event("change", { bubbles: true })))
  expect(upload).not.toHaveBeenCalled()
  render(true)
  const input = host.querySelector("input")!
  const click = vi.spyOn(input, "click")
  act(() => host.querySelector("button")!.click())
  expect(click).not.toHaveBeenCalled()
  expect(host.querySelector("button")!.getAttribute("aria-busy")).toBe("true")
  expect(input.disabled).toBe(true)
})
