// @vitest-environment jsdom
import { act } from "react-dom/test-utils"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { OpenAiChatMessage } from "../../lib/chat/openai-messages"
import { AssistantTurn } from "./AssistantTurn"
vi.mock("../../lib/i18n", () => ({ useT: () => (key: string, params?: { count: number }) => params ? `${key}:${params.count}` : key }))
const call = (id: string, name: string) => ({ id, type: "function" as const, function: { name, arguments: '{"selector":"main"}' } })
const execution: OpenAiChatMessage[] = [
  { role: "assistant", content: "Checking the page first.", reasoning_content: "Need to read the page.", tool_calls: [call("a", "get_page_content"), call("b", "inspect_element")] },
  { role: "tool", tool_call_id: "a", content: '{"text":"Article text"}' },
  { role: "tool", tool_call_id: "b", content: '{"error":"not_found"}' },
  { role: "assistant", content: "## Final answer\n\nHere is the summary.", reasoning_content: "Synthesize the findings." }
]
let host: HTMLDivElement, root: Root
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div"); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
function render(messages: OpenAiChatMessage[], running = false) { act(() => root.render(<AssistantTurn messages={messages} running={running} />)) }
function summary() { return host.querySelector<HTMLButtonElement>(".lumi-turn-process__summary")! }
it("collapses all intermediate activity, counts calls without failure totals, and leaves the final answer visible", () => {
  render(execution)
  expect(summary().getAttribute("aria-expanded")).toBe("false")
  expect(summary().textContent).toContain("execution.toolCalls:2")
  expect(summary().textContent).toBe("execution.toolCalls:2")
  expect(host.textContent).toContain("Final answer")
  expect(host.textContent).not.toContain("Checking the page")
  expect(host.querySelector(".lumi-reasoning")).toBeNull()
  expect(host.querySelector(".lumi-tool-call")).toBeNull()
})
it("reveals nested tool and reasoning details and can collapse the entire turn again", () => {
  render(execution)
  act(() => summary().click())
  expect(host.querySelectorAll(".lumi-tool-call")).toHaveLength(2)
  expect(host.querySelectorAll(".lumi-reasoning")).toHaveLength(2)
  act(() => host.querySelector<HTMLButtonElement>(".lumi-tool-call__trigger")!.click())
  expect(host.querySelector(".lumi-tool-call__detail--open")?.textContent).toContain("Article text")
  expect(host.querySelectorAll("h2")).toHaveLength(1)
  act(() => summary().click())
  expect(host.querySelector(".lumi-turn-process__details")).toBeNull()
  expect(host.textContent).toContain("Here is the summary.")
})
it("updates during execution without resetting the user's expanded state", () => {
  render(execution.slice(0, 1), true)
  expect(summary().textContent).toContain("execution.running")
  expect(host.textContent).not.toContain("Checking the page")
  act(() => summary().click())
  render(execution)
  expect(summary().getAttribute("aria-expanded")).toBe("true")
  expect(summary().textContent).not.toContain("execution.running")
  expect(host.textContent).toContain("Final answer")
})
it("shows a text-only reply directly and folds a reasoning-only turn without inventing tool calls", () => {
  render([{ role: "assistant", content: "Hello" }])
  expect(summary()).toBeNull()
  expect(host.textContent).toBe("Hello")
  render([{ role: "assistant", content: null, reasoning_content: "Thinking" }], true)
  expect(summary().textContent).toContain("execution.process")
  expect(summary().textContent).not.toContain("execution.toolCalls")
})
