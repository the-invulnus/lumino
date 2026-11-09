// @vitest-environment jsdom
import { act } from "react-dom/test-utils"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { TasksView } from "./TasksView"
import { listTasks, removeTask } from "../lib/workbench/store"
import { loadCustomAgents } from "../lib/chat/mode-config"
import { installDialogMock } from "../test-support/dialog"

vi.mock("../lib/workbench/store", () => ({ listTasks: vi.fn(), removeTask: vi.fn(), saveTask: vi.fn() }))
vi.mock("../lib/chat/mode-config", () => ({ loadCustomAgents: vi.fn() }))
vi.mock("../lib/workbench/i18n", () => ({ useW: () => (key: string) => key, starters: [] }))
let host: HTMLDivElement, root: Root, restoreDialog: () => void
const onUse = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  restoreDialog = installDialogMock()
  vi.mocked(listTasks).mockResolvedValue([{ id: "task-1", title: "Weekly report", prompt: "Summarize", createdAt: 1 }])
  vi.mocked(loadCustomAgents).mockResolvedValue([])
  vi.mocked(removeTask).mockResolvedValue(undefined)
  host = document.createElement("div"); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); restoreDialog() })
async function render(visible = true) { await act(async () => root.render(<TasksView visible={visible} onUse={onUse}/>)) }
async function deleteTask() { await act(async () => [...host.querySelectorAll<HTMLButtonElement>(".wb-saved-task button")].find(button => button.textContent === "delete")!.click()) }
async function decide(label: string) { await act(async () => [...host.querySelectorAll<HTMLButtonElement>("dialog button")].find(button => button.textContent === label)!.click()) }

it("identifies the shortcut and deletes it only after explicit confirmation", async () => {
  await render(); await deleteTask()
  expect(host.querySelector("dialog[open] .wb-confirm-detail")?.textContent).toBe("Weekly report")
  expect(removeTask).not.toHaveBeenCalled()
  await decide("cancel")
  expect(host.querySelector(".wb-saved-task")).not.toBeNull()
  await deleteTask()
  vi.mocked(listTasks).mockResolvedValue([])
  await decide("delete")
  expect(removeTask).toHaveBeenCalledExactlyOnceWith("task-1")
  expect(host.querySelector(".wb-saved-task")).toBeNull()
})

it("cancels a pending deletion when the view becomes hidden", async () => {
  await render(); await deleteTask(); await render(false)
  expect(host.querySelector("dialog")).toBeNull()
  expect(removeTask).not.toHaveBeenCalled()
})
