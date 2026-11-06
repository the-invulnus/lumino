/**
 * Obsidian MCP 工具 handler 工厂
 *
 * 用 MCP 客户端替代旧的直接 HTTP 请求方式。
 * 每个 handler 委托给 McpClient.callTool()，签名与 tool-executor 兼容。
 */

import { McpClient, type McpTool } from "../mcp/mcp-client"
import { getObsidianSettings, isObsidianConfigured } from "../../settings"

// ── 模块级客户端状态 ──

let mcpClient: McpClient | null = null
let clientConfig: string | null = null
let pendingClient: Promise<McpClient> | null = null
let discoveryError: string | null = null
let discoveredTools: McpTool[] = []

export function getDiscoveredObsidianTools(): McpTool[] {
  return discoveredTools
}

export function getObsidianDiscoveryError(): string | null {
  return discoveryError
}

/** 连接和发现失败必须传给 Agent，避免把故障误报成未启用集成。 */
export async function discoverObsidianTools() {
  discoveryError = null
  discoveredTools = []
  const settings = await getObsidianSettings()
  if (!isObsidianConfigured(settings)) {
    await resetMcpClient()
    return []
  }
  try {
    const wasConnected = mcpClient?.isConnected
    const client = await ensureMcpClient()
    try {
      discoveredTools = await client.listTools()
    } catch (error) {
      // Obsidian 重启后，本地 initialized 标记仍可能为 true。
      if (!wasConnected) throw error
      await resetMcpClient()
      const freshClient = await ensureMcpClient()
      discoveredTools = await freshClient.listTools()
    }
    if (discoveredTools.length === 0) {
      discoveryError = "Obsidian MCP 已连接，但 tools/list 返回了空工具列表。"
    }
    return discoveredTools
  } catch (error) {
    discoveryError = error instanceof Error ? error.message : String(error)
    await resetMcpClient()
    throw error
  }
}

export function getObsidianMcpClient(): McpClient | null {
  return mcpClient
}

/** 从 settings 创建或回收 MCP 客户端 */
export async function ensureMcpClient(): Promise<McpClient> {
  if (pendingClient) return pendingClient
  pendingClient = connectConfiguredClient()
  try {
    return await pendingClient
  } finally {
    pendingClient = null
  }
}

async function connectConfiguredClient(): Promise<McpClient> {
  const settings = await getObsidianSettings()
  if (!isObsidianConfigured(settings)) {
    await resetMcpClient()
    throw new Error("obsidian_not_configured")
  }
  const config = JSON.stringify([settings.baseUrl, settings.apiKey])
  if (mcpClient?.isConnected && clientConfig === config) return mcpClient

  // 如果已有旧实例但未连接，先清理
  if (mcpClient) {
    await mcpClient.disconnect().catch(() => {})
  }

  mcpClient = new McpClient(
    `${settings.baseUrl.replace(/\/+$/, "")}/mcp`,
    { "Authorization": `Bearer ${settings.apiKey}` }
  )
  clientConfig = config
  await mcpClient.connect()
  return mcpClient
}

/** 重置客户端（settings 变更时调用） */
export async function resetMcpClient(): Promise<void> {
  clientConfig = null
  discoveredTools = []
  const previousClient = mcpClient
  mcpClient = null
  if (previousClient) await previousClient.disconnect().catch(() => {})
}

// ── Handler 工厂 ──

type ToolHandler = (args: Record<string, unknown>) => Promise<string>

/**
 * 创建一个委托给 MCP 的工具 handler
 * @param mcpToolName MCP 工具名（如 "vault_list"）
 */
export function createMcpHandler(mcpToolName: string): ToolHandler {
  return async (args: Record<string, unknown>): Promise<string> => {
    try {
      const client = await ensureMcpClient()
      return await client.callTool(mcpToolName, args)
    } catch (error) {
      if (error instanceof Error && error.message === "obsidian_not_configured") {
        return JSON.stringify({ error: "obsidian_not_configured", message: "请在扩展设置中启用并配置 Obsidian API" })
      }
      return JSON.stringify({
        error: "obsidian_mcp_failed",
        tool: mcpToolName,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }
}
