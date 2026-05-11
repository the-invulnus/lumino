# Lumino 架构文档

## 项目概述

Lumino 是一款基于 Plasmo 框架构建的 Chrome 浏览器扩展，定位为「陪伴型助手」。用户通过 Side Panel 与 AI 对话，AI 可通过函数调用（function calling）自主使用内置工具系统。扩展配备了完整的三层记忆系统（浏览事件采集 → LLM 日记忆生成 → BM25 检索）、OPFS 文件系统工作区、AI 文本补全引擎，以及在所有页面注入悬浮按钮方便随时唤起侧栏。

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | [Plasmo](https://docs.plasmo.com/) 0.90.5 |
| UI | React 18 + TypeScript 5.3 |
| 样式 | 纯 CSS（设计令牌 `lumino-vars.css` + `paper.css` 软质 UI） |
| 包管理 | pnpm |
| 测试 | Vitest |
| 存储 | Chrome Storage API（`sync` / `local`）+ IndexedDB + OPFS（Origin Private File System） |

## 运行模式

Chrome Extension Manifest V3，采用 **Service Worker + Side Panel + Content Script** 架构：

| 入口 | 文件 | 说明 |
|---|---|---|
| Service Worker | `src/background.ts` | 点击工具栏图标打开 Side Panel；监听内容脚本消息并打开侧栏 |
| Side Panel | `src/sidepanel.tsx` | 核心交互界面：多会话聊天、LLM 对话、Agent 工具调用 |
| Options Page | `src/options.tsx` | LLM 配置表单（Base URL / API Key / Model） |
| Content Script | `src/contents/lumino-floating-button.ts` | 在 `<all_urls>` 页面注入悬浮按钮 — 点击通知 background 打开侧栏 |
| Content Script（已禁用） | `src/contents/lumino-input-watcher.ts` | 输入监听 & AI 自动补全 — 当前禁用 |

## 项目目录结构

```
lumino/
├── src/
│   ├── background.ts                 # Service Worker
│   ├── sidepanel.tsx                 # Side Panel — 主聊天 UI
│   ├── options.tsx                   # 选项页 — LLM 配置表单
│   ├── content/
│   │   ├── floating-button.ts        # 浮动按钮创建/挂载逻辑
│   │   └── floating-button.test.ts
│   ├── contents/
│   │   ├── lumino-floating-button.ts # Plasmo 内容脚本入口（<all_urls>）
│   │   └── lumino-input-watcher.ts   # 输入监听与 AI 补全（当前禁用）
│   ├── lib/
│   │   ├── chat/
│   │   │   ├── active-thread-storage.ts  # 当前活跃会话 ID（chrome.storage.local）
│   │   │   ├── agent-loop.ts             # Agent 循环：每轮 LLM 调用 → 工具调用 → 结果注入
│   │   │   ├── openai-messages.ts        # OpenAI 消息类型 & 工具调用结构
│   │   │   ├── system-prompt.ts          # 系统提示词组装（静态 + 动态画像/记忆）
│   │   │   ├── thread-idb.ts             # IndexedDB 会话 CRUD
│   │   │   ├── tool-definitions.ts       # Agent 工具 JSON Schema 定义
│   │   │   ├── tool-executor.ts          # 工具执行器（注册表 + 统一执行）
│   │   │   ├── tool-eviction.ts          # 大结果驱逐策略（超大结果写入 OPFS）
│   │   │   ├── tool-registry.ts          # 工具注册入口（按领域分组）
│   │   │   └── tools/
│   │   │       ├── fs-tools.ts           # 文件系统工具：ls/read/write/edit/glob/grep/rm/export
│   │   │       ├── memory-tools.ts       # 记忆工具：memory_get/memory_search
│   │   │       └── system-tools.ts       # 浏览器工具：current_page/tabs
│   │   ├── llm/
│   │   │   ├── types.ts                  # LlmSettings / ChatMessage 类型
│   │   │   ├── openai.ts                 # OpenAI 兼容 API 调用
│   │   │   └── openai.test.ts
│   │   ├── memory/
│   │   │   ├── types.ts                  # 三层记忆类型 + 补全消息类型
│   │   │   ├── bm25.ts                   # BM25 搜索算法实现
│   │   │   ├── tokenizer.ts              # 中英混合分词器（Intl.Segmenter）
│   │   │   ├── search-index.ts           # 记忆搜索索引
│   │   │   ├── retriever.ts             # Layer 3 检索器（BM25 + 时间衰减）
│   │   │   ├── context-builder.ts       # 补全上下文组装器（记忆 + 画像 + Session）
│   │   │   ├── event-collector.ts       # Layer 1 事件采集器（Content Script 端）
│   │   │   ├── event-store.ts           # Layer 1 事件存储委托
│   │   │   ├── memory-idb.ts            # 记忆 IndexedDB CRUD
│   │   │   ├── daily-memory.ts          # Layer 2 日记忆（LLM 总结）
│   │   │   ├── memory-scheduler.ts      # 定时任务调度器（chrome.alarms）
│   │   │   ├── privacy-filter.ts        # 隐私域名过滤（银行/政府/医疗等）
│   │   │   └── user-profile.ts          # 用户画像（LLM 推断 + 存储）
│   │   ├── completion/
│   │   │   ├── completion-engine.ts     # 补全引擎（Background 端调用 LLM）
│   │   │   └── input-watcher.ts         # 输入观察器（Content Script 端 DOM 监听）
│   │   ├── fs/
│   │   │   ├── opfs.ts                  # OPFS 记忆文件读写（profile.json、日记忆.md）
│   │   │   └── workspace.ts             # OPFS 工作区文件系统（Agent 工具后端）
│   │   ├── db.ts                        # 统一 IndexedDB 连接（version 2）
│   │   ├── settings.ts              # LLM 配置读写（chrome.storage.sync）
│   │   ├── settings.test.ts
│   │   └── side-panel-bridge.ts     # 内容脚本 ↔ Service Worker 消息常量
│   └── styles/
│       ├── lumino-vars.css          # 设计令牌（亮/暗双主题 CSS 变量）
│       ├── paper.css                # 扩展页通用 UI
│       └── content-inject.css       # 悬浮按钮样式（注入宿主页面）
├── assets/
│   └── icon.png                     # 扩展图标
├── .plasmo/                         # Plasmo 构建缓存
├── docs/
│   └── architecture.md              # 本文档
├── package.json
├── tsconfig.json
└── README.md
```

## 模块分层架构

```
┌─────────────────────────────────────────┐
│  UI 层 (React)                           │
│  sidepanel.tsx  │  options.tsx            │
├─────────────────────────────────────────┤
│  业务逻辑层 (chat/)                        │
│  agent-loop.ts  │  tool-executor.ts       │
│  system-prompt.ts  │  tool-definitions.ts │
│  thread-idb.ts  │  active-thread-storage  │
├─────────────────────────────────────────┤
│  记忆系统层 (memory/)                      │
│  event-collector → event-store →          │
│  daily-memory(LLM) → retriever(BM25)      │
│  user-profile.ts  │  context-builder.ts   │
├─────────────────────────────────────────┤
│  通信层                                   │
│  llm/openai.ts  │  side-panel-bridge.ts │
├─────────────────────────────────────────┤
│  持久化层                                 │
│  settings.ts (storage.sync)              │
│  db.ts → IndexedDB (线程/事件/记忆/洞察)   │
│  opfs.ts (记忆文件：profile、日记忆)        │
│  workspace.ts (Agent 工作区文件)           │
├─────────────────────────────────────────┤
│  基础层 (Background / Content Script)     │
│  background.ts  │  floating-button.ts    │
│  input-watcher.ts (已禁用)                 │
└─────────────────────────────────────────┘
```

## 核心数据流

### 聊天对话流程

```
用户输入 → Side Panel (React)
  │
  ├─ sendUserMessage()
  │   ├─ append 用户消息到本地 React state
  │   └─ 调用 runAgentLoop()
  │       │
  │       ├─ 构造消息列表：历史消息 + 用户输入
  │       ├─ 每轮循环：
  │       │   ├─ buildAgentMessages() → 组装系统提示词（静态 + 动态画像 + 近期记忆）
  │       │   ├─ requestChatCompletionTurn() → LLM API 调用
  │       │   ├─ 若返回 tool_calls → executeToolCall() → 结果追加为 tool 消息
  │       │   └─ 工具结果过大则 evictToOpfs() 写入 OPFS，返回预览
  │       │
  │       └─ 最多 8 轮工具调用循环
  │
  └─ 每轮消息通过 onMessagesUpdate 回调实时写入 IndexedDB
```

### 系统提示词组装

```
buildAgentMessages(historyMessages)
  ├─ STATIC_SYSTEM_PROMPT      # 核心身份 + 工具使用原则
  ├─ SEMI_STATIC_SYSTEM_PROMPT  # 记忆管理 + 文件系统 + 禁止项
  ├─ buildDynamicSystemBlock()  # 动态组装
  │   ├─ loadUserProfile()      # 用户画像
  │   ├─ loadDailyMemories()    # 今/昨日记忆摘要
  │   └─ 当前时间
  └─ ...historyMessages
```

### 悬浮按钮 → 侧栏打开流程

```
用户点击悬浮按钮 (Content Script)
  │
  └─ chrome.runtime.sendMessage({ type: "lumino/open-side-panel" })
      └─ background.ts: onMessage
          ├─ 优先通过 tabId 打开 → chrome.sidePanel.open({ tabId })
          └─ 降级通过 windowId 打开 → chrome.sidePanel.open({ windowId })
```

## Agent 工具系统

基于 OpenAI function calling 协议实现，支持模型自主选择调用工具。

### 架构概览

```
tool-definitions.ts ──→ 工具 JSON Schema 定义 (发送给 LLM)
tool-registry.ts   ──→ 按领域注册处理函数
tool-executor.ts   ──→ 统一执行入口 + 错误处理
tool-eviction.ts   ──→ 大结果驱逐策略
tools/
  ├── fs-tools.ts       ──→ 文件系统工具
  ├── memory-tools.ts   ──→ 记忆工具
  └── system-tools.ts   ──→ 浏览器系统工具
```

### 工具执行流程

```
LLM 返回 tool_calls (最多 8 轮循环)
  → executeToolCall(call)
    → 按 function.name 分发
    → 执行对应处理函数
    → maybeEvictToolResult() 检查结果大小（>80K 字符触发驱逐）
      → 排除列表中的工具不驱逐
      → 驱逐时将完整结果写入 OPFS，返回预览摘要
  → 结果作为 tool 消息追加到 messages
  → 继续下一轮 LLM 调用

完成条件：finish_reason !== "tool_calls" 或达到 8 轮
```

### 当前内置工具（10 个）

#### 记忆系统

| 工具名 | 功能 | 参数 |
|---|---|---|
| `memory_get` | 读取指定日期的日记忆全文 | `date?: string` |
| `memory_search` | BM25 关键词搜索历史记忆 | `query: string`, `limit?: number` |

#### 文件系统（基于 OPFS）

| 工具名 | 功能 | 参数 |
|---|---|---|
| `ls` | 列出工作区目录文件 | `path?: string` |
| `read_file` | 读取文件（支持分页） | `file_path: string`, `offset?: int`, `limit?: int` |
| `write_file` | 创建或覆写文件 | `file_path: string`, `content: string` |
| `edit_file` | 精确字符串替换编辑 | `file_path`, `old_string`, `new_string` |
| `glob` | glob 模式查找文件 | `pattern: string`, `path?: string` |
| `grep` | 文本/正则搜索文件内容 | `pattern: string`, `path?`, `glob?`, `output_mode?` |
| `rm` | 删除文件 | `path: string` |
| `export` | 导出文件/目录到本地 | `path?: string` |

#### 浏览器系统

| 工具名 | 功能 | 参数 |
|---|---|---|
| `current_page` | 获取当前标签页信息 | 无 |
| `tabs` | 列出所有标签页 | 无 |

### 工具结果驱逐策略

为防止超大工具结果撑爆 LLM 上下文窗口，系统在工具执行后自动检查：
- **阈值**: 结果字符数超过 `TOOL_TOKEN_LIMIT_BEFORE_EVICT`（默认 80,000 字符）
- **排除列表**: `memory_get`、`memory_search`、`current_page`、`tabs`、`ls`、`rm`、`write_file`、`edit_file`、`export` 永不驱逐（这些结果对 Agent 上下文至关重要）
- **预览生成**: `read_file`/`grep content` 保留前 200 行；纯文本保留前 2000 字符
- **存储**: 完整结果写入 OPFS `/large_tool_results/` 目录，Agent 可通过 `read_file` 重新读取

## 会话管理

- **存储引擎**: IndexedDB，数据库名 `lumino`，object store `threads`
- **数据结构**: `ChatThreadRecord { id, updatedAt, title?, messages: OpenAiChatMessage[] }`
- **当前会话**: `chrome.storage.local` 存 `lumino_active_thread_id`
- **会话列表**: 按 `updatedAt` 降序排列
- **标题推导**: 从首条用户消息前 25 字截取

## 记忆系统

Lumino 实现了三层记忆架构，从原始事件采集到智能检索形成完整闭环。

### 三层架构

```
Layer 1: 原始浏览事件 (event-collector → event-store → IndexedDB)
  ├── 事件类型: page_visit | input_focus | input_blur | input_type | tab_switch | page_scroll | idle
  ├── 每条事件携带: PageMeta (url/title/hostname/textSnippet) + InputMeta (selectorHint/nodeType/placeholder/text)
  ├── 隐私过滤: 自动跳过银行/政府/医疗/成人内容域名
  └── 自动清理: 7 天过期 / 最多 5000 条
    ↓
Layer 2: 日记忆 (daily-memory.ts → LLM 总结)
  ├── LLM 将当日所有浏览事件总结为 3-5 句话摘要
  ├── 提取 3-8 个关键词
  ├── 同步写入 IndexedDB + OPFS (.md 文件)
  ├── Agent 可通过 memory_get/memory_search 读写
  └── 自动清理: 最多保留 90 天
    ↓
Layer 3: 智能检索 (retriever.ts → BM25 + temporal decay)
  ├── 从当前 Session 事件提取上下文关键词
  ├── BM25 评分所有日记忆 + 对话洞察
  ├── 时间衰减: 14 天半衰期
  └── 返回 top-5 记忆 + 最近 10 条原始事件
```

### 用户画像

- LLM 从浏览行为自动推断：关注领域（interests）、语言偏好、常用站点
- 存储在 `chrome.storage.local` + OPFS `profile.json`
- 定时更新：每 6 小时（通过 chrome.alarms，当前已禁用主动 AI）

### AI 文本补全

- **触发**: Content Script 监听输入框 focus/input 事件，用户输入 ≥ 2 字符后防抖触发
- **上下文**: 当前页面信息 + 输入框描述 + Session 浏览上下文 + 用户画像 + BM25 检索记忆
- **展示**: ghost overlay 覆于输入框上方，灰色文本展示补全
- **接受**: Tab 键接受补全，自动插入输入框并触发 input/change 事件
- **限制**: 每个输入框最多 5 次补全请求，30 秒过期

### 当前状态

**主动 AI 功能（Layer 1 事件采集 + AI 自动补全）已临时禁用。**

- `background.ts` 中不再处理 L1 事件上报、补全请求等消息
- `lumino-input-watcher.ts` content script 不再注册到 manifest
- `memory-scheduler.ts` 定时任务（日记忆生成 / 存储清理 / 画像更新）不再被调用

保留功能：
- Agent 对话中可通过 `memory_get` / `memory_search` 工具主动读写记忆
- 系统提示词中动态注入用户画像和近期记忆
- 所有记忆模块代码完整保留，可随时重新启用

## 配置管理

- LLM 配置通过 `src/lib/settings.ts` 读写 `chrome.storage.sync`
- 支持跨设备同步
- 三项配置：`baseUrl`、`apiKey`、`model`
- 保存时自动 `trim()`，并去除 `baseUrl` 尾部斜杠
- `hasCompleteLlmSettings()` 检查是否三项配置齐全
- 使用 OpenAI 兼容协议：POST `{baseUrl}/chat/completions`

## 样式系统

- **设计令牌**: `src/styles/lumino-vars.css` — 完整的亮/暗双主题 CSS 变量
- **自动切换**: 通过 `prefers-color-scheme` 媒体查询
- **主题风格**: 软质陪伴感 — 米白底色、柔光渐变、模糊光斑动画
- **UI 组件**: `src/styles/paper.css` — 侧栏、聊天界面、会话列表、选项页共用
- **注入样式**: `src/styles/content-inject.css` — 悬浮按钮自适应定位，不污染宿主页面

## 测试

- **测试框架**: Vitest（`vitest run`）
- **测试文件**:
  - `src/lib/settings.test.ts` — LLM 配置读写与完整性检查
  - `src/lib/llm/openai.test.ts` — OpenAI API 调用与错误处理
  - `src/content/floating-button.test.ts` — 浮动按钮创建、去重、消息发送（jsdom 环境）

## Chrome 权限

| 权限 | 用途 |
|---|---|
| `storage` | chrome.storage.sync/local 存 LLM 配置、活跃会话、用户画像 |
| `sidePanel` | 控制 Side Panel 打开 |
| `alarms` | 记忆系统定时任务（日记忆生成、存储清理、画像更新） |
| `tabs` | current_page / tabs 工具查询浏览器标签页 |
| `downloads` | export 工具导出工作区文件到本地 |
| `<all_urls>` (host_permissions) | 内容脚本在所有页面注入悬浮按钮 |

## IndexedDB 数据库

统一数据库 `lumino`（version 2），所有模块共享一个连接：

| Store | Key Path | 索引 | 用途 |
|---|---|---|---|
| `threads` | `id` | — | 聊天会话 |
| `layer1_events` | `id` | `timestamp`, `type` | 浏览事件 |
| `daily_memories` | `date` | `createdAt` | 日记忆 |
| `insights` | `id` | `createdAt`, `category`, `sourceThreadId` | 对话洞察 |
| `profile_updates` | `id` | `timestamp` | 画像更新记录 |

## OPFS 存储布局

```
OPFS (navigator.storage.getDirectory)
  └── lumino/
      ├── memory/                    # 用户画像 + 日记忆 Markdown 文件
      │   ├── profile.json
      │   └── 2026-05-10.md
      └── workspace/                 # Agent 工具操作的工作区
          ├── (Agent 通过 ls/read_file/write_file 管理)
          └── large_tool_results/    # 被驱逐的大工具结果
```

## 现状盘点

### 已完成功能
- 多会话聊天（新建、切换、删除）
- OpenAI 兼容 API 调用（支持任意兼容服务）
- Agent 工具调用（function calling 协议，最多 8 轮循环，10 个内置工具）
- 悬浮按钮注入所有页面
- 亮/暗双主题自动切换
- LLM 配置持久化与跨设备同步
- OPFS 文件系统工作区（Agent 可创建/读取/编辑/搜索/导出文件）
- 三层记忆系统（浏览事件采集 → LLM 日记忆 → BM25 检索，主动采集已禁用）
- 用户画像自动推断（LLM 分析浏览行为）
- AI 文本补全引擎（Content Script 端 ghost overlay 展示，已禁用）
- 大工具结果驱逐策略（防止撑爆上下文窗口）
- 隐私域名过滤（银行/政府/医疗/成人内容不采集）
- 测试覆盖（3 个测试文件）

### 待扩展方向
- 工具可进一步扩展（如操作书签、历史记录、标签分组等浏览器能力）
- 没有流式响应（SSE / streaming），当前为一次性 fetch 等待完整回复
- README.md 仍是 Plasmo 模板内容，未更新为项目实际描述
- 缺少 Markdown 渲染，助手回复为纯文本
- 缺少请求重试 / 错误恢复机制
- 主动 AI 功能（浏览事件采集、AI 自动补全）等待恢复启用
- 测试覆盖仅限 3 个文件，缺少 memory/fs/completion 模块测试
