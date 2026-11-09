// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, expect, it, vi } from "vitest"
import { buildUserInputWithTime, stripCurrentTime } from "../../lib/chat/message-metadata"
import type { OpenAiChatMessage } from "../../lib/chat/openai-messages"
import { withMessageContext, withPageContext } from "../../lib/workbench/store"
import { ChatMessageBlock, displayContent } from "./ChatMessageBlock"

vi.mock("../../lib/i18n", () => ({ useT: () => (key: string) => key }))
afterEach(() => vi.useRealTimers())

const timestamp = "[Current Time: 2026-11-06T01:32:20.699Z]\n\n"
const prompt = "总结今天的github trending热门项目"
const withPages = withPageContext(prompt, [{ id: 12, title: "GitHub Trending", url: "https://github.com/trending" }])

it.each([1, 2, 4])("hides %i stored timestamps and reference metadata in the actual user bubble", count => {
  const raw = timestamp.repeat(count) + withPages
  const message: OpenAiChatMessage = { role: "user", content: raw }
  const html = renderToStaticMarkup(<ChatMessageBlock message={message} allMessages={[message]} index={0} />)
  const host = document.createElement("div")
  host.innerHTML = html
  expect(host.querySelector(".wb-user-message-text")?.textContent).toBe(prompt)
  expect(host.querySelector('[data-reference="page"]')?.textContent).toBe("GitHub Trending")
  expect(host.textContent).not.toContain("Current Time")
  expect(host.textContent).not.toContain("Reference pages")
  expect(displayContent(raw)).toBe(prompt)
  expect(message.content).toBe(raw)
})

it("refreshes the timestamp on regeneration without accumulating headers or losing selected pages", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-06T07:00:00.000Z"))
  let input = timestamp.repeat(3) + withPages
  for (let attempt = 0; attempt < 3; attempt++) {
    input = buildUserInputWithTime(stripCurrentTime(input))
    expect(input).toBe("[Current Time: 2026-11-06T07:00:00.000Z]\n\n" + withPages)
    expect(displayContent(input)).toBe(prompt)
  }
  expect(buildUserInputWithTime(timestamp.repeat(3) + withPages)).toBe(input)
})

it("handles text-part messages and CRLF headers while preserving the user's message formatting", () => {
  const text = "第一段\n\n第二段"
  const message: OpenAiChatMessage = { role: "user", content: [{ type: "text", text: timestamp.replaceAll("\n", "\r\n").repeat(2) + withPageContext(text, []) }] }
  const host = document.createElement("div")
  host.innerHTML = renderToStaticMarkup(<ChatMessageBlock message={message} allMessages={[message]} index={0} />)
  expect(host.textContent).toBe(text)
})

it("preserves timestamps quoted in normal text or code and unrelated bracketed content", () => {
  for (const text of ["解释这个标记：\n" + timestamp, "```text\n" + timestamp + "```", "[Current Time: tomorrow]\n\nExample"]) {
    expect(stripCurrentTime(text)).toBe(text)
    expect(displayContent(timestamp + text)).toBe(text)
  }
})

it("shows both reference types as chips while keeping their hidden context out of the prompt", () => {
  const pages = [{ id: 7, title: "Reference page", url: "https://example.com/page" }]
  const files = ['design-library/assets/app.js', 'notes/a "quoted" file.md']
  const raw = buildUserInputWithTime(withMessageContext("帮我分析", pages, files))
  const message: OpenAiChatMessage = { role: "user", content: raw }
  const host = document.createElement("div")
  host.innerHTML = renderToStaticMarkup(<ChatMessageBlock message={message} allMessages={[message]} index={0} />)
  expect(host.querySelector(".wb-user-message-text")?.textContent).toBe("帮我分析")
  expect(host.querySelector(".lm-chat-bubble--user")?.textContent).toBe("帮我分析")
  expect(host.querySelector(".wb-reference-chips")?.closest(".lm-chat-bubble")).toBeNull()
  expect(host.querySelector(".lm-chat-row")?.firstElementChild?.classList.contains("wb-reference-chips")).toBe(true)
  expect(host.querySelector("a")?.getAttribute("href")).toBe(pages[0].url)
  expect([...host.querySelectorAll('[data-reference="file"]')].map(chip => chip.getAttribute("title"))).toEqual(files)
  expect(host.textContent).toContain("app.js")
  expect(host.textContent).not.toContain("引用了工作区文件")
  expect(host.textContent).not.toContain("Workspace file references")
  expect(displayContent(raw)).toBe("帮我分析")
})

it("renders a reference-only message without an empty prompt or unsafe page links", () => {
  const raw = withMessageContext("", [{ id: 7, title: "Unsafe link", url: "javascript:alert(1)" }], ["notes/report.md"])
  const message: OpenAiChatMessage = { role: "user", content: raw }
  const host = document.createElement("div")
  host.innerHTML = renderToStaticMarkup(<ChatMessageBlock message={message} allMessages={[message]} index={0} />)
  expect(host.querySelector("a")).toBeNull()
  expect(host.querySelector(".wb-user-message-text")).toBeNull()
  expect(host.querySelector(".lm-chat-bubble")).toBeNull()
  expect(host.querySelectorAll(".wb-reference-chip")).toHaveLength(2)
  expect(host.textContent).toBe("Unsafe linkreport.md")
})
