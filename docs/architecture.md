# Lumino 架构文档

## 项目概述

Lumino 是一款基于 Plasmo 框架构建的 Chrome 浏览器扩展，定位为「陪伴型助手」。用户通过 Side Panel 与 AI 对话，AI 可通过内置的 Agent 工具系统调用扩展能力。扩展还在所有页面注入悬浮按钮，方便随时唤起侧栏。

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | [Plasmo](https://docs.plasmo.com/) 0.90.5 |
| UI | React 18 + TypeScript 5.3 |
| 样式 | 纯 CSS（自定义设计令牌 `lumino-vars.css` + `paper.css` 软质 UI） |
| 包管理 | pnpm |
| 测试 | Vitest |
| 存储 | Chrome Storage API（`sync` / `local`）+ IndexedDB |

## 运行模式

Chrome Extension Manifest V3，采用 **Service Worker + Side Panel + Content Script** 架构：

| 入口 | 文件 | 说明 |
|---|---|---|
| Service Worker | `src/background.ts` | 点击工具栏图标打开 Side Panel；监听内容脚本消息并打开侧栏 |
| Side Panel | `src/sidepanel.tsx` | 核心交互界面：多会话聊天、LLM 对话、Agent 工具调用 |
| Options Page | `src/options.tsx` | LLM 配置表单（Base URL / API Key / Model） |
| Content Script | `src/contents/lumino-floating-button.ts` | 在 `<all_urls>` 页面注入悬浮按钮 "L"，点击通知 background 打开侧栏 |

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
│   │   └── lumino-floating-button.ts # Plasmo 内容脚本入口（<all_urls>）
│   ├── lib/
│   │   ├── chat/
│   │   │   ├── active-thread-storage.ts  # 当前活跃会话 ID（chrome.storage.local）
│   │   │   ├── agent-tools.ts            # Agent 工具定义 + 执行
│   │   │   ├── openai-messages.ts        # OpenAI 消息类型 & 工具调用结构
│   │   │   └── thread-idb.ts             # IndexedDB 会话 CRUD
│   │   ├── llm/
│   │   │   ├── types.ts                  # LlmSettings / ChatMessage 类型
│   │   │   ├── openai.ts                 # OpenAI 兼容 API 调用
│   │   │   └── openai.test.ts
│   │   ├── settings.ts              # LLM 配置读写（chrome.storage.sync）
│   │   ├── settings.test.ts
│   │   └── side-panel-bridge.ts     # 内容脚本 ↔ Service Worker 消息常量
│   └── styles/
│       ├── lumino-vars.css          # 设计令牌（亮/暗双主题 CSS 变量）
│       ├── paper.css                # 扩展页通用 UI
│       └── content-inject.css       # 浮动按钮样式（注入宿主页面）
├── assets/
│   └── icon.png                     # 扩展图标
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
│  sidepanel.tsx  │  options.tsx           │
├─────────────────────────────────────────┤
│  业务逻辑层                               │
│  thread-idb.ts  │  agent-tools.ts       │
│  active-thread-storage.ts                │
├─────────────────────────────────────────┤
│  通信层                                   │
│  llm/openai.ts  │  side-panel-bridge.ts │
├─────────────────────────────────────────┤
│  持久化层                                 │
│  settings.ts (storage.sync)              │
│  thread-idb.ts (IndexedDB)               │
│  active-thread-storage.ts (storage.local)│
├─────────────────────────────────────────┤
│  基础层 (Background / Content Script)     │
│  background.ts  │  floating-button.ts    │
└─────────────────────────────────────────┘
```

## 核心数据流

### 聊天对话流程

```
用户输入 → Side Panel (React)
  │
  ├─ sendUserMessage()
  │   ├─ 构造 OpenAiChatMessage[]
  │   ├─ append 到本地 React state
  │   └─ 调用 requestChatCompletionTurn(settings, messages, tools)
  │       │
  │       └─ POST {baseUrl}/chat/completions（OpenAI 兼容 API）
  │           │
  │           ├─ 正常回复 → 显示 assistant 消息
  │           │
  │           └─ 返回 tool_calls
  │               ├─ executeLuminoToolCall(call)
  │               ├─ 将 tool result append 为 tool 消息
  │               └─ 再次调用 LLM（最多 8 轮工具循环）
  │
  └─ 每轮消息实时写入 IndexedDB（saveThreadMessages）
```

### 悬浮按钮 → 侧栏打开流程

```
用户点击悬浮按钮 (Content Script)
  │
  └─ chrome.runtime.sendMessage({ type: "lumino/open-side-panel" })
      │
      └─ background.ts: onMessage listener
          │
          ├─ 优先通过 tabId 打开 → chrome.sidePanel.open({ tabId })
          └─ 降级通过 windowId 打开 → chrome.sidePanel.open({ windowId })
```

## Agent 工具系统

基于 OpenAI function calling 协议实现，支持模型自主选择调用工具。

### 工具定义

工具通过 `OpenAiToolDefinition[]` 定义，随每次 API 请求的 `tools` 字段发送。

### 当前内置工具

| 工具名 | 功能 | 参数 |
|---|---|---|
| `lumino_get_manifest_version` | 返回扩展版本号 | 无 |
| `lumino_echo` | 回显文本，验证工具调用链路 | `text: string` |

### 工具执行流程

```
模型返回 tool_calls
  → executeLuminoToolCall(call)
    → 按 function.name 分发
    → 执行对应处理函数
    → 返回 JSON 字符串结果
  → append tool 消息到 messages
  → 再次 requestChatCompletionTurn()
  → 循环直到 finish_reason !== "tool_calls" 或达到 MAX_TOOL_ROUNDS (8)
```

## 会话管理

- **存储引擎**: IndexedDB，数据库名 `lumino_chat`，object store `threads`
- **数据结构**: `ChatThreadRecord { id, updatedAt, title?, messages: OpenAiChatMessage[] }`
- **当前会话**: `chrome.storage.local` 存 `lumino_active_thread_id`
- **会话列表**: 按 `updatedAt` 降序排列
- **标题推导**: 从首条用户消息前 25 字截取，兼容旧版 `DEFAULT_THREAD_ID = "default"`

## 配置管理

- LLM 配置通过 `src/lib/settings.ts` 读写 `chrome.storage.sync`
- 支持跨设备同步
- 三项配置：`baseUrl`、`apiKey`、`model`
- 保存时自动 `trim()`，并去除 `baseUrl` 尾部斜杠
- 使用 OpenAI 兼容协议：POST `{baseUrl}/chat/completions`

## 样式系统

- **设计令牌**: `src/styles/lumino-vars.css` — 完整的亮/暗双主题 CSS 变量
- **自动切换**: 通过 `prefers-color-scheme` 媒体查询
- **主题风格**: 软质陪伴感 — 米白底色、柔光渐变、模糊光斑动画
- **UI 组件**: `src/styles/paper.css` — 侧栏和选项页共用
- **注入样式**: `src/styles/content-inject.css` — 仅悬浮按钮，不污染宿主页面

## 测试

- **测试框架**: Vitest（`vitest run`）
- **测试文件**:
  - `src/lib/settings.test.ts` — LLM 配置读写与完整性检查
  - `src/lib/llm/openai.test.ts` — OpenAI API 调用与错误处理
  - `src/content/floating-button.test.ts` — 浮动按钮创建、去重、消息发送（jsdom 环境）

## Chrome 权限

| 权限 | 用途 |
|---|---|
| `storage` | chrome.storage.sync 存 LLM 配置 |
| `sidePanel` | 控制 Side Panel 打开 |
| `<all_urls>` (host_permissions) | 内容脚本在所有页面注入浮动按钮 |

## 现状盘点

### 已完成功能
- 多会话聊天（新建、切换、删除）
- OpenAI 兼容 API 调用（支持任意兼容服务）
- Agent 工具调用（function calling 协议，最多 8 轮循环）
- 悬浮按钮注入所有页面
- 亮/暗双主题自动切换
- LLM 配置持久化与跨设备同步
- 测试覆盖（3 个测试文件）

### 待扩展方向
- 工具数量极少（仅 2 个占位工具），未接入实际浏览器能力（读取页面内容、操作标签页等）
- 没有流式响应（SSE / streaming），当前为一次性 fetch 等待完整回复
- README.md 仍是 Plasmo 模板内容，未更新为项目实际描述
- 缺少 Markdown 渲染，助手回复为纯文本
- 缺少请求重试 / 错误恢复机制
