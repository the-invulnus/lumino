import { describe, expect, it, vi } from "vitest"

import { LlmRequestError, requestChatCompletion, requestChatCompletionTurn } from "./openai"

describe("requestChatCompletion", () => {
  it("posts OpenAI-compatible chat completions requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hello from AI" } }]
      })
    })

    const answer = await requestChatCompletion(
      {
        baseUrl: "https://api.example.com/v1/",
        apiKey: "test-key",
        model: "gpt-test"
      },
      [{ role: "user", content: "Hi" }],
      { fetcher: fetchMock }
    )

    expect(answer).toBe("Hello from AI")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-key"
        },
        body: JSON.stringify({
          model: "gpt-test",
          messages: [{ role: "user", content: "Hi" }]
        })
      }
    )
  })

  it("throws a typed error for failed API responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: { message: "Invalid API key" }
      })
    })

    await expect(
      requestChatCompletion(
        {
          baseUrl: "https://api.example.com/v1",
          apiKey: "bad-key",
          model: "gpt-test"
        },
        [{ role: "user", content: "Hi" }],
        { fetcher: fetchMock }
      )
    ).rejects.toMatchObject({
      name: "LlmRequestError",
      message: "Invalid API key",
      status: 401
    } satisfies Partial<LlmRequestError>)
  })
})

describe("requestChatCompletionTurn", () => {
  it("returns assistant message with tool_calls when present", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "lumino_echo", arguments: '{"text":"hi"}' }
                }
              ]
            }
          }
        ]
      })
    })

    const result = await requestChatCompletionTurn(
      {
        baseUrl: "https://api.example.com/v1/",
        apiKey: "test-key",
        model: "gpt-test"
      },
      {
        messages: [{ role: "user", content: "ping" }],
        tools: [
          {
            type: "function",
            function: {
              name: "lumino_echo",
              description: "echo",
              parameters: { type: "object", properties: {} }
            }
          }
        ]
      },
      { fetcher: fetchMock }
    )

    expect(result.message.role).toBe("assistant")
    expect(result.message.content).toBeNull()
    expect(result.message.tool_calls?.[0]?.function.name).toBe("lumino_echo")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.tools).toHaveLength(1)
    expect(body.messages).toEqual([{ role: "user", content: "ping" }])
  })
})
