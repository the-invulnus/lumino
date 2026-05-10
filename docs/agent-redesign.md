# Design: Lumino 对话 Agent 重设计

聚焦三个维度：
1. **System Prompt 动态组装** — prefix cache 友好的模块加载顺序
2. **Agent Tool 集设计** — 10 个 tool（记忆 2 + 文件 6 + 浏览器 2）
3. **双路径文件系统** — 记忆目录（OPFS 固定路径）+ 工作区（用户本地目录）

---

## 1. 当前 Agent 架构回顾

### 1.1 调用链路

```
sidepanel.tsx
  ├── DEFAULT_SYSTEM_PROMPT (硬编码静态字符串)
  ├── messages[] (system + user + assistant + tool)
  ├── LUMINO_AGENT_TOOLS (4 个 tool，全部只读)
  │     ├── lumino_get_manifest_version
  │     ├── lumino_echo
  │     ├── lumino_get_profile
  │     └── lumino_get_daily_memories
  └── runAssistantTurns()
        ├── requestChatCompletionTurn(settings, { messages, tools })
        ├── 收到 tool_calls → executeLuminoToolCall(call)
        └── while (tool_calls 存在 && rounds < 8)
```

### 1.2 问题

| 问题 | 影响 |
|------|------|
| System prompt 是单条写死的字符串 | 记忆/画像/上下文无法动态注入 |
| 动态内容混在 prompt 头部 | 破坏 prefix cache |
| 只有 4 个只读 tool | Agent 无法持久化任何信息 |
| 无文件系统 tool | Agent 不能帮用户生成文件 |
| tool 和 prompt 耦合在 sidepanel.tsx | 无法独立测试、无法跨场景复用 |

---

## 2. Prefix Cache 与 Prompt 组装

### 2.1 原理

LLM API（OpenAI、Anthropic、DeepSeek 等）对请求消息列表做 **prefix-based caching**：只有从 `messages[0]` 开始的连续匹配前缀才会被缓存。中间某条消息变化，后续全部失效。

### 2.2 组装策略

```
原则：静态 → 半静态 → 动态，动态内容放尾部

messages[0]: system — static  (~500t)  ← 永久 cacheable
messages[1]: system — semi-static (~300t) ← 天/周级 cacheable
messages[2]: system — dynamic  (~300t) ← 每轮重建，volatile
messages[3..N]: 对话历史               ← per-turn
```

| # | 内容 | 变化频率 | 缓存 |
|---|------|---------|------|
| system[0] | 核心身份 + 工具使用原则 | 扩展更新时（周/月级） | >99% |
| system[1] | 记忆管理指引 | 用户改偏好时（月级） | >95% |
| system[2] | 用户画像 + 近 2 天记忆摘要 + 时间 | 每轮 | 0%（volatile） |

### 2.3 实现

```typescript
// src/lib/chat/system-prompt.ts

// === Static Block (一直缓存) ===
const STATIC_SYSTEM_PROMPT = `你是 Lumino，运行在用户浏览器侧栏中的智能助手。

## 核心身份
- 你能读写用户的长期记忆，记忆存储在内部目录中
- 你能在用户指定的工作区目录中创建、读取、搜索文件
- 你能感知用户当前浏览器标签页的状态
- 回答简洁、温暖、中文优先

## 工具使用原则
- 优先使用工具获取实时信息
- 一次调用失败后换参数重试一次
- 不需要告知用户你正在调用工具，静默执行`

// === Semi-static Block (偏好变更时才失效) ===
const SEMI_STATIC_SYSTEM_PROMPT = `## 记忆管理
- 记忆存储在内部固定路径，由系统自动管理
- 使用 memory_get 读取特定日期的记忆
- 使用 memory_search 搜索历史记忆和洞察
- 日记忆由系统定时生成，你可以追加内容
- 用户说"记住"→ 将内容保存到文件或追加到记忆

## 文件系统
- 用户需要先选择一个本地目录作为工作区
- 使用 select_directory 让用户选择工作区目录
- 选择后，你可以用 ls/read/write/grep/rm 操作工作区文件
- 用户说"生成文件""创建项目"→ 在工作区中创建文件
- 用户未选择工作区时，先提示用户授权目录

## 禁止
✖ 密码、银行卡、身份证等敏感信息不要写入记忆或文件
✖ 低置信度推断先对话确认，不要自动写入
✖ 同一轮对话不要重复写入相同内容`

// === Dynamic Block (每轮重建) ===
export async function buildDynamicSystemBlock(): Promise<string> {
  const profile = await loadUserProfile()
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  const allMemories = await loadDailyMemories()
  const recentMemories = allMemories
    .filter(m => m.date === today || m.date === yesterday)
    .sort((a, b) => b.createdAt - a.createdAt)

  const lines: string[] = []

  // 画像
  lines.push("## 用户画像")
  if (profile.name) lines.push(`- 名称：${profile.name}`)
  lines.push(`- 语言：${profile.language === "zh" ? "中文" : "English"}`)
  if (profile.interests.length > 0) lines.push(`- 关注：${profile.interests.join("、")}`)
  if (profile.notes) lines.push(`- 备注：${profile.notes}`)
  if (profile.frequentSites.length > 0) {
    lines.push(`- 常用站点：${profile.frequentSites.slice(0, 5).join(", ")}`)
  }

  // 近期记忆
  lines.push("\n## 近期记忆摘要")
  if (recentMemories.length > 0) {
    for (const m of recentMemories) {
      lines.push(`- [${m.date}] ${m.summary}`)
    }
  } else {
    lines.push("（暂无近期记忆）")
  }

  // 时间
  lines.push(`\n## 当前时间\n- ${today}`)

  return lines.join("\n")
}
```

---

## 3. Agent Tool 集（10 个）

### 3.1 全景

```
┌──────────────────────────────────────────────┐
│                 Agent Tools (10)              │
│                                               │
│  ┌──────────┐  ┌──────────────┐  ┌─────────┐ │
│  │ 记忆 (2)  │  │ 文件系统 (6)  │  │ 浏览器(2)│ │
│  └──────────┘  └──────────────┘  └─────────┘ │
│                                               │
│  memory_get     select_directory   current_page│
│  memory_search  ls                 tabs       │
│                 read                          │
│                 write                         │
│                 grep                          │
│                 rm                            │
└──────────────────────────────────────────────┘
```

### 3.2 记忆工具（2 个）

操作路径：OPFS 内固定目录 `/lumino/memory/`。用户无需感知。

**`memory_get`**

```
name: memory_get
description: >
  读取指定日期的记忆文件。用户询问特定日期的浏览记录、
  历史行为时使用。也用于读取 Agent 或 Scheduler 之前写入的记忆内容。
parameters:
  date:
    type: string
    description: "日期，格式 YYYY-MM-DD，如 '2026-05-10'"
  includeRaw:
    type: boolean
    description: "是否同时返回当天的原始浏览事件列表，默认 false"
```

返回示例：
```json
{
  "date": "2026-05-10",
  "summary": "今天主要浏览了 React 19 文档和 Tailwind CSS v4 发布说明...",
  "keywords": ["React", "Tailwind CSS", "前端"],
  "rawEventCount": 47,
  "rawEvents": null
}
```

**`memory_search`**

```
name: memory_search
description: >
  搜索历史记忆和对话洞察。使用 BM25 算法在索引中匹配。
  用户问「我之前看过什么」「有没有关于 X 的记忆」时使用。
  比 grep 更快（走 IndexedDB 索引而非遍历文件）。
parameters:
  query:
    type: string
    description: "搜索关键词或自然语言查询"
  days:
    type: number
    description: "搜索最近多少天，默认 30"
  limit:
    type: number
    description: "返回条目数上限，默认 10，最大 20"
```

返回示例：
```json
[
  {
    "date": "2026-05-09",
    "score": 12.5,
    "summary": "研究了 React Server Components 的实现...",
    "matchType": "keyword_match"
  },
  {
    "date": "2026-05-03",
    "score": 8.2,
    "summary": "浏览了 TypeScript 5.5 新特性...",
    "matchType": "semantic"
  }
]
```

### 3.3 文件系统工具（6 个）

操作路径：用户通过 `select_directory` 选择的本地目录。

**`select_directory`**

```
name: select_directory
description: >
  弹出系统目录选择器，让用户为 Agent 选择一个本地工作区目录。
  选择后 Agent 可以在该目录中创建、读取、搜索、删除文件。
  用户可以在 Finder/资源管理器中直接查看和编辑这些文件。
  初次使用文件功能或需要切换目录时调用。
parameters: {}
```

**`ls`**

```
name: ls
description: 列出工作区指定目录下的文件和子目录。
parameters:
  path:
    type: string
    description: "相对路径，空字符串或 '/' 表示工作区根目录"
```

返回：
```json
[
  { "name": "notes", "type": "directory" },
  { "name": "README.md", "type": "file" },
  { "name": "config.json", "type": "file" }
]
```

**`read`**

```
name: read
description: 读取工作区文件的完整内容。
parameters:
  path:
    type: string
    description: "相对文件路径，如 'notes/meeting.md'"
```

**`write`**

```
name: write
description: >
  在工作区写入或创建文件。覆盖模式替换整个文件，追加模式在末尾添加内容。
  自动创建不存在的中间目录。用户说「保存」「生成」「创建文件」时使用。
parameters:
  path:
    type: string
    description: "相对文件路径"
  content:
    type: string
    description: "文件内容"
  mode:
    type: string
    enum: ["overwrite", "append"]
    description: "写入模式。overwrite 替换整个文件，append 追加到末尾。默认 overwrite。"
```

**`grep`**

```
name: grep
description: 在工作区内搜索包含指定关键词的文件。
parameters:
  query:
    type: string
    description: "搜索关键词"
  glob:
    type: string
    description: "文件名匹配模式，如 '*.md' 或 '**/*.ts'。默认 '*'"
  maxResults:
    type: number
    description: "最大返回数，默认 20"
```

返回：
```json
[
  { "path": "notes/meeting.md", "snippet": "...讨论了 React 19 的升级计划..." },
  { "path": "todo.md", "snippet": "- [ ] 升级 React 到 19..." }
]
```

**`rm`**

```
name: rm
description: 删除工作区中的文件或空目录。不可逆操作。使用前应向用户确认。
parameters:
  path:
    type: string
    description: "要删除的文件或空目录路径"
```

### 3.4 浏览器工具（2 个）

**`current_page`**

```
name: current_page
description: 获取用户当前正在浏览的标签页信息。Agent 需要了解用户在看什么时使用。
parameters:
  includeContent:
    type: boolean
    description: "是否包含页面文本摘要（前 3000 字符），默认 false"
```

**`tabs`**

```
name: tabs
description: 获取当前窗口所有打开的标签页列表。
parameters:
  query:
    type: string
    description: "过滤标题或 URL 的关键词，可选"
```

---

## 4. 双路径文件系统

### 4.1 架构

```
┌────────────────────────────────────────────────────┐
│                   Agent Tool Layer                  │
│                                                     │
│  memory_get ──────────┐    select_directory         │
│  memory_search        │    ls/read/write/grep/rm    │
│            │          │         │                   │
└────────────┼──────────┼─────────┼───────────────────┘
             │          │         │
    ┌────────▼──┐  ┌───▼─────────▼────┐
    │ 记忆路径   │  │   工作区路径      │
    │ OPFS      │  │   FSAA (本地)    │
    │ /lumino/  │  │   用户选择的目录  │
    │ memory/   │  │                 │
    └───────────┘  └─────────────────┘
```

### 4.2 记忆路径（OPFS，固定，用户无感）

```
/lumino/memory/
├── profile.json             ← 用户画像（结构化，自动注入 system prompt）
├── 2026-05-08.md            ← 日记忆（scheduler 自动生成）
├── 2026-05-09.md
├── 2026-05-10.md
├── insights/
│   ├── typescript-pref.md   ← Agent 写入的洞察
│   └── project-deadline.md
└── index/                   ← BM25 搜索索引
    └── ...
```

- 路径固定，Agent 通过 `memory_get` / `memory_search` 访问
- 后台 scheduler 定时生成日记忆 `.md` 文件
- Agent 通过系统内部方法追加内容到日记忆（不是通过 `write` tool）
- 用户不需要也不应该手动操作这个目录

### 4.3 工作区路径（FSAA，用户本地目录）

```
~/Documents/lumino-workspace/    ← 用户通过 select_directory 选择
├── notes/
│   └── meeting-2026-05-10.md    ← Agent 用 write 创建
├── src/
│   └── app.ts                   ← Agent 生成的代码
├── README.md
└── todo.md
```

- 用户通过 `select_directory` tool 授权
- Agent 通过 `ls` / `read` / `write` / `grep` / `rm` 操作
- 用户可以在 Finder/资源管理器中直接打开和编辑
- 权限通过 IndexedDB 持久化（下次打开侧栏自动恢复）

### 4.4 无工作区时的 fallback

用户未选择工作区时，`ls` / `read` / `write` / `grep` / `rm` 返回错误提示：
```
"未选择工作区。请先使用 select_directory 工具选择一个本地目录。"
```

Agent 的 system prompt 中已包含此指引，Agent 会主动提示用户选择目录。

---

## 5. Agent Loop 重构

### 5.1 独立的 loop 模块

```typescript
// src/lib/chat/agent-loop.ts

import { buildAgentMessages } from "./system-prompt"
import { executeToolCall } from "./tool-executor"
import { LUMINO_AGENT_TOOLS } from "./tool-definitions"
import type { OpenAiChatMessage } from "./openai-messages"
import type { LlmSettings } from "../llm/types"
import { requestChatCompletionTurn } from "../llm/openai"

const MAX_TOOL_ROUNDS = 10

export type AgentLoopOptions = {
  settings: LlmSettings
  threadId: string
  historyMessages: OpenAiChatMessage[]
  userInput: string
  onMessagesUpdate: (messages: OpenAiChatMessage[]) => Promise<void>
  signal?: AbortSignal
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<OpenAiChatMessage[]> {
  const { settings, historyMessages, userInput, onMessagesUpdate, signal } = options

  // 1. 组装 system prompt（prefix-cache 友好）
  const messages = await buildAgentMessages(historyMessages, userInput)
  let rounds = 0

  while (rounds < MAX_TOOL_ROUNDS) {
    if (signal?.aborted) throw new Error("aborted")

    rounds += 1

    // 2. 调用 LLM
    const { message: assistant, finishReason } = await requestChatCompletionTurn(settings, {
      messages,
      tools: LUMINO_AGENT_TOOLS
    })

    messages.push({
      role: "assistant",
      content: assistant.content,
      tool_calls: assistant.tool_calls
    })
    await onMessagesUpdate(messages)

    // 3. 检查是否需要继续
    if (!assistant.tool_calls?.length || finishReason === "stop") break

    // 4. 顺序执行 tool calls
    for (const call of assistant.tool_calls) {
      if (signal?.aborted) throw new Error("aborted")

      const content = await executeToolCall(call)
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content
      })
      await onMessagesUpdate(messages)
    }
  }

  return messages
}
```

### 5.2 Tool 注册

```typescript
// src/lib/chat/tool-registry.ts

import { registerTool } from "./tool-executor"
import { handleMemoryGet, handleMemorySearch } from "./tools/memory-tools"
import { handleSelectDirectory, handleLs, handleRead, handleWrite, handleGrep, handleRm } from "./tools/fs-tools"
import { handleCurrentPage, handleTabs } from "./tools/system-tools"

export function registerAllTools(): void {
  // 记忆
  registerTool("memory_get", handleMemoryGet)
  registerTool("memory_search", handleMemorySearch)

  // 文件系统
  registerTool("select_directory", handleSelectDirectory)
  registerTool("ls", handleLs)
  registerTool("read", handleRead)
  registerTool("write", handleWrite)
  registerTool("grep", handleGrep)
  registerTool("rm", handleRm)

  // 浏览器
  registerTool("current_page", handleCurrentPage)
  registerTool("tabs", handleTabs)
}
```

### 5.3 sidepanel.tsx 变更

```typescript
// 核心变更：
// 1. 使用 buildAgentMessages() 组装 prompt（不再用 DEFAULT_SYSTEM_PROMPT）
// 2. 使用 runAgentLoop() 替代内联的 runAssistantTurns
// 3. 初始化时注册所有工具

import { runAgentLoop } from "./lib/chat/agent-loop"
import { registerAllTools } from "./lib/chat/tool-registry"

registerAllTools()

async function sendUserMessage() {
  const trimmed = draft.trim()
  const threadId = activeThreadIdRef.current
  if (!trimmed || !threadId) return
  if (!hasCompleteLlmSettings(settings)) {
    setError("请先配置 LLM。")
    return
  }

  setDraft("")
  setIsLoading(true)
  setError("")

  try {
    const history = cloneMessages(messages)
    const updated = await runAgentLoop({
      settings,
      threadId,
      historyMessages: history,
      userInput: trimmed,
      onMessagesUpdate: async (msgs) => {
        setMessages(cloneMessages(msgs))
        await persistMessages(threadId, msgs)
      }
    })
    setMessages(cloneMessages(updated))
    await persistMessages(threadId, updated)
  } catch (e) {
    setError(e instanceof Error ? e.message : "请求失败")
  } finally {
    setIsLoading(false)
  }
}
```

---

## 6. 用户画像的存储与注入

画像不在工具集中暴露 `get` / `set`。而是：

- **存储**：`/lumino/memory/profile.json`（OPFS 内，后台 scheduler 定期更新）
- **注入**：每次对话的 system[2]（dynamic block）中自动包含当前画像
- **更新**：Agent 需要修改画像时，通过内部方法 `updateUserProfile()` 写入（不是 tool）
  - 触发方式：Agent 在 system prompt 中被指示"当用户声明偏好时，调用内部方法更新画像"
  - 简化方案：Agent 通过 `memory_get` 的副作用更新——当日记忆文件中追加画像变更记录，scheduler 下次运行时合并

**推荐方案**：画像更新也走记忆文件。Agent 追加一条笔记到当日记忆：`"用户偏好：TypeScript，React，pnpm"`。Scheduler 在每日凌晨汇总时自动更新 `profile.json`。这样 Agent 完全不需要专门的画像写入 tool。

---

## 7. 文件结构变更

```
src/lib/
├── db.ts                          # [MODIFIED] + fs_handles store
├── settings.ts                    # [UNCHANGED]
├── llm/
│   ├── openai.ts                  # [UNCHANGED]
│   └── types.ts                   # [UNCHANGED]
├── chat/
│   ├── openai-messages.ts         # [UNCHANGED]
│   ├── thread-idb.ts              # [UNCHANGED]
│   ├── active-thread-storage.ts   # [UNCHANGED]
│   ├── system-prompt.ts           # [NEW] 3 层 system prompt 组装
│   ├── agent-loop.ts              # [NEW] Agent turn loop
│   ├── tool-executor.ts           # [NEW] Tool 注册/分发
│   ├── tool-registry.ts           # [NEW] 所有 tool handler 注册
│   ├── tool-definitions.ts        # [NEW] Tool JSON 定义（10 个）
│   └── tools/
│       ├── memory-tools.ts        # [NEW] memory_get, memory_search
│       ├── fs-tools.ts            # [NEW] select_directory, ls, read, write, grep, rm
│       └── system-tools.ts        # [NEW] current_page, tabs
├── fs/
│   ├── opfs.ts                    # [NEW] 记忆路径 OPFS 操作
│   └── workspace.ts               # [NEW] 工作区 FSAA 操作
├── memory/                        # [MOSTLY UNCHANGED]
│   ├── types.ts                   # [MODIFIED] DailyMemoryEntry 扩展
│   ├── memory-idb.ts              # [MODIFIED] + insights store
│   ├── event-collector.ts         # [UNCHANGED]
│   ├── event-store.ts             # [MODIFIED]
│   ├── daily-memory.ts            # [MODIFIED] 输出为 .md 文件到 OPFS
│   ├── user-profile.ts            # [MODIFIED] 存储到 OPFS profile.json
│   ├── retriever.ts               # [REFACTORED] BM25
│   ├── tokenizer.ts               # [NEW] Intl.Segmenter
│   ├── bm25.ts                    # [NEW] BM25
│   ├── search-index.ts            # [NEW] 搜索索引
│   ├── context-builder.ts         # [UNCHANGED]
│   ├── memory-scheduler.ts        # [UNCHANGED]
│   └── privacy-filter.ts          # [UNCHANGED]
└── completion/                    # [UNCHANGED]
```

---

## 8. 总结

| 维度 | 当前 | 改造后 |
|------|------|--------|
| System Prompt | 1 条硬编码字符串 | 3 条分层（static/semi-static/dynamic），prefix cache 友好 |
| Tool 数量 | 4 个 | **10 个**（记忆 2 + 文件 6 + 浏览器 2） |
| Tool 命名 | `lumino_get_profile` 等 | Unix 风格：`ls`, `read`, `write`, `grep`, `rm` |
| 记忆路径 | IndexedDB | OPFS 固定目录 `/lumino/memory/` |
| 工作区路径 | 无 | 用户通过 `select_directory` 选择本地目录 |
| 用户画像 | 通过 tool 获取 | 自动注入 system[2]，无需 tool |
| Agent Loop | 内联在 sidepanel.tsx | 独立 `agent-loop.ts` + 模块化 tool 注册 |
