// @vitest-environment jsdom
import { act } from "react-dom/test-utils"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useConfirmDialog } from "./ConfirmDialog"
import { installDialogMock } from "../../test-support/dialog"

vi.mock("../../lib/workbench/i18n", () => ({ useW: () => (key: string) => key }))
let host: HTMLDivElement, root: Root, restoreDialog: () => void
const decision = vi.fn()
function Harness({ enabled = true }: { enabled?: boolean }) {
  const { confirm, dialog } = useConfirmDialog(enabled)
  return <><button type="button" onClick={async () => decision(await confirm({ title: "Delete folder", message: "This cannot be undone.", detail: "projects/site", confirmLabel: "Delete", destructive: true }))}>Request</button>{dialog}</>
}
function button(label: string) { return [...host.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === label)! }
beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  restoreDialog = installDialogMock()
  host = document.createElement("div"); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); restoreDialog() })
async function open() {
  await act(async () => root.render(<Harness/>))
  act(() => { button("Request").focus(); button("Request").click() })
}

it("waits for an explicit decision, names the affected item and starts focus on cancel", async () => {
  await open()
  expect(host.querySelector("dialog[open] .wb-confirm-detail")?.textContent).toBe("projects/site")
  expect(host.querySelector("dialog")?.getAttribute("aria-labelledby")).toBeTruthy()
  expect(document.activeElement).toBe(button("cancel"))
  expect(decision).not.toHaveBeenCalled()
  await act(async () => button("Delete").click())
  expect(decision).toHaveBeenCalledExactlyOnceWith(true)
  expect(host.querySelector("dialog")).toBeNull()
  expect(document.activeElement).toBe(button("Request"))
})

it("treats cancel, the Escape cancel event and backdrop clicks as cancellation", async () => {
  for (const dismiss of ["button", "escape", "backdrop"]) {
    await open()
    await act(async () => {
      if (dismiss === "button") button("cancel").click()
      else if (dismiss === "escape") host.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true }))
      else host.querySelector("dialog")!.click()
    })
    expect(decision).toHaveBeenLastCalledWith(false)
    expect(host.querySelector("dialog")).toBeNull()
  }
  expect(decision).toHaveBeenCalledTimes(3)
})

it("cancels pending work when the owning view is hidden or unmounted", async () => {
  await open()
  await act(async () => root.render(<Harness enabled={false}/>))
  expect(decision).toHaveBeenLastCalledWith(false)
  expect(host.querySelector("dialog")).toBeNull()
  await open()
  await act(async () => root.render(null))
  expect(decision).toHaveBeenCalledTimes(2)
  expect(decision).toHaveBeenLastCalledWith(false)
})

it("does not replace a pending dialog or confirm the same operation twice", async () => {
  await open()
  await act(async () => button("Request").click())
  expect(host.querySelectorAll("dialog")).toHaveLength(1)
  expect(decision).toHaveBeenCalledExactlyOnceWith(false)
  await act(async () => { const accept = button("Delete"); accept.click(); accept.click() })
  expect(decision.mock.calls.filter(([confirmed]) => confirmed)).toHaveLength(1)
})
