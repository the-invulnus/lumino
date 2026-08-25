import { describe, expect, it, vi } from "vitest"

import {
  DEFAULT_THINKING_CONFIG,
  getLlmSettings,
  getThinkingConfig,
  hasCompleteLlmSettings,
  resolveThinkingBody,
  saveLlmSettings,
  saveThinkingConfig,
  THINKING_CONFIG_KEY
} from "./settings"
import type { LlmSettings } from "./llm/llm-types"

function createStorageArea(initial: Record<string, unknown> = {}) {
  let stored = { ...initial }

  return {
    area: {
      get: vi.fn(async () => stored),
      set: vi.fn(async (value: Record<string, unknown>) => {
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

describe("Thinking config", () => {
  it("returns default config when storage is empty", async () => {
    const storage = createStorageArea()
    await expect(getThinkingConfig(storage.area)).resolves.toEqual(
      DEFAULT_THINKING_CONFIG
    )
  })

  it("saves and reads back config round-trip", async () => {
    const storage = createStorageArea()
    const config = {
      modes: [
        { id: "on", label: "on", body: { enable_thinking: true } },
        { id: "off", label: "off", body: {} }
      ],
      defaultModeId: "on"
    }

    await saveThinkingConfig(config, storage.area)
    await expect(getThinkingConfig(storage.area)).resolves.toEqual(config)
  })

  it("falls back to default on garbage / empty modes", async () => {
    const storage = createStorageArea({ [THINKING_CONFIG_KEY]: "not-an-object" })
    await expect(getThinkingConfig(storage.area)).resolves.toEqual(
      DEFAULT_THINKING_CONFIG
    )

    const empty = createStorageArea({ [THINKING_CONFIG_KEY]: { modes: [], defaultModeId: "x" } })
    await expect(getThinkingConfig(empty.area)).resolves.toEqual(
      DEFAULT_THINKING_CONFIG
    )
  })

  it("filters invalid modes and falls back defaultModeId to first mode", async () => {
    const storage = createStorageArea({
      [THINKING_CONFIG_KEY]: {
        modes: [
          { id: "a", label: "A", body: {} },
          { id: "broken" }, // 缺 label/body，被过滤
          { id: "b", label: "B", body: {} }
        ],
        defaultModeId: "deleted-id"
      }
    })

    const config = await getThinkingConfig(storage.area)
    expect(config.modes).toEqual([
      { id: "a", label: "A", body: {} },
      { id: "b", label: "B", body: {} }
    ])
    expect(config.defaultModeId).toBe("a")
  })

  it("saving LLM settings does not clobber thinking config", async () => {
    const storage = createStorageArea()
    await saveThinkingConfig(
      { modes: [{ id: "m", label: "M", body: { a: 1 } }], defaultModeId: "m" },
      storage.area
    )
    await saveLlmSettings(
      { baseUrl: "https://a.b", apiKey: "k", model: "m" },
      storage.area
    )
    expect(storage.getStored()[THINKING_CONFIG_KEY]).toBeDefined()
  })
})

describe("resolveThinkingBody", () => {
  const config = {
    modes: [
      { id: "off", label: "off", body: {} },
      { id: "on", label: "on", body: { thinking: { type: "enabled" } } }
    ],
    defaultModeId: "off"
  }

  it("resolves body by mode id", () => {
    expect(resolveThinkingBody(config, "on")).toEqual({
      thinking: { type: "enabled" }
    })
  })

  it("returns undefined for empty body", () => {
    expect(resolveThinkingBody(config, "off")).toBeUndefined()
  })

  it("falls back to defaultModeId when id is unknown or omitted", () => {
    expect(resolveThinkingBody(config, "nope")).toBeUndefined()
    expect(resolveThinkingBody(config, undefined)).toBeUndefined()
    expect(resolveThinkingBody(config)).toBeUndefined()
  })

  it("falls back to defaultModeId when body exists there", () => {
    const cfg = { ...config, defaultModeId: "on" }
    expect(resolveThinkingBody(cfg)).toEqual({ thinking: { type: "enabled" } })
  })
})
