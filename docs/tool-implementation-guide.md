# Lumino Agent 工具对齐与补齐实现指南

> 目标：将 Lumino 浏览器插件的 Agent 工具 schema 与 `FilesystemMiddleware`（deepagents）对齐，同时补齐缺失的 `edit_file`、`glob` 两个工具，并实现大工具结果驱逐（eviction）机制。

---

## 1. 项目上下文

| 事项 | 说明 |
|------|------|
| 项目类型 | Chrome 扩展（Plasmo 框架 + React） |
| 文件存储 | OPFS（Origin Private File System），通过 `navigator.storage.getDirectory()` |
| 工具注册 | `registerTool(name, handler)` → `Map<string, ToolHandler>` |
| 工具定义 | `LUMINO_AGENT_TOOLS: OpenAiToolDefinition[]` |
| LLM 协议 | OpenAI Chat Completions 兼容格式 |

**涉及文件清单：**

```
src/lib/
├── chat/
│   ├── tool-definitions.ts    ← OpenAiToolDefinition[] 工具 schema
│   ├── tool-registry.ts       ← registerAllTools() 注册入口
│   ├── tool-executor.ts       ← executeToolCall() 调度（需改造）
│   ├── agent-loop.ts          ← Agent 主循环（需改造）
│   └── tools/
│       ├── fs-tools.ts        ← ls/read/write/grep/rm/export 实现
│       ├── system-tools.ts    ← current_page/tabs 实现
│       └── memory-tools.ts    ← memory_get/memory_search 实现
├── fs/
│   └── workspace.ts           ← OPFS 文件系统操作底层
└── db.ts                      ← IndexedDB 持久化
```

---

## 2. 工具 Schema 对齐对照表

### 2.1 `ls` — 列出目录

| 维度 | FilesystemMiddleware | Lumino 当前 | 需改动 |
|------|---------------------|-------------|--------|
| 工具名 | `ls` | `ls` | 无 |
| `path` 参数 | 必填，绝对路径（如 `/`、`/src`） | 可选，默认 `""`（根） | 保持现状 |
| 返回格式 | 每行一个路径的纯文本 | JSON `{ path, entries: string[] }` | **对齐为纯文本路径列表** |

**Schema：** 不变。

**输入：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | 否 | 目录路径，相对于工作区根目录，默认 `""`（根目录） |

**输出格式（成功）：**
```
file1.txt
file2.md
subdir/
```

每行一个条目，目录以 `/` 结尾。

**输出格式（路径不存在）：**
```json
{"error": "not_found", "message": "路径不存在：/nonexistent"}
```

**输出格式（空目录）：**
```
(empty directory)
```

---

### 2.2 `read_file` — 读取文件

| 维度 | FilesystemMiddleware | Lumino 当前 | 需改动 |
|------|---------------------|-------------|--------|
| 工具名 | `read_file` | `read` | **重命名为 `read_file`** |
| `file_path` | ✅ 绝对路径 | `path`（相对路径） | **参数名改为 `file_path`** |
| `offset` | ✅ `0`（0-indexed） | ❌ 缺失 | **新增** |
| `limit` | ✅ `100` | ❌ 缺失 | **新增** |
| 返回格式 | `cat -n` 格式行号 | JSON `{ path, content }` | **对齐为带行号的纯文本** |

**这是最关键的改动。** `offset`/`limit` 对于大文件分页至关重要，避免 agent 上下文溢出。

**改后 Schema：**
```typescript
{
  type: "function",
  function: {
    name: "read_file",
    description: "读取工作区中的文件内容。支持通过 offset/limit 分页读取大文件。",
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
}
```

**输入：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `file_path` | `string` | 是 | — | 文件路径，以 `/` 开头 |
| `offset` | `integer` | 否 | `0` | 起始行号（0-indexed），用于分页 |
| `limit` | `integer` | 否 | `100` | 最多读取行数 |

**输出格式（成功）：**
```
     1  import { getWorkspaceHandle } from "../../fs/workspace"
     2  
     3  export async function handleLs(args: Record<string, unknown>): Promise<string> {
     4    const path = (args.path as string) || ""
     5    const root = await getWorkspaceHandle()
     6    // ...
```

每行格式为 `{行号:6d}  {内容}`，行号右对齐固定 6 字符宽度。

若存在续行（单行超过 5000 字符时会拆分为多个逻辑行），续行行号格式为 `5.1`、`5.2`。

若文件还有未显示的行，末尾追加：
```
[Truncated: N more lines not shown. Use offset=M to continue.]
```

**输出格式（文件不存在）：**
```json
{"error": "not_found", "message": "文件不存在：/path/to/file"}
```

**输出格式（路径是目录）：**
```json
{"error": "is_directory", "message": "/path/to/dir 是一个目录，请使用 ls。"}
```

**输出格式（空文件）：**
```
System reminder: File exists but has empty contents
```

---

### 2.3 `write_file` — 创建/覆写文件

| 维度 | FilesystemMiddleware | Lumino 当前 | 需改动 |
|------|---------------------|-------------|--------|
| 工具名 | `write_file` | `write` | **重命名为 `write_file`** |
| `file_path` | ✅ | `path` | **参数名改为 `file_path`** |
| `content` | ✅ | ✅ | 无 |
| 返回格式 | `"Updated file {path}"` | JSON `{ success, path, message }` | **对齐为纯文本确认** |

**改后 Schema：**
```typescript
{
  type: "function",
  function: {
    name: "write_file",
    description: "在工作区中创建新文件或覆写已有文件。优先使用 edit_file 编辑已有文件。",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "文件路径，相对于工作区根目录，必须以 / 开头。父目录不存在时会自动创建。"
        },
        content: {
          type: "string",
          description: "要写入的完整文件内容"
        }
      },
      required: ["file_path", "content"],
      additionalProperties: false
    }
  }
}
```

**输入：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file_path` | `string` | 是 | 文件路径，以 `/` 开头，父目录自动创建 |
| `content` | `string` | 是 | 文件内容 |

**输出格式（成功）：**
```
Updated file /path/to/file.txt
```

**输出格式（失败 — 由 OPFS 抛出异常）：**
```json
{"error": "write_failed", "message": "具体错误原因"}
```

---

### 2.4 `edit_file` — 精确字符串替换（**新增**）

FilesystemMiddleware 中存在，Lumino 完全缺失。这是 agent 编辑文件的核心工具，避免为小改动重写整个文件。

**Schema：**
```typescript
{
  type: "function",
  function: {
    name: "edit_file",
    description: "在工作区文件中执行精确字符串替换。\n- 使用前必须先调用 read_file 读取文件内容。\n- old_string 必须与文件内容完全匹配（包括所有空白字符）。\n- old_string 必须在文件中唯一，除非设置 replace_all=true。\n- 不要在 old_string 或 new_string 中包含行号前缀。",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "文件路径，相对于工作区根目录，必须以 / 开头"
        },
        old_string: {
          type: "string",
          description: "要被替换的精确文本。必须与文件内容完全匹配（包括缩进和空白）。必须唯一，除非 replace_all 为 true。"
        },
        new_string: {
          type: "string",
          description: "替换 old_string 的新文本。必须与 old_string 不同。"
        },
        replace_all: {
          type: "boolean",
          description: "是否替换所有匹配项。默认 false，此时 old_string 必须在文件中唯一。"
        }
      },
      required: ["file_path", "old_string", "new_string"],
      additionalProperties: false
    }
  }
}
```

**输入：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `file_path` | `string` | 是 | — | 文件路径，以 `/` 开头 |
| `old_string` | `string` | 是 | — | 要被替换的精确文本 |
| `new_string` | `string` | 是 | — | 替换后的新文本 |
| `replace_all` | `boolean` | 否 | `false` | 是否替换全部出现 |

**输出格式（成功，单次替换）：**
```
Successfully replaced 1 instance(s) in '/path/to/file.ts'
```

**输出格式（成功，replace_all=true，3 处替换）：**
```
Successfully replaced 3 instance(s) in '/path/to/file.ts'
```

**输出格式（文件不存在）：**
```json
{"error": "not_found", "message": "文件不存在：/path/to/file.ts"}
```

**输出格式（old_string 未找到）：**
```json
{"error": "not_found", "message": "未找到 old_string：import { foo } fro..."}
```

**输出格式（old_string 不唯一 — 出现 3 次但 replace_all=false）：**
```json
{"error": "not_unique", "message": "old_string 出现了 3 次，不唯一。请提供更多上下文使其唯一，或设置 replace_all=true。"}
```

**输出格式（old_string 与 new_string 相同）：**
```json
{"error": "no_change", "message": "old_string 和 new_string 相同。"}
```

**实现逻辑：**
1. 通过 `readWorkspaceFile()` 读取完整文件内容
2. 统计 `old_string` 出现次数
3. 校验唯一性（`replace_all=false` 且 `count > 1` 时拒绝）
4. 执行字符串替换（`String.replace()` 或 `String.replaceAll()`）
5. 通过 `writeWorkspaceFile()` 写回
6. 返回结果文本

---

### 2.5 `glob` — Glob 模式匹配（**新增**）

FilesystemMiddleware 中存在，Lumino 完全缺失。用于按模式快速定位文件。

**Schema：**
```typescript
{
  type: "function",
  function: {
    name: "glob",
    description: "在工作区中查找匹配 glob 模式的文件。\n支持的通配符：\n- *  匹配单层路径中的任意字符（不含 /）\n- ** 匹配任意层目录\n- ?  匹配单个字符（不含 /）\n\n示例：\n- **/*.py  查找所有 Python 文件\n- *.txt   查找根目录下的文本文件\n- /src/**/*.ts  查找 src 目录下所有 TypeScript 文件",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Glob 模式，例如 **/*.py 或 /subdir/**/*.md"
        },
        path: {
          type: "string",
          description: "搜索的起始目录，默认 '/'（整个工作区）"
        }
      },
      required: ["pattern"],
      additionalProperties: false
    }
  }
}
```

**输入：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `pattern` | `string` | 是 | — | Glob 模式，如 `**/*.py`、`*.txt`、`/src/**/*.ts` |
| `path` | `string` | 否 | `"/"` | 搜索的起始目录 |

**输出格式（成功，匹配到 5 个文件）：**
```
/data/config.json
/src/app.ts
/src/utils/helper.ts
/tests/app.test.ts
/README.md
```

每行一个匹配的文件绝对路径，按路径字母顺序排列。

**输出格式（无匹配）：**
```
(no matches)
```

**输出格式（匹配数超过 500 个，被截断）：**
```
/data/config.json
/src/app.ts
...（前 500 条匹配）
/src/utils/worker.ts

[... and 342 more matches truncated]
```

**实现逻辑：**
1. 递归遍历 OPFS 目录树，收集所有文件路径
2. 如果指定了 `path`，先按前缀过滤
3. 将 glob pattern 转为正则表达式：
   - `**` → `.*`（匹配任意字符包括 `/`）
   - `*` → `[^/]*`（匹配单层路径）
   - `?` → `[^/]`（匹配单个非 `/` 字符）
   - 其他特殊正则字符转义
4. 用正则逐一匹配每个文件路径
5. 结果按字母序排列，超过 500 个则截断并附提示

**不引入 `minimatch` 依赖**，手写 glob-to-regex 转换即可，约 30 行代码。

---

### 2.6 `grep` — 文本搜索

| 维度 | FilesystemMiddleware | Lumino 当前 | 需改动 |
|------|---------------------|-------------|--------|
| 工具名 | `grep` | `grep` | 无 |
| `pattern` | ✅ 字面量字符串 | 正则表达式 | **对齐为字面量搜索**（更安全） |
| `path` | ✅ | ✅ | 无 |
| `glob` | ✅ | ❌ 缺失 | **新增**：搜索前按 glob 过滤文件 |
| `output_mode` | ✅ `files_with_matches` / `content` / `count` | ❌ 缺失 | **新增** 三种输出模式 |

**改后 Schema：**
```typescript
{
  type: "function",
  function: {
    name: "grep",
    description: "在工作区文件中搜索文本（字面量匹配，非正则）。\n支持按 glob 过滤文件范围，支持三种输出模式。",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "要搜索的文本字面量（大小写敏感）"
        },
        path: {
          type: "string",
          description: "搜索的目录路径，默认 ''（整个工作区）"
        },
        glob: {
          type: "string",
          description: "按 glob 模式过滤要搜索的文件，例如 *.py 只搜索 Python 文件"
        },
        output_mode: {
          type: "string",
          enum: ["files_with_matches", "content", "count"],
          description: "输出模式：files_with_matches（默认，仅返回匹配的文件路径）、content（返回匹配行及上下文）、count（每个文件的匹配计数）"
        }
      },
      required: ["pattern"],
      additionalProperties: false
    }
  }
}
```

**输入：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `pattern` | `string` | 是 | — | 要搜索的字面量文本 |
| `path` | `string` | 否 | `""` | 搜索目录 |
| `glob` | `string` | 否 | — | 过滤文件的 glob 模式 |
| `output_mode` | `"files_with_matches"` \| `"content"` \| `"count"` | 否 | `"files_with_matches"` | 输出模式 |

**输出格式 — `output_mode="files_with_matches"`（默认）：**
```
/src/utils/helper.ts
/tests/app.test.ts
```

每行一个包含匹配内容的文件路径（去重）。

**输出格式 — `output_mode="content"`：**
```
/src/utils/helper.ts:12:  const result = processData(input)
/src/utils/helper.ts:45:  return processData(filtered)
/tests/app.test.ts:3:  import { processData } from "../src/utils/helper"
```

格式为 `{文件路径}:{行号}: {匹配行内容}`。每行内容截断到最多 200 字符。

**输出格式 — `output_mode="count"`：**
```
/src/utils/helper.ts: 2 matches
/tests/app.test.ts: 1 match
```

**输出格式（无匹配）：**
```
(no matches)
```

**输出格式（路径不存在）：**
```json
{"error": "not_found", "message": "路径不存在：/nonexistent"}
```

**实现要点：**
- `pattern` 使用 `line.includes(pattern)` 而非正则
- 有 `glob` 参数时先用 glob 匹配过滤文件列表，再在过滤后的文件中搜索
- 结果超过 50 条匹配行时截断并提示
- `content` 模式下每行的输出内容截断到 200 字符

---

## 3. Lumino 独有工具（保留不变）

以下工具为 Lumino 浏览器插件环境独有，FilesystemMiddleware 中不存在，保持现有实现不变。

### 3.1 `rm` — 删除文件

**Schema：** 不变。

**输入：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | 是 | 文件路径，相对于工作区根目录 |

**输出格式（成功）：**
```json
{"success": true, "path": "/file.txt", "message": "已删除：/file.txt"}
```

**输出格式（文件不存在 — 静默成功）：**
```json
{"success": true, "path": "/nonexistent.txt", "message": "已删除：/nonexistent.txt"}
```

### 3.2 `export` — 导出下载

**Schema：** 不变。

**输入：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | 否 | 文件或目录路径，不传则导出整个工作区 |

**输出格式（成功）：**
```json
{"success": true, "downloadId": 42, "filename": "workspace_2026-05-11T10-30-00.txt", "message": "文件已触发下载：workspace_2026-05-11T10-30-00.txt"}
```

**输出格式（无内容可导出）：**
```json
{"error": "empty", "message": "没有可导出的内容。"}
```

**输出格式（路径不存在）：**
```json
{"error": "not_found", "message": "路径不存在：/nonexistent"}
```

**输出格式（下载失败）：**
```json
{"error": "download_failed", "message": "具体浏览器错误原因"}
```

### 3.3 `memory_get` — 读取日记忆

**Schema：** 不变。

**输入：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `date` | `string` | 否 | 日期，格式 `YYYY-MM-DD`，不传则返回今天的记忆 |

**输出格式（找到）：**
```json
{
  "date": "2026-05-11",
  "summary": "...",
  "keywords": ["..."],
  "manualNotes": ["..."],
  "status": "...",
  ...
}
```

**输出格式（未找到）：**
```json
{"date": "2026-05-11", "found": false, "message": "未找到 2026-05-11 的记忆。"}
```

### 3.4 `memory_search` — 搜索记忆

**Schema：** 不变。

**输入：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `query` | `string` | 是 | — | 搜索查询词 |
| `limit` | `number` | 否 | `5` | 返回结果数量上限 |

**输出格式（成功）：**
```json
[
  {"date": "2026-05-10", "type": "memory", "text": "...", "score": 0.87},
  {"date": "2026-05-09", "type": "insight", "text": "...", "score": 0.72}
]
```

**输出格式（查询词为空）：**
```json
{"results": [], "message": "查询词为空。"}
```

### 3.5 `current_page` — 当前标签页信息

**Schema：** 不变。

**输入：** 无参数。

**输出格式（成功）：**
```json
{"url": "https://example.com", "title": "Example Page", "id": 123}
```

**输出格式（无活跃标签页）：**
```json
{"error": "no_active_tab", "message": "无法获取当前标签页信息。"}
```

### 3.6 `tabs` — 列出所有标签页

**Schema：** 不变。

**输入：** 无参数。

**输出格式（成功）：**
```json
{
  "count": 5,
  "tabs": [
    {"id": 123, "title": "Example", "url": "https://example.com", "active": true, "windowId": 1},
    ...
  ]
}
```

**输出格式（查询失败）：**
```json
{"error": "tabs_query_failed", "message": "具体错误原因"}
```

---

## 4. 大工具结果驱逐机制（Tool Result Eviction）

### 4.1 设计背景

在 FilesystemMiddleware 中，当某个非文件系统工具（如 `memory_search`、`tabs`）返回的结果超过 `tool_token_limit_before_evict`（默认 20000 tokens）时，结果会被写入工作区的 `/large_tool_results/{tool_call_id}` 文件，并在 Agent 的对话历史中用截断预览 + 文件路径引用替代原始结果，防止上下文窗口溢出。

这套机制在浏览器插件环境中完全可实现 — 本质是将超长结果写回 OPFS 并用 `read_file` 分段读取。

### 4.2 配置常量

```typescript
/** 工具结果超过此 token 数时触发驱逐（1 token ≈ 4 字符保守估算） */
const TOOL_TOKEN_LIMIT_BEFORE_EVICT = 20000

/** 每 token 的保守字符数估算 */
const NUM_CHARS_PER_TOKEN = 4

/** 驱逐文件存放目录 */
const EVICT_DIR = "/large_tool_results"

/** 预览时显示的头/尾行数 */
const PREVIEW_HEAD_LINES = 5
const PREVIEW_TAIL_LINES = 5

/** 排除驱逐的工具列表 —— 这些工具自身已有截断机制或不需要驱逐 */
const TOOLS_EXCLUDED_FROM_EVICTION = new Set([
  "ls",        // 自身有截断，返回太长说明 query 需细化
  "glob",      // 自身有截断（500 条）
  "grep",      // 自身有截断（50 条）
  "read_file", // 单行长行问题无法通过驱逐解决
  "edit_file", // 返回极短确认信息
  "write_file",// 返回极短确认信息
])
```

### 4.3 工作流程

```
Agent 调用工具 → 工具返回结果（字符串）
                       │
                       ▼
              结果字符数 > TOOL_TOKEN_LIMIT_BEFORE_EVICT × NUM_CHARS_PER_TOKEN？
                       │
             ┌─────────┴─────────┐
             │ 否                 │ 是
             ▼                    ▼
        直接返回原始结果    ① 将完整结果写入 OPFS 文件
                           /large_tool_results/{tool_call_id}
                                │
                                ▼
                           ② 创建截断预览（前 5 行 + 后 5 行 + 截断提示）
                                │
                                ▼
                           ③ 返回驱逐提示消息（包含预览 + 文件引用）
                              通知 Agent 用 read_file 分段读取该文件
```

### 4.4 驱逐提示模板

当工具结果被驱逐时，返回给 LLM 的消息格式：

```
Tool result too large, the result of this tool call {tool_call_id} was saved in the filesystem at this path: /large_tool_results/{tool_call_id}
You can read the result from the filesystem by using the read_file tool, but make sure to only read part of the result at a time.
You can do this by specifying an offset and limit in the read_file tool call.
For example, to read the first 100 lines, you can use the read_file tool with offset=0 and limit=100.

Here is a preview showing the head and tail of the result (lines of the form
... [N lines truncated] ...
indicate omitted lines in the middle of the content):

     1  {"date":"2026-05-10","type":"memory","text":"..."}
     2  {"date":"2026-05-10","type":"memory","text":"..."}
     3  {"date":"2026-05-10","type":"memory","text":"..."}
     4  {"date":"2026-05-10","type":"memory","text":"..."}
     5  {"date":"2026-05-10","type":"memory","text":"..."}

... [342 lines truncated] ...

   343  {"date":"2026-05-11","type":"insight","text":"..."}
   344  {"date":"2026-05-11","type":"insight","text":"..."}
   345  {"date":"2026-05-11","type":"insight","text":"..."}
   346  {"date":"2026-05-11","type":"insight","text":"..."}
   347  {"date":"2026-05-11","type":"insight","text":"..."}
```

### 4.5 预览生成函数

```typescript
/**
 * 为超长工具结果创建截断预览。
 *
 * 取前 head_lines 行和后 tail_lines 行，中间用省略标记连接。
 * 每行截断到 1000 字符防止单行爆炸。
 *
 * @param contentStr 完整的工具结果字符串
 * @param headLines 头部保留行数，默认 5
 * @param tailLines 尾部保留行数，默认 5
 * @returns 格式化的预览文本（带行号）
 */
function createContentPreview(
  contentStr: string,
  headLines: number = 5,
  tailLines: number = 5
): string {
  const lines = contentStr.split("\n")

  // 如果内容足够短，直接全部展示
  if (lines.length <= headLines + tailLines) {
    const preview = lines.map((l) => l.slice(0, 1000))
    return formatWithLineNumbers(preview, 1)
  }

  // 头部
  const head = lines.slice(0, headLines).map((l) => l.slice(0, 1000))
  const headSample = formatWithLineNumbers(head, 1)

  // 尾部
  const tail = lines.slice(-tailLines).map((l) => l.slice(0, 1000))
  const tailSample = formatWithLineNumbers(tail, lines.length - tailLines + 1)

  // 截断标记
  const skipped = lines.length - headLines - tailLines
  const truncationNotice = `\n... [${skipped} lines truncated] ...\n`

  return headSample + truncationNotice + tailSample
}

/**
 * 为内容添加 cat -n 风格行号。
 */
function formatWithLineNumbers(lines: string[], startLine: number): string {
  return lines
    .map((line, i) => {
      const lineNum = String(startLine + i).padStart(6, " ")
      return `${lineNum}  ${line}`
    })
    .join("\n")
}
```

### 4.6 驱逐拦截核心函数

此函数在工具执行完成后调用，判断结果是否需要驱逐。

```typescript
/**
 * 检查工具结果是否超过 token 阈值，若超过则驱逐到文件系统。
 *
 * @param toolResult 工具返回的原始字符串
 * @param toolCallId 工具调用的唯一 ID（OpenAI 的 tool_call_id）
 * @returns 驱逐后的消息文本（可能是原始结果或驱逐提示）
 */
async function maybeEvictToolResult(
  toolResult: string,
  toolCallId: string
): Promise<string> {
  // 未超过阈值，直接返回
  if (toolResult.length <= TOOL_TOKEN_LIMIT_BEFORE_EVICT * NUM_CHARS_PER_TOKEN) {
    return toolResult
  }

  const sanitizedId = toolCallId.replace(/[^a-zA-Z0-9_-]/g, "_")
  const filePath = `${EVICT_DIR}/${sanitizedId}`

  try {
    // 写入完整结果到文件系统
    await writeWorkspaceFile(filePath, toolResult)

    // 创建预览
    const preview = createContentPreview(toolResult, PREVIEW_HEAD_LINES, PREVIEW_TAIL_LINES)

    // 构造驱逐提示
    return [
      `Tool result too large, the result of this tool call ${toolCallId} was saved in the filesystem at this path: ${filePath}`,
      `You can read the result from the filesystem by using the read_file tool, but make sure to only read part of the result at a time.`,
      `You can do this by specifying an offset and limit in the read_file tool call.`,
      `For example, to read the first 100 lines, you can use the read_file tool with offset=0 and limit=100.`,
      "",
      "Here is a preview showing the head and tail of the result (lines of the form",
      "... [N lines truncated] ...",
      "indicate omitted lines in the middle of the content):",
      "",
      preview,
    ].join("\n")
  } catch {
    // 驱逐失败（如 OPFS 写入异常），回退到返回原始结果
    return toolResult
  }
}
```

### 4.7 在 Agent 循环中的集成点

驱逐拦截集成在 `tool-executor.ts` 的 `executeToolCall` 函数中 — 工具执行完成后、结果返回给 LLM 前进行判定。

**改后的 `tool-executor.ts`：**

```typescript
import type { OpenAiToolCall } from "./openai-messages"

type ToolHandler = (args: Record<string, unknown>) => Promise<string> | string

const toolRegistry = new Map<string, ToolHandler>()

export function registerTool(name: string, handler: ToolHandler): void {
  toolRegistry.set(name, handler)
}

/**
 * 执行单个工具调用并返回结果。
 *
 * 对非排除工具的结果进行 token 阈值检查，超限时自动驱逐到
 * /large_tool_results/ 目录，并用截断预览替代原始结果。
 */
export async function executeToolCall(
  call: OpenAiToolCall
): Promise<string> {
  const name = call.function.name
  const handler = toolRegistry.get(name)

  if (!handler) {
    return JSON.stringify({
      error: "unknown_tool",
      name,
      hint: "该工具尚未注册，请检查 tool-registry.ts"
    })
  }

  try {
    const args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>
    const rawResult = await handler(args)

    // 排除列表中的工具不参与驱逐
    if (TOOLS_EXCLUDED_FROM_EVICTION.has(name)) {
      return rawResult
    }

    // 检查是否需要驱逐
    return await maybeEvictToolResult(rawResult, call.id)
  } catch (error) {
    return JSON.stringify({
      error: "tool_execution_failed",
      name,
      message: error instanceof Error ? error.message : String(error)
    })
  }
}
```

### 4.8 输入输出约定

**触发条件：** 工具结果字符串长度 > `20000 × 4 = 80000` 字符，且工具名不在 `TOOLS_EXCLUDED_FROM_EVICTION` 中。

**输出格式（未触发驱逐，直接返回）：**
工具原始返回内容保持不变。

**输出格式（触发驱逐）：**
见 4.4 节的驱逐提示模板。LLM 看到此消息后应使用 `read_file` 分段读取 `/large_tool_results/{id}` 文件。

### 4.9 实现文件清单

| 文件 | 改动 | 说明 |
|------|------|------|
| `src/lib/chat/tool-executor.ts` | **修改** | 在 `executeToolCall` 中加入驱逐判定逻辑 |
| `src/lib/chat/tools/fs-tools.ts` | 无需改动 | `read_file`/`write_file` 已支持驱逐所需的读写能力 |
| 新增常量/工具函数 | **新增文件或内联** | `maybeEvictToolResult`、`createContentPreview`、`formatWithLineNumbers` 可放在 `tool-executor.ts` 或独立为 `tool-eviction.ts` |

---

## 5. 实施步骤（按顺序）

### Step 1：对齐 `read` → `read_file`（含 offset/limit）

**涉及文件：**
- `src/lib/chat/tool-definitions.ts` — 替换 `read` 的 schema 为 `read_file`
- `src/lib/chat/tools/fs-tools.ts` — 重命名 `handleRead` → `handleReadFile`，新增 offset/limit 逻辑
- `src/lib/chat/tool-registry.ts` — 更新注册名

**fs-tools.ts 参考实现：**
```typescript
export async function handleReadFile(args: Record<string, unknown>): Promise<string> {
  const path = args.file_path as string
  const offset = (args.offset as number) || 0
  const limit = (args.limit as number)
  // limit=0 或未指定时读取全部，否则限制行数
  const hasLimit = limit && limit > 0

  const content = await readWorkspaceFile(path)
  if (content === null) {
    return JSON.stringify({ error: "not_found", message: `文件不存在：${path}` })
  }
  if (content.length === 0) {
    return "System reminder: File exists but has empty contents"
  }

  const lines = content.split("\n")
  // 处理 offset 越界
  if (offset >= lines.length) {
    return JSON.stringify({ error: "offset_out_of_range", message: `offset=${offset} 超出文件行数范围（文件共 ${lines.length} 行）。` })
  }

  const sliced = hasLimit ? lines.slice(offset, offset + limit) : lines.slice(offset)
  const numbered = sliced.map((line, i) => {
    const lineNum = String(offset + i + 1).padStart(6, " ")
    return `${lineNum}  ${line}`
  })

  let result = numbered.join("\n")
  if (hasLimit && offset + limit < lines.length) {
    result += `\n\n[Truncated: ${lines.length - offset - limit} more lines not shown. Use offset=${offset + limit} to continue.]`
  }
  return result
}
```

### Step 2：对齐 `write` → `write_file`

**涉及文件：**
- `src/lib/chat/tool-definitions.ts` — 替换 `write` 的 schema，参数 `path`→`file_path`
- `src/lib/chat/tools/fs-tools.ts` — `args.path`→`args.file_path`，返回纯文本
- `src/lib/chat/tool-registry.ts` — 更新注册名

**fs-tools.ts 参考实现：**
```typescript
export async function handleWriteFile(args: Record<string, unknown>): Promise<string> {
  const filePath = args.file_path as string
  const content = args.content as string

  await writeWorkspaceFile(filePath, content)
  return `Updated file ${filePath}`
}
```

### Step 3：实现 `edit_file`（新增）

**涉及文件：**
- `src/lib/chat/tool-definitions.ts` — 新增 schema
- `src/lib/chat/tools/fs-tools.ts` — 新增 `handleEditFile`
- `src/lib/chat/tool-registry.ts` — 注册

**fs-tools.ts 参考实现：**
```typescript
export async function handleEditFile(args: Record<string, unknown>): Promise<string> {
  const filePath = args.file_path as string
  const oldString = args.old_string as string
  const newString = args.new_string as string
  const replaceAll = (args.replace_all as boolean) || false

  if (oldString === newString) {
    return JSON.stringify({ error: "no_change", message: "old_string 和 new_string 相同。" })
  }

  const content = await readWorkspaceFile(filePath)
  if (content === null) {
    return JSON.stringify({ error: "not_found", message: `文件不存在：${filePath}` })
  }

  // 统计出现次数
  const occurrences = content.split(oldString).length - 1
  if (occurrences === 0) {
    // 截断显示，避免超长
    const preview = oldString.length > 100 ? oldString.slice(0, 100) + "..." : oldString
    return JSON.stringify({ error: "not_found", message: `未找到 old_string：${preview}` })
  }
  if (!replaceAll && occurrences > 1) {
    return JSON.stringify({
      error: "not_unique",
      message: `old_string 出现了 ${occurrences} 次，不唯一。请提供更多上下文使其唯一，或设置 replace_all=true。`
    })
  }

  const newContent = replaceAll
    ? content.replaceAll(oldString, newString)
    : content.replace(oldString, newString)

  await writeWorkspaceFile(filePath, newContent)
  return `Successfully replaced ${replaceAll ? occurrences : 1} instance(s) in '${filePath}'`
}
```

### Step 4：实现 `glob`（新增）

**涉及文件：**
- `src/lib/chat/tool-definitions.ts` — 新增 schema
- `src/lib/chat/tools/fs-tools.ts` — 新增 `handleGlob` 及辅助函数
- `src/lib/chat/tool-registry.ts` — 注册

**fs-tools.ts 参考实现：**
```typescript
/**
 * 将 glob 模式转换为正则表达式。
 *
 * 转换规则：
 * - **  匹配任意字符包括 /       → .*
 * - *   匹配除 / 外的任意字符     → [^/]*
 * - ?   匹配单个非 / 字符          → [^/]
 * - 其他正则特殊字符转义
 */
function globToRegex(pattern: string): RegExp {
  let regexStr = "^"
  let i = 0
  while (i < pattern.length) {
    if (pattern[i] === "*" && pattern[i + 1] === "*") {
      regexStr += ".*"
      i += 2
      // 如果 ** 后面紧跟 /，吞掉这个 /
      if (pattern[i] === "/") {
        regexStr += "/"
        i++
      }
    } else if (pattern[i] === "*") {
      regexStr += "[^/]*"
      i++
    } else if (pattern[i] === "?") {
      regexStr += "[^/]"
      i++
    } else {
      const c = pattern[i]
      if (".+^${}()|[]\\".includes(c)) {
        regexStr += "\\" + c
      } else {
        regexStr += c
      }
      i++
    }
  }
  regexStr += "$"
  return new RegExp(regexStr)
}

/**
 * 递归收集目录下所有文件路径。
 * 返回的路径相对于给定目录（不含前缀 /）。
 */
async function collectAllFiles(
  dirHandle: FileSystemDirectoryHandle,
  prefix: string = ""
): Promise<string[]> {
  const result: string[] = []
  for await (const [name, handle] of (dirHandle as any).entries()) {
    const fullPath = prefix ? `${prefix}/${name}` : name
    if (handle.kind === "directory") {
      const subFiles = await collectAllFiles(handle as FileSystemDirectoryHandle, fullPath)
      result.push(...subFiles)
    } else {
      result.push(fullPath)
    }
  }
  return result
}

export async function handleGlob(args: Record<string, unknown>): Promise<string> {
  const pattern = args.pattern as string
  const basePath = (args.path as string) || "/"

  const root = await getWorkspaceHandle()
  const allFiles = await collectAllFiles(root)
  const regex = globToRegex(pattern)

  // 将文件路径统一为以 / 开头的绝对路径
  const absoluteFiles = allFiles.map((f) => "/" + f)

  const matches = absoluteFiles.filter((f) => {
    // 先按 basePath 过滤前缀
    if (basePath !== "/" && !f.startsWith(basePath)) return false
    // 去掉 basePath 前缀后再匹配 pattern
    const relative = basePath === "/" ? f : f.slice(basePath.length)
    return regex.test(relative)
  })

  matches.sort()

  if (matches.length > 500) {
    return (
      matches.slice(0, 500).join("\n") +
      `\n\n[... and ${matches.length - 500} more matches truncated]`
    )
  }
  return matches.join("\n") || "(no matches)"
}
```

### Step 5：对齐 `grep` — 字面量搜索 + output_mode + glob 过滤

**涉及文件：**
- `src/lib/chat/tool-definitions.ts` — 替换 `grep` schema
- `src/lib/chat/tools/fs-tools.ts` — 重写 `handleGrep`
- `src/lib/chat/tool-registry.ts` — 不变（名称不变）

**fs-tools.ts 参考实现：**
```typescript
export async function handleGrep(args: Record<string, unknown>): Promise<string> {
  const root = await getWorkspaceHandle()
  const pattern = (args.pattern as string) || ""
  const searchPath = (args.path as string) || ""
  const globPattern = (args.glob as string) || ""
  const outputMode = (args.output_mode as string) || "files_with_matches"

  // 解析搜索目标
  const target = searchPath ? await resolvePath(root, searchPath) : root
  if (!target) {
    return JSON.stringify({ error: "not_found", message: `路径不存在：${searchPath}` })
  }

  // 按文件收集匹配结果（去重用 Set）
  const fileMatches = new Map<string, Array<{ line: number; content: string }>>()

  async function searchFile(filePath: string, handle: FileSystemFileHandle): Promise<void> {
    try {
      const file = await handle.getFile()
      const text = await file.text()
      const lines = text.split("\n")
      const hits: Array<{ line: number; content: string }> = []
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(pattern)) {
          hits.push({ line: i + 1, content: lines[i].slice(0, 200) })
        }
      }
      if (hits.length > 0) {
        fileMatches.set(filePath, hits)
      }
    } catch {
      // skip unreadable files
    }
  }

  async function searchDir(dirHandle: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    for await (const [name, handle] of (dirHandle as any).entries()) {
      const fullPath = prefix ? `${prefix}/${name}` : name
      if (handle.kind === "directory") {
        await searchDir(handle as FileSystemDirectoryHandle, fullPath)
      } else {
        // 如果有 glob 过滤，先检查文件是否匹配
        if (globPattern) {
          // 使用 globToRegex 检查（复用 Step 4 中的函数）
          if (!globToRegex(globPattern).test(name)) continue
        }
        await searchFile(fullPath, handle as FileSystemFileHandle)
      }
    }
  }

  if (target.kind === "directory") {
    await searchDir(target as FileSystemDirectoryHandle, searchPath)
  } else {
    await searchFile(searchPath, target as FileSystemFileHandle)
  }

  if (fileMatches.size === 0) return "(no matches)"

  // 按 output_mode 格式化
  switch (outputMode) {
    case "content": {
      const lines: string[] = []
      for (const [filePath, hits] of fileMatches) {
        for (const hit of hits) {
          lines.push(`${filePath}:${hit.line}: ${hit.content}`)
        }
      }
      if (lines.length > 50) {
        return lines.slice(0, 50).join("\n") + `\n\n[... and ${lines.length - 50} more matches truncated]`
      }
      return lines.join("\n")
    }
    case "count": {
      const lines: string[] = []
      for (const [filePath, hits] of fileMatches) {
        const label = hits.length === 1 ? "match" : "matches"
        lines.push(`${filePath}: ${hits.length} ${label}`)
      }
      return lines.join("\n")
    }
    case "files_with_matches":
    default: {
      return [...fileMatches.keys()].sort().join("\n")
    }
  }
}
```

### Step 6：统一 `ls` 返回格式

**涉及文件：**
- `src/lib/chat/tools/fs-tools.ts` — 修改 `handleLs` 返回纯文本

**fs-tools.ts 参考实现：**
```typescript
export async function handleLs(args: Record<string, unknown>): Promise<string> {
  const root = await getWorkspaceHandle()
  const path = (args.path as string) || ""

  const target = await resolvePath(root, path)
  if (!target) {
    return JSON.stringify({ error: "not_found", message: `路径不存在：${path}` })
  }

  const entries = await listWorkspaceDir(path)
  if (entries.length === 0) {
    return "(empty directory)"
  }
  return entries
    .map((e) => e.name + (e.kind === "directory" ? "/" : ""))
    .join("\n")
}
```

### Step 7：实现大工具结果驱逐机制

**涉及文件：**
- `src/lib/chat/tool-executor.ts` — 改造 `executeToolCall`，加入驱逐拦截
- 可选：新建 `src/lib/chat/tool-eviction.ts` 独立模块

**参考实现见第 4 节 4.5–4.7**。

实现顺序：
1. 在 `tool-executor.ts`（或新建 `tool-eviction.ts`）中实现 `createContentPreview`、`formatWithLineNumbers`、`maybeEvictToolResult`
2. 添加 `TOOLS_EXCLUDED_FROM_EVICTION` 常量和 `TOOL_TOKEN_LIMIT_BEFORE_EVICT` 配置
3. 改造 `executeToolCall`：在执行 handler 之后、返回结果之前，调用 `maybeEvictToolResult` 进行驱逐判定

### Step 8：更新 `tool-registry.ts` 注册

**最终注册代码：**
```typescript
import { registerTool } from "./tool-executor"
import { handleMemoryGet, handleMemorySearch } from "./tools/memory-tools"
import {
  handleLs,
  handleReadFile,
  handleWriteFile,
  handleEditFile,
  handleGrep,
  handleGlob,
  handleRm,
  handleExport
} from "./tools/fs-tools"
import { handleCurrentPage, handleTabs } from "./tools/system-tools"

let registered = false

export function registerAllTools(): void {
  if (registered) return
  registered = true

  // 文件系统工具
  registerTool("ls", handleLs)
  registerTool("read_file", handleReadFile)
  registerTool("write_file", handleWriteFile)
  registerTool("edit_file", handleEditFile)
  registerTool("glob", handleGlob)
  registerTool("grep", handleGrep)
  registerTool("rm", handleRm)
  registerTool("export", handleExport)

  // 记忆系统工具
  registerTool("memory_get", handleMemoryGet)
  registerTool("memory_search", handleMemorySearch)

  // 浏览器系统工具
  registerTool("current_page", handleCurrentPage)
  registerTool("tabs", handleTabs)
}
```

---

## 6. 最终工具清单

| 工具名 | 分类 | 状态 |
|--------|------|------|
| `ls` | 文件系统 | 对齐返回格式为纯文本 |
| `read_file` | 文件系统 | **重命名 + 新增 offset/limit 分页** |
| `write_file` | 文件系统 | **重命名 + 参数名对齐** |
| `edit_file` | 文件系统 | **新增** |
| `glob` | 文件系统 | **新增** |
| `grep` | 文件系统 | 对齐字面量 + output_mode + glob 过滤 |
| `rm` | 文件系统（Lumino 独有） | 保持现状 |
| `export` | 文件系统（Lumino 独有） | 保持现状 |
| `memory_get` | 记忆系统 | 保持现状 |
| `memory_search` | 记忆系统 | 保持现状 |
| `current_page` | 浏览器系统 | 保持现状 |
| `tabs` | 浏览器系统 | 保持现状 |

**不可实现：** `execute`（浏览器沙箱限制，无条件执行任意 shell 命令）

---

## 7. 注意事项

1. **路径规范：** 所有文件系统工具的路径参数统一以 `/` 开头，表示相对于工作区根目录的路径（与 OPFS 实际路径不同，OPFS 内路径不含 `/` 前缀）。`workspace.ts` 中已通过 `path.replace(/^\/+/, "")` 处理转换。

2. **错误格式约定：**
   - 预期内的业务错误返回 JSON：`{ "error": "<code>", "message": "<描述>" }`
   - 操作成功返回纯文本字符串（与 FilesystemMiddleware 一致）
   - 未预期的运行时异常由 `tool-executor.ts` 的 try/catch 统一捕获，返回 `{ "error": "tool_execution_failed", ... }`

3. **不引入新依赖：** `glob` 匹配逻辑手写实现（约 30 行），不引入 `minimatch` 等第三方库。

4. **向后兼容：** `read` 和 `write` 的旧名称不再使用。系统中 `system-prompt.ts` 可能引用旧工具名，需要同步将其中提及的工具名更新为 `read_file`、`write_file`、`edit_file`、`glob`。

5. **结果截断与驱逐分工：**
   - **工具内截断**（由各工具自身处理）：`glob`（>500 条）、`grep`（>50 条匹配行）、`read_file`（通过 `limit` 参数）
   - **驱逐**（由 `tool-executor.ts` 统一处理）：针对不在 `TOOLS_EXCLUDED_FROM_EVICTION` 中的工具，当结果超过 80000 字符（≈20000 tokens）时自动写入 OPFS 并用预览替换
   - 两者不冲突：工具内截断优先于驱逐；已被截断的工具仍可能触发驱逐（如截断后仍超限）

6. **驱逐安全边界：**
   - 驱逐写入的 `/large_tool_results/` 目录对 Agent 完全可见（可通过 `ls`、`read_file` 访问），不需要额外权限
   - 驱逐失败（如 OPFS 写入异常）时回退返回原始结果，不会导致工具调用丢失
   - `tool_call_id` 中的特殊字符会被 `sanitize` 处理，避免路径注入

7. **测试：** 实现完成后，建议在 `src/lib/chat/tools/` 下新增 `fs-tools.test.ts`，用 vitest + OPFS mock（`jsdom` 不原生支持 OPFS，需要 mock `navigator.storage.getDirectory`）覆盖核心路径：
   - `read_file` 的 offset/limit 分页
   - `edit_file` 的唯一性校验和替换逻辑
   - `glob` 的 glob 模式匹配
   - `grep` 的三种 output_mode
   - `maybeEvictToolResult` 的阈值判定、预览生成、驱逐写入
