import type { OpenAiToolDefinition } from "./openai-messages"

export const LUMINO_AGENT_TOOLS: OpenAiToolDefinition[] = [
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
      name: "read",
      description: "读取工作区中的文件内容。",
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
      name: "write",
      description: "在工作区中创建或覆写文件。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "相对于工作区根目录的文件路径"
          },
          content: {
            type: "string",
            description: "要写入的文件内容"
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
      name: "grep",
      description: "在工作区文件中搜索匹配文本。",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "要搜索的文本或正则表达式"
          },
          path: {
            type: "string",
            description: "搜索的目录路径，默认 ''（整个工作区）"
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
