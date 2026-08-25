/**
 * @vitest-environment node
 */

import { describe, expect, it, vi } from "vitest"

import { runAgentLoop } from "./agent-loop"
import { LlmClient } from "./llm-client"
import type { LlmResponse, LuminoTool } from "./llm-types"

/** 构造一个 chat 方法被 mock 的 LlmClient */
function mockClient(sequence: Partial<LlmResponse>[]) {
  const client = new LlmClient({
    baseUrl: "https://example.com/v1",
    apiKey: "test-key",
    model: "test-model"
  })
  const chatMock = vi
    .spyOn(client, "chat")
    .mockImplementation(async () => {
      const next = sequence.shift() ?? {}
      return {
        text: null,
        ...next
      } as LlmResponse
    })
  return { client, chatMock }
}

describe("runAgentLoop reasoning_content 透传", () => {
  it("模型返回 reasoningContent 时，assistant 消息携带 reasoning_content", async () => {
    const { client } = mockClient([
      { text: "最终答复", reasoningContent: "先想一下再回答" }
    ])

    const messages = await runAgentLoop({
      client,
      systemPrompt: "system",
      messages: [{ role: "user", content: "问题" }],
      tools: []
    })

    const assistant = messages.filter((m) => m.role === "assistant")
    expect(assistant).toHaveLength(1)
    expect(assistant[0]).toMatchObject({
      role: "assistant",
      content: "最终答复",
      reasoning_content: "先想一下再回答"
    })
  })

  it("模型未返回 reasoningContent 时，assistant 消息不含该字段", async () => {
    const { client } = mockClient([{ text: "普通答复" }])

    const messages = await runAgentLoop({
      client,
      systemPrompt: "system",
      messages: [{ role: "user", content: "问题" }],
      tools: []
    })

    const assistant = messages.filter((m) => m.role === "assistant")
    expect(assistant).toHaveLength(1)
    expect(assistant[0]).not.toHaveProperty("reasoning_content")
  })

  it("onStepFinish 回调携带 reasoningContent", async () => {
    const { client } = mockClient([
      { text: "有推理的答复", reasoningContent: "推理内容" }
    ])
    const onStepFinish = vi.fn()

    await runAgentLoop({
      client,
      systemPrompt: "system",
      messages: [{ role: "user", content: "问题" }],
      tools: [],
      onStepFinish
    })

    expect(onStepFinish).toHaveBeenCalledTimes(1)
    expect(onStepFinish).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "有推理的答复",
        reasoningContent: "推理内容"
      })
    )
  })

  it("有 tool_calls 时 assistant 消息也携带 reasoning_content", async () => {
    const { client } = mockClient([
      {
        text: "我准备调用工具",
        reasoningContent: "用户想删除文件，需要先用 rm",
        toolCalls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "fake_tool", arguments: "{}" }
          }
        ]
      },
      // 工具执行后模型给出最终答复（无 tool_calls）
      { text: "删除完成" }
    ])

    const fakeTool: LuminoTool = {
      name: "fake_tool",
      description: "fake",
      inputSchema: { safeParse: () => ({ success: true, data: {} }) } as never,
      execute: async () => "ok"
    }

    const messages = await runAgentLoop({
      client,
      systemPrompt: "system",
      messages: [{ role: "user", content: "删除文件" }],
      tools: [fakeTool]
    })

    const assistantWithTools = messages.find(
      (m) => m.role === "assistant" && Array.isArray(m.tool_calls)
    )
    expect(assistantWithTools).toMatchObject({
      role: "assistant",
      reasoning_content: "用户想删除文件，需要先用 rm"
    })
  })
})
