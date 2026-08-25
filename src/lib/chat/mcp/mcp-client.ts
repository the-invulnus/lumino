/**
 * 轻量 MCP Streamable HTTP 客户端
 *
 * 实现 JSON-RPC 2.0 over HTTP POST，与 MCP Streamable HTTP Transport 兼容。
 * 不依赖 @modelcontextprotocol/sdk，零外部依赖，适配浏览器扩展 Service Worker 环境。
 *
 * 协议流程：
 *   1. initialize          → POST /mcp {"jsonrpc":"2.0","method":"initialize",...}
 *   2. notifications/initialized → POST /mcp {"jsonrpc":"2.0","method":"notifications/initialized"}
 *   3. tools/list          → 获取工具列表及参数 schema
 *   4. tools/call          → 调用单个工具
 */

export interface McpTool {
  name: string
  description?: string
  inputSchema: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
}

interface JsonRpcRequest {
  jsonrpc: "2.0"
  id: number | null
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: "2.0"
  id?: number | null
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

const MCP_PROTOCOL_VERSION = "2025-03-26"
const RPC_TIMEOUT_MS = 15000

export class McpClient {
  private url: string
  private headers: Record<string, string>
  private sessionId: string | null = null
  private requestId = 0
  private initialized = false

  /**
   * @param url    MCP endpoint 完整地址，例如 "http://127.0.0.1:27123/mcp"
   * @param headers 每次请求附带的静态 headers（认证信息等）
   */
  constructor(url: string, headers: Record<string, string>) {
    this.url = url.replace(/\/+$/, "")
    this.headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      ...headers
    }
  }

  get isConnected(): boolean {
    return this.initialized
  }

  // ── 公开 API ──

  /** 建立 MCP 会话：initialize → notifications/initialized */
  async connect(): Promise<void> {
    if (this.initialized) return

    // 1. initialize
    const initResult = await this.rpc("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      clientInfo: { name: "lumino", version: "0.1.0" }
    })

    if (!initResult.result) {
      throw new McpConnectionError(
        `MCP initialize failed: ${JSON.stringify(initResult.error)}`
      )
    }

    const serverInfo = initResult.result as Record<string, unknown>
    if (serverInfo.capabilities && (serverInfo.capabilities as Record<string, unknown>).tools) {
      // 服务端支持 tools，持续
    } else {
      console.warn("[mcp] 服务端未声明 tools 能力，继续尝试...")
    }

    // 2. 发送 initialized 通知（notification 无 id）
    await this.rpcNotification("notifications/initialized")
    this.initialized = true
  }

  /** 获取服务端工具列表 */
  async listTools(): Promise<McpTool[]> {
    this.ensureConnected()
    const result = await this.rpc("tools/list", {})
    if (!result.result) {
      throw new McpToolCallError("tools/list", `服务器错误: ${JSON.stringify(result.error)}`)
    }
    const r = result.result as { tools?: McpTool[] }
    return r.tools ?? []
  }

  /**
   * 调用一个 MCP 工具
   * @returns MCP content[0].text 的内容，或序列化的结果 JSON
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    this.ensureConnected()

    const result = await this.rpc("tools/call", {
      name,
      arguments: args
    })

    if (result.error) {
      throw new McpToolCallError(name, result.error.message)
    }

    const callResult = result.result as { content?: Array<{ type: string; text?: string }> }
    if (callResult?.content && callResult.content.length > 0) {
      return callResult.content.map(c => c.text ?? "").join("")
    }

    // 兜底：序列化整个 result
    return JSON.stringify(callResult)
  }

  /** 销毁 MCP 会话 */
  async disconnect(): Promise<void> {
    if (this.sessionId) {
      try {
        await fetch(this.url, {
          method: "DELETE",
          headers: { ...this.headers, "Mcp-Session-Id": this.sessionId }
        })
      } catch {
        // 忽略清理错误
      }
    }
    this.sessionId = null
    this.initialized = false
  }

  // ── 内部方法 ──

  private ensureConnected(): void {
    if (!this.initialized) {
      throw new McpConnectionError("MCP 客户端未初始化，请先调用 connect()")
    }
  }

  /** 发送 JSON-RPC 请求（带 id，期望返回） */
  private async rpc(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    const id = ++this.requestId
    const request: JsonRpcRequest = { jsonrpc: "2.0", id, method, params }
    const response = await this.sendRequest(request)
    return response
  }

  /** 发送 JSON-RPC notification（无 id，无 params，无返回期望） */
  private async rpcNotification(method: string): Promise<void> {
    const request = JSON.stringify({ jsonrpc: "2.0", method })
    await this.sendNotification(request)
  }

  /** notification 专用发送：不解析响应 */
  private async sendNotification(body: string): Promise<void> {
    const reqHeaders: Record<string, string> = { ...this.headers }
    if (this.sessionId) {
      reqHeaders["Mcp-Session-Id"] = this.sessionId
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS)

    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: reqHeaders,
        body,
        signal: controller.signal
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new McpConnectionError(
          `MCP HTTP ${res.status}: ${text.slice(0, 300)}`
        )
      }
      // notification 不期望返回体，忽略
    } catch (err) {
      if (err instanceof McpConnectionError) throw err
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new McpConnectionError(`MCP 请求超时 (${RPC_TIMEOUT_MS / 1000}s): notifications/initialized`)
      }
      throw new McpConnectionError(
        `MCP 请求失败: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /** 核心 HTTP 传输 —— 唯一操作 fetch 的方法 */
  private async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const reqHeaders: Record<string, string> = { ...this.headers }
    if (this.sessionId) {
      reqHeaders["Mcp-Session-Id"] = this.sessionId
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS)

    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify(request),
        signal: controller.signal
      })

      // 首次连接时提取 session id
      const newSessionId = res.headers.get("Mcp-Session-Id")
      if (newSessionId) {
        this.sessionId = newSessionId
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new McpConnectionError(
          `MCP HTTP ${res.status}: ${body.slice(0, 300)}`
        )
      }

      // notification 无 id，服务端无返回体
      if (request.id === null) {
        return { jsonrpc: "2.0", id: null }
      }

      // 解析响应体：可能是纯 JSON，也可能是 SSE 格式
      const text = await res.text()
      const contentType = res.headers.get("Content-Type") || ""

      if (contentType.includes("text/event-stream")) {
        // SSE 格式：提取 data: 行中的 JSON-RPC 响应
        const dataLine = text.split("\n")
          .find(line => line.startsWith("data: "))
        if (!dataLine) {
          throw new McpConnectionError(`SSE 响应中未找到 data 行: ${text.slice(0, 200)}`)
        }
        const jsonStr = dataLine.slice("data: ".length)
        return JSON.parse(jsonStr) as JsonRpcResponse
      }

      // 纯 JSON
      return JSON.parse(text) as JsonRpcResponse
    } catch (err) {
      if (err instanceof McpConnectionError || err instanceof McpToolCallError) {
        throw err
      }
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new McpConnectionError(`MCP 请求超时 (${RPC_TIMEOUT_MS / 1000}s): ${request.method}`)
      }
      throw new McpConnectionError(
        `MCP 请求失败: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

// ── 错误类型 ──

export class McpConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "McpConnectionError"
  }
}

export class McpToolCallError extends Error {
  public toolName: string
  constructor(toolName: string, detail: string) {
    super(`MCP tool "${toolName}": ${detail}`)
    this.name = "McpToolCallError"
    this.toolName = toolName
  }
}
