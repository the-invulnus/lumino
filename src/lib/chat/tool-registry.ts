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
import { handleCurrentPage, handleTabs } from "./tools/system-tools"

let registered = false

export function registerAllTools(): void {
  if (registered) return
  registered = true

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
}
