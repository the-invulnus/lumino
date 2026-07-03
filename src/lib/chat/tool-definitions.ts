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
import { isObsidianConfigured, getObsidianSettings } from "../settings"
import { getToolHandler } from "./tool-executor"

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
// Obsidian MCP 工具（16 个）
//
// 这些工具的 handler 由 obsidian-mcp 在运行时动态注册到 toolRegistry。
// schema 定义在这里是因为它们是静态的 Zod schema，
// 但 execute 必须通过 toolRegistry 查找 handler。
//
// getLuminoAgentTools() 只在 Obsidian 已配置 AND handler 实际注册成功
// 时才返回这些工具，杜绝 schema 和 handler 不一致的问题。
// ═══════════════════════════════════════════

export const vaultListTool = luminoTool({
  name: "vault_list",
  description: "列出 Obsidian vault 中的文件和子目录。目录条目以 / 结尾。不传 path 则列出根目录。",
  inputSchema: z.z.object({
    path: z.z.string().describe("目录路径，相对于 vault 根目录。可选，默认根目录。").optional()
  })
})

export const vaultReadTool = luminoTool({
  name: "vault_read",
  description: "读取 Obsidian vault 中笔记的内容和元数据。返回 JSON：content（Markdown 全文）、path、tags、frontmatter（YAML 元数据对象）、stat、links、backlinks。可通过 targetType + target 读取指定片段。",
  inputSchema: z.z.object({
    path: z.z.string().describe("笔记文件路径，相对于 vault 根目录"),
    targetType: z.z.enum(["heading", "block", "frontmatter"]).optional().describe("按片段读取时的目标类型"),
    target: z.z.string().optional().describe("片段目标：标题文本、块 ID（不含^）或 frontmatter 字段名。嵌套标题用 '::' 分隔"),
    targetDelimiter: z.z.string().optional().describe("嵌套标题路径分隔符，默认 '::'")
  })
})

export const vaultWriteTool = luminoTool({
  name: "vault_write",
  description: "创建新笔记或覆写已有笔记。自动创建缺失的父目录。",
  inputSchema: z.z.object({
    path: z.z.string().describe("笔记文件路径，如 收集/AI工具推荐.md"),
    content: z.z.string().describe("Markdown 格式的笔记完整内容")
  })
})

export const vaultAppendTool = luminoTool({
  name: "vault_append",
  description: "向笔记末尾追加内容。文件不存在时自动创建。",
  inputSchema: z.z.object({
    path: z.z.string().describe("笔记文件路径"),
    content: z.z.string().describe("要追加的 Markdown 内容")
  })
})

export const vaultPatchTool = luminoTool({
  name: "vault_patch",
  description: "精确定位修改笔记的特定部分。支持 heading/frontmatter/block 的 replace/prepend/append。" +
    "contentType='application/json' 可设置 frontmatter 类型化值或追加表格行。" +
    "createTargetIfMissing=true 可在目标不存在时自动创建。" +
    "搭配 vault_get_document_map 使用，先获取文件结构再精确 patch。",
  inputSchema: z.z.object({
    path: z.z.string().describe("笔记文件路径"),
    targetType: z.z.enum(["heading", "block", "frontmatter"]).describe("目标类型：heading=标题区块，block=块引用，frontmatter=YAML 字段"),
    target: z.z.string().describe("目标名称。heading 填标题文本；block 填块ID（不含^）；frontmatter 填字段名（如 tags、status）。嵌套标题用 '::' 分隔"),
    operation: z.z.enum(["replace", "prepend", "append"]).describe("操作：replace=替换，prepend=插入到开头，append=追加到末尾"),
    content: z.z.unknown().describe("内容。contentType='text/markdown' 时传字符串；contentType='application/json' 时可传原生 JSON 值"),
    contentType: z.z.string().optional().describe("MIME 类型。'text/markdown'（默认）或 'application/json'。JSON 模式可用于 setting typed frontmatter values"),
    createTargetIfMissing: z.z.boolean().optional().describe("目标不存在时自动创建（仅 heading 和 frontmatter，默认 false）"),
    trimTargetWhitespace: z.z.boolean().optional().describe("去除目标内容首尾空白再操作（默认 false）"),
    rejectIfContentPreexists: z.z.boolean().optional().describe("如果内容已存在则拒绝操作，用于幂等保护（默认 false）"),
    targetDelimiter: z.z.string().optional().describe("嵌套标题路径分隔符，默认 '::'"),
    targetScope: z.z.enum(["content", "marker", "markerAndContent"]).optional().describe("操作范围：content=仅内容（默认），marker=仅标题行/块ID，markerAndContent=标题和内容一起")
  })
})

export const vaultDeleteTool = luminoTool({
  name: "vault_delete",
  description: "从 vault 中删除指定文件。文件不存在时会报错。",
  inputSchema: z.z.object({
    path: z.z.string().describe("要删除的文件路径，相对于 vault 根目录")
  })
})

export const vaultMoveTool = luminoTool({
  name: "vault_move",
  description: "移动（重命名）vault 中的文件。自动创建目标父目录。保留文件历史并更新 Obsidian 内部链接。目标路径以 / 结尾时保留源文件名。",
  inputSchema: z.z.object({
    path: z.z.string().describe("源文件路径，相对于 vault 根目录"),
    destination: z.z.string().describe("目标路径。以 / 结尾时保留源文件名放入该目录"),
    allowOverwrite: z.z.boolean().optional().describe("允许覆盖已存在的目标文件（默认 false）")
  })
})

export const vaultGetDocumentMapTool = luminoTool({
  name: "vault_get_document_map",
  description: "获取文件的文档结构映射：headings 列表、block ID 列表、frontmatter 字段名列表。搭配 vault_read 和 vault_patch 使用，先获取结构再精准操作。",
  inputSchema: z.z.object({
    path: z.z.string().describe("笔记文件路径，相对于 vault 根目录")
  })
})

export const activeFileGetPathTool = luminoTool({
  name: "active_file_get_path",
  description: "获取 Obsidian 中当前打开文件的路径。返回的路径可直接用于 vault_read、vault_patch 等操作。无打开文件时出错。",
  inputSchema: z.z.object({})
})

export const periodicNoteGetPathTool = luminoTool({
  name: "periodic_note_get_path",
  description: "获取当前日期的周期性笔记（日记/周记/月记/季记/年记）路径。需要 Periodic Notes 或 Calendar 插件。不存在时自动创建并应用模板。",
  inputSchema: z.z.object({
    period: z.z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]).describe("周期类型：daily/ weekly/ monthly/ quarterly/ yearly")
  })
})

export const searchQueryTool = luminoTool({
  name: "search_query",
  description: "使用 JsonLogic 查询高级搜索 vault 中的笔记。支持正则、glob 匹配等。查询对象包含 path、content、tags、frontmatter、stat、links、backlinks 字段。",
  inputSchema: z.z.object({
    query: z.z.record(z.z.unknown()).describe("JsonLogic 查询对象。例：{\"in\":[\"tag\",{\"var\":\"tags\"}]} 查找含某标签的笔记")
  })
})

export const searchSimpleTool = luminoTool({
  name: "search_simple",
  description: "使用 Obsidian 内置简单搜索引擎搜索 vault。返回按相关度排序的匹配文件列表及上下文片段。",
  inputSchema: z.z.object({
    query: z.z.string().describe("搜索关键词"),
    contextLength: z.z.number().optional().describe("每个匹配结果的上下文字符数，默认 100")
  })
})

export const tagListTool = luminoTool({
  name: "tag_list",
  description: "获取 vault 中所有标签及其使用次数。标签名不含 # 前缀。要对文件添加/移除标签，使用 vault_patch 操作 frontmatter。",
  inputSchema: z.z.object({})
})

export const commandListTool = luminoTool({
  name: "command_list",
  description: "获取 Obsidian 所有注册命令的列表（id 和名称）。配合 command_execute 使用。",
  inputSchema: z.z.object({})
})

export const commandExecuteTool = luminoTool({
  name: "command_execute",
  description: "通过 ID 执行 Obsidian 命令。先用 command_list 获取可用命令列表。",
  inputSchema: z.z.object({
    commandId: z.z.string().describe("命令 ID，如 'editor:toggle-bold'")
  })
})

export const openFileTool = luminoTool({
  name: "open_file",
  description: "在 Obsidian UI 中打开指定文件。文件不存在时会自动创建。",
  inputSchema: z.z.object({
    path: z.z.string().describe("笔记文件路径"),
    newLeaf: z.z.boolean().optional().describe("在新窗格中打开（默认 false，在当前窗格打开）")
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
  vaultListTool, vaultReadTool, vaultWriteTool,
  vaultAppendTool, vaultPatchTool, vaultDeleteTool, vaultMoveTool,
  vaultGetDocumentMapTool, activeFileGetPathTool, periodicNoteGetPathTool,
  searchQueryTool, searchSimpleTool, tagListTool,
  commandListTool, commandExecuteTool, openFileTool
]

/**
 * 获取当前可用的 AI SDK 工具集。
 *
 * Obsidian 工具的条件：只有 settings 中 enabled=true 且 handler 已成功
 * 注册到 toolRegistry 时才暴露。避免 LLM 看到工具但调用时报 unknown_tool。
 */
export async function getLuminoAgentTools(): Promise<Record<string, any>> {
  const settings = await getObsidianSettings()
  const configured = isObsidianConfigured(settings)

  const tools: Record<string, any> = {}

  // 基础工具始终可用
  for (const t of BASE_TOOLS) {
    const name = (t as any).luminoName as string
    if (name) tools[name] = t
  }

  // Obsidian 工具：只暴露已成功注册了 handler 的
  if (configured) {
    for (const t of OBSIDIAN_TOOLS) {
      const name = (t as any).luminoName as string
      // 检查 handler 是否确实注册了
      if (name && getToolHandler(name)) {
        tools[name] = t
      }
    }
  }

  return tools
}
