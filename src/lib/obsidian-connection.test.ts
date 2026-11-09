import { beforeEach, describe, expect, it, vi } from "vitest"
import { testObsidianConnection } from "./obsidian-connection"

const mocks = vi.hoisted(() => ({ connect: vi.fn(), listTools: vi.fn(), disconnect: vi.fn(), construct: vi.fn() }))
vi.mock("./chat/mcp/mcp-client", () => ({
  McpClient: class {
    constructor(...args: unknown[]) { mocks.construct(...args) }
    connect = mocks.connect
    listTools = mocks.listTools
    disconnect = mocks.disconnect
  }
}))

const settings = { enabled: true, baseUrl: " http://localhost:27123/ ", apiKey: " test-key " }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.connect.mockResolvedValue(undefined)
  mocks.listTools.mockResolvedValue([{ name: "vault_list" }, { name: "vault_read" }])
  mocks.disconnect.mockResolvedValue(undefined)
})

describe("Obsidian connection check", () => {
  it("checks draft credentials and reports available tools", async () => {
    await expect(testObsidianConnection(settings)).resolves.toBe(2)
    expect(mocks.construct).toHaveBeenCalledWith("http://localhost:27123/mcp", { Authorization: "Bearer test-key" })
    expect(mocks.disconnect).toHaveBeenCalledOnce()
  })

  it("preserves connection failures and cleans up the test session", async () => {
    mocks.connect.mockRejectedValue(new Error("MCP HTTP 401"))
    await expect(testObsidianConnection(settings)).rejects.toThrow("MCP HTTP 401")
    expect(mocks.listTools).not.toHaveBeenCalled()
    expect(mocks.disconnect).toHaveBeenCalledOnce()
  })

  it("does not report success when tool discovery fails", async () => {
    mocks.listTools.mockRejectedValue(new Error("Session not found"))
    await expect(testObsidianConnection(settings)).rejects.toThrow("Session not found")
    expect(mocks.disconnect).toHaveBeenCalledOnce()
  })

  it("reports an empty tool list separately from connection failure", async () => {
    mocks.listTools.mockResolvedValue([])
    await expect(testObsidianConnection(settings)).resolves.toBe(0)
  })
})
