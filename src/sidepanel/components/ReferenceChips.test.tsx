// @vitest-environment jsdom
import { act } from "react-dom/test-utils"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { PageReferenceChip, ReferenceChips } from "./ReferenceChips"
import { ChatMessageBlock } from "./ChatMessageBlock"
import { withMessageContext } from "../../lib/workbench/store"
vi.mock("../../lib/i18n", () => ({ useT: () => (key: string) => key }))
let host: HTMLDivElement, root: Root
const openFile = vi.fn(), removeFile = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div"); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

it("opens the exact workspace path from a message chip outside the bubble", () => {
  const message = { role: "user" as const, content: withMessageContext("Review", [], ["src/app.js", "uploads/app.js"]) }
  act(() => root.render(<ChatMessageBlock message={message} allMessages={[message]} index={0} onOpenFile={openFile} />))
  const buttons = host.querySelectorAll<HTMLButtonElement>(".wb-reference-open")
  act(() => buttons[1].click())
  expect(openFile).toHaveBeenCalledWith("uploads/app.js")
  expect(buttons[1].closest(".lm-chat-bubble")).toBeNull()
  expect(host.querySelectorAll(".wb-reference-remove")).toHaveLength(0)
})

it("keeps preview and removal as independent controls in the composer", () => {
  const path = "uploads/long-report-name.md"
  act(() => root.render(<ReferenceChips files={[path]} onOpenFile={openFile} onRemoveFile={removeFile} />))
  act(() => host.querySelector<HTMLButtonElement>(".wb-reference-open")!.click())
  expect(openFile).toHaveBeenCalledWith(path)
  expect(removeFile).not.toHaveBeenCalled()
  act(() => host.querySelector<HTMLButtonElement>(".wb-reference-remove")!.click())
  expect(removeFile).toHaveBeenCalledWith(path)
  expect(openFile).toHaveBeenCalledOnce()
  expect(host.querySelector("button button")).toBeNull()
  expect(host.querySelector('[data-reference="file"]')?.getAttribute("title")).toBe(path)
})

it("keeps switching a referenced tab separate from removing its chip", () => {
  const page = { id: 73, title: "Selected page", url: "https://example.com/article" }
  const openPage = vi.fn(), removePage = vi.fn()
  act(() => root.render(<PageReferenceChip page={page} onOpen={openPage} onRemove={removePage}/>))
  act(() => host.querySelector<HTMLButtonElement>(".wb-reference-open")!.click())
  expect(openPage).toHaveBeenCalledExactlyOnceWith(page)
  expect(removePage).not.toHaveBeenCalled()
  act(() => host.querySelector<HTMLButtonElement>(".wb-reference-remove")!.click())
  expect(removePage).toHaveBeenCalledExactlyOnceWith(page)
  expect(openPage).toHaveBeenCalledOnce()
  expect(host.querySelector("a")).toBeNull()
  expect(host.querySelector("button button")).toBeNull()
})
