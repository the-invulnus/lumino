/**
 * 内置 Agent 配置
 *
 * 新增内置 Agent 只需在此数组添加一个条目。
 * 所有 Agent（内置 + 用户自定义）使用完全相同的 AgentConfig 类型，
 * 运行时由 mode-config.ts 的 getAllAgents() 统一合并加载。
 *
 * 所有内置 Agent 均使用全部工具（tools: []），仅 system prompt 不同。
 * system prompt = 共享基础 Prompt（BASE_SYSTEM_PROMPT）+ 各自个性化指令。
 */

import { type AgentConfig, loadCustomAgents } from "./mode-config"
import { BUILTIN_PROMPTS } from "./system-prompt"

// ═══════════════════════════════════════════
// 内置 Agent 列表
// ═══════════════════════════════════════════

export const BUILTIN_AGENTS: AgentConfig[] = [
  {
    id: "chat",
    name: "agent.chat.name",
    description: "agent.chat.desc",
    icon: "chat",
    isBuiltin: true,
    systemPrompt: BUILTIN_PROMPTS.chat,
    tools: [],  // 空数组 = 全部工具
    order: 0
  },
  {
    id: "research",
    name: "agent.research.name",
    description: "agent.research.desc",
    icon: "research",
    isBuiltin: true,
    systemPrompt: BUILTIN_PROMPTS.research,
    tools: [],
    order: 1
  },
  {
    id: "replicate",
    name: "agent.replicate.name",
    description: "agent.replicate.desc",
    icon: "replicate",
    isBuiltin: true,
    systemPrompt: BUILTIN_PROMPTS.replicate,
    tools: [],
    order: 2
  },
  {
    id: "automate",
    name: "agent.automate.name",
    description: "agent.automate.desc",
    icon: "automate",
    isBuiltin: true,
    systemPrompt: BUILTIN_PROMPTS.automate,
    tools: [],
    order: 3
  }
]

/**
 * 获取所有可用的 Agent（内置 + 用户自定义），统一排序
 */
export async function getAllAgents(): Promise<AgentConfig[]> {
  const customAgents = await loadCustomAgents()
  return [...BUILTIN_AGENTS, ...customAgents].sort((a, b) => {
    if (a.isBuiltin && b.isBuiltin) return a.order - b.order
    if (a.isBuiltin) return -1
    return 1
  })
}

/**
 * 根据 id 查找 Agent（从内置 + 自定义中查找）
 */
export async function getAgentById(id: string): Promise<AgentConfig | undefined> {
  const builtin = BUILTIN_AGENTS.find(a => a.id === id)
  if (builtin) return builtin

  const customAgents = await loadCustomAgents()
  return customAgents.find(a => a.id === id)
}