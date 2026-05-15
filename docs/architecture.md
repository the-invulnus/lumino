# Lumino 架构文档

## 项目概述

Lumino 是一款基于 Plasmo 框架构建的 Chrome 浏览器扩展，定位为「陪伴型 AI 助手」。用户通过 Side Panel 与 AI 对话，AI 通过 function calling 自主调度内置工具系统，可读取网页内容、操作 DOM、管理文件、存取 Obsidian 笔记。配备完整的三层记忆系统和 OPFS 文件系统工作区。

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | [Plasmo](https://docs.plasmo.com/) 0.90.5 |
| UI | React 18 + TypeScript 5.3 |
| 样式 | 纯 CSS（`lumino-vars.css` + `paper.css` 软质 UI） |
| 包管理 | pnpm |
| 测试 | Vitest + jsdom |
| 存储 | Chrome Storage API + IndexedDB + OPFS |
| LLM | OpenAI 兼容协议（function calling） |

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
│   │   │   ├── agent-loop.ts               # Agent 循环：LLM → 工具调用 → 结果注入
│   │   │   ├── openai-messages.ts          # OpenAI 消息/工具调用类型
│   │   │   ├── system-prompt.ts            # 系统提示词（静态 + 动态画像/记忆 + Obsidian）
│   │   │   ├── thread-idb.ts               # IndexedDB 会话 CRUD
│   │   │   ├── tool-definitions.ts         # 工具 JSON Schema（基础 + Obsidian 动态合并）
│   │   │   ├── tool-executor.ts            # 工具注册表 & 统一执行
│   │   │   ├── tool-eviction.ts            # 大结果驱逐 & 定时清理
│   │   │   ├── tool-registry.ts            # 工具注册（基础工具 + Obsidian 条件注册）
│   │   │   └── tools/
│   │   │       ├── browser-tools.ts        # 浏览器交互：get_page_content / inspect_element / fill_form / click_element / screenshot / navigate
│   │   │       ├── fs-tools.ts             # 文件系统：ls / read_file / write_file / edit_file / glob / grep / rm / export
│   │   │       ├── memory-tools.ts         # 记忆系统：memory_get / memory_search
│   │   │       ├── obsidian-tools.ts       # Obsidian 集成：list / read / write / append / patch / search / open
│   │   │       ├── system-tools.ts         # 浏览器系统：current_page / tabs / get_active_tab_id
│   │   │       └── browser-tools.test.ts   # DOM 探查注入函数单元测试
│   │   ├── llm/
│   │   │   ├── types.ts
│   │   │   ├── openai.ts
│   │   │   └── openai.test.ts
│   │   ├── memory/
│   │   │   ├── types.ts                    # 三层记忆类型
│   │   │   ├── memory-idb.ts              # 记忆 IndexedDB CRUD
│   │   │   ├── daily-memory.ts            # Layer 2 日记忆（LLM 总结）
│   │   │   ├── daily-memory-md.ts         # 日记忆 Markdown 导出
│   │   │   ├── user-profile.ts            # 用户画像
│   │   │   ├── collection-config.ts       # 采集配置
│   │   │   ├── dwell-checker.ts           # 页面停留巡检
│   │   │   ├── bookmark-watcher.ts        # 书签变更监听
│   │   │   ├── page-capture.ts            # 页面内容采集
│   │   │   ├── page-visit-idb.ts          # 页面访问记录
│   │   │   ├── input-event-idb.ts         # 输入事件记录
│   │   │   ├── copy-record-idb.ts         # 复制记录
│   │   │   ├── download-record-idb.ts     # 下载记录
│   │   │   └── memory-scheduler.ts        # 定时任务调度（已禁用）
│   │   ├── fs/
│   │   │   ├── workspace.ts               # OPFS 工作区操作
│   │   │   └── opfs.ts                    # OPFS 底层封装
│   │   ├── settings.ts                    # LLM + Obsidian 配置读写
│   │   ├── settings.test.ts
│   │   ├── side-panel-bridge.ts           # Background ↔ Side Panel 消息协议
│   │   └── db.ts                          # IndexedDB 统一连接
│   └── styles/
│       ├── lumino-vars.css                # 设计令牌（亮/暗双主题）
│       ├── paper.css                      # 软质 UI 组件
│       └── content-inject.css             # 悬浮按钮样式
├── docs/
│   └── architecture.md                    # 本文档
└── assets/                                # 静态资源
```

## Agent 工具系统

Agent 通过 OpenAI function calling 协议调用内置工具，当前共 **28 个工具**（含条件激活的 7 个 Obsidian 工具）。

### 工具分类

#### 记忆系统（2 个）
| 工具 | 说明 |
|---|---|
| `memory_get` | 读取指定日期的日记忆全文 |
| `memory_search` | BM25 全文搜索历史记忆和洞察 |

#### 文件系统（8 个）
| 工具 | 说明 |
|---|---|
| `ls` | 列出工作区目录（OPFS） |
| `read_file` | 读取文件（支持 offset/limit 分页） |
| `write_file` | 创建或覆写文件 |
| `edit_file` | 精确字符串替换编辑 |
| `glob` | glob 模式匹配文件 |
| `grep` | 正则/字面量搜索文件内容 |
| `rm` | 删除文件或目录 |
| `export` | 导出文件到本地下载目录 |

#### 浏览器系统（3 个）
| 工具 | 说明 |
|---|---|
| `current_page` | 获取当前标签页 URL、标题 |
| `tabs` | 列出所有打开标签页 |
| `get_active_tab_id` | 获取当前活跃标签页 ID，用于后续操作锁定 |

#### 浏览器交互（6 个）
| 工具 | 说明 |
|---|---|
| `get_page_content` | 提取页面文本（text / full_html / structured 三种模式） |
| `take_selection` | 获取用户选中的文本 |
| `inspect_element` | 探查 DOM 结构，返回属性、交互性、候选选择器 |
| `fill_form` | 填充表单字段，支持 `submit: true` 自动提交 |
| `click_element` | 点击页面元素 |
| `screenshot` | 页面可见区域截图 |
| `navigate` | 打开 URL（新开 tab 或复用已有 tab） |

#### Obsidian 集成（7 个，条件激活）
| 工具 | 说明 |
|---|---|
| `obsidian_list` | 列出 vault 目录 |
| `obsidian_read` | 读取笔记内容 |
| `obsidian_write` | 创建或覆写笔记 |
| `obsidian_append` | 向笔记末尾追加 |
| `obsidian_patch` | 精确定位修改（heading / frontmatter / block） |
| `obsidian_search` | 全文搜索 vault |
| `obsidian_open` | 在 Obsidian UI 中打开文件 |

所有浏览器交互工具和 Obsidian 工具均返回结构化 JSON，失败时携带 `error` 字段和 `message` 说明。

### 工具注册机制

- `tool-registry.ts` 中 `registerBaseTools()` 注册基础工具（幂等，仅一次）
- Obsidian 工具每次 `registerAllTools()` 调用时重新检查 `isObsidianConfigured()` 后条件注册
- `tool-definitions.ts` 中 `getLuminoAgentTools()` 根据配置动态合并 BASE_TOOLS + OBSIDIAN_TOOLS
- `system-prompt.ts` 中 `buildAgentMessages()` 仅在配置后注入 Obsidian 使用指引

### 标签页锁定机制

Agent 在首次浏览器操作前调用 `get_active_tab_id` 获取当前页面 `tab_id`，后续所有浏览器工具通过 `tab_id` 参数操作目标页面。这确保了 agent 始终工作在用户最初指定的页面上，不受用户切换标签页影响。

`navigate` 工具同样支持 `tab_id`：首次不传则新开后台 tab，后续传 `tab_id` 则在已有 tab 上跳转，避免堆积。

### 大结果驱逐

- `tool-eviction.ts` 中 `maybeEvictToolResult()` 统一处理工具返回结果
- 超过 80,000 字符时触发驱逐：预览摘要返回给 LLM，完整内容写入 `/large_tool_results/`
- 文件命名：`{toolName}_{timestamp}_{sanitizedId}.txt`
- `background.ts` 中通过 `chrome.alarms` 每 30 分钟调用 `cleanupEvictedFiles()` 清理超过 1 小时的驱逐文件

## 记忆系统

三层记忆架构：

| 层 | 说明 | 状态 |
|---|---|---|
| Layer 1 | 浏览事件采集（页面访问、停留、输入、复制、下载、书签） | 事件采集运行中，主动 AI 已禁用 |
| Layer 2 | LLM 日记忆生成（每日总结 + 关键词 + 状态评估） | 可通过 Agent 工具读写 |
| Layer 3 | BM25 全文检索 + 时间衰减排序 | `memory_search` 工具 |

## 配置管理

### LLM 配置（chrome.storage.sync）
- `baseUrl`：OpenAI 兼容 API 地址
- `apiKey`：API 密钥
- `model`：模型名称
- `hasCompleteLlmSettings()` 检查三项是否齐全

### Obsidian 集成配置（chrome.storage.sync）
- `obsidianEnabled`：是否启用
- `obsidianApiKey`：Local REST API 的 API Key
- `obsidianBaseUrl`：API 地址（默认 `http://127.0.0.1:27123`）
- `isObsidianConfigured()` 检查是否已启用且配置齐全
- 通过 Obsidian Local REST API 插件通信，静默读写 vault

### 采集配置（chrome.storage.sync）
- 页面停留、输入框、复制、书签、下载等采集开关
- 最小停留时长、巡检间隔
- 忽略 URL 正则模式

## OPFS 存储布局

```
OPFS (navigator.storage.getDirectory)
  └── lumino/
      ├── memory/                    # 用户画像 + 日记忆 Markdown
      │   ├── profile.json
      │   └── 2026-05-10.md
      └── workspace/                 # Agent 工作区
          ├── (Agent 通过 fs-tools 管理)
          └── large_tool_results/    # 被驱逐的大工具结果（每小时自动清理）
```

## IndexedDB

统一数据库 `lumino`：

| Store | Key | 索引用途 |
|---|---|---|
| `threads` | `id` | 聊天会话 CRUD |
| `layer1_events` | `id` | 浏览事件（按 timestamp/type 索引） |
| `daily_memories` | `date` | 日记忆（按 createdAt 索引） |
| `insights` | `id` | 对话洞察 |
| `profile_updates` | `id` | 画像更新记录 |

## Side Panel ↔ Background 通信

通过 `side-panel-bridge.ts` 定义消息协议：

| 消息类型 | 方向 | 说明 |
|---|---|---|
| `START_AGENT` | Side Panel → BG | 启动 Agent 执行 |
| `STOP_AGENT` | Side Panel → BG | 中止 Agent |
| `AGENT_PROGRESS` | BG → Side Panel | 推送工具调用进度 |
| `AGENT_COMPLETE` | BG → Side Panel | Agent 执行完成 |
| `AGENT_ERROR` | BG → Side Panel | 执行错误 |
| `AGENT_RUNNING_STATE` | BG → Content | 广播运行状态（控制悬浮按钮动画） |
| `SIDEPANEL_STATE` | BG → Content | 广播侧栏开关状态 |

Agent 在 Service Worker 中执行，不依赖 Side Panel 生命周期。Side Panel 关闭不影响 Agent 继续运行。

## Chrome 权限

| 权限 | 用途 |
|---|---|
| `storage` | LLM/Obsidian/采集 配置持久化 |
| `sidePanel` | 控制 Side Panel 打开 |
| `alarms` | Dwell 巡检 + 驱逐文件定时清理 |
| `tabs` | 浏览器工具查询/操作标签页 |
| `downloads` | export 工具导出文件 |
| `history` | 浏览历史（预约） |
| `bookmarks` | 书签变更监听 |
| `scripting` | 浏览器工具注入脚本到页面 |
| `<all_urls>` | 悬浮按钮注入 + 脚本注入 |

## 测试

- 框架：Vitest + jsdom
- 测试文件：
  - `src/lib/settings.test.ts` — LLM 配置读写与完整性
  - `src/lib/llm/openai.test.ts` — OpenAI API 调用与错误处理
  - `src/content/floating-button.test.ts` — 浮动按钮创建/去重
  - `src/lib/chat/tools/browser-tools.test.ts` — DOM 探查注入函数

## 样式系统

- 设计令牌：`lumino-vars.css`（亮/暗双主题 CSS 变量，`prefers-color-scheme` 自动切换）
- UI 组件：`paper.css`（软质陪伴感 — 米白底色、柔光渐变、模糊光斑动画）
- 注入样式：`content-inject.css`（悬浮按钮自适应定位，不污染宿主页面）

## 现状盘点

### 已完成
- 多会话聊天（新建、切换、删除）
- OpenAI 兼容 API 调用 + function calling Agent 循环
- 28 个内置工具（浏览器交互、文件系统、记忆系统、Obsidian 集成）
- 标签页锁定机制（agent 不受用户切换 tab 影响）
- 大结果驱逐 + 定时清理
- Obsidian Local REST API 集成（条件激活，静默读写 vault）
- 悬浮按钮注入 `<all_urls>`
- 亮/暗双主题自动切换
- 三层记忆系统（事件采集运行中，主动 AI 已禁用）
- Dwell 巡检 + 驱逐清理定时任务
- 用户画像自动推断
- Agent 在 Service Worker 执行，不受侧栏生命周期影响

### 待扩展
- LLM 流式响应（当前为一次性 fetch）
- Agent 请求重试 / 错误恢复机制
- Markdown 渲染（当前助手回复为纯文本）
- 主动 AI 功能恢复（AI 文本补全、自动日记忆生成）
- 工具可进一步扩展（书签管理、标签分组等浏览器能力）
- 测试覆盖可进一步加强（memory / fs / obsidian 模块）
