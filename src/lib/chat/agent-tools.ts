import type { OpenAiToolCall, OpenAiToolDefinition } from "./openai-messages"
import { loadUserProfile } from "../memory/user-profile"
import { loadDailyMemories } from "../memory/daily-memory"

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
  },
  {
    type: "function",
    function: {
      name: "lumino_get_profile",
      description: "返回 Lumino 根据用户浏览行为推断的用户画像（姓名、兴趣、常用站点等）。",
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
      name: "lumino_get_daily_memories",
      description: "返回最近 N 天的日记忆摘要。用户询问「我最近看了什么」「我之前浏览过啥」时使用。",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "获取最近多少天的记忆，默认 7"
          }
        },
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

    if (name === "lumino_get_profile") {
      const profile = await loadUserProfile()
      return JSON.stringify(profile, null, 2)
    }

    if (name === "lumino_get_daily_memories") {
      const args = JSON.parse(call.function.arguments || "{}") as { days?: number }
      const days = args.days ?? 7
      const allMemories = await loadDailyMemories()
      const recent = allMemories
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, days)

      return JSON.stringify(
        recent.map((m) => ({
          date: m.date,
          summary: m.summary,
          keywords: m.keywords
        })),
        null,
        2
      )
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
