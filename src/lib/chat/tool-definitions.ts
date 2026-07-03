/**
 * Lumino 工具定义
 *
 * 架构：
 * - 基础工具（memory、fs、browser）→ schema + handler 绑定在一起，直接传给 AI SDK
 * - Obsidian MCP 工具 → schema 静态定义，handler 由 McpClient 动态提供，但写入
 *   toolRegistry 后 schema 的 execute 从中查找
 *
 * 关键约定：每个 luminoTool 的 name 必须和 toolRegistry 中 registerTool 的 key 一致。
 * getLuminoAgentTools() 只返回已经实际注册了 handler 的工具，避免 schema 暴露但
 * handler 缺失导致的 "unknown_tool" 错误。
 */

import { tool } from "ai"
import * as z from "zod"
import { getObsidianMcpClient } from "./tools/obsidian-mcp"

// ═══════════════════════════════════════════
// luminoTool — AI SDK tool 包装器
// ═══════════════════════════════════════════

/**
 * 创建一个 Lumino 工具。
 *
 * handler: 可选的执行函数。传入时直接绑定到工具，不依赖 toolRegistry。
 *          不传时（Obsidian MCP 工具），execute 从 toolRegistry 动态查找。
 */
function luminoTool<NAME extends string, SCHEMA extends z.ZodTypeAny>(opts: {
  name: NAME
  description: string
  inputSchema: SCHEMA
  handler?: (args: Record<string, unknown>) => Promise<string>
}) {
  const t = tool({
    description: opts.description,
    inputSchema: opts.inputSchema,
    execute: opts.handler
      ? async (args) => {
          try {
            return await opts.handler!(args as Record<string, unknown>)
          } catch (error) {
            return JSON.stringify({
              error: "tool_execution_failed",
              name: opts.name,
              message: error instanceof Error ? error.message : String(error)
            })
          }
        }
      : async (args) => {
          const handler = getToolHandler(opts.name)
          if (!handler) {
            return JSON.stringify({
              error: "unknown_tool",
              name: opts.name,
              hint: "该工具的 handler 未注册，可能是 MCP 连接失败。请检查 Obsidian 是否运行。"
            })
          }
          try {
            return await handler(args as Record<string, unknown>)
          } catch (error) {
            return JSON.stringify({
              error: "tool_execution_failed",
              name: opts.name,
              message: error instanceof Error ? error.message : String(error)
            })
          }
        }
  })
  ;(t as any).luminoName = opts.name
  return t
}

// ═══════════════════════════════════════════
// 记忆系统工具
// ═══════════════════════════════════════════

export const memoryGetTool = luminoTool({
  name: "memory_get",
  description: "读取指定日期的日记忆全文。返回该日期的 summary、keywords、manualNotes、status 等。",
  inputSchema: z.z.object({
    date: z.z.string().describe("日期，格式 YYYY-MM-DD，不传则返回今天的记忆").optional()
  })
})

export const memorySearchTool = luminoTool({
  name: "memory_search",
  description: "在历史记忆和对话洞察中搜索。支持 BM25 关键词搜索，返回相关性排序的 top-K 结果。",
  inputSchema: z.z.object({
    query: z.z.string().describe("搜索查询词"),
    limit: z.z.number().describe("返回结果数量上限，默认 5").optional()
  })
})

// ═══════════════════════════════════════════
// 文件系统工具
// ═══════════════════════════════════════════

export const lsTool = luminoTool({
  name: "ls",
  description: "列出工作区目录中的文件和子目录。工作区位于扩展内部存储中，无需用户手动选择。",
  inputSchema: z.z.object({
    path: z.z.string().describe("相对于工作区根目录的路径，默认 ''（根目录）").optional()
  })
})

export const readFileTool = luminoTool({
  name: "read_file",
  description: "读取工作区中的文件内容。支持通过 offset/limit 分页读取大文件。",
  inputSchema: z.z.object({
    file_path: z.z.string().describe("文件路径，相对于工作区根目录，必须以 / 开头"),
    offset: z.z.number().int().describe("起始行号（0-indexed）。默认 0。").optional(),
    limit: z.z.number().int().describe("最多读取的行数。默认 100。").optional()
  })
})

export const writeFileTool = luminoTool({
  name: "write_file",
  description: "在工作区中创建或覆写文件。",
  inputSchema: z.z.object({
    file_path: z.z.string().describe("相对于工作区根目录的文件路径，必须以 / 开头"),
    content: z.z.string().describe("要写入的文件内容")
  })
})

export const editFileTool = luminoTool({
  name: "edit_file",
  description: "对工作区中的文件执行精确的字符串替换。",
  inputSchema: z.z.object({
    file_path: z.z.string().describe("要编辑的文件路径，相对于工作区根目录，必须以 / 开头"),
    old_string: z.z.string().describe("要被替换的原始文本片段。"),
    new_string: z.z.string().describe("替换后的新文本。")
  })
})

export const globTool = luminoTool({
  name: "glob",
  description: "根据 glob 模式查找匹配的文件。支持 *, **, ? 等通配符。",
  inputSchema: z.z.object({
    pattern: z.z.string().describe("glob 模式，如 '*.ts'、'src/**/*.ts'"),
    path: z.z.string().describe("搜索的根目录路径，默认 ''（工作区根目录）").optional()
  })
})

export const grepTool = luminoTool({
  name: "grep",
  description: "在工作区文件中搜索文本。支持字面量搜索和正则表达式搜索。",
  inputSchema: z.z.object({
    pattern: z.z.string().describe("搜索模式，字面量文本或正则表达式"),
    path: z.z.string().describe("搜索路径前缀，默认搜索整个工作区").optional(),
    include: z.z.string().describe("用 glob 模式过滤文件名，如 '*.md'").optional(),
    output_mode: z.z.enum(["content", "files_with_matches", "count"]).describe("输出模式").optional()
  })
})

export const rmTool = luminoTool({
  name: "rm",
  description: "删除工作区中的文件或空目录。",
  inputSchema: z.z.object({
    file_path: z.z.string().describe("文件路径，相对于工作区根目录，必须以 / 开头")
  })
})

export const exportTool = luminoTool({
  name: "export",
  description: "将工作区文件导出到用户本地下载目录。用户说'导出''下载''保存到本地'时使用。",
  inputSchema: z.z.object({
    file_path: z.z.string().describe("要导出的文件路径，相对于工作区根目录，必须以 / 开头"),
    filename: z.z.string().describe("下载时使用的文件名，不含路径").optional()
  })
})

// ═══════════════════════════════════════════
// 浏览器系统工具
// ═══════════════════════════════════════════

export const currentPageTool = luminoTool({
  name: "current_page",
  description: "获取当前活跃标签页的 URL、标题和基本信息。",
  inputSchema: z.z.object({})
})

export const tabsTool = luminoTool({
  name: "tabs",
  description: "列出浏览器中所有打开的标签页（URL 和标题）。",
  inputSchema: z.z.object({})
})

export const getActiveTabIdTool = luminoTool({
  name: "get_active_tab_id",
  description: "获取当前活跃标签页的 ID。涉及浏览器操作时必须先调用此工具锁定目标页面。",
  inputSchema: z.z.object({})
})

// ═══════════════════════════════════════════
// 浏览器交互工具
// ═══════════════════════════════════════════

export const getPageContentTool = luminoTool({
  name: "get_page_content",
  description: "读取当前页面的文本内容。可通过 selector 精确提取某个区域。",
  inputSchema: z.z.object({
    tab_id: z.z.number().int().describe("目标标签页的 ID。不传则使用当前活跃标签页。").optional(),
    mode: z.z.enum(["text", "full_html", "structured"]).describe("提取模式：text（默认）/ full_html / structured").optional(),
    selector: z.z.string().describe("CSS 选择器，精确提取某个区域，如 '.article-content'").optional(),
    max_chars: z.z.number().int().describe("返回内容的最大字符数，默认 8000").optional()
  })
})

export const takeSelectionTool = luminoTool({
  name: "take_selection",
  description: "获取用户在页面中选中的文本。",
  inputSchema: z.z.object({
    tab_id: z.z.number().int().describe("目标标签页的 ID。不传则使用当前活跃标签页。").optional()
  })
})

export const inspectElementTool = luminoTool({
  name: "inspect_element",
  description: "探查页面 DOM 结构。传入 CSS 选择器精确探查某个元素；不传则智能探测交互区域。",
  inputSchema: z.z.object({
    tab_id: z.z.number().int().describe("目标标签页的 ID。不传则使用当前活跃标签页。").optional(),
    selector: z.z.string().describe("CSS 选择器。不传则智能探测。").optional(),
    depth: z.z.number().int().describe("子元素树递归深度，默认 2").optional()
  })
})

export const fillFormTool = luminoTool({
  name: "fill_form",
  description: "在页面中自动填充表单。传入 fields 数组 [{selector, value}, ...]，可设置 submit: true 自动提交。",
  inputSchema: z.z.object({
    tab_id: z.z.number().int().describe("目标标签页的 ID。不传则使用当前活跃标签页。").optional(),
    fields: z.z.array(z.z.object({
      selector: z.z.string().describe("CSS 选择器"),
      value: z.z.string().describe("要填充的值")
    })).describe("要填充的表单字段数组"),
    submit: z.z.boolean().describe("填完后是否自动提交表单。默认 false。").optional()
  })
})

export const clickElementTool = luminoTool({
  name: "click_element",
  description: "点击页面元素。传入 CSS 选择器，会先滚动到元素可见区域再点击。",
  inputSchema: z.z.object({
    tab_id: z.z.number().int().describe("目标标签页的 ID。不传则使用当前活跃标签页。").optional(),
    selector: z.z.string().describe("要点击元素的 CSS 选择器，如 '.submit-btn'")
  })
})

export const screenshotTool = luminoTool({
  name: "screenshot",
  description: "对页面截图。用户说'截图''看看长什么样'时使用。",
  inputSchema: z.z.object({
    tab_id: z.z.number().int().describe("目标标签页的 ID。不传则使用当前活跃标签页。").optional(),
    format: z.z.enum(["jpeg", "png"]).describe("图片格式，默认 jpeg").optional(),
    quality: z.z.number().int().min(0).max(100).describe("JPEG 质量，0-100，默认 80").optional()
  })
})

export const scrollTool = luminoTool({
  name: "scroll",
  description: "在页面中滚动。可滚动到指定元素、指定位置或按页滚动。",
  inputSchema: z.z.object({
    tab_id: z.z.number().int().describe("目标标签页的 ID。不传则使用当前活跃标签页。").optional(),
    selector: z.z.string().describe("滚动到此 CSS 选择器对应的元素").optional(),
    x: z.z.number().int().describe("水平滚动像素").optional(),
    y: z.z.number().int().describe("垂直滚动像素").optional(),
    direction: z.z.enum(["down", "up"]).describe("按页滚动方向").optional()
  })
})

export const pressKeyTool = luminoTool({
  name: "press_key",
  description: "在页面中模拟按键操作。支持组合键如 Ctrl+a、Shift+Enter、Cmd+s。",
  inputSchema: z.z.object({
    tab_id: z.z.number().int().describe("目标标签页的 ID。不传则使用当前活跃标签页。").optional(),
    key: z.z.string().describe("按键组合，如 'Enter'、'Escape'、'Ctrl+a'、'Cmd+s'"),
    selector: z.z.string().describe("CSS 选择器。指定后按键事件将派发到该元素。").optional()
  })
})

export const navigateTool = luminoTool({
  name: "navigate",
  description: "在新标签页中打开 URL，返回新标签页的 tab_id。",
  inputSchema: z.z.object({
    url: z.z.string().describe("目标 URL，如 https://github.com 或 github.com")
  })
})

export const closeTabTool = luminoTool({
  name: "close_tab",
  description: "关闭指定标签页。传入 tab_ids 列表以支持一次性关闭多个标签页。",
  inputSchema: z.z.object({
    tab_ids: z.z.array(z.z.number().int()).describe("要关闭的标签页 ID 列表")
  })
})


// ═══════════════════════════════════════════
// Obsidian MCP 工具
//
// 不在这里静态定义——运行时通过 MCP client.listTools() 动态获取
// 服务端返回的 schema 和 description，由 getLuminoAgentTools() 组装。
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
// 工具列表
// ═══════════════════════════════════════════

export const BASE_TOOLS = [
  memoryGetTool, memorySearchTool,
  lsTool, readFileTool, writeFileTool, editFileTool, globTool, grepTool, rmTool, exportTool,
  currentPageTool, tabsTool, getActiveTabIdTool,
  getPageContentTool, takeSelectionTool, inspectElementTool,
  fillFormTool, clickElementTool, screenshotTool,
  scrollTool, pressKeyTool, navigateTool, closeTabTool
]

function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny {
  if (!schema || typeof schema !== "object") return z.z.any()

  const s = schema as Record<string, unknown>
  const type = s.type as string

  if (type === "object") {
    const props = (s.properties || {}) as Record<string, Record<string, unknown>>
    const required = (s.required || []) as string[]
    const shape: Record<string, z.ZodTypeAny> = {}
    for (const [key, propSchema] of Object.entries(props)) {
      let field = jsonSchemaToZod(propSchema)
      if (propSchema.description) {
        field = field.describe(propSchema.description as string)
      }
      if (!required.includes(key)) {
        field = field.optional()
      }
      shape[key] = field
    }
    return z.z.object(shape)
  }

  if (type === "string") {
    if (s.enum) return z.z.enum(s.enum as [string, ...string[]])
    return z.z.string()
  }

  if (type === "number" || type === "integer") return z.z.number()
  if (type === "boolean") return z.z.boolean()
  if (type === "array") {
    const items = s.items as Record<string, unknown> | undefined
    return z.z.array(items ? jsonSchemaToZod(items) : z.z.any())
  }

  return z.z.any()
}

/**
 * 获取当前可用的 AI SDK 工具集。
 *
 * Obsidian 工具从 MCP client.listTools() 动态获取 schema 和 description，
 * 不再是静态定义。只有 MCP 已连接且 handler 已注册时才暴露。
 */
export async function getLuminoAgentTools(): Promise<Record<string, any>> {
  const tools: Record<string, any> = {}

  // 基础工具始终可用
  for (const t of BASE_TOOLS) {
    const name = (t as any).luminoName as string
    if (name) tools[name] = t
  }

  // Obsidian MCP 工具：从客户端动态获取
  try {
    const client = getObsidianMcpClient()
    if (client?.isConnected) {
      const serverTools = await client.listTools()
      console.log(`[lumino:tools] MCP 动态获取到 ${serverTools.length} 个工具:`, serverTools.map(t => t.name))
      for (const st of serverTools) {
        try {
          const zodSchema = jsonSchemaToZod(st.inputSchema as Record<string, unknown>)
          tools[st.name] = tool({
            description: st.description || "",
            inputSchema: zodSchema,
            execute: async (args) => {
              try {
                return await client.callTool(st.name, args as Record<string, unknown>)
              } catch (error) {
                return JSON.stringify({
                  error: "obsidian_mcp_failed",
                  tool: st.name,
                  message: error instanceof Error ? error.message : String(error)
                })
              }
            }
          })
        } catch (schemaErr) {
          console.warn(`[lumino:tools] MCP 工具 ${st.name} schema 转换失败:`, schemaErr, st.inputSchema)
        }
      }
    }
  } catch (err) {
    console.warn("[lumino:tools] 获取 Obsidian MCP 工具列表失败:", err)
  }

  return tools
}
