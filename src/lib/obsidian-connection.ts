import { McpClient } from "./chat/mcp/mcp-client"
import type { ObsidianSettings } from "./settings"

/** 使用独立会话验证草稿配置，不影响正在运行的 Agent。 */
export async function testObsidianConnection(settings: ObsidianSettings): Promise<number> {
  const client = new McpClient(`${settings.baseUrl.trim().replace(/\/+$/, "")}/mcp`, {
    Authorization: `Bearer ${settings.apiKey.trim()}`
  })
  try {
    await client.connect()
    return (await client.listTools()).length
  } finally {
    // 清理测试会话不应延迟界面展示结果。
    void client.disconnect().catch(() => {})
  }
}
