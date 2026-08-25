import { getAgentWindowId } from "./agent-window"

// ═══════════════════════════════════════════
// 共享工具函数 — 供 browser-tools.ts 和 scrape-tools.ts 使用
// ═══════════════════════════════════════════

/** 驱逐文件存储目录 */
export const EVICT_DIR = "/large_tool_results"

/** fetch_resource 下载文件存储目录 */
export const DOWNLOADS_DIR = "/downloads"

/** executeScript 最大重试次数（应对 tab 导航中的 race condition） */
export const MAX_RETRIES = 2

/** 重试间隔（毫秒） */
export const RETRY_DELAY_MS = 300

/**
 * 向标签页注入脚本文件（如 assets/Readability.js）。
 * 幂等：重复注入同一文件无害，Chrome 会去重。
 * 用于需要依赖库的 executeScript 场景——先注入库文件，再用 executeScript({func}) 调用。
 */
export async function injectScriptFiles(
  tabId: number,
  files: string[]
): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files
  })
}

/**
 * 获取 agent 窗口的活跃标签页
 */
export function getActiveTab(): Promise<chrome.tabs.Tab> {
  return getAgentWindowId().then((agentWid) => {
    const query = agentWid != null
      ? { active: true, windowId: agentWid }
      : { active: true, currentWindow: true }
    return chrome.tabs.query(query).then(([tab]) => {
      if (!tab) throw new Error("no_active_tab")
      return tab
    })
  })
}

/**
 * 从 args 中解析 tab_id。有则直接用，无则获取当前活跃标签页。
 */
export async function resolveTabId(args: Record<string, unknown>): Promise<number> {
  if (typeof args.tab_id === "number" && args.tab_id > 0) {
    return args.tab_id
  }
  const tab = await getActiveTab()
  if (!tab.id) throw new Error("no_tab_id")
  return tab.id
}

/**
 * 执行 chrome.scripting.executeScript 并注入 func，带自动重试。
 * 泛型化设计，不绑定特定工具的参数格式。
 *
 * @param tabId    - 目标标签页 ID
 * @param func     - 注入到页面中执行的序列化函数
 * @param args     - 传给 func 的参数数组
 * @param label    - 日志标签（如 "get_page_content"）
 * @returns func 的返回字符串，注入失败时返回 null
 */
export async function executeScriptWithRetry<F extends (...args: any[]) => any>(
  tabId: number,
  func: F,
  args: Parameters<F>,
  label: string
): Promise<string | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func,
      args: args as unknown[]
    })

    if (result && result.result) {
      return typeof result.result === "string" ? result.result : JSON.stringify(result.result)
    }

    const lastError = chrome.runtime.lastError
    if (lastError) {
      console.error(`[lumino:tool] ${label} execute_script_failed (permanent):`, lastError.message, { tabId })
      return null
    }

    console.warn(
      `[lumino:tool] ${label} executeScript returned empty result (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
      { tabId }
    )
  }

  return null
}

// ═══════════════════════════════════════════
// queryWithText — :text() 选择器扩展（注入到页面内使用）
// ═══════════════════════════════════════════

/**
 * queryWithText 辅助函数的完整字符串表示。
 * 在 `chrome.scripting.executeScript` 的 `func` 内部使用，因为注入函数需要完全序列化。
 *
 * 用法（在注入函数内）：
 *   ${QUERY_WITH_TEXT_FN}
 *   然后调用 queryWithText(selector)
 *
 * 支持选择器语法：`button:text("Submit")` → 匹配 textContent === "Submit" 的 button
 */
export const QUERY_WITH_TEXT_FN = `
function queryWithText(sel) {
  var tm = sel.match(/^(.+):text\\(["']([^"']*)["']\\)$/);
  if (tm) {
    var candidates = document.querySelectorAll(tm[1]);
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i].textContent && candidates[i].textContent.trim() === tm[2]) {
        return candidates[i];
      }
    }
    return null;
  }
  return document.querySelector(sel);
}
`
