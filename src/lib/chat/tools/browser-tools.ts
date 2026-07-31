import { writeWorkspaceFileBytes } from "../../fs/workspace"
import { getAgentWindowId } from "./agent-window"
import {
  executeScriptWithRetry,
  getActiveTab,
  injectScriptFiles,
  MAX_RETRIES,
  QUERY_WITH_TEXT_FN,
  resolveTabId,
  RETRY_DELAY_MS
} from "./browser-utils"

// ── 等待 tab 加载完成（最多 15s，避免 navigate 后立即 get_page_content 失败）──
async function waitForTabLoad(tabId: number, timeoutMs = 8_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId)
      if (!tab) return
      if (tab.status === "complete") return
    } catch {
      return // tab 不存在
    }
    await new Promise((r) => setTimeout(r, 300))
  }
}

// ── get_page_content ──
// 提取当前页面文本内容，支持两种模式。
// 完整内容始终通过 executeScript 获取，然后在 handleGetPageContent 中
// 决定是否需要 evict 到 OPFS。

export async function handleGetPageContent(
  args: Record<string, unknown>
): Promise<string> {
  const mode = (args.mode as string) || "text"
  const selector = args.selector as string | undefined

  let tabId: number
  try {
    tabId = await resolveTabId(args)
  } catch {
    return JSON.stringify({ error: "no_tab_id" })
  }

  try {
    // text 模式且未指定 selector 时，注入 Readability + turndown 库用于正文提取并转 Markdown
    const useReadability = mode === "text" && !selector
    if (useReadability) {
      try {
        await injectScriptFiles(tabId, ["Readability.js", "turndown.browser.umd.js"])
      } catch {
        // 注入失败（受限制页面等）不阻塞，下方 func 会 fallback 到 innerText
      }
    }

    const result = await executeScriptWithRetry(
      tabId,
      (m: string, sel: string | null, useRead: boolean) => {
        try {
          if (m === "structured") {
            if (sel) {
              // 有 selector：提取指定区域的直接子元素结构
              const el = document.querySelector(sel)
              if (!el)
                return JSON.stringify({
                  error: "selector_not_found",
                  selector: sel
                })
              const children = Array.from(el.children)
              const items = children.map((c) => ({
                tag: c.tagName,
                text: (c as HTMLElement).innerText?.slice(0, 500) || "",
                href: (c as HTMLAnchorElement).href || null
              }))
              return JSON.stringify({ selector: sel, count: items.length, items })
            }

            // 无 selector：提取整个页面的骨架，每行一个 JSON 对象，含唯一 CSS 路径
            // 收集语义区块（header/nav/main/article/section/aside/footer/figure/form）、标题（h1-h6）、链接
            const SEMANTIC = new Set(["HEADER","NAV","MAIN","ARTICLE","SECTION","ASIDE","FOOTER","FIGURE","FORM"])
            const HEADINGS = new Set(["H1","H2","H3","H4","H5","H6"])
            const lines: string[] = []
            const seenLinks = new Set<string>()
            let linkCount = 0
            const MAX_NODES = 300
            const MAX_LINKS = 60
            const MAX_TEXT = 80

            // 生成唯一 CSS 路径（nth-child，避免歧义）
            function cssPath(node: Element): string {
              const parts: string[] = []
              let cur: Element | null = node
              while (cur && cur !== document.body) {
                const tag = cur.tagName.toLowerCase()
                let nth = 1
                let prev = cur.previousElementSibling
                while (prev) { if (prev.tagName === cur!.tagName) nth++; prev = prev.previousElementSibling }
                if (cur.id) { parts.unshift("#" + cur.id); break }
                parts.unshift(tag + ":nth-child(" + nth + ")")
                cur = cur.parentElement
              }
              return "body > " + parts.join(" > ")
            }

            function walk(node: Element) {
              if (lines.length >= MAX_NODES) return
              const tag = node.tagName
              const isSemantic = SEMANTIC.has(tag)
              const isHeading = HEADINGS.has(tag)
              const isLink = tag === "A"
              const href = (node as HTMLAnchorElement).href || ""

              if (isLink) {
                if (!href || href.startsWith("javascript:") || seenLinks.has(href) || linkCount >= MAX_LINKS) return
                seenLinks.add(href)
                linkCount++
                const text = ((node as HTMLElement).innerText || "").trim().slice(0, MAX_TEXT).replace(/"/g, "'")
                if (text) lines.push(JSON.stringify({ selector: cssPath(node), tag: "a", text, href }))
                return
              }
              if (isHeading) {
                const text = (node as HTMLElement).innerText?.trim().slice(0, MAX_TEXT).replace(/"/g, "'") || ""
                if (text) lines.push(JSON.stringify({ selector: cssPath(node), tag: tag.toLowerCase(), text }))
                return
              }
              if (isSemantic) {
                const text = ((node as HTMLElement).innerText?.split("\n")[0] || "").trim().slice(0, MAX_TEXT).replace(/"/g, "'")
                const childCount = Array.from(node.children).filter(c => SEMANTIC.has(c.tagName) || HEADINGS.has(c.tagName) || c.tagName === "A").length
                lines.push(JSON.stringify({ selector: cssPath(node), tag: tag.toLowerCase(), text, children: childCount }))
              }
              for (const child of Array.from(node.children)) {
                walk(child)
              }
            }
            walk(document.body)
            return lines.join("\n")
          }

          // text 模式（默认）
          if (sel) {
            const el = document.querySelector(sel)
            const text = el ? (el as HTMLElement).innerText || "" : ""
            return text
          } else if (useRead && typeof (window as any).Readability !== "undefined") {
            // 用 Readability 提取正文 HTML，再用 turndown 转 Markdown（保留标题/段落/列表/代码块格式）
            // 两个库都注入到页面，全程在页面 DOM 环境跑（SW 无 document，turndown 不能在 SW 跑）
            try {
              const doc = document.cloneNode(true) as Document
              const reader = new (window as any).Readability(doc)
              const article = reader.parse()
              if (article && article.content && article.textContent && article.textContent.trim()) {
                if (typeof (window as any).TurndownService !== "undefined") {
                  const td = new (window as any).TurndownService({
                    headingStyle: "atx",
                    codeBlockStyle: "fenced",
                    bulletListMarker: "-"
                  })
                  td.remove(["style", "script"])
                  const markdown = td.turndown(article.content).trim()
                  return article.title ? `# ${article.title}\n\n${markdown}` : markdown
                }
                // turndown 未注入，fallback 到 textContent
                return article.textContent.trim()
              }
              // Readability 判定为非文章页或解析为空，fallback 到 innerText
              const main = document.querySelector("main, article, [role=main]")
              return main ? (main as HTMLElement).innerText || "" : document.body.innerText || ""
            } catch {
              const main = document.querySelector("main, article, [role=main]")
              return main ? (main as HTMLElement).innerText || "" : document.body.innerText || ""
            }
          } else {
            const main = document.querySelector("main, article, [role=main]")
            return main ? (main as HTMLElement).innerText || "" : document.body.innerText || ""
          }
        } catch (e) {
          return JSON.stringify({
            error: "func_execution_error",
            message: e instanceof Error ? e.message : String(e),
            stack:
              e instanceof Error
                ? e.stack?.split("\n").slice(0, 3).join("\n")
                : null
          })
        }
      },
      [mode, selector ?? null, useReadability],
      "get_page_content"
    )

    if (!result) {
      return JSON.stringify({
        error: "execute_script_failed",
        detail: "executeScript returned empty after retry",
        hint: "Tab may have been closed or is a restricted page (e.g. chrome://)."
      })
    }

    return typeof result === "string" ? result : JSON.stringify(result)
  } catch (error) {
    return JSON.stringify({
      error: "get_page_content_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

// ── fill_form ──
// 在当前页面填充表单字段

export async function handleFillForm(
  args: Record<string, unknown>
): Promise<string> {
  const fields = args.fields as
    | Array<{ selector: string; value: string }>
    | undefined
  if (!fields || fields.length === 0) {
    return JSON.stringify({
      error: "no_fields",
      message: "请提供要填充的字段列表"
    })
  }

  const submit = args.submit === true

  let tabId: number
  try {
    tabId = await resolveTabId(args)
  } catch {
    return JSON.stringify({ error: "no_tab_id" })
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (
        f: Array<{ selector: string; value: string }>,
        doSubmit: boolean
      ) => {
        const results: Array<Record<string, unknown>> = []

        // 辅助函数：支持 :text("...") 选择器（jQuery/Sizzle 扩展）
        function queryWithText(sel: string): Element | null {
          const textMatch = sel.match(/^(.+):text\(["']([^"\']*)["']\)$/)
          if (textMatch) {
            const candidates = document.querySelectorAll(textMatch[1])
            for (const c of candidates) {
              if (c.textContent?.trim() === textMatch[2]) {
                return c
              }
            }
            return null
          }
          return document.querySelector(sel)
        }

        for (const { selector, value } of f) {
          try {
            const el = queryWithText(selector)
            if (!el) {
              results.push({
                selector,
                success: false,
                error: "element_not_found"
              })
              continue
            }

            const tag = el.tagName.toLowerCase()

            if (
              el instanceof HTMLInputElement ||
              el instanceof HTMLTextAreaElement
            ) {
              el.focus()
              el.value = ""
              el.dispatchEvent(new Event("focus", { bubbles: true }))
              el.value = value
              el.dispatchEvent(new Event("input", { bubbles: true }))
              el.dispatchEvent(new Event("change", { bubbles: true }))
              el.dispatchEvent(new Event("blur", { bubbles: true }))
              results.push({
                selector,
                success: true,
                tag,
                type: el.type || tag
              })
            } else if (el instanceof HTMLSelectElement) {
              el.focus()
              el.dispatchEvent(new Event("focus", { bubbles: true }))
              // 尝试按 value 或 text 匹配选项
              let matched = false
              for (let i = 0; i < el.options.length; i++) {
                if (
                  el.options[i].value === value ||
                  el.options[i].text === value
                ) {
                  el.selectedIndex = i
                  matched = true
                  break
                }
              }
              el.dispatchEvent(new Event("input", { bubbles: true }))
              el.dispatchEvent(new Event("change", { bubbles: true }))
              el.dispatchEvent(new Event("blur", { bubbles: true }))
              results.push({ selector, success: matched, tag, matched })
            } else if (
              el.getAttribute("contenteditable") === "true" ||
              el.getAttribute("contenteditable") === ""
            ) {
              el.textContent = value
              el.dispatchEvent(new Event("input", { bubbles: true }))
              results.push({
                selector,
                success: true,
                tag,
                contenteditable: true
              })
            } else {
              results.push({
                selector,
                success: false,
                error: "unsupported_element",
                tag
              })
            }
          } catch (e) {
            results.push({
              selector,
              success: false,
              error: e instanceof Error ? e.message : String(e)
            })
          }
        }

        // 提交表单
        if (doSubmit && f.length > 0) {
          try {
            const lastField = document.querySelector(f[f.length - 1].selector)
            if (lastField) {
              const form = lastField.closest("form")
              if (form) {
                // 方法 1：触发 form submit 事件
                form.dispatchEvent(
                  new Event("submit", { bubbles: true, cancelable: true })
                )
                // 方法 2：查找 form 内的 submit 按钮并点击（兼容 React 等拦截了 submit 事件的框架）
                const submitBtn = form.querySelector(
                  'button[type="submit"], input[type="submit"], button:not([type])'
                ) as HTMLElement | null
                if (submitBtn) {
                  submitBtn.click()
                }
                results.push({
                  submitted: true,
                  form_action: (form as HTMLFormElement).action || null
                })
              } else {
                // 不在 form 内，尝试按回车
                if (lastField instanceof HTMLInputElement) {
                  lastField.dispatchEvent(
                    new KeyboardEvent("keydown", {
                      key: "Enter",
                      code: "Enter",
                      keyCode: 13,
                      bubbles: true,
                      cancelable: true
                    })
                  )
                  results.push({ submitted: true, via: "enter_key" })
                } else {
                  results.push({ submitted: false, error: "no_form_found" })
                }
              }
            }
          } catch (e) {
            results.push({
              submitted: false,
              error: e instanceof Error ? e.message : String(e)
            })
          }
        }

        return JSON.stringify({ results })
      },
      args: [fields, submit]
    })

    if (!result || !result.result) {
      return JSON.stringify({ error: "execute_script_failed" })
    }

    return typeof result.result === "string"
      ? result.result
      : JSON.stringify(result.result)
  } catch (error) {
    return JSON.stringify({
      error: "fill_form_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

// ── click_element ──
// 在页面中点击指定元素

export async function handleClickElement(
  args: Record<string, unknown>
): Promise<string> {
  const selector = args.selector as string | undefined
  if (!selector) {
    return JSON.stringify({
      error: "no_selector",
      message: "请提供 CSS 选择器"
    })
  }

  let tabId: number
  try {
    tabId = await resolveTabId(args)
  } catch {
    return JSON.stringify({ error: "no_tab_id" })
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel: string) => {
        // 将 jQuery/Sizzle :text("...") 选择器转换为原生可用的形式
        let effectiveSel = sel
        let textFilter: string | null = null
        const textMatch = sel.match(/^(.+):text\(["']([^"']*)["']\)$/)
        if (textMatch) {
          effectiveSel = textMatch[1]
          textFilter = textMatch[2]
        }

        let el: Element | null = null
        try {
          if (textFilter) {
            const candidates = document.querySelectorAll(effectiveSel)
            for (const c of candidates) {
              if (c.textContent?.trim() === textFilter) {
                el = c
                break
              }
            }
          } else {
            el = document.querySelector(effectiveSel)
          }
        } catch (e) {
          return JSON.stringify({
            error: "invalid_selector",
            selector: sel,
            message: `CSS selector syntax error: ${e instanceof Error ? e.message : String(e)}`
          })
        }

        if (!el) {
          return JSON.stringify({ error: "element_not_found", selector: sel })
        }

        if (
          el instanceof HTMLButtonElement ||
          el instanceof HTMLInputElement ||
          el instanceof HTMLSelectElement
        ) {
          if (el.disabled) {
            return JSON.stringify({
              error: "element_disabled",
              selector: sel,
              tag: el.tagName.toLowerCase()
            })
          }
        }

        // 先滚动到可见区域
        el.scrollIntoView({ behavior: "instant", block: "center" })

        const rect = el.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const y = rect.top + rect.height / 2

        // 模拟完整点击序列
        el.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y })
        )
        el.dispatchEvent(
          new MouseEvent("mouseup", { bubbles: true, clientX: x, clientY: y })
        )
        el.dispatchEvent(
          new MouseEvent("click", { bubbles: true, clientX: x, clientY: y })
        )

        // 如果是链接，也尝试触发导航
        if (el instanceof HTMLAnchorElement && el.href) {
          return JSON.stringify({
            success: true,
            tag: "a",
            href: el.href,
            text: el.textContent?.trim().slice(0, 200) || ""
          })
        }

        return JSON.stringify({
          success: true,
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim().slice(0, 200) || ""
        })
      },
      args: [selector]
    })

    if (!result || !result.result) {
      return JSON.stringify({ error: "execute_script_failed" })
    }

    return typeof result.result === "string"
      ? result.result
      : JSON.stringify(result.result)
  } catch (error) {
    return JSON.stringify({
      error: "click_element_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

// ── screenshot ──
// 对当前页面截图

export async function handleScreenshot(
  args: Record<string, unknown>
): Promise<string> {
  const format = (args.format as string) === "png" ? "png" : "jpeg"
  const quality = (args.quality as number) ?? 80

  let tabId: number
  try {
    tabId = await resolveTabId(args)
  } catch {
    return JSON.stringify({ error: "no_tab_id" })
  }

  try {
    // captureVisibleTab 第一个参数是 windowId，不是 tabId
    let windowId: number | undefined
    try {
      const tab = await chrome.tabs.get(tabId)
      windowId = tab.windowId
    } catch {
      windowId = undefined
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format,
      quality
    })

    if (!dataUrl) {
      return JSON.stringify({ error: "capture_failed" })
    }

    // 解码 data URL 为二进制 bytes，避免文本编码损坏图片
    const commaIdx = dataUrl.indexOf(",")
    const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl
    const binStr = atob(base64)
    const bytes = new Uint8Array(binStr.length)
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i)
    }

    const ext = format === "png" ? "png" : "jpg"
    const timestamp = Date.now()
    const savePath = `/screenshots/screenshot_${timestamp}_tab${tabId}.${ext}`

    await writeWorkspaceFileBytes(savePath, bytes)

    return JSON.stringify({
      tab_id: tabId,
      format,
      quality: format === "jpeg" ? quality : undefined,
      size_bytes: bytes.length,
      saved_to: savePath
    })
  } catch (error) {
    return JSON.stringify({
      error: "screenshot_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

// ── inspect_element ──
// 探查页面 DOM 结构

export async function handleInspectElement(
  args: Record<string, unknown>
): Promise<string> {
  const selector = args.selector as string | undefined | null
  const depth = (args.depth as number) ?? 2
  const includeChildren = args.include_children !== false

  let tabId: number
  try {
    tabId = await resolveTabId(args)
  } catch {
    return JSON.stringify({ error: "no_tab_id" })
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (
        sel: string | null | undefined,
        maxDepth: number,
        showChildren: boolean
      ) => {
        try {
          function isVisible(el: Element): boolean {
            const style = window.getComputedStyle(el)
            if (
              style.display === "none" ||
              style.visibility === "hidden" ||
              style.opacity === "0"
            ) {
              return false
            }
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          }

          function getInteractivity(el: Element): Record<string, unknown> {
            const info: Record<string, unknown> = {
              visible: isVisible(el),
              clickable: false,
              focusable: false,
              editable: false
            }

            if (
              el instanceof HTMLButtonElement ||
              el instanceof HTMLAnchorElement ||
              (el instanceof HTMLInputElement &&
                (el.type === "submit" ||
                  el.type === "button" ||
                  el.type === "reset"))
            ) {
              info.clickable = true
              info.disabled =
                (el as HTMLButtonElement | HTMLInputElement).disabled || false
            }

            if (
              el instanceof HTMLInputElement ||
              el instanceof HTMLTextAreaElement ||
              el instanceof HTMLSelectElement
            ) {
              info.focusable = true
              if (!(el as HTMLInputElement).disabled) {
                info.editable = true
              }
            }

            if ((el as HTMLElement).tabIndex >= 0) {
              info.focusable = true
            }

            return info
          }

          function getLabel(el: Element): string | null {
            const input = el as
              | HTMLInputElement
              | HTMLTextAreaElement
              | HTMLSelectElement
            if (input.id) {
              const labelEl = document.querySelector(
                `label[for="${CSS.escape(input.id)}"]`
              )
              if (labelEl) return labelEl.textContent?.trim() || null
            }
            const parentLabel = input.closest("label")
            if (parentLabel) return parentLabel.textContent?.trim() || null
            const prev = input.previousElementSibling
            if (prev?.tagName === "LABEL")
              return prev.textContent?.trim() || null
            return null
          }

          function buildSelectors(el: Element): string[] {
            const selectors: string[] = []
            const input = el as
              | HTMLInputElement
              | HTMLTextAreaElement
              | HTMLSelectElement
            if (input.id) selectors.push(`#${CSS.escape(input.id)}`)

            const tag = el.tagName.toLowerCase()

            if ((input as HTMLInputElement).name) {
              selectors.push(
                `${tag}[name="${(input as HTMLInputElement).name}"]`
              )
            }

            if (input instanceof HTMLInputElement && input.type && input.name) {
              selectors.push(
                `input[type="${input.type}"][name="${input.name}"]`
              )
            }

            const ph = (input as HTMLInputElement).placeholder
            if (ph) selectors.push(`${tag}[placeholder="${ph}"]`)

            const ariaLabel = input.getAttribute("aria-label")
            if (ariaLabel) selectors.push(`[aria-label="${ariaLabel}"]`)

            const testId = input.getAttribute("data-testid")
            if (testId) selectors.push('[data-testid="' + testId + '"]')

            const role = input.getAttribute("role")
            if (role) selectors.push(tag + '[role="' + role + '"]')

            const cls =
              input.className && typeof input.className === "string"
                ? input.className.trim().split(/\s+/).filter(Boolean)
                : []
            if (cls.length === 1 && cls[0]) {
              selectors.push(tag + "." + CSS.escape(cls[0]))
            }

            return selectors
          }

          function extractAttrs(el: Element): Record<string, unknown> {
            const tag = el.tagName.toLowerCase()
            const attrs: Record<string, unknown> = {
              tag,
              text: el.textContent?.trim().slice(0, 80) || null,
              id: el.id || null,
              class:
                el.className && typeof el.className === "string"
                  ? el.className.trim() || null
                  : null
            }

            if (el instanceof HTMLAnchorElement) {
              attrs.href = el.href || null
            }

            if (el instanceof HTMLImageElement) {
              attrs.src = el.src || null
              attrs.alt = el.alt || null
            }

            if (
              el instanceof HTMLInputElement ||
              el instanceof HTMLTextAreaElement ||
              el instanceof HTMLSelectElement
            ) {
              const input = el as
                | HTMLInputElement
                | HTMLTextAreaElement
                | HTMLSelectElement
              attrs.name = (input as HTMLInputElement).name || null
              attrs.type =
                tag === "input"
                  ? (input as HTMLInputElement).type || "text"
                  : tag
              attrs.placeholder =
                (input as HTMLInputElement | HTMLTextAreaElement).placeholder ||
                null
              attrs.required = (input as HTMLInputElement).required || false
              attrs.value =
                el instanceof HTMLSelectElement
                  ? (el as HTMLSelectElement).options[
                      (el as HTMLSelectElement).selectedIndex
                    ]?.text ||
                    el.getAttribute("value") ||
                    null
                  : (input as HTMLInputElement).value || null
              attrs.label = getLabel(el)
            }

            attrs.interactivity = getInteractivity(el)
            attrs.candidate_selectors = buildSelectors(el)

            return attrs
          }

          function extractChildren(
            parent: Element,
            currentDepth: number
          ): Array<Record<string, unknown>> {
            if (currentDepth <= 0 || !showChildren) return []

            const children: Array<Record<string, unknown>> = []
            for (const child of parent.children) {
              const info = extractAttrs(child)
              if (currentDepth > 1) {
                info.children = extractChildren(child, currentDepth - 1)
              }
              children.push(info)
            }
            return children
          }

          // 辅助函数：支持 :text("...") 选择器（jQuery/Sizzle 扩展）
          function queryWithText(sel2: string): Element | null {
            const tm = sel2.match(/^(.+):text\(["']([^"\']*)["']\)$/)
            if (tm) {
              const candidates = document.querySelectorAll(tm[1])
              for (const c of candidates) {
                if (c.textContent?.trim() === tm[2]) {
                  return c
                }
              }
              return null
            }
            return document.querySelector(sel2)
          }

          // Main logic
          let target: Element | null

          if (sel) {
            target = queryWithText(sel)
          } else {
            target =
              document.querySelector("form, [role=form]") ||
              document.querySelector(
                "[role=dialog], [role=menu], [role=toolbar]"
              ) ||
              document.querySelector("nav, [role=navigation]") ||
              document.querySelector("main, article, [role=main]") ||
              document.body
          }

          if (!target) {
            return JSON.stringify({ error: "element_not_found", selector: sel })
          }

          const info = extractAttrs(target)
          if (showChildren) {
            info.children = extractChildren(target, maxDepth)
          }
          info.child_count = target.children.length
          info.total_descendants = target.querySelectorAll("*").length

          return JSON.stringify(info)
        } catch (e) {
          return JSON.stringify({
            error: "func_execution_error",
            message: e instanceof Error ? e.message : String(e),
            stack:
              e instanceof Error
                ? e.stack?.split("\n").slice(0, 3).join("\n")
                : null
          })
        }
      },
      args: [selector ?? null, depth, includeChildren]
    })

    if (!result || !result.result) {
      const detail = !result
        ? "chrome.scripting.executeScript returned empty"
        : "executeScript result has no result field"
      console.error(
        "[lumino:tool] inspect_element execute_script_failed:",
        detail,
        result
      )
      return JSON.stringify({
        error: "execute_script_failed",
        detail,
        hint: "Cannot inject script into this page (e.g. chrome:// or extension pages). Switch to a regular web page."
      })
    }

    return typeof result.result === "string"
      ? result.result
      : JSON.stringify(result.result)
  } catch (error) {
    console.error("[lumino:tool] inspect_element error:", error)
    return JSON.stringify({
      error: "inspect_element_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

// ── navigate ──
// 新开标签页导航到目标 URL，返回新 tab 的 tab_id

export async function handleNavigate(
  args: Record<string, unknown>
): Promise<string> {
  const url = args.url as string | undefined
  if (!url) {
    return JSON.stringify({ error: "no_url", message: "请提供要访问的 URL" })
  }

  // 补全协议头
  let normalizedUrl = url
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = "https://" + normalizedUrl
  }

  const existingTabId = args.tab_id as number | undefined

  try {
    let tab: chrome.tabs.Tab

    if (existingTabId && existingTabId > 0) {
      // 在已有 tab 上导航，复用不新开
      const agentWindowId = await getAgentWindowId()
      tab = await chrome.tabs.update(existingTabId, {
        url: normalizedUrl,
        active: false
      })
    } else {
      // 新开后台标签页
      const agentWinId = await getAgentWindowId()
      tab = await chrome.tabs.create({
        url: normalizedUrl,
        active: false,
        ...(agentWinId != null ? { windowId: agentWinId } : {})
      })
    }

    // 等待页面加载完成再返回，避免 agent 拿到 tab_id 后立即调用 get_page_content
    // 时页面尚未渲染，导致 executeScript 注入失败
    if (tab.id) {
      await waitForTabLoad(tab.id)
      // 重新获取 tab 信息，确保 url/title 是加载完成后的值
      try {
        const loaded = await chrome.tabs.get(tab.id)
        tab = loaded
      } catch {
        // tab 可能已被关闭
      }
    }

    return JSON.stringify({
      tab_id: tab.id,
      url: tab.url ?? normalizedUrl,
      title: tab.title ?? ""
    })
  } catch (error) {
    return JSON.stringify({
      error: "navigate_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

// ── scroll ──
// 滚动页面到指定位置

export async function handleScroll(
  args: Record<string, unknown>
): Promise<string> {
  let tabId: number
  try {
    tabId = await resolveTabId(args)
  } catch {
    return JSON.stringify({ error: "no_tab_id" })
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (opts: {
        to?: string
        by?: { x: number; y: number }
        percent?: number
        selector?: string
        direction?: string
        by_x?: number
        by_y?: number
      }) => {
        const scrollToPos = (top: number, left: number) => {
          window.scrollTo({ top, left, behavior: "instant" as ScrollBehavior })
        }

        // 记录滚动方法用于输出
        let method = "unknown"

        if (opts.selector) {
          const el = document.querySelector(opts.selector)
          if (!el) {
            return JSON.stringify({
              error: "selector_not_found",
              selector: opts.selector
            })
          }
          el.scrollIntoView({ behavior: "instant", block: "start" })
          method = "selector"
        } else if (typeof opts.direction === "string") {
          // 按页滚动：不传 direction 时用 down
          const dir = opts.direction
          const vh = window.innerHeight
          const delta = Math.round(vh * 0.75)
          if (dir === "down") {
            window.scrollBy({
              left: 0,
              top: delta,
              behavior: "instant" as ScrollBehavior
            })
          } else if (dir === "up") {
            window.scrollBy({
              left: 0,
              top: -delta,
              behavior: "instant" as ScrollBehavior
            })
          }
          method = "direction_" + dir
        } else if (
          typeof opts.by_x === "number" ||
          typeof opts.by_y === "number"
        ) {
          // 像素滚动
          window.scrollBy({
            left: opts.by_x ?? 0,
            top: opts.by_y ?? 0,
            behavior: "instant" as ScrollBehavior
          })
          method = "by"
        } else if (opts.to === "top") {
          scrollToPos(0, 0)
          method = "to_top"
        } else if (opts.to === "bottom") {
          scrollToPos(document.documentElement.scrollHeight, 0)
          method = "to_bottom"
        } else if (typeof opts.percent === "number") {
          const pct = Math.max(0, Math.min(100, opts.percent))
          const maxY =
            document.documentElement.scrollHeight - window.innerHeight
          scrollToPos(Math.round((pct / 100) * maxY), 0)
          method = "percent"
        } else if (opts.by && (opts.by.x !== 0 || opts.by.y !== 0)) {
          window.scrollBy({
            left: opts.by.x ?? 0,
            top: opts.by.y ?? 0,
            behavior: "instant" as ScrollBehavior
          })
          method = "by"
        } else {
          return JSON.stringify({
            error: "no_scroll_target",
            hint: "需要指定 direction、to、by、by_x/by_y、percent 或 selector 之一"
          })
        }

        return JSON.stringify({
          scrolled: true,
          method,
          scroll_y: Math.round(window.scrollY),
          scroll_x: Math.round(window.scrollX),
          page_height: document.documentElement.scrollHeight,
          viewport_height: window.innerHeight
        })
      },
      args: [
        {
          to: args.to as string | undefined,
          by: args.by as { x: number; y: number } | undefined,
          percent: args.percent as number | undefined,
          selector: args.selector as string | undefined,
          direction: args.direction as string | undefined,
          by_x: args.x as number | undefined,
          by_y: args.y as number | undefined
        }
      ]
    })

    if (!result || !result.result) {
      return JSON.stringify({ error: "execute_script_failed" })
    }

    return typeof result.result === "string"
      ? result.result
      : JSON.stringify(result.result)
  } catch (error) {
    return JSON.stringify({
      error: "scroll_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

// ── press_key ──
// 模拟键盘按键

export async function handlePressKey(
  args: Record<string, unknown>
): Promise<string> {
  const key = args.key as string | undefined
  if (!key) {
    return JSON.stringify({
      error: "no_key",
      message:
        "请提供按键名称，如 Enter、Escape、Tab、ArrowDown、a、Control+a 等"
    })
  }

  let tabId: number
  try {
    tabId = await resolveTabId(args)
  } catch {
    return JSON.stringify({ error: "no_tab_id" })
  }

  // 解析组合键，如 "Control+a"、"Shift+Enter"
  const parts = key.split("+")
  const mainKey = parts.pop()!

  // 修饰键映射
  const modifierMap: Record<string, string> = {
    Control: "ctrlKey",
    Ctrl: "ctrlKey",
    Shift: "shiftKey",
    Alt: "altKey",
    Meta: "metaKey",
    Cmd: "metaKey"
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (opts: { key: string; modifiers: string[]; selector?: string }) => {
        const modMap: Record<string, string> = {
          Control: "ctrlKey",
          Ctrl: "ctrlKey",
          Shift: "shiftKey",
          Alt: "altKey",
          Meta: "metaKey",
          Cmd: "metaKey"
        }

        const init: KeyboardEventInit = {
          key: opts.key,
          code: "Key" + opts.key.toUpperCase(),
          bubbles: true,
          cancelable: true
        }

        for (const mod of opts.modifiers) {
          const prop = modMap[mod]
          if (prop) (init as Record<string, unknown>)[prop] = true
        }

        // 特殊 code 映射
        const codeMap: Record<string, string> = {
          Enter: "Enter",
          Escape: "Escape",
          Tab: "Tab",
          Backspace: "Backspace",
          Delete: "Delete",
          ArrowUp: "ArrowUp",
          ArrowDown: "ArrowDown",
          ArrowLeft: "ArrowLeft",
          ArrowRight: "ArrowRight",
          Home: "Home",
          End: "End",
          PageUp: "PageUp",
          PageDown: "PageDown",
          " ": "Space",
          Space: "Space"
        }
        init.code = codeMap[opts.key] || "Key" + opts.key.toUpperCase()

        let target: EventTarget = document

        if (opts.selector) {
          const el = document.querySelector(opts.selector)
          if (!el) {
            return JSON.stringify({
              error: "selector_not_found",
              selector: opts.selector
            })
          }
          target = el
        } else {
          // 如果没有指定选择器，尝试将焦点元素作为目标
          target = document.activeElement || document.body
        }

        target.dispatchEvent(
          new KeyboardEvent("keydown", init as KeyboardEventInit)
        )
        target.dispatchEvent(
          new KeyboardEvent("keypress", init as KeyboardEventInit)
        )
        target.dispatchEvent(
          new KeyboardEvent("keyup", init as KeyboardEventInit)
        )

        return JSON.stringify({
          pressed: true,
          key: opts.key,
          modifiers: opts.modifiers,
          target:
            opts.selector ||
            (document.activeElement?.tagName || "body").toLowerCase()
        })
      },
      args: [
        {
          key: mainKey,
          modifiers: parts,
          selector: args.selector as string | undefined
        }
      ]
    })

    if (!result || !result.result) {
      return JSON.stringify({ error: "execute_script_failed" })
    }

    return typeof result.result === "string"
      ? result.result
      : JSON.stringify(result.result)
  } catch (error) {
    return JSON.stringify({
      error: "press_key_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

// ── close_tab ──
// 关闭指定标签页，支持一次性关闭多个

export async function handleCloseTab(
  args: Record<string, unknown>
): Promise<string> {
  const tabIds = args.tab_ids as number[] | undefined
  if (!tabIds || !Array.isArray(tabIds) || tabIds.length === 0) {
    return JSON.stringify({
      error: "missing_tab_ids",
      message: "关闭标签页需要提供有效的 tab_ids 列表"
    })
  }

  const results: Array<{
    tab_id: number
    title: string
    url: string
    closed: boolean
    error?: string
  }> = []

  for (const tabId of tabIds) {
    try {
      const tab = await chrome.tabs.get(tabId)
      const title = tab.title ?? ""
      const url = tab.url ?? ""

      await chrome.tabs.remove(tabId)

      results.push({
        tab_id: tabId,
        title,
        url,
        closed: true
      })
    } catch (error) {
      results.push({
        tab_id: tabId,
        title: "",
        url: "",
        closed: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return JSON.stringify({
    closed_count: results.filter((r) => r.closed).length,
    failed_count: results.filter((r) => !r.closed).length,
    results
  })
}
