import { registerTool } from "./tool-executor"
import { handleMemoryGet, handleMemorySearch } from "./tools/memory-tools"
import {
  handleLs,
  handleRead,
  handleWrite,
  handleGrep,
  handleRm,
  handleExport
} from "./tools/fs-tools"
import { handleCurrentPage, handleTabs } from "./tools/system-tools"

let registered = false

export function registerAllTools(): void {
  if (registered) return
  registered = true

  registerTool("memory_get", handleMemoryGet)
  registerTool("memory_search", handleMemorySearch)
  registerTool("ls", handleLs)
  registerTool("read", handleRead)
  registerTool("write", handleWrite)
  registerTool("grep", handleGrep)
  registerTool("rm", handleRm)
  registerTool("export", handleExport)
  registerTool("current_page", handleCurrentPage)
  registerTool("tabs", handleTabs)
}
