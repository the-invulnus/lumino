import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createMcpHandler,
  discoverObsidianTools,
  ensureMcpClient,
  getDiscoveredObsidianTools,
  getObsidianDiscoveryError,
  resetMcpClient
} from "./obsidian-mcp"

const tool = { name: "vault_list", inputSchema: { type: "object", properties: {} } }
let settings: Record<string, unknown>
let fetchMock: ReturnType<typeof vi.fn>
let nextSession: number

beforeEach(async () => {
  await resetMcpClient()
  settings = { obsidianEnabled: true, obsidianApiKey: "test-key", obsidianBaseUrl: "http://localhost:27123" }
  vi.stubGlobal("chrome", { storage: { local: { get: vi.fn(async () => settings) } } })
  nextSession = 0
  fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === "DELETE") return new Response(null, { status: 204 })
    const request = JSON.parse(init.body as string)
    if (request.method === "notifications/initialized") return new Response(null, { status: 202 })
    if (request.method === "initialize") {
      return Response.json({ jsonrpc: "2.0", id: request.id, result: { capabilities: { tools: {} } } }, {
        headers: { "Mcp-Session-Id": `session-${++nextSession}` }
      })
    }
    return Response.json({ jsonrpc: "2.0", id: request.id, result: { tools: [tool] } })
  })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(async () => {
  await resetMcpClient()
  vi.unstubAllGlobals()
})

describe("Obsidian MCP discovery recovery", () => {
  it("reinitializes an expired session and restores tools", async () => {
    await discoverObsidianTools()
    fetchMock.mockImplementationOnce(async () => Response.json({ error: "Session not found" }, { status: 404 }))

    await expect(discoverObsidianTools()).resolves.toEqual([tool])

    expect(nextSession).toBe(2)
    expect(getObsidianDiscoveryError()).toBeNull()
    expect(getDiscoveredObsidianTools()).toEqual([tool])
    const lastRequest = fetchMock.mock.calls.at(-1)![1] as RequestInit
    expect(lastRequest.headers).toMatchObject({ "Mcp-Session-Id": "session-2" })
  })

  it("uses changed credentials instead of reusing the old client", async () => {
    await discoverObsidianTools()
    settings.obsidianApiKey = "replacement-key"
    settings.obsidianBaseUrl = "http://localhost:27124"
    await discoverObsidianTools()

    expect(nextSession).toBe(2)
    expect(fetchMock.mock.calls.at(-1)![0]).toBe("http://localhost:27124/mcp")
    expect(fetchMock.mock.calls.at(-1)![1].headers).toMatchObject({ Authorization: "Bearer replacement-key" })
  })

  it("removes discovered tools when the integration is disabled", async () => {
    await discoverObsidianTools()
    settings.obsidianEnabled = false
    await expect(discoverObsidianTools()).resolves.toEqual([])
    expect(getDiscoveredObsidianTools()).toEqual([])
    expect(getObsidianDiscoveryError()).toBeNull()
  })

  it("retains a diagnostic and clears tools when reconnection fails", async () => {
    await discoverObsidianTools()
    fetchMock.mockImplementation(async () => { throw new TypeError("Failed to fetch") })

    await expect(discoverObsidianTools()).rejects.toThrow("Failed to fetch")
    expect(getDiscoveredObsidianTools()).toEqual([])
    expect(getObsidianDiscoveryError()).toContain("Failed to fetch")
  })

  it("shares initialization between concurrent callers", async () => {
    const [first, second] = await Promise.all([ensureMcpClient(), ensureMcpClient()])
    expect(first).toBe(second)
    expect(nextSession).toBe(1)
  })

  it("does not replay a tool call after an ambiguous network failure", async () => {
    await discoverObsidianTools()
    const before = fetchMock.mock.calls.length
    fetchMock.mockImplementation(async () => { throw new TypeError("Failed to fetch") })
    const result = await createMcpHandler("vault_write")({ path: "test.md" })
    expect(JSON.parse(result).error).toBe("obsidian_mcp_failed")
    expect(fetchMock.mock.calls.length - before).toBe(1)
  })
})
