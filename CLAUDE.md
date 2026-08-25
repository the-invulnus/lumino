# Lumino 架构文档

这个文档描述了当前工作目录下的Lumino项目架构。随着功能的新增或架构的升级，同步修改此`CLAUDE.md`文档

## 项目概述

Lumino 是一款基于 Plasmo 框架构建的 Chrome 浏览器扩展，定位为「多模式 AI 助手」。用户通过 Side Panel 从首页选择功能模式，进入对应的 Agent 对话界面。每个 Agent 模式有不同的系统提示词和工具子集，适应搜索调研、设计复刻、页面操控等场景。用户可在 Options 页创建自定义 Agent。AI 通过自研 Agent 循环（`while(true)` + tool calling）自主调度内置工具系统，可读取网页内容、操作 DOM、管理文件、存取 Obsidian 笔记。配备 OPFS 文件系统工作区。

（文档更新有滞后性，如果发现代码实现与本文档说明不符，一律以代码实现为准。）

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | [Plasmo](https://docs.plasmo.com/) 0.90.5 |
| UI | React 18 + TypeScript 5.3 |
| Agent 框架 | 自研 `LlmClient` + `runAgentLoop()`（`while(true)` + tool calling） |
| LLM Provider | 自研 `LlmClient`（OpenAI 兼容协议，非流式/流式） |
| Schema 校验 | zod@3.25.76（工具 inputSchema 定义） |
| 样式 | 纯 CSS 三层架构 + 多主题切换（tokens / layout / components） |
| 包管理 | pnpm |
| 测试 | Vitest + jsdom |
| 存储 | Chrome Storage API + IndexedDB + OPFS |
| 国际化 | 自建轻量 i18n（`src/lib/i18n.ts` + en/zh 字典），默认英文，运行时切换 |

## 国际化（i18n）

零依赖自建方案，支持中英文运行时切换、默认英文：

- **核心** `src/lib/i18n.ts` — `t(key, params?)` 翻译函数（`{name}` 占位符插值），`getLocale()`，`setStoredLocale()` / `applyLocale()`，`initLocaleFromStorage()`（启动恢复），`useT()` React hook（监听 `lumino-locale-change` 事件，切换语言时重渲染）
- **字典** `src/lib/i18n/en.ts` + `zh.ts` — 扁平点分 key，两文件 key 必须同步
- **locale 存储** `chrome.storage.local`（键 `lumino_locale`）— 不随 Google 账号同步
- **启动恢复**：Side Panel（`App.tsx`）、Options（`options.tsx`）、Background SW（`boot()`）、content script（`floating-button.ts`）各自调用 `initLocaleFromStorage()`；非 React 上下文直接用模块级 `t()`，React 组件用 `useT()`
- **内置 Agent 名称/描述**：`builtin-agents.ts` 的 `name`/`description` 存的是 i18n key（如 `agent.chat.name`），前端渲染处用 `t(agent.name)` 解析
- **语言切换 UI**：Options 页 General 分区，EN/中文 toggle
- **后台系统提示词和工具 description（发给 LLM 的）不做双语**，保持现有中文；但**会话命名提示词**（`thread-idb.ts` 的 `generateThreadTitle`）用英文指令并要求标题语言跟随用户输入 query 的语言
- **时间格式化**统一抽到 `src/lib/format-time.ts`（`formatRelativeTime` / `formatHistoryDate`），消除 ChatView/HomePage/HistoryPanel 三处重复

## 存储安全

LLM API Key 与 Obsidian token 存 `chrome.storage.local`（`settings.ts` 的 `getStorageArea` 默认 local），**不随 Google 账号同步到云端**，降低账号被入侵时的凭证泄露面。自定义 Agent 配置（`mode-config.ts`）不含密钥，仍存 `chrome.storage.sync` 以支持跨设备同步。

## 运行模式

Chrome Extension Manifest V3，**Service Worker + Side Panel + Content Script + Offscreen**：

| 入口 | 文件 | 说明 |
|---|---|---|
| Service Worker | `src/background.ts` | Agent 执行引擎、消息路由、定时任务（驱逐清理） |
| Side Panel | `src/sidepanel.tsx` | 薄入口，实际逻辑在 `src/sidepanel/App.tsx` — 首页/聊天路由、导航栏、历史面板 |
| Options Page | `src/options.tsx` | LLM 配置 + Obsidian 集成配置 + 主题切换 + 自定义 Agent 管理 |
| Offscreen Document | `src/tabs/offscreen.tsx` | Plasmo Tab Pages 入口，由 SW 通过 `chrome.offscreen` 按需创建；用 pdf.js（`pdfjs-dist@3.11.174`，主线程模式）提取 PDF 文本。SW 不能 spawn Web Worker，故解析在 offscreen 的 DOM 环境完成。pdf.js 必须用 3.x 的 `pdf.worker.entry` 入口（挂 `globalThis.pdfjsWorker` 走主线程），6.x 的 worker/Blob import 机制会被 MV3 CSP 拦截 |
| Content Script | `src/contents/lumino-floating-button.ts` | `<all_urls>` 注入悬浮按钮，点击唤起侧栏 |
| Content Script（辅助） | `src/content/floating-button.ts` | 浮动按钮 DOM 创建/挂载逻辑 |
| Content Script（辅助） | `src/contents/lumino-input-watcher.ts` | 基础注入，抑制 SW 上下文失效错误 |

## Agent 多模式系统

Lumino 支持多 Agent 模式，内置和用户自定义 Agent 使用统一的 `AgentConfig` 类型。

### 配置架构

```
BUILTIN_AGENTS (builtin-agents.ts)  +  customAgents (chrome.storage.sync)
         │                                    │
         └─────────── getAllAgents() ──────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                  ▼
   IconSidebar         HomePage           ChatView
  (导航栏渲染)       (首页卡片)         (send 时读取
                                     systemPrompt + tools)
```

- **内置 Agent** 定义在 `src/lib/chat/builtin-agents.ts`，一个 `AgentConfig[]` 数组。新增内置 Agent 只需在数组中添加一个条目
- **自定义 Agent** 存在 `chrome.storage.sync`（随 Chrome 账号同步），由 `src/lib/chat/mode-config.ts` 的 `loadCustomAgents()` / `saveCustomAgents()` 读写
- **统一加载**：`builtin-agents.ts` 的 `getAllAgents()` 将内置和自定义 Agent 合并，统一排序后提供给前端
- **工具过滤**：`agent-loop.ts` 按 `agentConfig.isBuiltin` 分流——内置 Agent 传 `toolFilter = undefined`（=全部工具），自定义 Agent 传 `agentConfig.tools` 作为显式白名单（空数组 = 无工具）。`getLuminoAgentTools(toolFilter?)` 语义：`undefined` = 全部工具，数组 = 按名过滤。白名单可含 `"mcp:*"` 通配符全量注入 Obsidian MCP 工具

### 内置 Agent 列表

| id | 名称 | 工具子集 | 说明 |
|---|---|---|---|
| `chat` | 通用 | 全部工具 | 全能助手 |
| `research` | 深度调研 | navigate, get_page_content, screenshot, scroll, etc. | 浏览网页、深度搜索 |
| `replicate` | 设计复刻 | scrape_structure, scrape_styles, scrape_resources, fetch_resource, etc. | DOM/CSS 提取、资源收集 |
| `automate` | 页面操控 | fill_form, click_element, press_key, inspect_element, etc. | 表单填充、元素操作 |

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
                                                    │  llm/agent-loop.ts  │
                                                    │  while(true) +      │
                                                    │  LlmClient.chat()   │
                                                    └──────────┬──────────┘
                                                               │
                                                    ┌──────────▼──────────┐
                                                    │  tool-definitions.ts│
                                                    │  LuminoTool + zod   │
                                                    │  ↓ execute 调用     │
                                                    │  tool-executor.ts   │
                                                    │  ↓ handler 路由     │
                                                    │  tools/*.ts         │
                                                    └─────────────────────┘
```

### Agent 循环

两层架构分离：

**底层 `src/lib/llm/agent-loop.ts`** — 核心循环，不与 Lumino 业务耦合：
- `while(true)` + `LlmClient.chat()` 实现多轮 tool calling
- 消息格式全程使用 OpenAI 原生格式（`LlmMessage`），无格式转换
- 最大步数默认 100，每步完成后回调 `onStepFinish`
- 支持 `AbortSignal` 中止、自定义 `fetch`、超时控制

**上层 `src/lib/chat/agent-loop.ts`** — 薄包装层：
- 调用 `buildAgentMessages()` 构建系统提示词
- 调用 `getLuminoAgentTools()` 获取工具列表（`LuminoTool[]`）
- 创建 `LlmClient`（配置 `thinking: { type: "disabled" }` + HTTP 日志）
- 管理 `accumulatedMessages` 用于 UI 推送

### LlmClient (`src/lib/llm/llm-client.ts`)

OpenAI 兼容的 LLM 调用客户端，统一封装非流式/流式两种模式：

- `chat(messages, tools?, options?)` → 非流式，返回 `LlmResponse { text, toolCalls, usage? }`
- `chatStream(messages, tools?, onChunk, options?)` → SSE 流式，逐 token 回调
- 支持 `LlmConfig` 配置：`maxTokens`, `temperature`, `topP`, `thinking`, `extraBody`
- 支持图片输入：user message 的 `content` 可为 `ContentPart[]`（`{ type: "text" }` | `{ type: "image_url" }`）
- 当前应用使用非流式 `chat()` 模式

### 工具定义 (tool-definitions.ts)

使用自研 `LuminoTool` 类型 + Zod schema 定义所有工具：

```ts
const tool = luminoTool({
  name: "get_page_content",
  description: "读取当前页面的可见文本内容...",
  inputSchema: z.z.object({
    tab_id: z.z.number().int().describe("目标标签页的 ID...").optional(),
    mode: z.z.enum(["text", "structured"]).describe("提取模式...").optional()
  })
})
```

- `LuminoTool` 类型：`{ name, description, inputSchema: ZodType, execute: (args) => Promise<string> }`
- `luminoTool()` 返回 `LuminoTool`，`execute` 直接调用 `getToolHandler(name)` 从 `tool-executor.ts` 注册表获取 handler
- `getLuminoAgentTools()` 返回 `LuminoTool[]`，Agent 循环中通过 `luminoToolsToOpenAi()` 转为 OpenAI tools 参数
- Zod Schema 通过 `zodToJsonSchema()` 转为 JSON Schema 传给 LLM
- 工具列表分 `BASE_TOOLS`（基础工具，随版本演进会增减）+ Obsidian MCP 动态工具，根据配置合并

### 工具注册与执行 (tool-executor.ts)

- **注册表**：`Map<string, ToolHandler>` 全局单例
- **注册入口**：`tool-registry.ts` 的 `registerAllTools()` 在 Service Worker 和 Side Panel 启动时各调用一次
- **执行流程**：`executeToolCall(call, signal)` → handler → `maybeEvictToolResult()`（大结果驱逐）
- **对外接口**：`getToolHandler(name)` 供 tool-definitions.ts 使用

### 工具清单（基础工具 + Obsidian MCP 动态工具）

| 分类 | 工具名 | 文件 |
|------|--------|------|
| 文件系统 | `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`, `rm`, `export` | `tools/fs-tools.ts` |
| 浏览器系统 | `current_page`, `tabs` | `tools/system-tools.ts` |
| 页面阅读 | `get_page_content`（text 模式用 Mozilla Readability 提取正文，去除导航/广告噪声；非文章页 fallback 到 `main/article` innerText） | `tools/browser-tools.ts` + `assets`（`Readability.js` 经 `web_accessible_resources` 注入） |
| 浏览器交互 | `inspect_element`, `fill_form`, `click_element`, `screenshot`, `scroll`, `press_key`, `navigate`, `close_tab` | `tools/browser-tools.ts` |
| 页面爬取 | `scrape_structure`, `scrape_styles`, `scrape_resources`, `fetch_resource` | `tools/scrape-tools.ts` |
| PDF | `read_pdf`（在 offscreen document 用 pdf.js 提取文本，支持 path/url 两种来源） | `tools/pdf-tools.ts` + `tabs/offscreen.tsx` + `lib/offscreen-pdf-bridge.ts` |
| Obsidian (MCP) | 运行时动态获取（`vault_list`, `vault_read`, `vault_write` 等） | `mcp/mcp-client.ts` + `tools/obsidian-mcp.ts` |

### Side Panel ↔ Service Worker 通信

通信协议定义在 `src/lib/side-panel-bridge.ts`：

| 消息类型 | 方向 | 说明 |
|----------|------|------|
| `START_AGENT_MESSAGE` | SP → SW | 发起 agent 执行，携带 threadId + historyMessages + userInput |
| `STOP_AGENT_MESSAGE` | SP → SW | 中止当前 agent |
| `AGENT_PROGRESS_MESSAGE` | SW → SP | 每步 onStepFinish 时推送完整 messages 数组 |
| `AGENT_COMPLETE_MESSAGE` | SW → SP | agent 正常完成 / 用户中止后推送最终 messages |
| `AGENT_ERROR_MESSAGE` | SW → SP | agent 异常终止，携带错误信息 |

**推送策略**：Agent 循环中每次 tool call 完成就通过 `onStepFinish` 回调推送一次完整消息数组。Side Panel 收到后直接 `setMessages(cloneMessages(msgs))` 全量替换，实时看到每步进展。

## 前端 UI 架构

### Side Panel 组件层级

```
SidePanel (sidepanel.tsx — 薄入口)
└── App (sidepanel/App.tsx — 顶层路由 + 状态管理)
    ├── HomePage (sidepanel/HomePage.tsx — 功能卡片网格)
    ├── ChatView (sidepanel/ChatView.tsx — 聊天界面核心)
    │   ├── ChatMessageBlock (sidepanel/components/)
    │   │   └── LumiToolCall (sidepanel/components/)
    │   └── HistoryPanel (sidepanel/HistoryPanel.tsx — 右侧滑出历史面板)
    └── IconSidebar (sidepanel/IconSidebar.tsx — 右侧导航栏)
```

**路由逻辑**：
- `currentAgent === null` → 渲染 `HomePage`（功能卡片首页）
- `currentAgent !== null` → 渲染 `ChatView`（对应 Agent 的聊天界面）

**多模式支持**：
- `START_AGENT_MESSAGE.payload` 携带 `mode` 和 `agentConfig`（systemPrompt + tools 数组）
- SW 透传给 `runAgentLoop()`，用于系统提示词覆盖和工具过滤
- 导航栏和首页都通过 `getAllAgents()` 获取统一 Agent 列表，一个循环渲染

### 右侧导航栏（IconSidebar）

HeyGen 风格的 78px 宽图标+文字导航栏：
- 首页按钮（🏠）→ 返回功能卡片页
- 内置 Agent 按钮（按 order 排序，图标在上 + 名称在下）
- 分割线
- 用户自定义 Agent 按钮
- spacer → 设置按钮（打开 Options Page）
- 运行中指示器：绿色圆点脉冲动画

### 历史面板（HistoryPanel）

右上角历史按钮 → 遮罩层 + 从右侧滑入 300px 面板：
- 搜索框：按标题/内容过滤
- 全局会话列表：标题 + 日期 + 内容预览 + 删除
- 点击卡片：切换到对应会话

### 消息渲染 (ChatView)

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
│   ├── sidepanel.tsx                    # Side Panel 薄入口 → App.tsx
│   ├── options.tsx                      # 选项页 — LLM + Obsidian + 主题 + 自定义 Agent 管理
│   ├── sidepanel/
│   │   ├── App.tsx                      # 顶层路由（首页 / 聊天分发）+ 状态管理
│   │   ├── HomePage.tsx                 # 功能卡片网格首页
│   │   ├── ChatView.tsx                 # 聊天界面核心（消息、composer、session strip）
│   │   ├── IconSidebar.tsx              # 右侧导航栏（HeyGen 风格）
│   │   ├── HistoryPanel.tsx             # 右侧滑出历史面板
│   │   ├── components/
│   │   │   ├── ChatMessageBlock.tsx      # 消息气泡渲染
│   │   │   └── LumiToolCall.tsx          # 工具调用卡片
│   │   └── hooks/
│   │       ├── useAgentBridge.ts        # Agent 通信 hook
│   │       └── useThreads.ts            # 会话管理 hook
│   ├── content/
│   │   ├── floating-button.ts           # 浮动按钮 DOM 逻辑
│   │   └── floating-button.test.ts
│   ├── contents/
│   │   ├── lumino-floating-button.ts    # Plasmo 内容脚本入口（悬浮按钮）
│   │   └── lumino-input-watcher.ts      # 基础注入（抑制 SW 上下文失效错误）
│   ├── lib/
│   │   ├── chat/
│   │   │   ├── builtin-agents.ts           # 内置 Agent 配置（新增内置 Agent 只需编辑此文件）
│   │   │   ├── mode-config.ts              # AgentConfig 类型 + 自定义 Agent 加载/保存
│   │   │   ├── active-thread-storage.ts    # 当前活跃会话（chrome.storage.local）
│   │   │   ├── agent-loop.ts               # Agent 循环薄包装（系统提示词 + 工具获取 + LlmClient 创建）
│   │   │   ├── openai-messages.ts          # OpenAI 消息/工具调用类型（IndexedDB 存储格式）
│   │   │   ├── system-prompt.ts            # 系统提示词组装（支持 override + 当前时间 + Obsidian）
│   │   │   ├── thread-idb.ts               # IndexedDB 会话 CRUD（ChatThreadRecord 含 mode 字段）
│   │   │   ├── tool-definitions.ts         # LuminoTool 定义 + getLuminoAgentTools(toolFilter?)
│   │   │   ├── tool-executor.ts            # 工具注册表 & 统一执行 & getToolHandler
│   │   │   ├── tool-eviction.ts            # 大结果驱逐 & 定时清理
│   │   │   ├── tool-registry.ts            # 工具注册入口（registerAllTools）
│   │   │   └── tools/
│   │   │       ├── agent-window.ts         # Agent 窗口 ID 管理
│   │   │       ├── browser-utils.ts        # 浏览器工具共享函数
│   │   │       ├── browser-tools.ts        # 页面阅读 + 浏览器交互工具
│   │   │       ├── scrape-tools.ts         # 页面爬取工具
│   │   │       ├── pdf-tools.ts            # read_pdf handler（调 offscreen 解析 PDF）
│   │   │       ├── fs-tools.ts             # 文件系统工具
│   │   │       ├── obsidian-mcp.ts         # Obsidian MCP 工具
│   │   │       ├── system-tools.ts         # 浏览器系统工具
│   │   │       ├── browser-tools.test.ts
│   │   │       └── scrape-tools.test.ts
│   │   ├── llm/
│   │   │   ├── llm-types.ts               # 核心类型：LlmConfig, LlmMessage, LlmTool, LuminoTool, LlmResponse 等
│   │   │   ├── llm-client.ts              # LlmClient 类（chat + chatStream 非流式/流式）
│   │   │   ├── agent-loop.ts              # 核心 runAgentLoop()（while(true) + tool calling）
│   │   │   └── zod-to-json-schema.ts      # Zod ↔ JSON Schema 互转（zodToJsonSchema + jsonSchemaToZod）
│   │   ├── fs/
│   │   │   ├── types.ts
│   │   │   ├── fs-ops.ts
│   │   │   ├── export.ts
│   │   │   └── workspace.ts
│   │   ├── db.ts                          # IndexedDB 实例管理（threads 存储）
│   │   ├── theme.ts                       # 主题应用
│   │   ├── settings.ts                    # 设置读写（LLM + Obsidian）
│   │   ├── side-panel-bridge.ts           # SP ↔ SW 通信协议类型（含 mode/agentConfig）
│   │   └── offscreen-pdf-bridge.ts        # SW ↔ offscreen 通信桥（ensureOffscreenDocument + parsePdfViaOffscreen）
│   ├── tabs/
│   │   └── offscreen.tsx                  # Plasmo Tab Pages 入口 → offscreen.html，pdf.js 解析 PDF
│   ├── styles/
│   │   ├── tokens.css                     # 主题 Token 变量
│   │   ├── layout.css                     # 纯布局层（含导航栏、首页、历史面板）
│   │   └── components.css                 # 视觉表现层
│   └── assets/
│       └── (图标、截图等静态资源)
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

## 现状盘点

### 已完成
- 多会话聊天（新建、切换、删除）
- 自研 Agent 循环（`while(true)` + `LlmClient.chat()`，替代 AI SDK）
- 自研 `LlmClient`（非流式/流式，支持图片输入、LLM 参数配置）
- 23 个内置工具（浏览器交互、文件系统、Obsidian 集成、页面爬取），加上 Obsidian MCP 动态工具
- 前端消息合并渲染（同轮 agent 多步消息合并为一个气泡）
- 标签页锁定机制（agent 不受用户切换 tab 影响）
- 大结果驱逐 + 定时清理
- Obsidian Local REST API 集成（条件激活）
- 悬浮按钮注入 `<all_urls>`
- 三主题切换系统（Paper/ORYZO/Fictional）
- 页面爬取工具（scrape_structure/scrape_styles/scrape_resources/fetch_resource）
- 中英文 i18n 运行时切换（自建轻量方案，默认英文）
- Markdown 渲染 + DOMPurify 消毒

### 待扩展
- Agent 请求重试 / 错误恢复机制
- 工具可进一步扩展（书签管理、标签分组等浏览器能力）
- 测试覆盖可进一步加强（fs / obsidian 模块）
