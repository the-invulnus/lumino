import { registerTool } from "./tool-executor"
import { handleMemoryGet, handleMemorySearch } from "./tools/memory-tools"
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
import { handleCurrentPage, handleTabs, handleGetActiveTabId } from "./tools/system-tools"
import {
  handleObsidianList,
  handleObsidianRead,
  handleObsidianWrite,
  handleObsidianAppend,
  handleObsidianPatch,
  handleObsidianSearch,
  handleObsidianOpen
} from "./tools/obsidian-tools"
import { isObsidianConfigured, getObsidianSettings } from "../settings"
import {
  handleGetPageContent,
  handleTakeSelection,
  handleInspectElement,
  handleFillForm,
  handleClickElement,
  handleScreenshot,
  handleNavigate
} from "./tools/browser-tools"

let baseRegistered = false

function registerBaseTools(): void {
  if (baseRegistered) return
  baseRegistered = true

  // 记忆系统工具
  registerTool("memory_get", handleMemoryGet)
  registerTool("memory_search", handleMemorySearch)

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
  registerTool("get_active_tab_id", handleGetActiveTabId)

  // 浏览器交互工具
  registerTool("get_page_content", handleGetPageContent)
  registerTool("take_selection", handleTakeSelection)
  registerTool("inspect_element", handleInspectElement)
  registerTool("fill_form", handleFillForm)
  registerTool("click_element", handleClickElement)
  registerTool("screenshot", handleScreenshot)
  registerTool("navigate", handleNavigate)
}

export async function registerAllTools(): Promise<void> {
  registerBaseTools()

  // Obsidian 集成工具每次执行时都检查配置状态，避免竞态导致漏注册
  const obsidianSettings = await getObsidianSettings()
  if (isObsidianConfigured(obsidianSettings)) {
    registerTool("obsidian_list", handleObsidianList)
    registerTool("obsidian_read", handleObsidianRead)
    registerTool("obsidian_write", handleObsidianWrite)
    registerTool("obsidian_append", handleObsidianAppend)
    registerTool("obsidian_patch", handleObsidianPatch)
    registerTool("obsidian_search", handleObsidianSearch)
    registerTool("obsidian_open", handleObsidianOpen)
  }
}
