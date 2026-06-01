import { tool } from "ai"
import * as z from "zod"
import { isObsidianConfigured, getObsidianSettings } from "../settings"
import { getToolHandler } from "./tool-executor"

/**
 * 创建一个 Lumino 工具——AI SDK tool() 包装。
 * execute 直接调用 tool-executor 注册表中的 handler。
 */
function luminoTool<NAME extends string, SCHEMA extends z.ZodTypeAny>(opts: {
  name: NAME
  description: string
  inputSchema: SCHEMA
}) {
  const t = tool({
    description: opts.description,
    inputSchema: opts.inputSchema,
    execute: async (args) => {
      const handler = getToolHandler(opts.name)
      if (!handler) {
        return JSON.stringify({
          error: "unknown_tool",
          name: opts.name,
          hint: "该工具尚未注册，请检查 tool-registry.ts"
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
  // 挂载 luminoName 到返回对象上，方便通过工具实例自身获取名称
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
  description: "关闭指定标签页。必须传入要关闭的标签页 tab_id。",
  inputSchema: z.z.object({
    tab_id: z.z.number().int().describe("要关闭的标签页 ID")
  })
})


// ═══════════════════════════════════════════
// Obsidian 工具
// ═══════════════════════════════════════════

export const obsidianListTool = luminoTool({
  name: "obsidian_list",
  description: "列出 Obsidian vault 中的文件和子目录。不传 path 则列出根目录。",
  inputSchema: z.z.object({
    path: z.z.string().describe("目录路径，相对于 vault 根目录。").optional()
  })
})

export const obsidianReadTool = luminoTool({
  name: "obsidian_read",
  description: "读取 Obsidian vault 中笔记的完整内容。",
  inputSchema: z.z.object({
    path: z.z.string().describe("笔记文件路径，相对于 vault 根目录，如 工作/项目笔记.md")
  })
})

export const obsidianWriteTool = luminoTool({
  name: "obsidian_write",
  description: "创建新笔记或覆写已有笔记。",
  inputSchema: z.z.object({
    path: z.z.string().describe("笔记文件路径，如 收集/AI工具推荐.md"),
    content: z.z.string().describe("Markdown 格式的笔记内容")
  })
})

export const obsidianAppendTool = luminoTool({
  name: "obsidian_append",
  description: "向笔记末尾追加内容。",
  inputSchema: z.z.object({
    path: z.z.string().describe("笔记文件路径"),
    content: z.z.string().describe("要追加的 Markdown 内容")
  })
})

export const obsidianPatchTool = luminoTool({
  name: "obsidian_patch",
  description: "精确定位修改笔记的特定部分。支持 heading/frontmatter/block 的 append/prepend/replace。",
  inputSchema: z.z.object({
    path: z.z.string().describe("笔记文件路径"),
    target_type: z.z.enum(["heading", "frontmatter", "block"]).describe("目标类型"),
    target: z.z.string().describe("目标名称"),
    operation: z.z.enum(["append", "prepend", "replace"]).describe("操作类型"),
    content: z.z.string().describe("要写入的内容")
  })
})

export const obsidianSearchTool = luminoTool({
  name: "obsidian_search",
  description: "在 Obsidian vault 中全文搜索笔记。返回匹配的文件名和评分上下文片段。",
  inputSchema: z.z.object({
    query: z.z.string().describe("搜索关键词")
  })
})

export const obsidianOpenTool = luminoTool({
  name: "obsidian_open",
  description: "在 Obsidian 桌面端 UI 中打开指定笔记。",
  inputSchema: z.z.object({
    path: z.z.string().describe("笔记文件路径")
  })
})

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

export const OBSIDIAN_TOOLS = [
  obsidianListTool, obsidianReadTool, obsidianWriteTool,
  obsidianAppendTool, obsidianPatchTool, obsidianSearchTool, obsidianOpenTool
]

export async function getLuminoAgentTools(): Promise<Record<string, any>> {
  const settings = await getObsidianSettings()
  const allTools = isObsidianConfigured(settings)
    ? [...BASE_TOOLS, ...OBSIDIAN_TOOLS]
    : BASE_TOOLS
  const tools: Record<string, any> = {}
  for (const t of allTools) {
    const name = (t as any).luminoName
    if (name) tools[name] = t
  }
  return tools
}
