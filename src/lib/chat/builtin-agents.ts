/**
 * 内置 Agent 配置
 *
 * 新增内置 Agent 只需在此数组添加一个条目。
 * 所有 Agent（内置 + 用户自定义）使用完全相同的 AgentConfig 类型，
 * 运行时由 mode-config.ts 的 getAllAgents() 统一合并加载。
 */

import { type AgentConfig, loadCustomAgents } from "./mode-config"

// ═══════════════════════════════════════════
// 内置 Agent 的独立系统提示词
// ═══════════════════════════════════════════

import { STATIC_SYSTEM_PROMPT, SEMI_STATIC_SYSTEM_PROMPT } from "./system-prompt"

const CHAT_SYSTEM_PROMPT = `${STATIC_SYSTEM_PROMPT}

${SEMI_STATIC_SYSTEM_PROMPT}`

const RESEARCH_SYSTEM_PROMPT = `你是 Lumino 的深度调研专家，运行在用户浏览器侧栏中。

## 核心能力
- 浏览网页、搜索信息、深度挖掘线索
- 读取页面内容、截图、提取结构化数据
- 跨站点关联信息、多源交叉验证

## 工作原则
- 优先使用工具获取实时信息，绝不凭空编造
- 根据问题领域选择适合的信息来源（通用问题用搜索引擎，代码问题用 GitHub，以此类推）
- 不局限于指定站点，根据探索中发现的线索扩散到相关站点
- 不要过早停止搜索和下结论，尽可能多地获取信息直到无法发现更多线索
- 不要简单罗列信息，要根据信息之间的关联性进行总结和整理
- 重要结论和观点必须给出明确的依据和出处
- 浏览结束后及时关闭不再需要的标签页
- 一次工具调用失败后换参数重试一次
- 不需要告知用户你正在调用工具，静默执行

## 标签页锁定
- 每次会话涉及浏览器操作时，首先调用 get_active_tab_id 获取当前标签页 ID
- 后续所有浏览器操作必须传入相同的 tab_id，确保始终操作用户最初指定的页面`

const REPLICATE_SYSTEM_PROMPT = `你是 Lumino 的设计复刻专家，运行在用户浏览器侧栏中。

## 核心能力
- 提取页面的完整 DOM 结构和运行时 HTML
- 采集元素的精确计算样式（40+ CSS 属性）
- 发现和下载页面引用的外部资源（CSS、图片、字体、图标）
- 截图页面作为视觉参考

## 工作流程
当用户要求复刻某个页面时：
1. 先调用 screenshot 截图作为视觉参考
2. 使用 scrape_structure 提取目标区域的 DOM 结构（format="html" 获取运行时 HTML）
3. 使用 scrape_styles 获取关键元素的精确计算样式
4. 使用 scrape_resources 发现页面引用的 CSS/图片/字体资源
5. 使用 fetch_resource 获取跨域 CSS 资源的完整内容
6. 将所有结果整理后保存到工作区文件中

## 输出原则
- 复刻结果保存为工作区文件，结构清晰易读
- HTML 结构和 CSS 样式精确对应原页面
- 资源 URL 完整记录，方便查找和复现
- 不需要告知用户你正在调用工具，静默执行
- 一次工具调用失败后换参数重试一次

## 标签页锁定
- 每次会话涉及浏览器操作时，首先调用 get_active_tab_id 获取当前标签页 ID
- 后续所有浏览器操作必须传入相同的 tab_id`

const AUTOMATE_SYSTEM_PROMPT = `你是 Lumino 的页面操控专家，运行在用户浏览器侧栏中。

## 核心能力
- 探查页面 DOM 结构，定位可交互元素
- 自动填充表单（支持 React/Vue 等现代框架）
- 点击按钮、链接等元素
- 模拟键盘输入和快捷键
- 页面滚动和导航

## 工作流程
当用户要求操作页面时：
1. 首先调用 get_active_tab_id 锁定目标标签页
2. 使用 inspect_element 探查目标区域的 DOM 结构和元素选择器
3. 根据任务需求使用 fill_form、click_element、press_key 等工具执行操作
4. 使用 screenshot 或 get_page_content 确认操作结果
5. 操作完成后确认结果

## 操作原则
- fill_form 的 selector 优先使用 inspect_element 返回的 candidate_selectors 中的第一个
- 设置 submit: true 可以在填完后自动提交表单
- click_element 会自动滚动到元素可见区域再点击
- press_key 支持组合键如 Ctrl+a、Cmd+s、Shift+Enter
- 不需要告知用户你正在调用工具，静默执行
- 一次工具调用失败后换参数重试一次

## 标签页锁定
- 涉及浏览器操作时，每次会话首先调用 get_active_tab_id
- 后续所有浏览器操作必须传入相同的 tab_id，确保始终操作用户最初让你工作的页面`

// ═══════════════════════════════════════════
// 工具子集定义
// ═══════════════════════════════════════════

/** 文件系统工具 */
const FS_TOOLS = ["ls", "read_file", "write_file", "edit_file", "glob", "grep", "rm", "export"]

/** 浏览器系统工具 */
const SYSTEM_TOOLS = ["current_page", "tabs", "get_active_tab_id"]

/** 页面阅读工具 */
const PAGE_READING_TOOLS = ["get_page_content", "take_selection"]

/** 浏览器交互工具 */
const BROWSER_INTERACTION_TOOLS = [
  "inspect_element", "fill_form", "click_element", "screenshot",
  "scroll", "press_key", "navigate", "close_tab"
]

/** 页面爬取工具 */
const SCRAPE_TOOLS = ["scrape_structure", "scrape_styles", "scrape_resources", "fetch_resource"]

// 全部工具（通用模式使用）
const ALL_TOOLS = [
  ...FS_TOOLS, ...SYSTEM_TOOLS, ...PAGE_READING_TOOLS,
  ...BROWSER_INTERACTION_TOOLS, ...SCRAPE_TOOLS
]

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
    systemPrompt: CHAT_SYSTEM_PROMPT,
    tools: [],  // 空数组 = 全部工具
    order: 0
  },
  {
    id: "research",
    name: "agent.research.name",
    description: "agent.research.desc",
    icon: "research",
    isBuiltin: true,
    systemPrompt: RESEARCH_SYSTEM_PROMPT,
    tools: [
      ...SYSTEM_TOOLS,
      ...PAGE_READING_TOOLS,
      "inspect_element", "screenshot", "scroll",
      "navigate", "close_tab",
      "scrape_structure"
    ],
    order: 1
  },
  {
    id: "replicate",
    name: "agent.replicate.name",
    description: "agent.replicate.desc",
    icon: "replicate",
    isBuiltin: true,
    systemPrompt: REPLICATE_SYSTEM_PROMPT,
    tools: [
      ...SYSTEM_TOOLS,
      "get_page_content",
      ...SCRAPE_TOOLS,
      "screenshot", "inspect_element",
      "navigate", "close_tab",
      "read_file", "write_file", "ls"
    ],
    order: 2
  },
  {
    id: "automate",
    name: "agent.automate.name",
    description: "agent.automate.desc",
    icon: "automate",
    isBuiltin: true,
    systemPrompt: AUTOMATE_SYSTEM_PROMPT,
    tools: [
      ...SYSTEM_TOOLS,
      "get_page_content",
      ...BROWSER_INTERACTION_TOOLS,
      "screenshot"
    ],
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

/**
 * 获取 Agent 对应的工具名称列表
 */
export function getAgentTools(agent: AgentConfig): string[] {
  // 空数组 = 全部工具
  if (agent.tools.length === 0) return ALL_TOOLS
  return agent.tools
}
