import type { OpenAiToolCall } from "./openai-messages"
import { maybeEvictToolResult } from "./tool-eviction"

type ToolHandler = (args: Record<string, unknown>) => Promise<string> | string

export function getToolHandler(name: string): ToolHandler | undefined {
  return toolRegistry.get(name)
}

const toolRegistry = new Map<string, ToolHandler>()

export function registerTool(name: string, handler: ToolHandler): void {
  toolRegistry.set(name, handler)
}

export async function executeToolCall(
  call: OpenAiToolCall,
  signal?: AbortSignal
): Promise<string> {
  const name = call.function.name
  const handler = toolRegistry.get(name)

  if (!handler) {
    return JSON.stringify({
      error: "unknown_tool",
      name,
      hint: "该工具尚未注册，请检查 tool-registry.ts"
    })
  }

  try {
    const args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>
    // 检查是否已中止
    if (signal?.aborted) {
      throw new DOMException("工具执行被中止", "AbortError")
    }
    const rawResult = await handler(args)

    // 驱逐判定：大工具结果自动写入 OPFS，用预览替换返回内容
    const evicted = await maybeEvictToolResult(rawResult, call.id, name)

    // 工具返回 error 字段时加日志，方便定位 agent 静默停止的原因
    if (evicted.startsWith('{"error"')) {
      console.warn(`[lumino:agent] tool ${name} returned error:`, evicted.slice(0, 200))
    }

    return evicted
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.warn(`[lumino:agent] tool ${name} threw:`, errMsg)
    return JSON.stringify({
      error: "tool_execution_failed",
      name,
      message: errMsg
    })
  }
}
