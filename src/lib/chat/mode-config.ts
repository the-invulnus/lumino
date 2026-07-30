/**
 * Agent 配置类型与加载逻辑
 *
 * 内置 Agent 和用户自定义 Agent 使用完全相同的 AgentConfig 类型。
 * 运行时通过 getAllAgents() 合并，前端统一渲染。
 */

export type AgentConfig = {
  id: string            // "chat" | "research" | ... | custom-uuid
  name: string          // "通用" | "深度调研" | ...
  description: string   // 一句话描述（展示在首页卡片和导航 tooltip）
  icon: string          // 图标标识符，对应 icons.tsx 中的 key
  isBuiltin: boolean
  systemPrompt: string  // 完整系统提示词
  tools: string[]       // 工具名称白名单。内置 agent 忽略此字段（用全部工具）；自定义 agent 按此过滤，空数组 = 无工具。可含 "mcp:*" 通配符。
  order: number         // 排序权重
}

/** 从 chrome.storage.sync 加载用户自定义 Agent */
export async function loadCustomAgents(): Promise<AgentConfig[]> {
  try {
    const data = await chrome.storage.sync.get("lumino_custom_agents")
    const agents = data.lumino_custom_agents
    if (Array.isArray(agents)) {
      return agents as AgentConfig[]
    }
  } catch {
    // sync area 不可用时降级到 local
    try {
      const data = await chrome.storage.local.get("lumino_custom_agents")
      const agents = data.lumino_custom_agents
      if (Array.isArray(agents)) {
        return agents as AgentConfig[]
      }
    } catch {
      // 静默
    }
  }
  return []
}

/** 保存用户自定义 Agent 到 chrome.storage.sync（降级到 local） */
export async function saveCustomAgents(agents: AgentConfig[]): Promise<void> {
  const payload = { lumino_custom_agents: agents }
  try {
    await chrome.storage.sync.set(payload)
  } catch {
    // sync 不可用时降级到 local
    await chrome.storage.local.set(payload)
  }
}

/** 从 localStorage 读取最后使用的模式 */
export function getLastActiveMode(): string | null {
  try {
    return localStorage.getItem("lumino_last_mode")
  } catch {
    return null
  }
}

export function setLastActiveMode(mode: string): void {
  try {
    localStorage.setItem("lumino_last_mode", mode)
  } catch {
    // 静默
  }
}
