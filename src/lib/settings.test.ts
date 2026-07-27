import { describe, expect, it, vi } from "vitest"

import {
  getLlmSettings,
  hasCompleteLlmSettings,
  saveLlmSettings
} from "./settings"
import type { LlmSettings } from "./llm/llm-types"

function createStorageArea(initial: Partial<LlmSettings> = {}) {
  let stored = { ...initial }

  return {
    area: {
      get: vi.fn(async () => stored),
      set: vi.fn(async (value: Partial<LlmSettings>) => {
        stored = { ...stored, ...value }
      })
    },
    getStored: () => stored
  }
}

describe("LLM settings", () => {
  it("saves and reads trimmed OpenAI-compatible settings", async () => {
    const storage = createStorageArea()

    await saveLlmSettings(
      {
        baseUrl: " https://api.example.com/v1/ ",
        apiKey: " sk-test ",
        model: " gpt-test "
      },
      storage.area
    )

    expect(storage.getStored()).toEqual({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "gpt-test"
    })
    await expect(getLlmSettings(storage.area)).resolves.toEqual({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "gpt-test"
    })
  })

  it("reports whether settings are complete", () => {
    expect(
      hasCompleteLlmSettings({
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "gpt-test"
      })
    ).toBe(true)
    expect(
      hasCompleteLlmSettings({
        baseUrl: "https://api.example.com/v1",
        apiKey: "",
        model: "gpt-test"
      })
    ).toBe(false)
  })
})
