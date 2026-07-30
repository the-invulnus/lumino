import { registerTool } from "./tool-executor"
import {
  handleLs,
  handleReadFile,
  handleWriteFile,
  handleEditFile,
  handleGlob,
  handleGrep,
  handleRm,
  handleExport
} from "./tools/fs-tools"
import { handleCurrentPage, handleTabs } from "./tools/system-tools"
import {
  createMcpHandler,
  ensureMcpClient,
  resetMcpClient,
  getObsidianMcpClient
} from "./tools/obsidian-mcp"
import { isObsidianConfigured, getObsidianSettings } from "../settings"
import {
  handleGetPageContent,
  handleInspectElement,
  handleFillForm,
  handleClickElement,
  handleScreenshot,
  handleNavigate,
  handleCloseTab,
  handleScroll,
  handlePressKey
} from "./tools/browser-tools"
import {
  handleScrapeStructure,
  handleScrapeStyles,
  handleScrapeResources,
  handleFetchResource
} from "./tools/scrape-tools"
import { handleReadPdf } from "./tools/pdf-tools"

let baseRegistered = false
let mcpRegistered = false

function registerBaseTools(): void {
  if (baseRegistered) return
  baseRegistered = true

  // 文件系统工具
  registerTool("ls", handleLs)
  registerTool("read_file", handleReadFile)
  registerTool("write_file", handleWriteFile)
  registerTool("edit_file", handleEditFile)
  registerTool("glob", handleGlob)
  registerTool("grep", handleGrep)
  registerTool("rm", handleRm)
  registerTool("export", handleExport)

  // 浏览器系统工具
  registerTool("current_page", handleCurrentPage)
  registerTool("tabs", handleTabs)

  // 页面阅读工具
  registerTool("get_page_content", handleGetPageContent)

  // 浏览器交互工具
  registerTool("inspect_element", handleInspectElement)
  registerTool("fill_form", handleFillForm)
  registerTool("click_element", handleClickElement)
  registerTool("screenshot", handleScreenshot)
  registerTool("scroll", handleScroll)
  registerTool("press_key", handlePressKey)
  registerTool("navigate", handleNavigate)
  registerTool("close_tab", handleCloseTab)

  // 页面爬取工具
  registerTool("scrape_structure", handleScrapeStructure)
  registerTool("scrape_styles", handleScrapeStyles)
  registerTool("scrape_resources", handleScrapeResources)
  registerTool("fetch_resource", handleFetchResource)

  // PDF 工具
  registerTool("read_pdf", handleReadPdf)
}

async function registerObsidianMcpTools(): Promise<void> {
  if (mcpRegistered) {
    return
  }

  const settings = await getObsidianSettings()
  if (!isObsidianConfigured(settings)) {
    return
  }

  try {
    // 确保 MCP 客户端已连接
    const client = await ensureMcpClient()

    // 从服务端动态获取工具列表
    const serverTools = await client.listTools()

    // 为每个 MCP 工具创建 handler 并注册
    for (const tool of serverTools) {
      registerTool(tool.name, createMcpHandler(tool.name))
    }

    mcpRegistered = true
  } catch (err) {
    console.warn("[lumino:registry] Obsidian MCP 连接失败，工具未注册:", err)
    mcpRegistered = false
    await resetMcpClient()
  }
}

export async function registerAllTools(): Promise<void> {
  registerBaseTools()
  await registerObsidianMcpTools()
}

/** settings 变更时调用：重置 MCP 状态，下次自动重连 */
export async function reinitObsidianMcp(): Promise<void> {
  await resetMcpClient()
  mcpRegistered = false
  await registerObsidianMcpTools()
}
