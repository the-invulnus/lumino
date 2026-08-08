import { describe, expect, it, vi } from "vitest"

import { LlmClient } from "./llm-client"

type MockResponse = Pick<Response, "ok" | "json">

/** 构造 fetcher mock：捕获请求体并返回合法的 OpenAI 响应 */
function mockFetcher() {
  let capturedBody: Record<string, unknown> | null = null
  const fetcher = vi.fn(async (_url: string, init?: RequestInit): Promise<MockResponse> => {
    capturedBody = JSON.parse((init?.body as string) ?? "{}") as Record<string, unknown>
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { role: "assistant", content: "hi" } }] })
    }
  })
  return { fetcher, getBody: () => capturedBody }
}

async function chatWith(config: Record<string, unknown>) {
  const { fetcher, getBody } = mockFetcher()
  const client = new LlmClient({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "m",
    ...config
  })
  await client.chat(
    [{ role: "user", content: "hi" }],
    undefined,
    { fetcher: fetcher as unknown as typeof fetch }
  )
  return getBody()
}

describe("LlmClient.buildRequestBody thinkingBody 注入", () => {
  it("injects thinkingBody fields into the request body", async () => {
    const body = await chatWith({
      thinkingBody: { thinking: { type: "enabled" }, reasoning_effort: "high" }
    })
    expect(body).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "high"
    })
    // 无多余 thinking 残留
    expect(Object.keys(body)).not.toContain("thinkingBody")
  })

  it("does not inject anything when thinkingBody is undefined (auto)", async () => {
    const body = await chatWith({})
    expect(body.thinking).toBeUndefined()
    expect(body.reasoning_effort).toBeUndefined()
  })

  it("does not inject anything when thinkingBody is empty object (auto)", async () => {
    const body = await chatWith({ thinkingBody: {} })
    expect(body.thinking).toBeUndefined()
  })

  it("extraBody wins over thinkingBody on same key", async () => {
    const body = await chatWith({
      thinkingBody: { thinking: { type: "enabled" }, temperature: 0.5 },
      extraBody: { thinking: { type: "disabled" } }
    })
    expect(body.thinking).toEqual({ type: "disabled" })
    // extraBody 只覆盖冲突 key，temperature 仍来自 thinkingBody
    expect(body.temperature).toBe(0.5)
  })
})
