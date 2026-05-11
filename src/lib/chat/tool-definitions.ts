import type { OpenAiToolDefinition } from "./openai-messages"

export const LUMINO_AGENT_TOOLS: OpenAiToolDefinition[] = [
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
  }
]
