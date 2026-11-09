// @vitest-environment jsdom
import { act } from "react-dom/test-utils"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useFileContext } from "./use-file-context"
import { ReferenceChips } from "../../sidepanel/components/ReferenceChips"

vi.mock("../i18n", () => ({ useT: () => (key: string) => key }))
let host: HTMLDivElement, root: Root, hook: ReturnType<typeof useFileContext>
function Harness() {
  hook = useFileContext()
  return <ReferenceChips files={hook.files} onRemoveFile={path => hook.setFiles(prev => prev.filter(file => file !== path))} />
}
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div"); document.body.append(host); root = createRoot(host)
  act(() => root.render(<Harness />))
})
afterEach(() => { act(() => root.unmount()); host.remove() })
it("adds multiple files without duplicates and removes them through the composer chips", () => {
  act(() => hook.setFiles(prev => [...prev, "notes/first.md", "notes/first.md", "notes/second.md"]))
  expect(hook.files).toEqual(["notes/first.md", "notes/second.md"])
  expect(host.querySelectorAll("button")).toHaveLength(2)
  act(() => host.querySelector("button")!.click())
  expect(hook.files).toEqual(["notes/second.md"])
  expect(host.textContent).not.toContain("first.md")
})
it("restores attachments per conversation and clears them for a new or sent draft", () => {
  act(() => { hook.setFiles(["first.md"]); hook.remember("a"); hook.reset(); hook.setFiles(["second.md"]); hook.remember("b") })
  act(() => hook.restore("a"))
  expect(hook.files).toEqual(["first.md"])
  act(() => { hook.reset(); hook.remember("a"); hook.restore("b") })
  expect(hook.files).toEqual(["second.md"])
  act(() => hook.restore("a"))
  expect(hook.files).toEqual([])
  act(() => hook.restore("new"))
  expect(hook.files).toEqual([])
})

it("keeps uploads completed after a conversation switch with the original draft", () => {
  act(() => { hook.setFiles(["first.md"]); hook.remember("a"); hook.reset(); hook.setFiles(["second.md"]) })
  act(() => hook.appendSaved("a", ["uploads/report.pdf"]))
  expect(hook.files).toEqual(["second.md"])
  act(() => hook.restore("a"))
  expect(hook.files).toEqual(["first.md", "uploads/report.pdf"])
})

it("removes deleted paths from current and saved drafts without matching sibling prefixes", () => {
  act(() => { hook.setFiles(["notes/a.md", "notes/deep/b.md", "notes-backup/a.md"]); hook.remember("a") })
  act(() => hook.removePath("notes", true))
  expect(hook.files).toEqual(["notes-backup/a.md"])
  act(() => hook.restore("a"))
  expect(hook.files).toEqual(["notes-backup/a.md"])
  act(() => hook.removePath("notes-backup/a.md"))
  expect(hook.files).toEqual([])
})
