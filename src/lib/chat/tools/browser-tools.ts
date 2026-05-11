// ── 工具函数 ──

function getActiveTab(): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) return reject(new Error("no_active_tab"))
      resolve(tab)
    })
  })
}

// ── get_page_content ──
// 提取当前页面文本内容，支持三种模式

export async function handleGetPageContent(
  args: Record<string, unknown>
): Promise<string> {
  const mode = (args.mode as string) || "text"
  const selector = args.selector as string | undefined
  const maxChars = (args.max_chars as number) || 8000

  const tab = await getActiveTab()
  if (!tab.id) return JSON.stringify({ error: "no_tab_id" })

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (m: string, sel: string | null, max: number) => {
        let text = ""

        if (m === "full_html") {
          text = document.documentElement.outerHTML
        } else if (m === "structured" && sel) {
          // 提取特定选择器下的结构化内容
          const el = document.querySelector(sel)
          if (!el) return JSON.stringify({ error: "selector_not_found", selector: sel })
          const children = Array.from(el.children)
          const items = children.map((c) => ({
            tag: c.tagName,
            text: (c as HTMLElement).innerText?.slice(0, 500) || "",
            href: (c as HTMLAnchorElement).href || null
          }))
          return JSON.stringify({ selector: sel, count: items.length, items })
        } else {
          // mode === "text" (默认)
          if (sel) {
            const el = document.querySelector(sel)
            text = el ? (el as HTMLElement).innerText || "" : ""
          } else {
            // 优先取 main/article，否则取 body
            const main = document.querySelector("main, article, [role=main]")
            text = main ? (main as HTMLElement).innerText || "" : document.body.innerText || ""
          }
        }

        if (text.length > max) {
          text = text.slice(0, max) + `\n\n[截断：总长度 ${text.length} 字符，仅显示前 ${max} 字符]`
        }

        return text
      },
      args: [mode, selector ?? null, maxChars]
    })

    if (!result || !result.result) {
      return JSON.stringify({ error: "execute_script_failed" })
    }

    return typeof result.result === "string" ? result.result : JSON.stringify(result.result)
  } catch (error) {
    return JSON.stringify({
      error: "get_page_content_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

// ── take_selection ──
// 获取用户在页面中选中的文本

export async function handleTakeSelection(
  _args: Record<string, unknown>
): Promise<string> {
  const tab = await getActiveTab()
  if (!tab.id) return JSON.stringify({ error: "no_tab_id" })

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed) {
          return JSON.stringify({ selected: false, message: "当前页面没有选中文本" })
        }

        const range = sel.getRangeAt(0)
        const container = range.commonAncestorContainer
        const parentEl = container.nodeType === 3 ? container.parentElement : container as Element

        return JSON.stringify({
          selected: true,
          text: sel.toString(),
          length: sel.toString().length,
          // 提供上下文：选中文本前后各取一点周围文本
          context_before: parentEl?.textContent?.slice(
            Math.max(0, (parentEl.textContent.indexOf(sel.toString()) - 50)),
            parentEl.textContent.indexOf(sel.toString())
          )?.trim() || null,
          context_after: parentEl?.textContent?.slice(
            parentEl.textContent.indexOf(sel.toString()) + sel.toString().length,
            parentEl.textContent.indexOf(sel.toString()) + sel.toString().length + 50
          )?.trim() || null
        })
      }
    })

    if (!result || !result.result) {
      return JSON.stringify({ error: "execute_script_failed" })
    }

    return typeof result.result === "string" ? result.result : JSON.stringify(result.result)
  } catch (error) {
    return JSON.stringify({
      error: "take_selection_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

// ── fill_form ──
// 在当前页面填充表单字段

export async function handleFillForm(
  args: Record<string, unknown>
): Promise<string> {
  const fields = args.fields as Array<{ selector: string; value: string }> | undefined
  if (!fields || fields.length === 0) {
    return JSON.stringify({ error: "no_fields", message: "请提供要填充的字段列表" })
  }

  const tab = await getActiveTab()
  if (!tab.id) return JSON.stringify({ error: "no_tab_id" })

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (f: Array<{ selector: string; value: string }>) => {
        const results: Array<{ selector: string; success: boolean; error?: string }> = []

        for (const { selector, value } of f) {
          try {
            const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
            if (!el) {
              results.push({ selector, success: false, error: "元素未找到" })
              continue
            }

            // 触发 focus + input + change 事件，确保 React/Vue 框架感知
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype, "value"
            )?.set
            const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
              HTMLTextAreaElement.prototype, "value"
            )?.set

            if (el instanceof HTMLSelectElement) {
              el.value = value
            } else if (el instanceof HTMLTextAreaElement && nativeTextareaValueSetter) {
              nativeTextareaValueSetter.call(el, value)
            } else if (el instanceof HTMLInputElement && nativeInputValueSetter) {
              nativeInputValueSetter.call(el, value)
            } else {
              ;(el as HTMLInputElement).value = value
            }

            el.dispatchEvent(new Event("input", { bubbles: true }))
            el.dispatchEvent(new Event("change", { bubbles: true }))
            el.dispatchEvent(new FocusEvent("focus", { bubbles: true }))
            el.dispatchEvent(new FocusEvent("blur", { bubbles: true }))

            results.push({ selector, success: true })
          } catch (e) {
            results.push({ selector, success: false, error: String(e) })
          }
        }

        return JSON.stringify(results)
      },
      args: [fields]
    })

    if (!result || !result.result) {
      return JSON.stringify({ error: "execute_script_failed" })
    }

    return typeof result.result === "string" ? result.result : JSON.stringify(result.result)
  } catch (error) {
    return JSON.stringify({
      error: "fill_form_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

// ── click_element ──
// 在当前页面模拟点击元素

export async function handleClickElement(
  args: Record<string, unknown>
): Promise<string> {
  const selector = args.selector as string | undefined
  if (!selector) {
    return JSON.stringify({ error: "no_selector", message: "请提供 CSS 选择器" })
  }

  const tab = await getActiveTab()
  if (!tab.id) return JSON.stringify({ error: "no_tab_id" })

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null
        if (!el) {
          return JSON.stringify({ success: false, error: "元素未找到", selector: sel })
        }

        // 如果元素不可见，尝试滚动到可见区域
        if (el.scrollIntoView) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
        }

        // 如果元素被禁用，返回失败
        if ((el as HTMLButtonElement).disabled) {
          return JSON.stringify({ success: false, error: "元素被禁用", selector: sel })
        }

        el.click()
        return JSON.stringify({
          success: true,
          selector: sel,
          tag: el.tagName,
          text: el.textContent?.slice(0, 100) || ""
        })
      },
      args: [selector]
    })

    if (!result || !result.result) {
      return JSON.stringify({ error: "execute_script_failed" })
    }

    return typeof result.result === "string" ? result.result : JSON.stringify(result.result)
  } catch (error) {
    return JSON.stringify({
      error: "click_element_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

// ── screenshot ──
// 截取当前页面可见区域

export async function handleScreenshot(
  args: Record<string, unknown>
): Promise<string> {
  const format = (args.format as string) || "jpeg"
  const quality = (args.quality as number) ?? 80

  const tab = await getActiveTab()
  if (!tab.id) return JSON.stringify({ error: "no_tab_id" })
  if (!tab.windowId) return JSON.stringify({ error: "no_window_id" })

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: format as "jpeg" | "png",
      quality: format === "jpeg" ? quality : undefined
    })

    // 返回 data URL 摘要信息（完整 base64 太长，不该注入 LLM context）
    const sizeBytes = Math.round((dataUrl.length * 3) / 4)
    return JSON.stringify({
      success: true,
      format,
      quality,
      size_bytes: sizeBytes,
      // 缩略信息：前 100 字符，让模型知道截图已生成
      data_url_prefix: dataUrl.slice(0, 80) + "...",
      note: "截图已生成（base64 data URL）。完整内容过长，已存放在工具结果中。若模型支持 vision，可通过此 data_url 查看截图。"
    })
  } catch (error) {
    return JSON.stringify({
      error: "screenshot_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

// ── inspect_element ──
// 通用 DOM 探查：分析指定元素的标签、属性、可交互性及子元素结构

export async function handleInspectElement(
  args: Record<string, unknown>
): Promise<string> {
  const selector = (args.selector as string) || null
  const depth = (args.depth as number) || 2
  const includeChildren = args.include_children !== false

  const tab = await getActiveTab()
  if (!tab.id) return JSON.stringify({ error: "no_tab_id" })

  if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("about:")) {
    return JSON.stringify({
      error: "cannot_inject",
      url: tab.url,
      message: "无法在 chrome:// / chrome-extension:// / about: 页面注入脚本，请切换到普通网页。"
    })
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel: string | null, maxDepth: number, showChildren: boolean) => {
        try {
          function isVisible(el: Element): boolean {
            const rect = el.getBoundingClientRect()
            if (rect.width === 0 && rect.height === 0) return false
            const style = window.getComputedStyle(el)
            if (style.display === "none" || style.visibility === "hidden") return false
            if (parseFloat(style.opacity) === 0) return false
            return true
          }

          function getInteractivity(el: Element): Record<string, unknown> {
            const info: Record<string, unknown> = {
              visible: isVisible(el),
              clickable: false,
              focusable: false,
              editable: false
            }

            if (el instanceof HTMLButtonElement ||
                el instanceof HTMLAnchorElement ||
                (el instanceof HTMLInputElement && (
                  (el as HTMLInputElement).type === "submit" ||
                  (el as HTMLInputElement).type === "button" ||
                  (el as HTMLInputElement).type === "reset"
                ))) {
              info.clickable = true
              info.disabled = (el as HTMLButtonElement | HTMLInputElement).disabled || false
            }

            if (el instanceof HTMLInputElement ||
                el instanceof HTMLTextAreaElement ||
                el instanceof HTMLSelectElement) {
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
            const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
            if (input.id) {
              const labelEl = document.querySelector('label[for="' + CSS.escape(input.id) + '"]')
              if (labelEl) return labelEl.textContent?.trim() || null
            }
            const parentLabel = input.closest("label")
            if (parentLabel) return parentLabel.textContent?.trim() || null
            const prev = input.previousElementSibling
            if (prev?.tagName === "LABEL") return prev.textContent?.trim() || null
            return null
          }

          function buildSelectors(el: Element): string[] {
            const selectors: string[] = []
            const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
            if (input.id) selectors.push("#" + CSS.escape(input.id))

            const tag = el.tagName.toLowerCase()

            if ((input as HTMLInputElement).name) {
              selectors.push(tag + '[name="' + (input as HTMLInputElement).name + '"]')
            }

            if (input instanceof HTMLInputElement && input.type && input.name) {
              selectors.push('input[type="' + input.type + '"][name="' + input.name + '"]')
            }

            const ph = (input as HTMLInputElement | HTMLTextAreaElement).placeholder
            if (ph) selectors.push(tag + '[placeholder="' + ph + '"]')

            const ariaLabel = input.getAttribute("aria-label")
            if (ariaLabel) selectors.push('[aria-label="' + ariaLabel + '"]')

            const testId = input.getAttribute("data-testid")
            if (testId) selectors.push('[data-testid="' + testId + '"]')

            const role = input.getAttribute("role")
            if (role) selectors.push(tag + '[role="' + role + '"]')

            const cls = input.className && typeof input.className === "string"
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
              text: el.textContent?.trim().slice(0, 200) || null,
              id: el.id || null,
              class: el.className && typeof el.className === "string" ? el.className.trim() || null : null
            }

            if (el instanceof HTMLAnchorElement) {
              attrs.href = el.href || null
            }

            if (el instanceof HTMLImageElement) {
              attrs.src = el.src || null
              attrs.alt = el.alt || null
            }

            if (el instanceof HTMLInputElement ||
                el instanceof HTMLTextAreaElement ||
                el instanceof HTMLSelectElement) {
              const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
              attrs.name = (input as HTMLInputElement).name || null
              attrs.type = tag === "input" ? ((input as HTMLInputElement).type || "text") : tag
              attrs.placeholder = (input as HTMLInputElement | HTMLTextAreaElement).placeholder || null
              attrs.required = (input as HTMLInputElement).required || false
              attrs.value = el instanceof HTMLSelectElement
                ? (el as HTMLSelectElement).options[(el as HTMLSelectElement).selectedIndex]?.text || el.getAttribute("value") || null
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

          // Main logic
          let target: Element | null

          if (sel) {
            target = document.querySelector(sel)
          } else {
            target = document.querySelector("form, [role=form]") ||
                     document.querySelector("[role=dialog], [role=menu], [role=toolbar]") ||
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
            stack: e instanceof Error ? e.stack?.split("\n").slice(0, 3).join("\n") : null
          })
        }
      },
      args: [selector, depth, includeChildren]
    })

    if (!result || !result.result) {
      const detail = !result
        ? "chrome.scripting.executeScript returned empty"
        : "executeScript result has no result field"
      console.error("[lumino:tool] inspect_element execute_script_failed:", detail, result)
      return JSON.stringify({
        error: "execute_script_failed",
        detail,
        hint: "Cannot inject script into this page (e.g. chrome:// or extension pages). Switch to a regular web page."
      })
    }

    return typeof result.result === "string" ? result.result : JSON.stringify(result.result)
  } catch (error) {
    console.error("[lumino:tool] inspect_element error:", error)
    return JSON.stringify({
      error: "inspect_element_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}
