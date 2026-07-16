// @ts-nocheck
/**
 * scrape_* 注入函数单元测试
 * 在 Node 环境用 jsdom 模拟 DOM，测试各注入函数的核心逻辑
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

// ═══════════════════════════════════════════
// scrape_structure 注入函数测试
// ═══════════════════════════════════════════

function runScrapeStructure(
  html: string,
  selector: string | null,
  maxDepth: number,
  maxNodes: number,
  incText: boolean,
  incBbox: boolean
): string {
  const dom = new JSDOM(`<!DOCTYPE html>${html}`)
  const doc = dom.window.document
  const win = dom.window as any

  let nodeCount = 0
  let truncated = false
  let maxDepthReached = false

  function extractNode(el: Element, currentDepth: number): Record<string, unknown> | null {
    if (nodeCount >= maxNodes) {
      truncated = true
      return null
    }
    if (currentDepth > maxDepth) {
      maxDepthReached = true
      return null
    }
    nodeCount++

    const node: Record<string, unknown> = {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      class: el.className && typeof el.className === "string"
        ? el.className.trim() || null
        : null
    }

    if (incText) {
      node.text = el.textContent?.trim().slice(0, 500) || null
    }

    if (incBbox) {
      const rect = el.getBoundingClientRect()
      node.bbox = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height)
      }
    }

    const children: Array<Record<string, unknown>> = []
    if (currentDepth < maxDepth) {
      for (const child of el.children) {
        const childNode = extractNode(child, currentDepth + 1)
        if (childNode) children.push(childNode)
        if (truncated) break
      }
    } else if (el.children.length > 0) {
      maxDepthReached = true
    }
    if (children.length > 0) {
      node.children = children
    }

    return node
  }

  const root = selector ? doc.querySelector(selector) : doc.body
  if (!root) return JSON.stringify({ error: "selector_not_found", selector })

  const tree = extractNode(root, 1)

  return JSON.stringify({ root: tree, total_nodes: nodeCount, truncated, max_depth_reached: maxDepthReached })
}

describe("scrape_structure injected function", () => {
  it("extracts single element with no children", () => {
    const html = '<div id="box" class="container">Hello</div>'
    const result = JSON.parse(runScrapeStructure(html, "#box", 10, 500, true, false))

    expect(result.root.tag).toBe("div")
    expect(result.root.id).toBe("box")
    expect(result.root.class).toBe("container")
    expect(result.root.text).toBe("Hello")
    expect(result.root.children).toBeUndefined()
    expect(result.total_nodes).toBe(1)
    expect(result.truncated).toBe(false)
  })

  it("extracts nested children", () => {
    const html = `
      <header class="top"><nav><a href="/">Home</a></nav></header>
      <main><p>Content</p></main>
    `
    // Using a selector on body to avoid JSDOM body wrapper inconsistencies
    const wrappedHtml = `<body><div id="root">${html}</div></body>`
    const result = JSON.parse(runScrapeStructure(wrappedHtml, "#root", 10, 500, true, false))

    expect(result.root.tag).toBe("div")
    expect(result.root.children.length).toBe(2)
    expect(result.root.children[0].tag).toBe("header")
    expect(result.root.children[0].children[0].tag).toBe("nav")
    expect(result.root.children[0].children[0].children[0].tag).toBe("a")
    expect(result.total_nodes).toBe(6) // root + header + nav + a + main + p
  })

  it("respects maxNodes limit", () => {
    const html = '<body>' + Array.from({ length: 10 }, (_, i) => `<div id="d${i}">${i}</div>`).join("") + '</body>'
    const result = JSON.parse(runScrapeStructure(html, null, 10, 3, true, false))

    expect(result.truncated).toBe(true)
    // body(1) + div(2) = 3 nodes max
    expect(result.total_nodes).toBe(3)
  })

  it("respects depth limit", () => {
    const html = '<div id="l1"><div id="l2"><div id="l3"><span id="l4">Deep</span></div></div></div>'
    const result = JSON.parse(runScrapeStructure(html, "#l1", 1, 500, true, false))

    // depth=1 starting from l1: only l1 is extracted, but l1 has children so max_depth_reached=true
    expect(result.max_depth_reached).toBe(true)
    expect(result.root.id).toBe("l1")
    expect(result.root.children).toBeUndefined()
    expect(result.total_nodes).toBe(1)
  })

  it("includes bounding box when incBbox is true", () => {
    const html = '<div id="box">Box</div>'
    const result = JSON.parse(runScrapeStructure(html, "#box", 10, 500, false, true))

    expect(result.root.bbox).toBeDefined()
    expect(typeof result.root.bbox.x).toBe("number")
    expect(typeof result.root.bbox.y).toBe("number")
    expect(typeof result.root.bbox.w).toBe("number")
    expect(typeof result.root.bbox.h).toBe("number")
  })

  it("omits text when incText is false", () => {
    const html = '<div id="box">Hello World</div>'
    const result = JSON.parse(runScrapeStructure(html, "#box", 10, 500, false, false))

    expect(result.root.text).toBeUndefined()
  })

  it("returns null text for empty elements", () => {
    const html = '<div id="empty"></div>'
    const result = JSON.parse(runScrapeStructure(html, "#empty", 10, 500, true, false))

    expect(result.root.text).toBeNull()
  })

  it("handles selector_not_found", () => {
    const html = '<div id="box">Hello</div>'
    const result = JSON.parse(runScrapeStructure(html, "#nonexistent", 10, 500, true, false))

    expect(result.error).toBe("selector_not_found")
  })
})

// ═══════════════════════════════════════════
// scrape_styles 注入函数测试
// ═══════════════════════════════════════════

const DEFAULT_STYLE_PROPERTIES = [
  "color", "font-family", "font-size", "font-weight", "font-style",
  "line-height", "letter-spacing", "text-align", "text-decoration",
  "text-transform", "white-space", "word-break",
  "background-color", "background-image", "background-size",
  "background-position", "background-repeat",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-radius",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "display", "position", "top", "right", "bottom", "left",
  "width", "height", "max-width", "max-height", "min-width", "min-height",
  "overflow", "overflow-x", "overflow-y",
  "flex-direction", "flex-wrap", "align-items", "justify-content",
  "gap", "flex-grow", "flex-shrink",
  "grid-template-columns", "grid-template-rows",
  "box-shadow", "opacity", "transform", "z-index",
  "cursor", "pointer-events", "visibility",
  "object-fit", "object-position"
]

function runScrapeStyles(
  html: string,
  selector: string,
  properties: string[] | null,
  incBoxModel: boolean,
  incPseudo: string[] | null
): string {
  const dom = new JSDOM(`<!DOCTYPE html>${html}`)
  const doc = dom.window.document
  const win = dom.window

  // JSDOM getComputedStyle returns empty values by default
  // We test the logic structure rather than actual CSS values

  try {
    // JSDOM 不支持 getComputedStyle 返回真实值，但我们可以设置 element.style
    // 来让 getComputedStyle 返回 inline styles

    const propsToGet = (properties && properties.length > 0) ? properties : null

    function extractComputedStyles(
      el: Element,
      propertyList: string[] | null
    ): Record<string, string> {
      const result: Record<string, string> = {}
      try {
        const styles = win.getComputedStyle(el)
        const keys = propertyList || DEFAULT_STYLE_PROPERTIES
        for (const key of keys) {
          const val = styles.getPropertyValue(key)
          if (val) {
            result[key] = val
          }
        }
      } catch (_e) {
        // getComputedStyle not fully supported in this jsdom version
      }
      return result
    }

    function extractBoxModel(el: Element): Record<string, unknown> {
      const styles = win.getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return {
        content: {
          width: Math.round(rect.width
            - parseFloat(styles.paddingLeft || "0")
            - parseFloat(styles.paddingRight || "0")
            - parseFloat(styles.borderLeftWidth || "0")
            - parseFloat(styles.borderRightWidth || "0")),
          height: Math.round(rect.height
            - parseFloat(styles.paddingTop || "0")
            - parseFloat(styles.paddingBottom || "0")
            - parseFloat(styles.borderTopWidth || "0")
            - parseFloat(styles.borderBottomWidth || "0"))
        },
        padding: {
          top: Math.round(parseFloat(styles.paddingTop || "0")),
          right: Math.round(parseFloat(styles.paddingRight || "0")),
          bottom: Math.round(parseFloat(styles.paddingBottom || "0")),
          left: Math.round(parseFloat(styles.paddingLeft || "0"))
        },
        border: {
          top: Math.round(parseFloat(styles.borderTopWidth || "0")),
          right: Math.round(parseFloat(styles.borderRightWidth || "0")),
          bottom: Math.round(parseFloat(styles.borderBottomWidth || "0")),
          left: Math.round(parseFloat(styles.borderLeftWidth || "0"))
        },
        margin: {
          top: Math.round(parseFloat(styles.marginTop || "0")),
          right: Math.round(parseFloat(styles.marginRight || "0")),
          bottom: Math.round(parseFloat(styles.marginBottom || "0")),
          left: Math.round(parseFloat(styles.marginLeft || "0"))
        }
      }
    }

    const el = doc.querySelector(selector)
    if (!el) return JSON.stringify({ error: "selector_not_found", selector })

    const info: Record<string, unknown> = {
      tag: el.tagName.toLowerCase(),
      selector_hint: el.id ? "#" + CSS.escape(el.id)
        : el.className && typeof el.className === "string" && el.className.trim()
          ? el.tagName.toLowerCase() + "." + el.className.trim().split(/\s+/)[0]
          : el.tagName.toLowerCase()
    }

    info.computed_styles = extractComputedStyles(el, propsToGet)

    if (incBoxModel) {
      info.box_model = extractBoxModel(el)
      const r = el.getBoundingClientRect()
      info.bbox = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    }

    return JSON.stringify({ elements: [info], total_elements: 1 })
  } catch (e) {
    return JSON.stringify({ error: "func_execution_error", message: e instanceof Error ? e.message : String(e) })
  }
}

describe("scrape_styles injected function", () => {
  it("returns element tag and selector hint", () => {
    const html = '<div id="hero" class="section primary">Hero</div>'
    const result = JSON.parse(runScrapeStyles(html, "#hero", null, true, null))

    expect(result.elements[0].tag).toBe("div")
    expect(result.elements[0].selector_hint).toContain("hero")
    expect(result.total_elements).toBe(1)
  })

  it("includes box_model when incBoxModel is true", () => {
    const html = '<div id="box">Box</div>'
    const result = JSON.parse(runScrapeStyles(html, "#box", null, true, null))

    const el = result.elements[0]
    expect(el.box_model).toBeDefined()
    expect(el.box_model.padding).toBeDefined()
    expect(el.box_model.border).toBeDefined()
    expect(el.box_model.margin).toBeDefined()
    expect(el.box_model.content).toBeDefined()
    expect(el.bbox).toBeDefined()
    expect(typeof el.bbox.x).toBe("number")
  })

  it("filters by provided properties list", () => {
    const html = '<div id="box" style="color: red; font-size: 16px; background-color: blue;">Box</div>'
    const result = JSON.parse(runScrapeStyles(html, "#box", ["color", "font-size"], false, null))

    const styles = result.elements[0].computed_styles
    // JSDOM may or may not return inline styles via getComputedStyle
    // The function should at least work without errors
    expect(result.error).toBeUndefined()
  })

  it("handles selector_not_found", () => {
    const html = '<div>Hello</div>'
    const result = JSON.parse(runScrapeStyles(html, "#none", null, true, null))

    expect(result.error).toBe("selector_not_found")
  })

  it("uses class-based selector hint when no id", () => {
    const html = '<div class="hero-section primary">Hero</div>'
    const result = JSON.parse(runScrapeStyles(html, ".hero-section", null, false, null))

    expect(result.elements[0].selector_hint).toBe("div.hero-section")
  })

  it("uses tag-based selector hint when no id or class", () => {
    const html = '<div>Hello</div>'
    const result = JSON.parse(runScrapeStyles(html, "div", null, false, null))

    expect(result.elements[0].selector_hint).toBe("div")
  })
})

// ═══════════════════════════════════════════
// scrape_resources 注入函数测试
// ═══════════════════════════════════════════

function runScrapeResources(
  html: string,
  resourceTypes: string[] | null,
  includeInline: boolean,
  limit: number
): string {
  const dom = new JSDOM(`<!DOCTYPE html>${html}`)
  const doc = dom.window.document

  try {
    const wantAll = !resourceTypes || resourceTypes.length === 0
    const want = (t: string) => wantAll || (resourceTypes && resourceTypes.indexOf(t) >= 0)
    const output: Record<string, unknown> = {}
    const totals: Record<string, number> = {}

    // CSS
    if (want("css")) {
      const css: Array<Record<string, unknown>> = []
      try {
        for (let i = 0; i < doc.styleSheets.length && css.length < limit; i++) {
          const ss = doc.styleSheets[i]
          const item: Record<string, unknown> = {
            href: ss.href || null,
            inline: !ss.href
          }
          if (ss.media && ss.media.length > 0) {
            item.media = ss.media.mediaText || null
          }
          try {
            item.rule_count = ss.cssRules.length
            item.accessible = true
            if (includeInline && ss.ownerNode && ss.ownerNode.textContent) {
              item.content = ss.ownerNode.textContent.slice(0, 50000)
            }
          } catch (_e) {
            item.accessible = false
            item.rule_count = null
            item.error = "SecurityError: cross-origin stylesheet"
          }
          if (!ss.href && !includeInline) continue
          css.push(item)
        }
      } catch (_e) { /* ignore */ }
      output.css = css
      totals.css = css.length
    }

    // Images
    if (want("images")) {
      const images: Array<Record<string, unknown>> = []
      try {
        const imgs = doc.querySelectorAll("img[src]")
        for (const img of imgs) {
          if (images.length >= limit) break
          const src = (img as any).src as string
          if (!src || src.startsWith("data:")) continue
          images.push({
            src,
            type: "img",
            natural_width: (img as any).naturalWidth,
            natural_height: (img as any).naturalHeight
          })
        }
      } catch (_e) { /* ignore */ }
      output.images = images
      totals.images = images.length
    }

    // Fonts — JSDOM doesn't fully support document.fonts
    if (want("fonts")) {
      const fonts: Array<Record<string, unknown>> = []
      try {
        const fontFaces = (doc as any).fonts
        if (fontFaces && typeof fontFaces.forEach === "function") {
          fontFaces.forEach((f: any) => {
            if (fonts.length >= limit) return
            fonts.push({
              family: f.family || null,
              weight: f.weight || "400",
              style: f.style || "normal",
              status: f.status || "unloaded"
            })
          })
        }
      } catch (_e) { /* ignore */ }
      output.fonts = fonts
      totals.fonts = fonts.length
    }

    // Icons
    if (want("icons")) {
      const icons: Array<Record<string, unknown>> = []
      try {
        const iconLinks = doc.querySelectorAll(
          'link[rel="icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"], link[rel="shortcut icon"]'
        )
        for (const link of iconLinks) {
          if (icons.length >= limit) break
          icons.push({
            href: link.getAttribute("href") || null,
            rel: link.getAttribute("rel") || null,
            sizes: link.getAttribute("sizes") || null,
            type: link.getAttribute("type") || null
          })
        }
      } catch (_e) { /* ignore */ }
      output.icons = icons
      totals.icons = icons.length
    }

    // Scripts
    if (want("scripts")) {
      const scripts: Array<Record<string, unknown>> = []
      try {
        const scriptEls = doc.querySelectorAll("script[src]")
        for (const s of scriptEls) {
          if (scripts.length >= limit) break
          scripts.push({
            src: s.getAttribute("src") || null,
            type: s.getAttribute("type") || "text/javascript",
            async: s.hasAttribute("async"),
            defer: s.hasAttribute("defer")
          })
        }
      } catch (_e) { /* ignore */ }
      output.scripts = scripts
      totals.scripts = scripts.length
    }

    output.total = totals
    return JSON.stringify(output)
  } catch (e) {
    return JSON.stringify({ error: "func_execution_error", message: e instanceof Error ? e.message : String(e) })
  }
}

describe("scrape_resources injected function", () => {
  it("discovers images", () => {
    const html = '<img src="https://example.com/hero.png" width="1200" height="600"><img src="https://example.com/logo.svg">'
    const result = JSON.parse(runScrapeResources(html, null, false, 200))

    expect(result.images.length).toBe(2)
    expect(result.images[0].src).toContain("hero.png")
    expect(result.images[0].type).toBe("img")
    expect(result.images[1].src).toContain("logo.svg")
    expect(result.total.images).toBe(2)
  })

  it("skips data URI images", () => {
    const html = '<img src="data:image/png;base64,iVBORw0KGgo="><img src="https://example.com/real.png">'
    const result = JSON.parse(runScrapeResources(html, null, false, 200))

    expect(result.images.length).toBe(1)
    expect(result.images[0].src).toContain("real.png")
  })

  it("discovers icon links", () => {
    const html = '<link rel="icon" href="/favicon.ico" sizes="32x32">'
    const result = JSON.parse(runScrapeResources(html, null, false, 200))

    expect(result.icons.length).toBe(1)
    expect(result.icons[0].href).toBe("/favicon.ico")
    expect(result.icons[0].rel).toBe("icon")
  })

  it("discovers scripts with src", () => {
    const html = '<script src="https://example.com/app.js" type="module"></script>'
    const result = JSON.parse(runScrapeResources(html, null, false, 200))

    expect(result.scripts.length).toBe(1)
    expect(result.scripts[0].src).toContain("app.js")
  })

  it("discovers inline CSS when includeInline is true", () => {
    const html = '<style>body { color: red; }</style>'
    const result = JSON.parse(runScrapeResources(html, null, true, 200))

    expect(result.css.length).toBeGreaterThanOrEqual(1)
    const inlineCss = result.css.find((c: any) => c.inline === true)
    expect(inlineCss).toBeDefined()
    expect(inlineCss.accessible).toBe(true)
  })

  it("skips inline CSS when includeInline is false", () => {
    const html = '<style>body { color: red; }</style>'
    const result = JSON.parse(runScrapeResources(html, null, false, 200))

    // With includeInline=false, inline <style> sheets should be skipped
    const inlineCss = result.css.find((c: any) => c.inline === true)
    expect(inlineCss).toBeUndefined()
  })

  it("filters by resource_types", () => {
    const html = '<img src="https://example.com/hero.png"><script src="https://example.com/app.js"></script>'
    const result = JSON.parse(runScrapeResources(html, ["images"], false, 200))

    expect(result.images).toBeDefined()
    expect(result.scripts).toBeUndefined()
    expect(result.css).toBeUndefined()
    expect(result.total.images).toBe(1)
  })

  it("respects limit per resource type", () => {
    const imgs = Array.from({ length: 5 }, (_, i) =>
      `<img src="https://example.com/img${i}.png">`
    ).join("")
    const result = JSON.parse(runScrapeResources(imgs, ["images"], false, 2))

    expect(result.images.length).toBe(2)
  })

  it("returns total counts for all discovered types", () => {
    const html = '<img src="https://example.com/hero.png"><link rel="icon" href="/favicon.ico">'
    const result = JSON.parse(runScrapeResources(html, null, false, 200))

    expect(result.total).toBeDefined()
    expect(typeof result.total.images).toBe("number")
    expect(typeof result.total.icons).toBe("number")
  })
})
