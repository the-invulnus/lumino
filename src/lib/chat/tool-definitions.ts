/**
 * Lumino 工具定义
 *
 * 架构：
 * - 基础工具（memory、fs、browser）→ schema + handler 绑定在一起
 * - Obsidian MCP 工具 → schema 静态定义，handler 由 McpClient 动态提供
 *
 * 关键约定：每个 luminoTool 的 name 必须和 toolRegistry 中 registerTool 的 key 一致。
 * getLuminoAgentTools() 只返回已经实际注册了 handler 的工具，避免 schema 暴露但
 * handler 缺失导致的 "unknown_tool" 错误。
 */

import * as z from "zod"
import type { LuminoTool } from "../llm/llm-types"
import { jsonSchemaToZod } from "../llm/zod-to-json-schema"
import { getObsidianMcpClient } from "./tools/obsidian-mcp"
import { getToolHandler } from "./tool-executor"

// ═══════════════════════════════════════════
// luminoTool — 工具包装器
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
}): LuminoTool {
  return {
    name: opts.name,
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
  }
}

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
  description: "读取工作区中的文件内容。支持通过 offset/limit 按行分页读取大文件。",
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
  description: "将工作区文件或整个目录导出到用户本地下载目录。导出目录时会打包为 zip。",
  inputSchema: z.z.object({
    file_path: z.z.string().describe("要导出的文件或目录路径，相对于工作区根目录，必须以 / 开头。如 /screenshots 导出截图目录，不传则导出整个工作区。").optional(),
    filename: z.z.string().describe("下载时使用的文件名，不含路径。目录导出时默认为目录名.zip。").optional()
  })
})

// ═══════════════════════════════════════════
// 浏览器系统工具
// ═══════════════════════════════════════════

export const currentPageTool = luminoTool({
  name: "current_page",
  description: "获取当前活跃标签页的 ID、URL 和标题。涉及浏览器操作时调用以锁定目标页面。",
  inputSchema: z.z.object({})
})

export const tabsTool = luminoTool({
  name: "tabs",
  description: "列出浏览器中所有打开的标签页（URL 和标题）。",
  inputSchema: z.z.object({})
})

// ═══════════════════════════════════════════
// 页面阅读工具
// ═══════════════════════════════════════════

export const getPageContentTool = luminoTool({
  name: "get_page_content",
  description: "读取页面内容。text 模式（默认）读取正文文本；structured 模式读取页面骨架（标题层级与语义区块，不传 selector 时为整页大纲，传 selector 时为该区域的子元素结构）。",
  inputSchema: z.z.object({
    tab_id: z.z.number().int().describe("目标标签页的 ID。不传则使用当前活跃标签页。").optional(),
    mode: z.z.enum(["text", "structured"]).describe("text：读取正文文本；structured：读取结构骨架").optional(),
    selector: z.z.string().describe("CSS 选择器，限定提取区域。text 模式下取该区域的文本；structured 模式下取该区域的子元素结构。不传则针对整个页面。").optional()
  })
})

// ═══════════════════════════════════════════
// 浏览器交互工具
// ═══════════════════════════════════════════

export const inspectElementTool = luminoTool({
  name: "inspect_element",
  description: "探查页面可交互元素。传入 CSS 选择器探查某个元素的标签、属性和交互能力（可点击/可聚焦/可编辑/可见）；不传则智能探测表单、对话框、导航等交互区域。",
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
  description: "对页面截图。",
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
// 页面爬取工具
// ═══════════════════════════════════════════

export const scrapeStructureTool = luminoTool({
  name: "scrape_structure",
  description: "提取当前页面的运行时 DOM 结构。format=html 返回完整的 outerHTML 字符串，format=json 返回结构化的树形数据（含 bounding box 等）。用于复刻/重建页面布局。",
  inputSchema: z.z.object({
    tab_id: z.z.number().int().describe("目标标签页的 ID。不传则使用当前活跃标签页。").optional(),
    format: z.z.enum(["html", "json"]).describe("输出格式：html=返回运行时 DOM 的 outerHTML 字符串（所见即所得），json=返回结构化的树形数据含 bounding box。默认 json。").optional(),
    selector: z.z.string().describe("CSS 选择器，限定爬取范围。html 模式下不传返回整页 HTML，json 模式下不传从 body 开始。").optional(),
    depth: z.z.number().int().describe("（仅 json 模式）DOM 树递归深度，默认 10。").optional(),
    max_nodes: z.z.number().int().describe("（仅 json 模式）最大节点数，默认 500。").optional(),
    include_text: z.z.boolean().describe("（仅 json 模式）是否包含元素内的文本内容。默认 true。").optional(),
    include_bbox: z.z.boolean().describe("（仅 json 模式）是否包含元素的位置和尺寸。默认 true。").optional()
  })
})

export const scrapeStylesTool = luminoTool({
  name: "scrape_styles",
  description: "获取页面元素的完整计算样式（font/color/spacing/border/background/layout 等 40+ 关键 CSS 属性）。也可获取伪元素样式和盒模型数据。用于复刻/重建页面的视觉效果。",
  inputSchema: z.z.object({
    tab_id: z.z.number().int().describe("目标标签页的 ID。不传则使用当前活跃标签页。").optional(),
    selector: z.z.string().describe("CSS 选择器，定位目标元素。如 '.hero-section' 或 '#main-content'"),
    properties: z.z.array(z.z.string()).describe("要获取的 CSS 属性列表。不传则返回约 40 个关键属性（color, font-family, font-size, font-weight, line-height, text-align, background-color, border, border-radius, padding, margin, width, height, display, flex-direction, align-items, justify-content, position, box-shadow, opacity, transform, z-index 等）。").optional(),
    include_box_model: z.z.boolean().describe("是否同时返回盒模型数据（content/padding/border/margin 四边宽度）。默认 true。").optional(),
    include_pseudo: z.z.array(z.z.string()).describe("同时获取伪元素的样式，如 ['::before', '::after']。").optional(),
    recursion: z.z.enum(["none", "children", "descendants"]).describe("是否递归获取子元素样式。none=仅目标元素，children=直接子元素，descendants=所有后代。默认 none。").optional()
  })
})

export const scrapeResourcesTool = luminoTool({
  name: "scrape_resources",
  description: "发现页面引用的外部资源 URL（CSS、图片、字体、图标、脚本等）。同域 CSS 可直接读取规则数量和内容，跨域 CSS 标记为不可访问，需用 fetch_resource 获取。",
  inputSchema: z.z.object({
    tab_id: z.z.number().int().describe("目标标签页的 ID。不传则使用当前活跃标签页。").optional(),
    resource_types: z.z.array(z.z.enum(["css", "images", "fonts", "icons", "scripts"])).describe("要收集的资源类型。不传则收集所有类型。").optional(),
    include_inline: z.z.boolean().describe("是否收集内联资源（如内联 <style>、data URI 图片）。默认 false，仅收集外部 URL。").optional(),
    limit: z.z.number().int().describe("每类资源的最大数量，默认 200。").optional()
  })
})

export const fetchResourceTool = luminoTool({
  name: "fetch_resource",
  description: "通过 Service Worker 获取指定 URL 的完整资源内容。无 CORS 限制，可获取跨域 CSS、图片、字体等文件。单次获取一个 URL。",
  inputSchema: z.z.object({
    url: z.z.string().describe("资源 URL，如 https://cdn.example.com/styles/main.css 或 /styles/main.css（相对路径）"),
    tab_id: z.z.number().int().describe("目标标签页的 ID。用于解析相对 URL 的基础 URL。不传则使用当前活跃标签页。").optional()
  })
})

// ═══════════════════════════════════════════
// PDF 工具
// ═══════════════════════════════════════════

export const readPdfTool = luminoTool({
  name: "read_pdf",
  description: "提取 PDF 的文本内容。path（工作区路径）或 url 二选一，优先 path。",
  inputSchema: z.z.object({
    path: z.z.string().describe("工作区里的 PDF 路径（如 /report.pdf）。与 url 二选一，优先 path。").optional(),
    url: z.z.string().describe("PDF 链接（http/https）。与 path 二选一。").optional()
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

export const BASE_TOOLS: LuminoTool[] = [
  // 文件
  lsTool, readFileTool, writeFileTool, editFileTool, globTool, grepTool, rmTool, exportTool,
  // 浏览器系统
  currentPageTool, tabsTool,
  // 页面阅读
  getPageContentTool,
  // 浏览器交互
  inspectElementTool, fillFormTool, clickElementTool, screenshotTool,
  scrollTool, pressKeyTool, navigateTool, closeTabTool,
  // 页面爬取
  scrapeStructureTool, scrapeStylesTool, scrapeResourcesTool, fetchResourceTool,
  // PDF
  readPdfTool
]

/**
 * 获取当前可用的 Lumino 工具集。
 *
 * Obsidian 工具从 MCP client.listTools() 动态获取 schema 和 description，
 * 不再是静态定义。只有 MCP 已连接且 handler 已注册时才暴露。
 *
 * @param toolFilter - 工具名称白名单。undefined = 全部工具（内置 agent）；
 *                     传数组 = 仅返回白名单内的工具，空数组 = 无工具（自定义 agent）。
 *                     白名单可含 "mcp:*" 通配符，表示全量注入所有 MCP 工具。
 */
export async function getLuminoAgentTools(toolFilter?: string[]): Promise<LuminoTool[]> {
  const tools: LuminoTool[] = []
  // undefined = 全部基础工具；数组 = 按白名单过滤（空数组过滤后为空）
  const filterAll = toolFilter === undefined

  // 基础工具
  for (const t of BASE_TOOLS) {
    if (!filterAll && !toolFilter!.includes(t.name)) continue
    tools.push(t)
  }

  // Obsidian MCP 工具：从客户端动态获取
  // undefined 或白名单含 "mcp:*" → MCP 工具全量注入；否则按白名单逐个过滤
  const includeAllMcp = filterAll || toolFilter!.includes("mcp:*")
  try {
    const client = getObsidianMcpClient()
    if (client?.isConnected) {
      const serverTools = await client.listTools()
      for (const st of serverTools) {
        if (!includeAllMcp && !toolFilter!.includes(st.name)) continue

        try {
          const zodSchema = jsonSchemaToZod(st.inputSchema as Record<string, unknown>)
          tools.push({
            name: st.name,
            description: st.description || "",
            inputSchema: zodSchema,
            execute: async (args: Record<string, unknown>) => {
              try {
                return await client.callTool(st.name, args)
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