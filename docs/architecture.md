# Lumino 架构文档

## 项目概述

Lumino 是一款基于 Plasmo 框架构建的 Chrome 浏览器扩展，定位为「陪伴型 AI 助手」。用户通过 Side Panel 与 AI 对话，AI 通过 Agent 框架（Vercel AI SDK v6）自主调度内置工具系统，可读取网页内容、操作 DOM、管理文件、存取 Obsidian 笔记。配备完整的三层记忆系统和 OPFS 文件系统工作区。

（文档更新有滞后性，如果发现代码实现与本文档说明不符，一律以代码实现为准。）

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | [Plasmo](https://docs.plasmo.com/) 0.90.5 |
| UI | React 18 + TypeScript 5.3 |
| Agent 框架 | [Vercel AI SDK v6](https://sdk.vercel.ai/) (`ai@6.0.190`) |
| LLM Provider | `@ai-sdk/openai@3.0.65`（OpenAI 兼容协议） |
| Schema 校验 | zod@4.4.3（AI SDK tool() inputSchema 使用） |
| 样式 | 纯 CSS 三层架构 + 多主题切换（tokens / layout / components） |
| 包管理 | pnpm |
| 测试 | Vitest + jsdom |
| 存储 | Chrome Storage API + IndexedDB + OPFS |

## 运行模式

Chrome Extension Manifest V3，**Service Worker + Side Panel + Content Script**：

| 入口 | 文件 | 说明 |
|---|---|---|
| Service Worker | `src/background.ts` | Agent 执行引擎、消息路由、定时任务（dwell 巡检、驱逐清理） |
| Side Panel | `src/sidepanel.tsx` | 核心交互界面：多会话聊天、LLM 对话 |
| Options Page | `src/options.tsx` | LLM 配置 + Obsidian 集成配置 + 采集开关 |
| Content Script | `src/contents/lumino-floating-button.ts` | `<all_urls>` 注入悬浮按钮，点击唤起侧栏 |
| Content Script（辅助） | `src/content/floating-button.ts` | 浮动按钮 DOM 创建/挂载逻辑 |
| Content Script（已禁用） | `src/contents/lumino-input-watcher.ts` | 输入监听 & AI 自动补全 |

## Agent 架构（核心）

### 整体数据流

```
┌──────────────┐     chrome.runtime.sendMessage      ┌─────────────────┐
│  Side Panel  │ ──────────────────────────────────→ │  Service Worker │
│  (React)     │                                      │  (background.ts)│
│              │ ←── AGENT_PROGRESS (每步推送) ───── │                 │
│              │ ←── AGENT_COMPLETE (最终结果) ───── │                 │
│              │ ←── AGENT_ERROR   (错误) ────────── │                 │
└──────────────┘                                      └────────┬────────┘
                                                               │
                                                    runAgentLoop()
                                                               │
                                                    ┌──────────▼──────────┐
                                                    │   agent-loop.ts     │
                                                    │  AI SDK generateText│
                                                    │  + onStepFinish     │
                                                    └──────────┬──────────┘
                                                               │
                                                    ┌──────────▼──────────┐
                                                    │  tool-definitions.ts│
                                                    │  tool() + zod v4    │
                                                    │  ↓ execute 调用     │
                                                    │  tool-executor.ts   │
                                                    │  ↓ handler 路由     │
                                                    │  tools/*.ts         │
                                                    └─────────────────────┘
```

### Agent 循环 (agent-loop.ts)

使用 AI SDK v6 的 `generateText()` 替代手写 `while(true)` 循环：

- **模型调用**：`openai.chat(model)` — 强制使用 Chat Completions API（非 Responses API）
- **工具集成**：`tools` 参数传入 AI SDK `ToolSet`，由 SDK 自动管理 tool call → tool result 的循环
- **最大步数**：`stopWhen: stepCountIs(15)`
- **每步回调**：`onStepFinish` 中调用 `appendStepMessages()` 将当前步骤的 assistant 消息 + tool results 追加到累积数组，然后通过 `onMessagesUpdate` 回调推送给 background.ts
- **消息格式转换**：`openAiToModelMessages()` 将 IndexedDB 中存储的 `OpenAiChatMessage[]` 转为 AI SDK 要求的 `ModelMessage[]`

关键类型转换：
```
OpenAiChatMessage[]  ──openAiToModelMessages()──→  ModelMessage[]
    ↑                                                      │
    │                              generateText({ messages, tools, onStepFinish })
    │                                                      │
    └────────── appendStepMessages() ←─────────────────────┘
                    (累积完整消息)
```

### 工具定义 (tool-definitions.ts)

使用 AI SDK 的 `tool()` + Zod v4 schema 定义所有工具：

```ts
const tool = luminoTool({
  name: "memory_get",
  description: "读取指定日期的日记忆全文...",
  inputSchema: z.z.object({
    date: z.z.string().describe("日期，格式 YYYY-MM-DD...").optional()
  })
})
```

- `luminoTool()` 内部包装 AI SDK `tool()`，`execute` 直接调用 `getToolHandler(name)` 从 `tool-executor.ts` 注册表获取 handler
- Zod v4 兼容性：使用 `import * as z from "zod"` + `z.z.string()` 模式（Plasmo/Parcel CJS 打包要求）
- 工具列表分 `BASE_TOOLS`（21个基础工具）+ `OBSIDIAN_TOOLS`（7个 Obsidian 工具），根据配置动态合并

### 工具注册与执行 (tool-executor.ts)

- **注册表**：`Map<string, ToolHandler>` 全局单例
- **注册入口**：`tool-registry.ts` 的 `registerAllTools()` 在 Service Worker 和 Side Panel 启动时各调用一次
- **执行流程**：`executeToolCall(call, signal)` → handler → `maybeEvictToolResult()`（大结果驱逐）
- **对外接口**：`getToolHandler(name)` 供 tool-definitions.ts 使用

### 工具清单（28个）

| 分类 | 工具名 | 文件 |
|------|--------|------|
| 记忆 | `memory_get`, `memory_search` | `tools/memory-tools.ts` |
| 文件系统 | `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`, `rm`, `export` | `tools/fs-tools.ts` |
| 浏览器系统 | `current_page`, `tabs`, `get_active_tab_id` | `tools/system-tools.ts` |
| 浏览器交互 | `get_page_content`, `take_selection`, `inspect_element`, `fill_form`, `click_element`, `screenshot`, `scroll`, `press_key`, `navigate` | `tools/browser-tools.ts` |
| Obsidian | `obsidian_list`, `obsidian_read`, `obsidian_write`, `obsidian_append`, `obsidian_patch`, `obsidian_search`, `obsidian_open` | `tools/obsidian-tools.ts` |

### Side Panel ↔ Service Worker 通信

通信协议定义在 `src/lib/side-panel-bridge.ts`：

| 消息类型 | 方向 | 说明 |
|----------|------|------|
| `START_AGENT_MESSAGE` | SP → SW | 发起 agent 执行，携带 threadId + historyMessages + userInput |
| `STOP_AGENT_MESSAGE` | SP → SW | 中止当前 agent |
| `AGENT_PROGRESS_MESSAGE` | SW → SP | 每步 onStepFinish 时推送完整 messages 数组 |
| `AGENT_COMPLETE_MESSAGE` | SW → SP | agent 正常完成 / 用户中止后推送最终 messages |
| `AGENT_ERROR_MESSAGE` | SW → SP | agent 异常终止，携带错误信息 |

**推送策略**：`onStepFinish` 中每次工具调用完成就推送一次完整消息数组。Side Panel 收到后直接 `setMessages(cloneMessages(msgs))` 全量替换。由于 AI SDK 的 `onStepFinish` 会在每次 tool call → tool result 循环后触发，Side Panel 可以实时看到每步进展。

## 前端 UI 架构

### 消息渲染 (sidepanel.tsx)

**消息合并逻辑**（`mergedMessages` useMemo）：
- 将 `visibleMessages` 中的连续非-user 消息（assistant + tool）合并成一个数组分组
- user 消息保持独立
- 分组后的 item 在渲染时：`Array.isArray(item)` 为 true 时，所有子消息在一个 `lm-chat-row-wrapper` 中连续渲染，共享一组复制/删除按钮
- 单个 user 消息按原有逻辑独立渲染

**组件层级**：
```
lm-chat-scroll
├── lm-chat-row-wrapper--user          ← 用户消息（独立）
│   ├── ChatMessageBlock → lm-chat-row--user → lm-chat-bubble--user
│   └── lm-chat-actions (复制/删除)
│
└── lm-chat-row-wrapper--assistant     ← Agent 消息组（合并）
    ├── lumi-sequence-stack
    │   ├── ChatMessageBlock → lm-chat-row--assistant → lm-chat-bubble--assistant
    │   │   ├── lm-chat-md (文本段落)
    │   │   └── LumiToolCall (工具调用卡片，可展开查看参数/结果)
    │   ├── ChatMessageBlock → lm-chat-row--tool     ← 孤立 tool 消息
    │   └── ...
    └── lm-chat-actions (复制/删除 — 整组)
```

**ChatMessageBlock 逻辑**：
- `role === "user"`：渲染纯文本气泡
- `role === "assistant"`：渲染文本 + tool_calls（如果有），tool_calls 通过 `lumi-sequence-stack` 将段落文本与工具调用卡片交错排列。同时查找下方相邻的 tool 消息作为 tool result 展示
- `role === "tool"`：如果已被上方的 assistant 消息消费（tool_call_id 匹配），返回 null 避免重复渲染。否则渲染独立 tool 结果行

### 消息存储与传输

- **持久层**：IndexedDB (`thread-idb.ts`)，每个 `ChatThreadRecord` 包含 `messages: OpenAiChatMessage[]`
- **传输格式**：`OpenAiChatMessage[]` 通过 `chrome.runtime.sendMessage` 以 JSON 序列化传输
- **状态同步**：agent 运行时，每步 `onStepFinish` 都会 `saveThreadMessages()` 持久化，确保 SW 意外终止时可恢复进度

## 项目目录结构

```
lumino/
├── src/
│   ├── background.ts                    # Service Worker — Agent 执行 & 消息路由
│   ├── sidepanel.tsx                    # Side Panel 主聊天 UI
│   ├── options.tsx                      # 选项页 — LLM + Obsidian + 采集配置
│   ├── content/
│   │   ├── floating-button.ts           # 浮动按钮 DOM 逻辑
│   │   └── floating-button.test.ts
│   ├── contents/
│   │   ├── lumino-floating-button.ts    # Plasmo 内容脚本入口
│   │   └── lumino-input-watcher.ts      # AI 补全（已禁用）
│   ├── lib/
│   │   ├── chat/
│   │   │   ├── active-thread-storage.ts    # 当前活跃会话（chrome.storage.local）
│   │   │   ├── agent-loop.ts               # Agent 循环：AI SDK generateText + onStepFinish
│   │   │   ├── openai-messages.ts          # OpenAI 消息/工具调用类型
│   │   │   ├── system-prompt.ts            # 系统提示词组装（静态 + 半静态 + 动态画像/记忆 + Obsidian）
│   │   │   ├── thread-idb.ts               # IndexedDB 会话 CRUD
│   │   │   ├── tool-definitions.ts         # AI SDK tool() 定义（luminoTool 包装 + Zod v4 schema）
│   │   │   ├── tool-executor.ts            # 工具注册表 & 统一执行 & getToolHandler
│   │   │   ├── tool-eviction.ts            # 大结果驱逐 & 定时清理
│   │   │   ├── tool-registry.ts            # 工具注册入口（registerAllTools）
│   │   │   └── tools/
│   │   │       ├── browser-tools.ts        # 浏览器交互工具
│   │   │       ├── fs-tools.ts             # 文件系统工具
│   │   │       ├── memory-tools.ts         # 记忆系统工具
│   │   │       ├── obsidian-tools.ts       # Obsidian 集成工具
│   │   │       ├── system-tools.ts         # 浏览器系统工具
│   │   │       └── browser-tools.test.ts
│   │   ├── llm/
│   │   │   ├── types.ts                   # LLM 设置类型
│   │   │   ├── openai.ts                  # OpenAI 兼容 API 调用（已废弃，由 AI SDK 替代）
│   │   │   └── openai.test.ts
│   │   ├── memory/
│   │   │   ├── types.ts
│   │   │   ├── memory-idb.ts
│   │   │   ├── daily-memory.ts
│   │   │   ├── daily-memory-md.ts
│   │   │   ├── user-profile.ts
│   │   │   ├── collection-config.ts
│   │   │   ├── dwell-checker.ts
│   │   │   ├── bookmark-watcher.ts
│   │   │   ├── page-capture.ts
│   │   │   └── page-visit-idb.ts
│   │   ├── fs/
│   │   │   ├── types.ts
│   │   │   ├── fs-ops.ts
│   │   │   ├── export.ts
│   │   │   └── workspace.ts
│   │   ├── db.ts                          # IndexedDB 实例管理
│   │   ├── theme.ts                       # 主题应用
│   │   ├── settings.ts                    # 设置读写
│   │   └── side-panel-bridge.ts           # SP ↔ SW 通信协议类型
│   ├── styles/
│   │   ├── tokens.css                     # 主题 Token 变量
│   │   ├── layout.css                     # 纯布局层
│   │   └── components.css                 # 视觉表现层
│   └── assets/
│       └── black_cat.gif
├── package.json
├── tsconfig.json
├── pnpm-workspace.yaml                   # zod v4 CJS 兼容覆盖
├── THEME.md                              # 主题系统文档
└── docs/
    └── architecture.md                   # 本文档
```

## 样式架构（三层分离）

| 层 | 文件 | 职责 | 是否受主题影响 |
|---|---|---|---|
| **Token 层** | `styles/tokens.css` | 定义 `--lumi-*` CSS 变量，每个主题一个 `:root[data-theme="..."]` 块 | 是 — 主题切换即换 Token 值 |
| **布局层** | `styles/layout.css` | display / flex / position / overflow / z-index 等纯结构属性 | 否 |
| **组件层** | `styles/components.css` | 所有视觉属性（颜色/圆角/阴影/字号等），全部引用 `--lumi-*` Token | 间接受主题控制 |

### 类名规范

| 前缀 | 含义 | 示例 |
|------|------|------|
| `lm-*` | 主题无关的通用 UI 组件 | `.lm-shell`, `.lm-chat-bubble`, `.lm-primary-button` |
| `lumi-*` | AI 交互特有内部组件 | `.lumi-tool-call`, `.lumi-running-indicator`, `.lumi-sequence-stack` |

## 记忆系统

三层记忆架构：
- **Layer 1**：页面访问事件（`page-visit-idb.ts`）
- **Layer 2**：日记忆总结（`daily-memory.ts`，LLM 生成 summary/keywords）
- **Layer 3**：用户画像（`user-profile.ts`，自动推断）

## 现状盘点

### 已完成
- 多会话聊天（新建、切换、删除）
- AI SDK v6 Agent 循环（`generateText` + `onStepFinish` 流式推送）
- 28 个内置工具（浏览器交互、文件系统、记忆系统、Obsidian 集成）
- 前端消息合并渲染（同轮 agent 多步消息合并为一个气泡）
- 标签页锁定机制（agent 不受用户切换 tab 影响）
- 大结果驱逐 + 定时清理
- Obsidian Local REST API 集成（条件激活）
- 悬浮按钮注入 `<all_urls>`
- 三主题切换系统（Paper/ORYZO/Fictional）
- 三层记忆系统（事件采集运行中，主动 AI 已禁用）
- Dwell 巡检 + 驱逐清理定时任务
- 用户画像自动推断

### 待扩展
- Markdown 渲染（当前助手回复为纯文本）
- Agent 请求重试 / 错误恢复机制
- 主动 AI 功能恢复（AI 文本补全、自动日记忆生成）
- 工具可进一步扩展（书签管理、标签分组等浏览器能力）
- 测试覆盖可进一步加强（memory / fs / obsidian 模块）
