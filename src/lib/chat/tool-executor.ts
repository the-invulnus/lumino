import type { OpenAiToolCall } from "./openai-messages"

type ToolHandler = (args: Record<string, unknown>) => Promise<string> | string

const toolRegistry = new Map<string, ToolHandler>()

export function registerTool(name: string, handler: ToolHandler): void {
  toolRegistry.set(name, handler)
}

export async function executeToolCall(
  call: OpenAiToolCall
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
    return await handler(args)
  } catch (error) {
    return JSON.stringify({
      error: "tool_execution_failed",
      name,
      message: error instanceof Error ? error.message : String(error)
    })
  }
}
