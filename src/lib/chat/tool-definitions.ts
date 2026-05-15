import type { OpenAiToolDefinition } from "./openai-messages"
import { isObsidianConfigured, getObsidianSettings } from "../settings"

const BASE_TOOLS: OpenAiToolDefinition[] = [

  // ── 记忆系统工具 ──
  {
    type: "function",
    function: {
      name: "memory_get",
      description:
        "读取指定日期的日记忆全文。返回该日期的 summary、keywords、manualNotes、status 等。",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "日期，格式 YYYY-MM-DD，不传则返回今天的记忆"
          }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "memory_search",
      description:
        "在历史记忆和对话洞察中搜索。支持 BM25 关键词搜索，返回相关性排序的 top-K 结果。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索查询词"
          },
          limit: {
            type: "number",
            description: "返回结果数量上限，默认 5"
          }
        },
        required: ["query"],
        additionalProperties: false
      }
    }
  },

  // ── 文件系统工具 ──
  {
    type: "function",
    function: {
      name: "ls",
      description:
        "列出工作区目录中的文件和子目录。工作区位于扩展内部存储中，无需用户手动选择。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "相对于工作区根目录的路径，默认 ''（根目录）"
          }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "读取工作区中的文件内容。支持通过 offset/limit 分页读取大文件。",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "文件路径，相对于工作区根目录，必须以 / 开头"
          },
          offset: {
            type: "integer",
            description: "起始行号（0-indexed）。例如 offset=0 从第 1 行开始，offset=100 从第 101 行开始。默认 0。"
          },
          limit: {
            type: "integer",
            description: "最多读取的行数。默认 100。设为 0 或省略则读取全部（慎用，避免上下文溢出）。"
          }
        },
        required: ["file_path"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "在工作区中创建或覆写文件。",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "相对于工作区根目录的文件路径，必须以 / 开头"
          },
          content: {
            type: "string",
            description: "要写入的文件内容"
          }
        },
        required: ["file_path", "content"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "对工作区中的文件执行精确的字符串替换。当需要编辑现有文件时使用此工具，而非重写整个文件。",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "要编辑的文件路径，相对于工作区根目录，必须以 / 开头"
          },
          old_string: {
            type: "string",
            description: "要被替换的原始文本片段。必须与文件中的内容完全匹配（包括空格、缩进、换行），且在文件中唯一出现。"
          },
          new_string: {
            type: "string",
            description: "替换后的新文本。如果为空字符串，则删除 old_string。"
          }
        },
        required: ["file_path", "old_string", "new_string"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "glob",
      description:
        "根据 glob 模式查找匹配的文件。支持 *, **, ? 等通配符。返回匹配的文件路径列表。",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "glob 模式，如 '*.ts'、'src/**/*.ts'、'test/*.test.ts'"
          },
          path: {
            type: "string",
            description: "搜索的根目录路径，默认 ''（工作区根目录）"
          }
        },
        required: ["pattern"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "grep",
      description:
        "在工作区文件中搜索匹配的文本或正则表达式。支持三种输出模式。",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "要搜索的文本（字面量匹配）或正则表达式"
          },
          path: {
            type: "string",
            description: "搜索的目录路径，默认 ''（整个工作区）"
          },
          glob: {
            type: "string",
            description: "按文件名 glob 模式过滤，如 '*.ts' 只搜索 TypeScript 文件"
          },
          output_mode: {
            type: "string",
            description: "输出模式：content（显示匹配行）、files_with_matches（只显示文件路径）、count（显示每个文件的匹配数）。默认 content。",
            enum: ["content", "files_with_matches", "count"]
          }
        },
        required: ["pattern"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "rm",
      description: "删除工作区中的文件。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "相对于工作区根目录的文件路径"
          }
        },
        required: ["path"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "export",
      description:
        "将工作区文件导出到用户本地下载目录。传入文件路径导出单个文件，不传路径则导出整个工作区。会弹出浏览器下载对话框。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "相对于工作区根目录的文件或目录路径，不传则导出整个工作区"
          }
        },
        additionalProperties: false
      }
    }
  },

  // ── 浏览器系统工具 ──
  {
    type: "function",
    function: {
      name: "current_page",
      description: "获取用户当前浏览器标签页的信息（URL、标题）。",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "tabs",
      description: "列出用户当前打开的所有浏览器标签页。",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_active_tab_id",
      description:
        "获取当前活跃标签页的 id。在任务的首次浏览器操作前调用此工具，获取当前页面的 tab_id，之后所有浏览器交互工具（get_page_content、take_selection、inspect_element、fill_form、click_element、screenshot）都通过 tab_id 参数指定目标标签页，确保操作不受用户切换标签页的影响。",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  },
  // ── Obsidian 集成工具（需在设置中配置 API Key 后激活）───
// ── 浏览器交互工具 ──
  {
    type: "function",
    function: {
      name: "get_page_content",
      description:
        "提取当前浏览器页面的文本内容。支持多种模式：text（提取正文文本）、full_html（完整HTML）、structured（按选择器提取结构化数据）。默认以 text 模式提取 <main>/<article>/<body> 的内容。可通过 selector 参数精确提取某个元素内的文本，超长内容会自动写入内部存储。",
      parameters: {
        type: "object",
        properties: {
          tab_id: {
            type: "number",
            description: "目标标签页的 ID。首次操作时先调用 get_active_tab_id 获取，后续所有浏览器操作都传入此值以锁定工作页面，避免用户切换标签页导致操作错误页面。不传则使用当前活跃标签页。"
          },
          mode: {
            type: "string",
            description: "提取模式：text（正文文本，默认）、full_html（完整HTML源码）、structured（按选择器提取结构化列表）",
            enum: ["text", "full_html", "structured"]
          },
          selector: {
            type: "string",
            description: "CSS 选择器。在 text/structured 模式下，只提取该选择器匹配元素的内容。不传则提取整个页面正文。"
          },
          max_chars: {
            type: "number",
            description: "最大返回字符数，默认无限制。完整内容直接返回，超长内容（>80000 字符）会自动写入内部存储并在结果末尾注明文件路径。"
          }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "take_selection",
      description:
        "获取用户在当前页面中选中的文本。返回选中的文本内容、长度，以及选中文本前后的上下文（各约50字符）。如果用户没有选中任何文本，返回 selected: false。",
      parameters: {
        type: "object",
        properties: {
          tab_id: {
            type: "number",
            description: "目标标签页的 ID。首次操作时先调用 get_active_tab_id 获取，后续所有浏览器操作都传入此值以锁定工作页面，避免用户切换标签页导致操作错误页面。不传则使用当前活跃标签页。"
          }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "inspect_element",
      description:
        "探查页面 DOM 元素的结构和属性。传入 CSS 选择器可精确探查某个元素；不传则智能探测页面中最可能的交互区域（表单、对话框、导航等）。返回：标签名、属性（id/class/href/src/name/type/placeholder/label/value）、交互性（是否可见/可点击/可聚焦/可编辑）、候选 CSS 选择器（可用于 fill_form/click_element）、递归子元素树（depth 控制深度）。在点击按钮、填充表单、提取数据之前，优先使用此工具了解 DOM 结构。",
      parameters: {
        type: "object",
        properties: {
          tab_id: {
            type: "number",
            description: "目标标签页的 ID。首次操作时先调用 get_active_tab_id 获取，后续所有浏览器操作都传入此值以锁定工作页面，避免用户切换标签页导致操作错误页面。不传则使用当前活跃标签页。"
          },
          selector: {
            type: "string",
            description: "CSS 选择器，用于定位要探查的元素。不传则自动探测页面中最可能的交互区域。"
          },
          depth: {
            type: "number",
            description: "递归探查子元素的深度，默认 2。设为 0 则只返回目标元素本身。"
          },
          include_children: {
            type: "boolean",
            description: "是否包含子元素信息，默认 true。设为 false 则只返回目标元素属性。"
          }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fill_form",
      description:
        "在当前浏览器页面中自动填充表单字段并可选提交。传入字段列表 [{selector, value}, ...]，每个 selector 为 CSS 选择器，value 为要填充的值。会触发 input/change/focus/blur 事件以确保 React/Vue 等框架感知变化。设置 submit=true 可在填完后自动提交表单（优先找 form 内的 submit 按钮点击，兜底触发 form submit 事件或回车键）。返回每个字段的填充结果及提交状态。",
      parameters: {
        type: "object",
        properties: {
          tab_id: {
            type: "number",
            description: "目标标签页的 ID。首次操作时先调用 get_active_tab_id 获取，后续所有浏览器操作都传入此值以锁定工作页面，避免用户切换标签页导致操作错误页面。不传则使用当前活跃标签页。"
          },
          fields: {
            type: "array",
            description: "要填充的字段列表",
            items: {
              type: "object",
              properties: {
                selector: {
                  type: "string",
                  description: "CSS 选择器，用于定位表单元素"
                },
                value: {
                  type: "string",
                  description: "要填充的值"
                }
              },
              required: ["selector", "value"],
              additionalProperties: false
            }
          },
          submit: {
            type: "boolean",
            description: "是否在填充完成后自动提交表单，默认 false。设为 true 时，会在最后一个字段所在的 form 中查找 submit 按钮并点击，兼容 React/Vue 等框架。"
          }
        },
        required: ["fields"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "click_element",
      description:
        "在当前浏览器页面中模拟点击指定元素。会先尝试滚动到该元素可见区域。如果元素被禁用（disabled），返回失败。返回被点击元素的标签名和文本摘要。",
      parameters: {
        type: "object",
        properties: {
          tab_id: {
            type: "number",
            description: "目标标签页的 ID。首次操作时先调用 get_active_tab_id 获取，后续所有浏览器操作都传入此值以锁定工作页面，避免用户切换标签页导致操作错误页面。不传则使用当前活跃标签页。"
          },
          selector: {
            type: "string",
            description: "CSS 选择器，用于定位要点击的元素"
          }
        },
        required: ["selector"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "screenshot",
      description:
        "对当前浏览器页面可见区域截图。返回截图信息（data URL 前缀、格式、大小）。若模型支持 vision 能力，可通过返回的 data URL 查看截图内容。支持 jpeg（默认）和 png 格式。",
      parameters: {
        type: "object",
        properties: {
          tab_id: {
            type: "number",
            description: "目标标签页的 ID。首次操作时先调用 get_active_tab_id 获取，后续所有浏览器操作都传入此值以锁定工作页面，避免用户切换标签页导致操作错误页面。不传则使用当前活跃标签页。"
          },
          format: {
            type: "string",
            description: "截图格式，jpeg 或 png。默认 jpeg。",
            enum: ["jpeg", "png"]
          },
          quality: {
            type: "number",
            description: "JPEG 质量，0-100，默认 80。PNG 格式忽略此参数。"
          }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "navigate",
      description:
        "打开指定 URL。不传 tab_id 时创建新的后台标签页；传入 tab_id 时在当前标签页上导航（复用已有标签页，避免打开过多标签页）。首次调用不传 tab_id 打开新页面，后续跳转传入首次返回的 tab_id 实现标签页复用。支持自动补全 https:// 协议头。",
      parameters: {
        type: "object",
        properties: {
          tab_id: {
            type: "number",
            description: "可选。要复用的标签页 ID。传入时在已有标签页上导航而非新开。不传则创建新标签页。"
          },
          url: {
            type: "string",
            description: "要访问的 URL。支持完整 URL（https://github.com）或省略协议的域名（github.com），自动补全 https://。"
          }
        },
        required: ["url"],
        additionalProperties: false
      }
    }
  }
];

const OBSIDIAN_TOOLS: OpenAiToolDefinition[] = [
{
    type: "function",
    function: {
      name: "obsidian_list",
      description:
        "列出 Obsidian vault 中的文件和子目录。不传 path 则列出根目录。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "目录路径，相对于 vault 根目录。不传则列出根目录。"
          }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "obsidian_read",
      description:
        "读取 Obsidian vault 中笔记的完整内容。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "笔记文件路径，相对于 vault 根目录，如 工作/项目笔记.md"
          }
        },
        required: ["path"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "obsidian_write",
      description:
        "创建新笔记或覆写已有笔记。如果文件已存在，会覆盖全部内容。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "笔记文件路径，如 收集/AI工具推荐.md"
          },
          content: {
            type: "string",
            description: "Markdown 格式的笔记内容"
          }
        },
        required: ["path", "content"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "obsidian_append",
      description:
        "向笔记末尾追加内容。适合在已有笔记中补充新信息。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "笔记文件路径"
          },
          content: {
            type: "string",
            description: "要追加的 Markdown 内容"
          }
        },
        required: ["path", "content"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "obsidian_patch",
      description:
        "精确定位修改笔记的特定部分。支持三种目标类型：heading（在某标题下操作）、frontmatter（修改元数据字段）、block（修改块引用）。支持三种操作：append（追加）、prepend（前置插入）、replace（替换）。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "笔记文件路径"
          },
          target_type: {
            type: "string",
            description: "目标类型：heading、frontmatter 或 block",
            enum: ["heading", "frontmatter", "block"]
          },
          target: {
            type: "string",
            description: "目标名称，如 heading 名、frontmatter 字段名、block 引用 ID"
          },
          operation: {
            type: "string",
            description: "操作类型：append、prepend 或 replace",
            enum: ["append", "prepend", "replace"]
          },
          content: {
            type: "string",
            description: "要写入的内容"
          }
        },
        required: ["path", "target_type", "target", "operation", "content"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "obsidian_search",
      description:
        "在 Obsidian vault 中全文搜索笔记。返回匹配的文件名和评分上下文片段。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词"
          }
        },
        required: ["query"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "obsidian_open",
      description:
        "在 Obsidian 桌面端 UI 中打开指定笔记，方便用户查看。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "笔记文件路径"
          }
        },
        required: ["path"],
        additionalProperties: false
      }
    }
  },
];

export async function getLuminoAgentTools(): Promise<OpenAiToolDefinition[]> {
  const settings = await getObsidianSettings()
  if (isObsidianConfigured(settings)) {
    return [...BASE_TOOLS, ...OBSIDIAN_TOOLS]
  }
  return BASE_TOOLS
}
