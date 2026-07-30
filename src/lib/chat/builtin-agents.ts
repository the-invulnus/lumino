/**
 * 内置 Agent 配置
 *
 * 新增内置 Agent 只需在此数组添加一个条目。
 * 所有 Agent（内置 + 用户自定义）使用完全相同的 AgentConfig 类型，
 * 运行时由 mode-config.ts 的 getAllAgents() 统一合并加载。
 *
 * 工具配置：内置 Agent 一律使用全部工具（agent-loop.ts 按 isBuiltin 分流，
 * toolFilter 传 undefined = 全部工具），tools 字段对内置 Agent 无意义。
 * 自定义 Agent 的 tools 是显式白名单（空数组 = 无工具）。
 * system prompt = 共享基础 Prompt（BASE_SYSTEM_PROMPT）+ 各自个性化指令。
 */

import { type AgentConfig, loadCustomAgents } from "./mode-config"
import { buildBuiltinPrompt } from "./system-prompt"
import { isObsidianConfigured, getObsidianSettings } from "../settings"

// ═══════════════════════════════════════════
// 内置 Agent 列表
// ═══════════════════════════════════════════

const BUILTIN_AGENT_DEFS: Omit<AgentConfig, "systemPrompt">[] = [
  {
    id: "chat",
    name: "agent.chat.name",
    description: "agent.chat.desc",
    icon: "chat",
    isBuiltin: true,
    tools: [],  // 内置 agent 用全部工具（isBuiltin 时忽略 tools）
    order: 0
  },
  {
    id: "research",
    name: "agent.research.name",
    description: "agent.research.desc",
    icon: "research",
    isBuiltin: true,
    tools: [],
    order: 1
  },
  {
    id: "replicate",
    name: "agent.replicate.name",
    description: "agent.replicate.desc",
    icon: "replicate",
    isBuiltin: true,
    tools: [],
    order: 2
  },
  {
    id: "automate",
    name: "agent.automate.name",
    description: "agent.automate.desc",
    icon: "automate",
    isBuiltin: true,
    tools: [],
    order: 3
  }
]

/**
 * 获取内置 Agent 列表（含动态生成的 system prompt）。
 * Obsidian 配置状态影响 prompt 注入。
 */
export async function getBuiltinAgents(): Promise<AgentConfig[]> {
  const obsidianSettings = await getObsidianSettings()
  const obsidianOn = isObsidianConfigured(obsidianSettings)
  return BUILTIN_AGENT_DEFS.map((def) => ({
    ...def,
    systemPrompt: buildBuiltinPrompt(def.id, obsidianOn)
  }))
}

/**
 * 获取所有可用的 Agent（内置 + 用户自定义），统一排序
 */
export async function getAllAgents(): Promise<AgentConfig[]> {
  const [builtinAgents, customAgents] = await Promise.all([
    getBuiltinAgents(),
    loadCustomAgents()
  ])
  return [...builtinAgents, ...customAgents].sort((a, b) => {
    if (a.isBuiltin && b.isBuiltin) return a.order - b.order
    if (a.isBuiltin) return -1
    return 1
  })
}

/**
 * 根据 id 查找 Agent（从内置 + 自定义中查找）
 */
export async function getAgentById(id: string): Promise<AgentConfig | undefined> {
  const builtinAgents = await getBuiltinAgents()
  const builtin = builtinAgents.find(a => a.id === id)
  if (builtin) return builtin

  const customAgents = await loadCustomAgents()
  return customAgents.find(a => a.id === id)
}