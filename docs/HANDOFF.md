# Handoff: Lumino Agent 重设计 → 实施

## 背景

Lumino 是一个 Chrome 浏览器扩展（Plasmo 框架），Side Panel 中有对话 Agent。当前 Agent 工具只有 4 个只读 tool（`lumino_get_profile`、`lumino_get_daily_memories`、`lumino_get_manifest_version`、`lumino_echo`），没有写入能力。记忆系统只能由后台 scheduler 定时写入，Agent 无法在对话中持久化信息。

## 设计文档

先读完这两份文档再动手：
- `docs/agent-redesign.md` — Agent 架构重设计（system prompt、tool 集、文件系统）
- `docs/memory-agent-tools-design.md` — 记忆系统设计（日记忆、BM25 搜索、类型扩展）

## 实施任务清单

### Phase 1：新建文件（核心骨架）

按以下顺序创建：

```
src/lib/chat/system-prompt.ts       — 3 层 system prompt 组装（static/semi-static/dynamic）
src/lib/chat/tool-executor.ts       — Tool 注册/分发（registerTool + executeToolCall）
src/lib/chat/tool-registry.ts       — 注册所有 10 个 tool handler
src/lib/chat/tool-definitions.ts    — 10 个 tool 的 JSON 定义（给 LLM 的 function list）
src/lib/chat/agent-loop.ts          — Agent turn loop（替代 sidepanel.tsx 中的 runAssistantTurns）
src/lib/chat/tools/memory-tools.ts  — memory_get + memory_search handler
src/lib/chat/tools/fs-tools.ts      — select_directory, ls, read, write, grep, rm handler
src/lib/chat/tools/system-tools.ts  — current_page, tabs handler
src/lib/fs/opfs.ts                  — OPFS 操作（记忆路径 /lumino/memory/）
src/lib/fs/workspace.ts             — FSAA 工作区操作（用户本地目录）
src/lib/memory/tokenizer.ts         — Intl.Segmenter 分词
src/lib/memory/bm25.ts              — BM25 算法
src/lib/memory/search-index.ts      — 搜索索引构建
```

### Phase 2：修改现有文件

| 文件 | 变更内容 |
|------|---------|
| `src/sidepanel.tsx` | 去掉 `DEFAULT_SYSTEM_PROMPT`、`LUMINO_AGENT_TOOLS`、`executeLuminoToolCall`、内联的 `runAssistantTurns`。改为调用 `runAgentLoop()`。初始化时调用 `registerAllTools()`。 |
| `src/lib/chat/agent-tools.ts` | 删除（内容迁移到 tool-definitions.ts + tool-registry.ts + tools/*.ts） |
| `src/lib/db.ts` | 版本号升到 2。新增 store：`insights`（keyPath=`id`，索引 `createdAt`、`category`、`sourceThreadId`）、`profile_updates`（keyPath=`id`，索引 `timestamp`）、`fs_handles`（keyPath=`id`） |
| `src/lib/memory/types.ts` | 新增 `ConversationInsight`、`ManualNote` 类型。`DailyMemoryEntry` 新增 `manualNotes?`、`status?`、`statusReason?`、`lastModifiedBy?`、`lastModifiedAt?` |
| `src/lib/memory/memory-idb.ts` | 新增 `loadInsights()`、`saveInsight()`、`appendManualNote()`、`markMemoryStatus()` |
| `src/lib/memory/daily-memory.ts` | 日记忆输出为 `.md` 文件写入 OPFS `/lumino/memory/`（同时保留 IndexedDB 记录用于搜索索引） |
| `src/lib/memory/user-profile.ts` | 画像存储到 OPFS `/lumino/memory/profile.json`（同时保留 `chrome.storage.local` 用于 scheduler） |
| `src/lib/memory/retriever.ts` | `retrieveContext()` 改用 BM25（不再用 `includes()` 字符串匹配） |

### Phase 3：删除文件

```
src/lib/chat/agent-tools.ts  — 已被 tool-definitions.ts + tools/*.ts 替代
```

## 关键技术点

### 1. System Prompt 组装（prefix cache）

3 条 system 消息，动态内容在尾部：

```
messages[0]: system — STATIC_SYSTEM_PROMPT（核心身份 + 工具使用原则）
messages[1]: system — SEMI_STATIC_SYSTEM_PROMPT（记忆管理指引 + 文件系统指引）
messages[2]: system — buildDynamicSystemBlock()（画像 + 近 2 天记忆摘要 + 当前时间）
messages[3..]: 对话历史
```

`agent-redesign.md` 第 2 节有完整代码。

### 2. Tool 注册模式

```typescript
// tool-definitions.ts — 定义（给 LLM 的 function list）
export const LUMINO_AGENT_TOOLS: OpenAiToolDefinition[] = [...]

// tool-registry.ts — 注册 handler
registerTool("memory_get", handleMemoryGet)

// tool-executor.ts — 分发
export async function executeToolCall(call: OpenAiToolCall): Promise<string> {
  const handler = toolRegistry.get(call.function.name)
  const args = JSON.parse(call.function.arguments || "{}")
  return handler(args)
}
```

### 3. 双路径文件系统

```
记忆路径：OPFS /lumino/memory/      ← memory_get、memory_search（用户无感）
工作区路径：FSAA 用户本地目录         ← select_directory、ls、read、write、grep、rm
```

- `opfs.ts`：`getMemoryPath()` 返回 OPFS 根目录下的 `/lumino/memory/`
- `workspace.ts`：`getWorkspaceHandle()` 从 IndexedDB 恢复或返回 null
- 用户未选工作区时，`ls`/`read`/`write`/`grep`/`rm` 返回 JSON error 提示

### 4. IndexedDB 升级（db.ts 版本号 2）

在 `onupgradeneeded` 中新增：

```typescript
// insights — 对话洞察
if (!db.objectStoreNames.contains("insights")) {
  const is = db.createObjectStore("insights", { keyPath: "id" })
  is.createIndex("createdAt", "createdAt", { unique: false })
  is.createIndex("category", "category", { unique: false })
  is.createIndex("sourceThreadId", "sourceThreadId", { unique: false })
}

// fs_handles — 持久化 FileSystemDirectoryHandle
if (!db.objectStoreNames.contains("fs_handles")) {
  db.createObjectStore("fs_handles", { keyPath: "id" })
}
```

### 5. BM25 搜索（替换 includes()）

`retriever.ts` 当前用 `summary.includes(kw)`，改为：

1. `tokenizer.ts` — `Intl.Segmenter` 分词（中文友好）
2. `bm25.ts` — BM25 计算（k1=1.2, b=0.75）
3. `search-index.ts` — 从 daily_memories + insights 构建索引
4. `retriever.ts` — `retrieveContext()` 调用 BM25 + temporal decay（14 天半衰期）

### 6. Side Panel 精简

`sidepanel.tsx` 的核心变更：

```typescript
// 删除
- import { executeLuminoToolCall, LUMINO_AGENT_TOOLS } from "./lib/chat/agent-tools"
- const DEFAULT_SYSTEM_PROMPT = "..."

// 新增
+ import { runAgentLoop } from "./lib/chat/agent-loop"
+ import { registerAllTools } from "./lib/chat/tool-registry"

// 初始化
+ registerAllTools()

// sendUserMessage 中
- const runAssistantTurns = useCallback(async (...) => { ... })
+ // 改为调用 runAgentLoop()
+ const updated = await runAgentLoop({ settings, threadId, historyMessages, userInput, onMessagesUpdate })
```

## 验证

完成后运行：

```bash
# TypeScript 编译检查
npx tsc --noEmit

# 如果有测试
npx vitest run
```

然后加载扩展到 Chrome 验证：
1. Side Panel 对话能正常发送/接收
2. LLM 能调用 tool（观察 tool call 日志）
3. 记忆搜索能返回结果
4. `select_directory` 能弹出目录选择器
5. `write` 能在本地目录创建文件

## 顺序建议

1. 先读完两份设计文档
2. 从 `tool-definitions.ts` + `tool-executor.ts` + `tool-registry.ts` 开始（不依赖其他模块）
3. 然后 `tools/memory-tools.ts` + `tools/system-tools.ts`（依赖现有 memory 模块）
4. 然后 `system-prompt.ts` + `agent-loop.ts`（依赖 tool 注册）
5. 然后 `sidepanel.tsx` 改造（依赖 agent-loop）
6. 文件系统 `opfs.ts` + `workspace.ts` + `tools/fs-tools.ts`（独立模块，最后做或并行）
7. BM25 `tokenizer.ts` + `bm25.ts` + `search-index.ts` + 改造 `retriever.ts`（独立模块）
8. IndexedDB 升级 + `types.ts` 扩展 + memory 模块改造
