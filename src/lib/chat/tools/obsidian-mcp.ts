/**
 * Obsidian MCP 工具 handler 工厂
 *
 * 用 MCP 客户端替代旧的直接 HTTP 请求方式。
 * 每个 handler 委托给 McpClient.callTool()，签名与 tool-executor 兼容。
 */

import { McpClient } from "../mcp/mcp-client"
import { getObsidianSettings, isObsidianConfigured } from "../../settings"

// ── 模块级客户端状态 ──

let mcpClient: McpClient | null = null

export function getObsidianMcpClient(): McpClient | null {
  return mcpClient
}

/** 从 settings 创建或回收 MCP 客户端 */
export async function ensureMcpClient(): Promise<McpClient> {
  if (mcpClient?.isConnected) return mcpClient

  const settings = await getObsidianSettings()
  if (!isObsidianConfigured(settings)) {
    throw new Error("obsidian_not_configured")
  }

  // 如果已有旧实例但未连接，先清理
  if (mcpClient) {
    await mcpClient.disconnect().catch(() => {})
  }

  mcpClient = new McpClient(
    `${settings.baseUrl.replace(/\/+$/, "")}/mcp`,
    { "Authorization": `Bearer ${settings.apiKey}` }
  )
  await mcpClient.connect()
  return mcpClient
}

/** 重置客户端（settings 变更时调用） */
export async function resetMcpClient(): Promise<void> {
  if (mcpClient) {
    await mcpClient.disconnect().catch(() => {})
    mcpClient = null
  }
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
