import type { OpenAiToolCall, OpenAiToolDefinition } from "./openai-messages"

export const LUMINO_AGENT_TOOLS: OpenAiToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "lumino_get_manifest_version",
      description: "返回当前 Lumino 浏览器扩展的版本号（来自 manifest.json）。",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "lumino_echo",
      description: "原样回显一段文本，用于验证工具调用链路。",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "要回显的文本" }
        },
        required: ["text"],
        additionalProperties: false
      }
    }
  }
]

export async function executeLuminoToolCall(
  call: OpenAiToolCall
): Promise<string> {
  const name = call.function.name

  try {
    if (name === "lumino_get_manifest_version") {
      const version = chrome.runtime.getManifest().version
      return JSON.stringify({ version })
    }

    if (name === "lumino_echo") {
      const args = JSON.parse(call.function.arguments || "{}") as { text?: string }
      return JSON.stringify({ echoed: args.text ?? "" })
    }

    return JSON.stringify({
      error: "unknown_tool",
      name
    })
  } catch (error) {
    return JSON.stringify({
      error: "tool_execution_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}
