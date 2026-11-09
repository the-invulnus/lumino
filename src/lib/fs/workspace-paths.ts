/** Internal tool output is temporary, not a user deliverable. */
export const TOOL_RESULTS_DIR = "/.larget_tool_result"
export const LEGACY_TOOL_RESULT_DIRS = ["/large_tool_results", "/large_tool_result"] as const
export const SCREENSHOTS_DIR = "/screenshots"

export function isHiddenWorkspaceEntry(path: string): boolean {
  const parts = path.split("/").filter(Boolean)
  return parts.some(part => part.startsWith(".")) || LEGACY_TOOL_RESULT_DIRS.some(dir => dir === `/${parts[0]}`)
}
