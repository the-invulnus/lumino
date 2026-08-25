// @ts-nocheck
/**
 * inspect_element 注入函数单元测试
 * 在 Node 环境用 jsdom 模拟 DOM，测试 extractAttrs / getInteractivity / buildSelectors 等
 * 不测试 chrome.scripting.executeScript 本身（那是浏览器 API）
 */
import { describe, it, expect } from "vitest"
import { JSDOM } from "jsdom"

// CSS.escape polyfill for jsdom (not available in Node)
if (typeof CSS === "undefined" || !CSS.escape) {
  const ESCAPE_RE = /([\x00-\x2C\x2E\x3A-\x40\x5B-\x5E\x60\x7B-\xFF])/g
  const ESCAPE_MAP: Record<string, string> = {}
  ;(globalThis as any).CSS = {
    escape(value: string): string {
      if (ESCAPE_MAP[value]) return ESCAPE_MAP[value]
      const result = value.replace(ESCAPE_RE, (ch) => "\\" + ch.charCodeAt(0).toString(16).padStart(6, "0") + " ")
      ESCAPE_MAP[value] = result
      return result
    }
  }
}


// 复制注入函数的核心逻辑（独立于浏览器 API）
function runInspect(
  html: string,
  selector: string | null,
  depth: number,
  showChildren: boolean
): string {
  const dom = new JSDOM(`<!DOCTYPE html>${html}`)
  const doc = dom.window.document
  const win = dom.window as any

  // ——— 辅助函数（与 browser-tools.ts 中的 func 完全一致）———

  function isVisible(el: Element): boolean {
    // jsdom 不支持 getBoundingClientRect / getComputedStyle 模拟
    // 跳过可见性检测，默认返回 true
    return true
  }

  function getInteractivity(el: Element): Record<string, unknown> {
    const info: Record<string, unknown> = {
      visible: isVisible(el),
      clickable: false,
      focusable: false,
      editable: false
    }

    if (el instanceof win.HTMLButtonElement ||
        el instanceof win.HTMLAnchorElement ||
        (el instanceof win.HTMLInputElement && (
          el.type === "submit" ||
          el.type === "button" ||
          el.type === "reset"
        ))) {
      info.clickable = true
      info.disabled = (el as win.HTMLButtonElement | win.HTMLInputElement).disabled || false
    }

    if (el instanceof win.HTMLInputElement ||
        el instanceof win.HTMLTextAreaElement ||
        el instanceof win.HTMLSelectElement) {
      info.focusable = true
      if (!(el as win.HTMLInputElement).disabled) {
        info.editable = true
      }
    }

    if ((el as win.HTMLElement).tabIndex >= 0) {
      info.focusable = true
    }

    return info
  }

  function getLabel(el: Element): string | null {
    const input = el as win.HTMLInputElement | win.HTMLTextAreaElement | win.HTMLSelectElement
    if (input.id) {
      const labelEl = doc.querySelector(`label[for="${CSS.escape(input.id)}"]`)
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
    const input = el as win.HTMLInputElement | win.HTMLTextAreaElement | win.HTMLSelectElement
    if (input.id) selectors.push(`#${CSS.escape(input.id)}`)

    const tag = el.tagName.toLowerCase()

    if ((input as win.HTMLInputElement).name) {
      selectors.push(`${tag}[name="${(input as win.HTMLInputElement).name}"]`)
    }

    if (input instanceof win.HTMLInputElement && input.type && input.name) {
      selectors.push(`input[type="${input.type}"][name="${input.name}"]`)
    }

    const ph = (input as win.HTMLInputElement | win.HTMLTextAreaElement).placeholder
    if (ph) selectors.push(`${tag}[placeholder="${ph}"]`)

    const ariaLabel = input.getAttribute("aria-label")
    if (ariaLabel) selectors.push(`[aria-label="${ariaLabel}"]`)

    const testId = input.getAttribute("data-testid")
    if (testId) selectors.push(`[data-testid="${testId}"]`)

    const role = input.getAttribute("role")
    if (role) selectors.push(`${tag}[role="${role}"]`)

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

    if (el instanceof win.HTMLAnchorElement) {
      attrs.href = el.href || null
    }

    if (el instanceof win.HTMLImageElement) {
      attrs.src = el.src || null
      attrs.alt = el.alt || null
    }

    if (el instanceof win.HTMLInputElement ||
        el instanceof win.HTMLTextAreaElement ||
        el instanceof win.HTMLSelectElement) {
      const input = el as win.HTMLInputElement | win.HTMLTextAreaElement | win.HTMLSelectElement
      attrs.name = (input as win.HTMLInputElement).name || null
      attrs.type = tag === "input" ? ((input as win.HTMLInputElement).type || "text") : tag
      attrs.placeholder = (input as win.HTMLInputElement | win.HTMLTextAreaElement).placeholder || null
      attrs.required = (input as win.HTMLInputElement).required || false
      attrs.value = el instanceof win.HTMLSelectElement
        ? (el as win.HTMLSelectElement).options[(el as win.HTMLSelectElement).selectedIndex]?.text || el.getAttribute("value") || null
        : (input as win.HTMLInputElement).value || null
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

  // ——— 主逻辑 ———
  let target: Element | null

  if (selector) {
    target = doc.querySelector(selector)
  } else {
    target = doc.querySelector("form, [role=form]") ||
             doc.querySelector("main, article, [role=main]") ||
             doc.body
  }

  if (!target) {
    return JSON.stringify({ error: "element_not_found", selector })
  }

  const info = extractAttrs(target)
  if (showChildren) {
    info.children = extractChildren(target, depth)
  }
  info.child_count = target.children.length
  info.total_descendants = target.querySelectorAll("*").length

  return JSON.stringify(info)
}

// ═══════════════ 测试 ═══════════════

describe("inspect_element 注入函数", () => {
  it("探查表单字段：类型、标签、选择器", () => {
    const result = runInspect(
      `<form id="login">
        <label for="email">邮箱</label>
        <input id="email" name="email" type="email" placeholder="请输入邮箱" required />
        <label for="pwd">密码</label>
        <input id="pwd" name="password" type="password" required />
        <button id="submit-btn" type="submit">登录</button>
      </form>`,
      "#login",
      2,
      true
    )

    const parsed = JSON.parse(result)
    expect(parsed.tag).toBe("form")
    expect(parsed.id).toBe("login")
    expect(parsed.child_count).toBe(5)

    const children = parsed.children as Array<Record<string, unknown>>
    expect(children.length).toBeGreaterThanOrEqual(3)

    // 邮箱字段
    const emailField = children.find((c) => c.id === "email")
    expect(emailField).toBeDefined()
    expect(emailField!.type).toBe("email")
    expect(emailField!.name).toBe("email")
    expect(emailField!.placeholder).toBe("请输入邮箱")
    expect(emailField!.required).toBe(true)
    expect(emailField!.label).toBe("邮箱")
    const emailSelectors = emailField!.candidate_selectors as string[]
    expect(emailSelectors).toContain("#email")
    expect(emailSelectors).toContain("input[name=\"email\"]")

    // 密码字段
    const pwdField = children.find((c) => c.id === "pwd")
    expect(pwdField).toBeDefined()
    expect(pwdField!.type).toBe("password")
    expect(pwdField!.label).toBe("密码")

    // 按钮
    const btn = children.find((c) => c.id === "submit-btn")
    expect(btn).toBeDefined()
    expect((btn!.interactivity as Record<string, unknown>).clickable).toBe(true)
  })

  it("无 selector 时自动探测表单", () => {
    const result = runInspect(
      `<main><form id="signup"><input name="username" /></form></main>`,
      null,
      1,
      true
    )

    const parsed = JSON.parse(result)
    expect(parsed.tag).toBe("form")
    expect(parsed.id).toBe("signup")
  })

  it("depth=0 时不返回子元素", () => {
    const result = runInspect(
      `<div id="root"><span>hello</span><span>world</span></div>`,
      "#root",
      0,
      true
    )

    const parsed = JSON.parse(result)
    expect(parsed.children).toEqual([])
  })

  it("include_children=false 时不返回子元素", () => {
    const result = runInspect(
      `<div id="root"><span>hello</span></div>`,
      "#root",
      2,
      false
    )

    const parsed = JSON.parse(result)
    expect(parsed.children).toBeUndefined()
  })

  it("不存在的选择器返回错误", () => {
    const result = runInspect(
      `<div></div>`,
      "#not-found",
      1,
      true
    )

    const parsed = JSON.parse(result)
    expect(parsed.error).toBe("element_not_found")
  })

  it("返回 candidate_selectors（id > name > type+name > placeholder）", () => {
    const result = runInspect(
      `<input id="zip" name="zipcode" type="text" placeholder="邮编" aria-label="邮政编码" />`,
      "#zip",
      0,
      false
    )

    const parsed = JSON.parse(result)
    const selectors = parsed.candidate_selectors as string[]
    // ID 应该是第一个
    expect(selectors[0]).toBe("#zip")
    // name 第二个
    expect(selectors[1]).toBe("input[name=\"zipcode\"]")
    // placeholder 在中间
    expect(selectors).toContain("input[placeholder=\"邮编\"]")
    // aria-label
    expect(selectors).toContain("[aria-label=\"邮政编码\"]")
  })

  it("按钮的可交互性正确", () => {
    const result = runInspect(
      `<button id="ok" type="submit">确定</button>`,
      "#ok",
      0,
      false
    )

    const parsed = JSON.parse(result)
    expect(parsed.tag).toBe("button")
    expect(parsed.interactivity.clickable).toBe(true)
    expect(parsed.interactivity.focusable).toBe(true)
  })

  it("禁用的按钮 clickable 但 disabled=true", () => {
    const result = runInspect(
      `<button id="no" disabled>不可用</button>`,
      "#no",
      0,
      false
    )

    const parsed = JSON.parse(result)
    expect(parsed.interactivity.clickable).toBe(true)
    expect(parsed.interactivity.disabled).toBe(true)
  })

  it("输入框可编辑、可聚焦", () => {
    const result = runInspect(
      `<input id="text" type="text" />`,
      "#text",
      0,
      false
    )

    const parsed = JSON.parse(result)
    expect(parsed.interactivity.focusable).toBe(true)
    expect(parsed.interactivity.editable).toBe(true)
  })

  it("链接返回 href", () => {
    const result = runInspect(
      `<a id="link" href="https://example.com">示例</a>`,
      "#link",
      0,
      false
    )

    const parsed = JSON.parse(result)
    expect(parsed.tag).toBe("a")
    expect(parsed.href).toBe("https://example.com/")
    expect(parsed.text).toBe("示例")
  })
})
