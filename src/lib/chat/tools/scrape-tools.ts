/**
 * 页面爬取工具 — scrape_tools
 *
 * 用于复刻/重建网页的原始样式和资源：
 * - scrape_structure: 运行时 DOM 树 + bounding box
 * - scrape_styles:    计算后的 CSS 样式 + 盒模型
 * - scrape_resources: 外部资源 URL 发现
 * - fetch_resource:   Service Worker 侧拉取任意 URL 内容（无 CORS 限制）
 *
 * 所有工具的结果直接写入 OPFS，返回文件路径供 agent 用 read_file 读取。
 */

import { writeWorkspaceFile, writeWorkspaceFileBytes } from "../../fs/workspace"
import { getAgentWindowId } from "./agent-window"
import {
  DOWNLOADS_DIR,
  EVICT_DIR,
  executeScriptWithRetry,
  resolveTabId
} from "./browser-utils"

// ═══════════════════════════════════════════
// 公共：将结果保存到 OPFS
// ═══════════════════════════════════════════

async function saveToOpfs(
  data: string,
  toolName: string,
  tabId: number,
  ext = "json"
): Promise<string> {
  const timestamp = Date.now()
  const path = `${EVICT_DIR}/${toolName}_${timestamp}_tab${tabId}.${ext}`
  await writeWorkspaceFile(path, data)
  return path
}

// ═══════════════════════════════════════════
// scrape_structure — 运行时 DOM 树 + 盒模型
// ═══════════════════════════════════════════

export async function handleScrapeStructure(
  args: Record<string, unknown>
): Promise<string> {
  const selector = args.selector as string | undefined | null
  const depth = (args.depth as number) ?? 10
  const maxNodes = (args.max_nodes as number) ?? 500
  const format = (args.format as string) || "json"
  const includeText = args.include_text !== false
  const includeBbox = args.include_bbox !== false

  let tabId: number
  try {
    tabId = await resolveTabId(args)
  } catch {
    return JSON.stringify({ error: "no_tab_id" })
  }

  try {
    const result = await executeScriptWithRetry(
      tabId,
      (
        sel: string | null | undefined,
        fmt: string,
        maxDepth: number,
        maxNodes: number,
        incText: boolean,
        incBbox: boolean
      ) => {
        try {
          // html 模式：直接返回运行时 DOM 的 outerHTML 字符串
          if (fmt === "html") {
            const root = sel
              ? document.querySelector(sel)
              : document.documentElement
            if (!root) {
              return JSON.stringify({
                error: "selector_not_found",
                selector: sel
              })
            }
            return (root as Element).outerHTML
          }

          // json 模式（默认）：递归构建结构化树
          let nodeCount = 0
          let truncated = false
          let maxDepthReached = false

          function extractNode(
            el: Element,
            currentDepth: number
          ): Record<string, unknown> | null {
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
              class:
                el.className && typeof el.className === "string"
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

            // 递归子元素
            const children: Array<Record<string, unknown>> = []
            if (currentDepth < maxDepth) {
              for (const child of el.children) {
                const childNode = extractNode(child, currentDepth + 1)
                if (childNode) {
                  children.push(childNode)
                }
                if (truncated) break
              }
            } else if (el.children.length > 0) {
              // 达到深度限制但还有子元素可展开
              maxDepthReached = true
            }
            if (children.length > 0) {
              node.children = children
            }

            return node
          }

          const root = sel ? document.querySelector(sel) : document.body

          if (!root) {
            return JSON.stringify({
              error: "selector_not_found",
              selector: sel
            })
          }

          const tree = extractNode(root, 1)

          return JSON.stringify({
            root: tree,
            total_nodes: nodeCount,
            truncated: truncated,
            max_depth_reached: maxDepthReached
          })
        } catch (e) {
          return JSON.stringify({
            error: "func_execution_error",
            message: e instanceof Error ? e.message : String(e)
          })
        }
      },
      [selector ?? null, format, depth, maxNodes, includeText, includeBbox],
      "scrape_structure"
    )

    // html 模式返回的是 raw HTML 字符串，用 .html 扩展名
    const ext = format === "html" ? "html" : "json"

    if (!result) {
      return JSON.stringify({
        error: "execute_script_failed",
        detail: "executeScript returned empty after retry"
      })
    }

    const path = await saveToOpfs(result, "scrape_structure", tabId, ext)
    return JSON.stringify({ saved_to: path })
  } catch (error) {
    return JSON.stringify({
      error: "scrape_structure_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

// ═══════════════════════════════════════════
// scrape_styles — 计算样式 + 盒模型
// ═══════════════════════════════════════════

/** 默认返回的关键 CSS 属性列表（约 40 个） */
const DEFAULT_STYLE_PROPERTIES = [
  // 字体/文字
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-decoration",
  "text-transform",
  "white-space",
  "word-break",
  // 背景
  "background-color",
  "background-image",
  "background-size",
  "background-position",
  "background-repeat",
  // 边框
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-radius",
  // 间距
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  // 布局
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "width",
  "height",
  "max-width",
  "max-height",
  "min-width",
  "min-height",
  "overflow",
  "overflow-x",
  "overflow-y",
  "flex-direction",
  "flex-wrap",
  "align-items",
  "justify-content",
  "gap",
  "flex-grow",
  "flex-shrink",
  "grid-template-columns",
  "grid-template-rows",
  // 视觉效果
  "box-shadow",
  "opacity",
  "transform",
  "z-index",
  "cursor",
  "pointer-events",
  "visibility",
  "object-fit",
  "object-position"
]

export async function handleScrapeStyles(
  args: Record<string, unknown>
): Promise<string> {
  const selector = args.selector as string
  if (!selector) {
    return JSON.stringify({
      error: "no_selector",
      message: "请提供 CSS 选择器"
    })
  }

  const properties = args.properties as string[] | undefined
  const includeBoxModel = args.include_box_model !== false
  const includePseudo = args.include_pseudo as string[] | undefined
  const recursion = (args.recursion as string) || "none"

  let tabId: number
  try {
    tabId = await resolveTabId(args)
  } catch {
    return JSON.stringify({ error: "no_tab_id" })
  }

  try {
    const result = await executeScriptWithRetry(
      tabId,
      (
        sel: string,
        props: string[] | null | undefined,
        incBoxModel: boolean,
        incPseudo: string[] | null | undefined,
        rec: string
      ) => {
        try {
          const propsToGet = props && props.length > 0 ? props : null

          function extractBoxModel(
            el: Element,
            styles: CSSStyleDeclaration
          ): Record<string, unknown> {
            const rect = el.getBoundingClientRect()
            return {
              content: {
                width: Math.round(
                  rect.width -
                    parseFloat(styles.paddingLeft || "0") -
                    parseFloat(styles.paddingRight || "0") -
                    parseFloat(styles.borderLeftWidth || "0") -
                    parseFloat(styles.borderRightWidth || "0")
                ),
                height: Math.round(
                  rect.height -
                    parseFloat(styles.paddingTop || "0") -
                    parseFloat(styles.paddingBottom || "0") -
                    parseFloat(styles.borderTopWidth || "0") -
                    parseFloat(styles.borderBottomWidth || "0")
                )
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

          function extractComputedStyles(
            styles: CSSStyleDeclaration,
            propertyList: string[] | null
          ): Record<string, string> {
            const result: Record<string, string> = {}
            const keys = propertyList || DEFAULT_STYLE_PROPERTIES
            for (const key of keys) {
              const val = styles.getPropertyValue(key)
              if (val) {
                result[key] = val
              }
            }
            return result
          }

          function processElement(el: Element): Record<string, unknown> {
            const styles = window.getComputedStyle(el)
            const info: Record<string, unknown> = {
              tag: el.tagName.toLowerCase(),
              selector_hint: el.id
                ? "#" + CSS.escape(el.id)
                : el.className &&
                    typeof el.className === "string" &&
                    el.className.trim()
                  ? el.tagName.toLowerCase() +
                    "." +
                    el.className.trim().split(/\s+/)[0]
                  : el.tagName.toLowerCase()
            }

            info.computed_styles = extractComputedStyles(styles, propsToGet)

            if (incBoxModel) {
              info.box_model = extractBoxModel(el, styles)
              info.bbox = (() => {
                const r = el.getBoundingClientRect()
                return {
                  x: Math.round(r.x),
                  y: Math.round(r.y),
                  w: Math.round(r.width),
                  h: Math.round(r.height)
                }
              })()
            }

            if (incPseudo && incPseudo.length > 0) {
              const pseudo: Record<string, unknown> = {}
              for (const pseudoEl of incPseudo) {
                const pseudoStyles = window.getComputedStyle(el, pseudoEl)
                pseudo[pseudoEl] = extractComputedStyles(
                  pseudoStyles,
                  propsToGet
                )
              }
              info.pseudo = pseudo
            }

            // 递归子元素
            if (rec === "children" || rec === "descendants") {
              const children: Array<Record<string, unknown>> = []
              for (const child of el.children) {
                const childInfo = processElement(child)
                children.push(childInfo)
                if (rec === "descendants") {
                  // 更深层递归由 processElement 内部处理
                }
              }
              if (children.length > 0) {
                info.children = children
              }
            }

            return info
          }

          const el = document.querySelector(sel)
          if (!el) {
            return JSON.stringify({
              error: "selector_not_found",
              selector: sel
            })
          }

          const info = processElement(el)
          return JSON.stringify({ elements: [info], total_elements: 1 })
        } catch (e) {
          return JSON.stringify({
            error: "func_execution_error",
            message: e instanceof Error ? e.message : String(e)
          })
        }
      },
      [
        selector,
        properties ?? null,
        includeBoxModel,
        includePseudo ?? null,
        recursion
      ],
      "scrape_styles"
    )

    if (!result) {
      return JSON.stringify({
        error: "execute_script_failed",
        detail: "executeScript returned empty after retry"
      })
    }

    const path = await saveToOpfs(result, "scrape_styles", tabId)
    return JSON.stringify({ saved_to: path })
  } catch (error) {
    return JSON.stringify({
      error: "scrape_styles_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

// ═══════════════════════════════════════════
// scrape_resources — 外部资源 URL 发现
// ═══════════════════════════════════════════

export async function handleScrapeResources(
  args: Record<string, unknown>
): Promise<string> {
  const resourceTypes = args.resource_types as string[] | undefined
  const includeInline = args.include_inline === true
  const limit = (args.limit as number) ?? 200

  let tabId: number
  try {
    tabId = await resolveTabId(args)
  } catch {
    return JSON.stringify({ error: "no_tab_id" })
  }

  try {
    const result = await executeScriptWithRetry(
      tabId,
      (types: string[] | null, incInline: boolean, lim: number) => {
        try {
          const wantAll = !types || types.length === 0
          const want = (t: string) =>
            wantAll || (types && types.indexOf(t) >= 0)
          const output: Record<string, unknown> = {}
          const totals: Record<string, number> = {}

          // ── CSS ──
          if (want("css")) {
            const css: Array<Record<string, unknown>> = []
            try {
              for (
                let i = 0;
                i < document.styleSheets.length && css.length < lim;
                i++
              ) {
                const ss = document.styleSheets[i]
                const item: Record<string, unknown> = {
                  href: ss.href || null,
                  inline: !ss.href
                }

                if (ss.media && ss.media.length > 0) {
                  item.media = ss.media.mediaText || null
                }

                if (ss.title) {
                  item.title = ss.title
                }

                try {
                  item.rule_count = ss.cssRules.length
                  item.accessible = true

                  // 同一域下的 CSS：可选内联内容
                  if (incInline && ss.ownerNode && ss.ownerNode.textContent) {
                    item.content = ss.ownerNode.textContent.slice(0, 50000)
                  }
                } catch (_e) {
                  item.accessible = false
                  item.rule_count = null
                  item.error = "SecurityError: cross-origin stylesheet"
                }

                if (!ss.href && !incInline) continue
                css.push(item)
              }
            } catch (_e) {
              /* ignore */
            }
            output.css = css
            totals.css = css.length
          }

          // ── Images ──
          if (want("images")) {
            const images: Array<Record<string, unknown>> = []
            try {
              // <img> 标签
              const imgs = document.querySelectorAll("img[src]")
              for (const img of imgs) {
                if (images.length >= lim) break
                const src = (img as HTMLImageElement).src
                if (!src || src.startsWith("data:")) continue
                images.push({
                  src,
                  type: "img",
                  natural_width: (img as HTMLImageElement).naturalWidth,
                  natural_height: (img as HTMLImageElement).naturalHeight
                })
              }

              // background-image
              if (images.length < lim && incInline) {
                const bgEls = document.querySelectorAll(
                  '[style*="background-image"]'
                )
                for (const el of bgEls) {
                  if (images.length >= lim) break
                  const bg = (el as HTMLElement).style.backgroundImage
                  const urlMatch = bg && bg.match(/url\(["']?([^"')]+)["']?\)/)
                  if (urlMatch && !urlMatch[1].startsWith("data:")) {
                    images.push({ src: urlMatch[1], type: "background_image" })
                  }
                }
              }

              // picture > source
              if (images.length < lim) {
                const sources = document.querySelectorAll(
                  "picture source[srcset]"
                )
                for (const src of sources) {
                  if (images.length >= lim) break
                  const srcset = src.getAttribute("srcset")
                  if (srcset) {
                    images.push({ srcset, type: "picture_source" })
                  }
                }
              }

              // video poster
              if (images.length < lim) {
                const videos = document.querySelectorAll("video[poster]")
                for (const v of videos) {
                  if (images.length >= lim) break
                  images.push({
                    src: v.getAttribute("poster")!,
                    type: "video_poster"
                  })
                }
              }
            } catch (_e) {
              /* ignore */
            }
            output.images = images
            totals.images = images.length
          }

          // ── Fonts ──
          if (want("fonts")) {
            const fonts: Array<Record<string, unknown>> = []
            try {
              const fontFaces = (document as any).fonts
              if (fontFaces && typeof fontFaces.forEach === "function") {
                fontFaces.forEach((f: any) => {
                  if (fonts.length >= lim) return
                  fonts.push({
                    family: f.family || null,
                    weight: f.weight || "400",
                    style: f.style || "normal",
                    status: f.status || "unloaded"
                  })
                })
              }
            } catch (_e) {
              /* ignore */
            }
            output.fonts = fonts
            totals.fonts = fonts.length
          }

          // ── Icons ──
          if (want("icons")) {
            const icons: Array<Record<string, unknown>> = []
            try {
              const iconLinks = document.querySelectorAll(
                'link[rel="icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"], link[rel="shortcut icon"]'
              )
              for (const link of iconLinks) {
                if (icons.length >= lim) break
                icons.push({
                  href: link.getAttribute("href") || null,
                  rel: link.getAttribute("rel") || null,
                  sizes: link.getAttribute("sizes") || null,
                  type: link.getAttribute("type") || null
                })
              }

              // msapplication 图标
              const msIcon = document.querySelector(
                'meta[name="msapplication-TileImage"]'
              )
              if (msIcon && icons.length < lim) {
                icons.push({
                  href: msIcon.getAttribute("content") || null,
                  rel: "msapplication-TileImage"
                })
              }
            } catch (_e) {
              /* ignore */
            }
            output.icons = icons
            totals.icons = icons.length
          }

          // ── Scripts ──
          if (want("scripts")) {
            const scripts: Array<Record<string, unknown>> = []
            try {
              const scriptEls = document.querySelectorAll("script[src]")
              for (const s of scriptEls) {
                if (scripts.length >= lim) break
                scripts.push({
                  src: s.getAttribute("src") || null,
                  type: s.getAttribute("type") || "text/javascript",
                  async: s.hasAttribute("async"),
                  defer: s.hasAttribute("defer")
                })
              }
            } catch (_e) {
              /* ignore */
            }
            output.scripts = scripts
            totals.scripts = scripts.length
          }

          output.total = totals
          return JSON.stringify(output)
        } catch (e) {
          return JSON.stringify({
            error: "func_execution_error",
            message: e instanceof Error ? e.message : String(e)
          })
        }
      },
      [resourceTypes ?? null, includeInline, limit],
      "scrape_resources"
    )

    if (!result) {
      return JSON.stringify({
        error: "execute_script_failed",
        detail: "executeScript returned empty after retry"
      })
    }

    const path = await saveToOpfs(result, "scrape_resources", tabId)
    return JSON.stringify({ saved_to: path })
  } catch (error) {
    return JSON.stringify({
      error: "scrape_resources_failed",
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

// ═══════════════════════════════════════════
// fetch_resource — SW 侧拉取任意 URL 内容
// ═══════════════════════════════════════════

export async function handleFetchResource(
  args: Record<string, unknown>
): Promise<string> {
  const url = args.url as string
  if (!url) {
    return JSON.stringify({ error: "no_url", message: "请提供资源 URL" })
  }

  let resolvedUrl: string

  try {
    // 相对路径 → 用 tab origin 拼接
    if (url.startsWith("/") || !url.includes("://")) {
      let origin = "http://localhost"
      try {
        if (typeof args.tab_id === "number" && args.tab_id > 0) {
          const tab = await chrome.tabs.get(args.tab_id)
          if (tab.url) {
            const parsed = new URL(tab.url)
            origin = parsed.origin
          }
        } else {
          const agentWid = await getAgentWindowId()
          const query =
            agentWid != null
              ? { active: true, windowId: agentWid }
              : { active: true, currentWindow: true }
          const [activeTab] = await chrome.tabs.query(query)
          if (activeTab?.url) {
            const parsed = new URL(activeTab.url)
            origin = parsed.origin
          }
        }
      } catch (_e) {
        /* use default origin */
      }
      resolvedUrl = new URL(url, origin).toString()
    } else {
      resolvedUrl = url
    }
  } catch {
    return JSON.stringify({ error: "invalid_url", url })
  }

  try {
    const response = await fetch(resolvedUrl)
    if (!response.ok) {
      return JSON.stringify({
        error: "fetch_failed",
        url: resolvedUrl,
        status: response.status,
        statusText: response.statusText
      })
    }

    const contentType = response.headers.get("content-type") || "unknown"

    // 生成文件名：优先从 URL 路径提取后缀，content-type 兜底
    const urlPath = (() => {
      try {
        return new URL(resolvedUrl).pathname
      } catch {
        return ""
      }
    })()
    const pathExt = urlPath.includes(".")
      ? urlPath.split(".").pop()?.toLowerCase()
      : undefined
    const ext = pathExt
      ? `.${pathExt}`
      : contentType.includes("css")
        ? ".css"
        : contentType.includes("javascript")
          ? ".js"
          : contentType.includes("svg")
            ? ".svg"
            : contentType.includes("html")
              ? ".html"
              : contentType.includes("json")
                ? ".json"
                : contentType.includes("font") || contentType.includes("woff")
                  ? ".woff2"
                  : ".txt"
    const urlFileName = pathExt ? urlPath.split("/").pop() : undefined
    const safeName =
      urlFileName && urlFileName.length <= 128
        ? urlFileName
        : `fetch_resource_${Date.now()}_${btoa(resolvedUrl).replace(/[/+=]/g, "_").slice(0, 32)}${ext}`
    const path = `${DOWNLOADS_DIR}/${safeName}`

    // 二进制资源（图片/字体/音视频等）按 bytes 写入，避免文本编码损坏
    const isBinary =
      /^(image\/|font\/|audio\/|video\/|application\/(pdf|zip|gzip|x-tar|wasm|octet-stream))/i.test(
        contentType
      ) ||
      /\.(png|jpe?g|gif|webp|ico|bmp|woff2?|ttf|otf|eot|mp3|wav|mp4|webm|ogg|pdf|zip|gz|tar|wasm)$/i.test(
        path
      )
    let size: number
    if (isBinary) {
      const buf = await response.arrayBuffer()
      await writeWorkspaceFileBytes(path, new Uint8Array(buf))
      size = buf.byteLength
    } else {
      const content = await response.text()
      await writeWorkspaceFile(path, content)
      size = content.length
    }

    return JSON.stringify({
      url: resolvedUrl,
      content_size: size,
      content_type: contentType,
      saved_to: path
    })
  } catch (error) {
    return JSON.stringify({
      error: "fetch_resource_failed",
      url: resolvedUrl,
      message: error instanceof Error ? error.message : String(error)
    })
  }
}
