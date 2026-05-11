# Lumino Agent 工具对齐与补齐实现指南

> 目标：将 Lumino 浏览器插件的 Agent 工具 schema 与 `FilesystemMiddleware`（deepagents）对齐，同时补齐缺失的 `edit_file`、`glob`、`append_file` 三个工具。

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
│   ├── tool-executor.ts       ← executeToolCall() 调度
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
| `path` 参数 | 必填，绝对路径 | 可选，默认 `""`（根） | 无，保持现状即可 |
| 返回格式 | 路径列表字符串 | `{ path, entries: string[] }` JSON | **建议对齐**：返回纯文本路径列表，一行一个 |

**改后 schema（tool-definitions.ts）：** 无变化。

**改后实现（fs-tools.ts `handleLs`）：** 将返回从 `JSON.stringify({ path, entries })` 改为路径列表字符串，格式为每行一个路径，目录以 `/` 结尾。

---

### 2.2 `read_file` — 读取文件

| 维度 | FilesystemMiddleware | Lumino 当前 | 需改动 |
|------|---------------------|-------------|--------|
| 工具名 | `read_file` | `read` | **重命名为 `read_file`** |
| `file_path` | ✅（绝对路径） | `path`（相对路径） | **参数名改为 `file_path`**，文档说明改为绝对路径 |
| `offset` | ✅ `0`（0-indexed） | ❌ 缺失 | **新增** |
| `limit` | ✅ `100` | ❌ 缺失 | **新增** |
| 返回格式 | `cat -n` 格式行号 | `{ path, content }` JSON | **对齐为带行号的纯文本** |

**这是最关键的改动。** `offset`/`limit` 对于大文件分页至关重要，避免 agent 上下文溢出。

**改后 schema：**
```typescript
{
  type: "function",
  function: {
    name: "read_file",
    description: "读取工作区中的文件内容。支持分页。",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "相对于工作区根目录的文件路径，必须以 / 开头"
        },
        offset: {
          type: "integer",
          description: "起始行号（0-indexed），与 limit 配合进行分页，默认 0"
        },
        limit: {
          type: "integer",
          description: "最多读取的行数，默认 100"
        }
      },
      required: ["file_path"],
      additionalProperties: false
    }
  }
}
```

**改后实现：**
- 读取完整内容 → `split("\n")` → 按 `offset`/`limit` 切片
- 格式化为 `cat -n` 风格：`{lineNumber:6d}  {content}`
- 空文件返回 `"System reminder: File exists but has empty contents"`
- 超出范围的 offset 返回错误提示

---

### 2.3 `write_file` — 创建/覆写文件

| 维度 | FilesystemMiddleware | Lumino 当前 | 需改动 |
|------|---------------------|-------------|--------|
| 工具名 | `write_file` | `write` | **重命名为 `write_file`** |
| `file_path` | ✅ | `path` | **参数名改为 `file_path`** |
| `content` | ✅ | ✅ | 无 |
| 返回格式 | `"Updated file {path}"` | `{ success, path, message }` JSON | 改为简单文本确认 |

**改动最小**，主要是命名对齐。

---

### 2.4 `edit_file` — 精确字符串替换（**新增**）

FilesystemMiddleware 中存在，Lumino 完全缺失。这是 agent 编辑文件的核心工具。

**Schema：**
```typescript
{
  type: "function",
  function: {
    name: "edit_file",
    description: `在工作区文件中执行精确字符串替换。
- 必须先用 read_file 读取文件后再使用此工具。
- old_string 必须在文件中唯一（除非 replace_all 为 true）。
- 保留原始缩进，不要在 old_string 或 new_string 中包含行号前缀。`,
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "相对于工作区根目录的文件路径，必须以 / 开头"
        },
        old_string: {
          type: "string",
          description: "要被替换的精确文本。必须在文件中唯一，除非 replace_all 为 true。"
        },
        new_string: {
          type: "string",
          description: "用于替换 old_string 的文本。必须与 old_string 不同。"
        },
        replace_all: {
          type: "boolean",
          description: "是否替换所有匹配项。默认 false，此时 old_string 必须唯一。"
        }
      },
      required: ["file_path", "old_string", "new_string"],
      additionalProperties: false
    }
  }
}
```

**实现逻辑（伪代码）：**
```
1. readWorkspaceFile(file_path) → content
2. 如果文件不存在 → 返回 error "not_found"
3. 统计 old_string 在 content 中出现的次数：
   - replace_all=false 且 count > 1 → 返回 error "old_string 不唯一"
   - replace_all=false 且 count = 0 → 返回 error "未找到 old_string"
4. 执行替换：new_content = content.replace(old_string, new_string) 或 replaceAll
5. writeWorkspaceFile(file_path, new_content)
6. 返回 "Successfully replaced N instance(s) in '{file_path}'"
```

---

### 2.5 `glob` — Glob 模式匹配（**新增**）

FilesystemMiddleware 中存在，Lumino 完全缺失。

**Schema：**
```typescript
{
  type: "function",
  function: {
    name: "glob",
    description: "在工作区中查找匹配 glob 模式的文件。支持 *（任意字符）、**（任意目录）、?（单个字符）。示例：**/*.py、*.txt、/subdir/**/*.md",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Glob 模式，例如 **/*.py 查找所有 Python 文件"
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

**实现逻辑（伪代码）：**
```
1. 解析 pattern 中的字面量前缀（如 **/*.py → 直接递归全工作区）
2. 递归遍历 OPFS 目录树，收集所有文件路径
3. 对每个路径执行 glob 匹配：
   - *  匹配单层路径中的任意字符（不含 /）
   - ** 匹配任意层路径
   - ?  匹配单个字符（不含 /）
4. 返回匹配的路径列表，一行一个
5. 结果过长时截断并附提示
```

**注意：** 不建议引入 npm 依赖（如 `minimatch`）。200 行以内的手写 glob 足够覆盖 agent 使用场景。

---

### 2.6 `grep` — 文本搜索（对齐）

| 维度 | FilesystemMiddleware | Lumino 当前 | 需改动 |
|------|---------------------|-------------|--------|
| 工具名 | `grep` | `grep` | 无 |
| `pattern` | ✅ 字面量字符串 | 正则表达式 | **对齐为字面量**（更安全，agent 不会写坏正则） |
| `path` | ✅ | ✅ | 无 |
| `glob` | ✅ | ❌ | **新增**（搜索前按 glob 过滤文件） |
| `output_mode` | ✅ `files_with_matches` / `content` / `count` | ❌ 仅返回匹配内容 | **新增**：支持三种输出模式 |

**改后 schema：**
```typescript
{
  type: "function",
  function: {
    name: "grep",
    description: "在工作区文件中搜索文本（字面量匹配，非正则）。",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "要搜索的文本字面量"
        },
        path: {
          type: "string",
          description: "搜索目录，默认整个工作区"
        },
        glob: {
          type: "string",
          description: "按 glob 模式过滤文件，例如 *.py"
        },
        output_mode: {
          type: "string",
          enum: ["files_with_matches", "content", "count"],
          description: "输出格式：files_with_matches（仅文件路径）、content（匹配行）、count（匹配计数）"
        }
      },
      required: ["pattern"],
      additionalProperties: false
    }
  }
}
```

**实现要点：**
- `pattern` 改为字面量搜索：`line.includes(pattern)` 替代 `new RegExp(pattern)`
- `glob` 参数：先用 glob 匹配过滤文件列表，再对过滤后的文件执行搜索
- `output_mode="files_with_matches"`：去重文件路径列表
- `output_mode="content"`：`{file}:{line}: {content}` 格式
- `output_mode="count"`：`{file}: {count}` 格式

---

### 2.7 `append_file` — 追加内容（**新增**）

FilesystemMiddleware 中存在，Lumino 完全缺失。

**Schema：**
```typescript
{
  type: "function",
  function: {
    name: "append_file",
    description: "向工作区文件追加内容。如果文件不存在则创建。",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "相对于工作区根目录的文件路径，必须以 / 开头"
        },
        content: {
          type: "string",
          description: "要追加的文本内容"
        }
      },
      required: ["file_path", "content"],
      additionalProperties: false
    }
  }
}
```

**实现逻辑（伪代码）：**
```
1. 尝试 readWorkspaceFile(file_path)
2. 如果文件存在 → new_content = existing_content + content
   如果不存在 → new_content = content
3. writeWorkspaceFile(file_path, new_content)
4. 返回 "Appended content to {file_path}"
```

---

### 2.8 `execute` — 沙箱执行

**不可实现。** 浏览器扩展无法执行任意 shell 命令。不添加此工具。

---

## 3. Lumino 独有工具（保留不变）

| 工具 | 说明 | 改动 |
|------|------|------|
| `rm` | 删除文件 | 无，FilesystemMiddleware 无此工具但 Lumino 保留 |
| `export` | 下载到本地 | 无，Lumino 独有 |
| `memory_get` | 读取日记忆 | 无 |
| `memory_search` | 搜索记忆 | 无 |
| `current_page` | 当前标签页信息 | 无 |
| `tabs` | 列出所有标签页 | 无 |

---

## 4. 实施步骤（按顺序）

### Step 1：对齐 `read` → `read_file`（含 offset/limit）

**改 `tool-definitions.ts`：** 将 `read` 的 schema 替换为上文 2.2 的 `read_file`。

**改 `fs-tools.ts`：**
- 重命名 `handleRead` → `handleReadFile`
- 新增 `offset`/`limit` 参数解析
- 格式化输出为 `cat -n` 风格

```typescript
export async function handleReadFile(args: Record<string, unknown>): Promise<string> {
  const path = args.file_path as string
  const offset = (args.offset as number) || 0
  const limit = (args.limit as number) || 100

  const content = await readWorkspaceFile(path)
  if (content === null) {
    return JSON.stringify({ error: "not_found", message: `文件不存在：${path}` })
  }
  if (content.length === 0) {
    return "System reminder: File exists but has empty contents"
  }

  const lines = content.split("\n")
  const sliced = lines.slice(offset, offset + limit)
  const numbered = sliced.map((line, i) => {
    const lineNum = String(offset + i + 1).padStart(6, " ")
    return `${lineNum}  ${line}`
  })

  let result = numbered.join("\n")
  if (offset + limit < lines.length) {
    result += `\n\n[Truncated: ${lines.length - offset - limit} more lines not shown. Use offset=${offset + limit} to continue.]`
  }
  return result
}
```

**改 `tool-registry.ts`：**
```typescript
registerTool("read_file", handleReadFile)  // 替换原来的 registerTool("read", handleRead)
```

---

### Step 2：对齐 `write` → `write_file`

**改 `tool-definitions.ts`：** 参数 `path` → `file_path`，工具名改为 `write_file`。

**改 `fs-tools.ts`：** `handleWrite` 中 `args.path` → `args.file_path`，返回从 JSON 改为纯文本。

**改 `tool-registry.ts`：** `registerTool("write_file", handleWrite)`。

---

### Step 3：实现 `edit_file`（新增）

**在 `fs-tools.ts` 中新增：**

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
    return JSON.stringify({ error: "not_found", message: `未找到 old_string：${oldString.slice(0, 100)}` })
  }
  if (!replaceAll && occurrences > 1) {
    return JSON.stringify({
      error: "not_unique",
      message: `old_string 出现了 ${occurrences} 次，不唯一。请提供更多上下文使其唯一，或设置 replace_all=true。`
    })
  }

  const newContent = replaceAll ? content.replaceAll(oldString, newString) : content.replace(oldString, newString)
  await writeWorkspaceFile(filePath, newContent)

  return `Successfully replaced ${replaceAll ? occurrences : 1} instance(s) in '${filePath}'`
}
```

**在 `tool-registry.ts` 中注册：**
```typescript
registerTool("edit_file", handleEditFile)
```

---

### Step 4：实现 `glob`（新增）

**在 `fs-tools.ts` 中新增：**

```typescript
function matchGlob(pattern: string, filePath: string): boolean {
  // 将 glob pattern 转为正则：
  // ** → 匹配任意字符（包括 /）
  // *  → 匹配除 / 外的任意字符
  // ?  → 匹配单个非 / 字符
  let regexStr = ""
  let i = 0
  while (i < pattern.length) {
    if (pattern[i] === "*" && pattern[i + 1] === "*") {
      regexStr += ".*"
      i += 2
      // 跳过后续的 /
      if (pattern[i] === "/") { regexStr += "/"; i++ }
    } else if (pattern[i] === "*") {
      regexStr += "[^/]*"
      i++
    } else if (pattern[i] === "?") {
      regexStr += "[^/]"
      i++
    } else {
      // 转义特殊正则字符
      const c = pattern[i]
      if (".+^${}()|[]\\".includes(c)) {
        regexStr += "\\" + c
      } else {
        regexStr += c
      }
      i++
    }
  }
  return new RegExp(`^${regexStr}$`).test(filePath)
}

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
  const matches = allFiles
    .map((f) => "/" + f)
    .filter((f) => {
      if (basePath !== "/" && !f.startsWith(basePath)) return false
      return matchGlob(pattern, basePath === "/" ? f : f.slice(basePath.length))
    })

  if (matches.length > 500) {
    return matches.slice(0, 500).join("\n") + `\n\n[... and ${matches.length - 500} more matches truncated]`
  }
  return matches.join("\n") || "(no matches)"
}
```

**在 `tool-registry.ts` 中注册：**
```typescript
registerTool("glob", handleGlob)
```

---

### Step 5：实现 `append_file`（新增）

**在 `fs-tools.ts` 中新增：**

```typescript
export async function handleAppendFile(args: Record<string, unknown>): Promise<string> {
  const filePath = args.file_path as string
  const newContent = args.content as string

  const existing = await readWorkspaceFile(filePath)
  const finalContent = existing !== null ? existing + newContent : newContent
  await writeWorkspaceFile(filePath, finalContent)

  return `Appended content to ${filePath}`
}
```

**在 `tool-registry.ts` 中注册：**
```typescript
registerTool("append_file", handleAppendFile)
```

---

### Step 6：对齐 `grep` — 字面量搜索 + output_mode + glob 过滤

**改 `fs-tools.ts` 中 `handleGrep`：**
- `pattern` 从正则改为字面量（`line.includes(pattern)`）
- 新增 `output_mode` 参数，支持 `files_with_matches` / `content` / `count`
- 新增 `glob` 参数，先按 glob 过滤文件再搜索

参考实现要点见上文 2.6。

---

### Step 7：统一 `ls` 返回格式

**改 `fs-tools.ts` 中 `handleLs`：** 返回纯文本路径列表而非 JSON。

```typescript
export async function handleLs(args: Record<string, unknown>): Promise<string> {
  const root = await getWorkspaceHandle()
  const path = (args.path as string) || ""
  const entries = await listWorkspaceDir(path)
  if (entries.length === 0) return "(empty directory)"
  return entries.map((e) => e.name + (e.kind === "directory" ? "/" : "")).join("\n")
}
```

---

### Step 8：更新 `tool-definitions.ts` 中的工具列表

添加 `edit_file`、`glob`、`append_file` 的 schema，更新 `read`→`read_file`、`write`→`write_file` 的 schema。

---

### Step 9：重新生成 `tool-registry.ts` 注册

统一在 `registerAllTools()` 中注册所有工具。

---

## 5. 最终工具清单

| 工具名 | 分类 | 状态 |
|--------|------|------|
| `ls` | 文件系统 | 对齐返回格式 |
| `read_file` | 文件系统 | **重命名 + 新增 offset/limit** |
| `write_file` | 文件系统 | **重命名 + 参数名对齐** |
| `edit_file` | 文件系统 | **新增** |
| `glob` | 文件系统 | **新增** |
| `grep` | 文件系统 | 对齐字面量 + output_mode + glob |
| `append_file` | 文件系统 | **新增** |
| `rm` | 文件系统（Lumino 独有） | 无变化 |
| `export` | 文件系统（Lumino 独有） | 无变化 |
| `memory_get` | 记忆系统 | 无变化 |
| `memory_search` | 记忆系统 | 无变化 |
| `current_page` | 浏览器系统 | 无变化 |
| `tabs` | 浏览器系统 | 无变化 |

**不可实现：** `execute`（浏览器沙箱限制）

---

## 6. 注意事项

1. **路径规范：** 所有文件系统工具的路径参数统一以 `/` 开头表示工作区根目录的相对路径（与 OPFS 实际路径不同，OPFS 内路径不含 `/` 前缀）。在 `workspace.ts` 中已通过 `path.replace(/^\/+/, "")` 处理。

2. **错误处理：** 所有工具返回统一的错误 JSON 格式 `{ error: string, message: string }`，或纯文本成功确认。

3. **不引入新依赖：** `glob` 匹配手写实现，不引入 `minimatch`。

4. **向后兼容：** `read` 和 `write` 的旧名称不再使用。系统中 `system-prompt.ts` 可能引用旧工具名，需要同步更新。

5. **测试：** 实现完成后，建议在 `fs-tools.ts` 同目录下新增 `fs-tools.test.ts`，用 vitest + OPFS mock 覆盖核心路径。
