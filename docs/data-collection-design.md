# Lumino 数据采集系统 — 实施方案

## 目录

1. [概述](#1-概述)
2. [存储架构](#2-存储架构)
3. [类型定义](#3-类型定义)
4. [采集配置](#4-采集配置)
5. [Content Script 端采集](#5-content-script-端采集)
6. [Background 端采集 + 巡检](#6-background-端采集--巡检)
7. [页面内容采集模块](#7-页面内容采集模块)
8. [文件结构](#8-文件结构)
9. [实施顺序](#9-实施顺序)

---

## 1. 概述

### 设计目标

为 Lumino 插件提供按天粒度的用户浏览行为数据采集，支撑后续的个性化 AI 推荐。

### 核心原则

- **分表存储，精准采集**：不采集无用数据，每种行为独立一张表
- **先判达标，后取内容**：页面停留不足阈值不采集内容，避免存储浪费
- **chrome.storage.local 存临时状态**：tab 打开时间等轻量状态，SW 被杀不丢
- **采集行为可配置**：每个采集项可独立开关，页面采集支持正则忽略名单
- **内容采集模块化**：页面内容提取（turndown）作为可替换模块
- **长生命周期数据走 OPFS 文件**：用户画像、日记忆等语义级数据用 Markdown 文件存储，agent 可直接读写

### 采集清单

| 采集项 | 存储方式 | 存储内容 | 保留期 | 默认开关 |
|---|---|---|---|---|
| 长时间浏览页面 | IDB `page_visits` | URL、标题、域名、完整Markdown内容、停留时长 | 90天 | ✅ |
| 书签变更 | IDB `bookmark_changes` | 标题、URL、父文件夹、操作类型 | 90天 | ✅ |
| 输入框交互 | IDB `input_events` | 域名、输入框类型、完整文本、输入来源(typing/paste) | 7天 | ✅ |
| 下载文件 | IDB `download_records` | 文件名、URL、文件大小、MIME类型 | 90天 | ✅ |
| 复制内容 | IDB `copy_records` | 域名、完整原文 | 7天 | ✅ |
| 日记忆 | OPFS `/lumino/memories/memory-YYYY-MM-DD.md` | 当天记忆摘要、关键词、来源事件引用 | 90天 | — |
| 用户画像 | OPFS `/lumino/memory/profile.md` | 自由格式 Markdown，agent 可语义化读写 | 永久 | — |

---

## 2. 存储架构

### IndexedDB：`lumino`（版本 4）

```
┌──────────────────────────────────────────────────────┐
│ page_visits                                          │
│ keyPath: id                                          │
│ indexes: dateKey, hostname, timestamp                │
│ 保留期: 90天                                          │
├──────────────────────────────────────────────────────┤
│ bookmark_changes                                     │
│ keyPath: id                                          │
│ indexes: dateKey, action, timestamp                  │
│ 保留期: 90天                                          │
├──────────────────────────────────────────────────────┤
│ input_events                                         │
│ keyPath: id                                          │
│ indexes: dateKey, hostname, timestamp                │
│ 保留期: 7天                                           │
├──────────────────────────────────────────────────────┤
│ download_records                                     │
│ keyPath: id                                          │
│ indexes: dateKey, timestamp                          │
│ 保留期: 90天                                          │
├──────────────────────────────────────────────────────┤
│ copy_records                                         │
│ keyPath: id                                          │
│ indexes: dateKey, hostname, timestamp                │
│ 保留期: 7天                                           │
├──────────────────────────────────────────────────────┤
│ threads [已有]                                       │
│ keyPath: id                                          │
├──────────────────────────────────────────────────────┤
│ 【废弃】layer1_events                                │
│ 【废弃】daily_memories（迁移到 OPFS MD 文件）          │
│ 【废弃】insights                                     │
│ 【废弃】profile_updates                              │
└──────────────────────────────────────────────────────┘
```

### OPFS 文件系统（Origin Private File System）

```
/lumino/
├── memory/
│   └── profile.md                          — 用户画像，自由格式 Markdown
│                                           agent 可语义化修改
│
└── memories/
    ├── memory-2026-05-10.md                — 日记忆文件
    ├── memory-2026-05-11.md
    └── memory-2026-05-12.md
        内容格式（Markdown）：
        # 2026-05-12 日记忆
        
        ## 摘要
        今天主要浏览了 React 19 和 Next.js 相关文档...
        
        ## 关键词
        React 19, Next.js, Server Components, Tailwind CSS
        
        ## 来源事件
        - page_visit: abc123 (react.dev)
        - page_visit: def456 (nextjs.org)
        
        ## 手动笔记
        - Agent 于 22:00 追加: 用户对 RSC 特别关注
        
        ## 状态
        status: ok
        lastModifiedBy: agent
        lastModifiedAt: 1734567890000
```

**说明**：OPFS 是浏览器为扩展提供的私有文件系统，<lumino> 存储的目录。存储在这个目录下的文件，agent 和其他模块都可以直接读写。

### chrome.storage.local

```
┌──────────────────────────────────────────────────────┐
│ lumino_tab_timers                                    │
│ 类型: Record<number, number>                         │
│ 内容: { tabId: 打开时间戳 }                           │
│ 用途: SW 巡检时对比当前 tabs，判断浏览时长             │
│                                                       │
│ lumino_collection_config                              │
│ 类型: CollectionConfig                                │
│ 用途: 所有采集开关 + 阈值 + 忽略正则                   │
└──────────────────────────────────────────────────────┘
```

---

## 3. 类型定义

```typescript
// ============================================================
// 页面访问记录
// ============================================================
export type PageVisitRecord = {
  id: string
  url: string
  title: string
  hostname: string
  /** turndown 转换后的完整 Markdown，不截断 */
  markdown: string
  /** 页面语言（document.documentElement.lang） */
  lang: string
  /** 有效停留时长（毫秒） */
  dwellMs: number
  dateKey: string      // "2026-05-13"
  timestamp: number    // Unix ms
}

// ============================================================
// 书签变更事件
// ============================================================
export type BookmarkChangeEvent = {
  id: string
  action: "added" | "removed" | "changed"
  timestamp: number
  dateKey: string
  bookmarkId: string
  title: string
  url?: string
  parentId?: string
  index?: number
}

// ============================================================
// 输入事件
// ============================================================
export type InputEventRecord = {
  id: string
  hostname: string
  nodeType: string       // "input" | "textarea" | "contenteditable"
  placeholder: string
  /** 完整输入文本，不截断 */
  text: string
  inputSource: "typing" | "paste"
  pastedLength?: number
  dateKey: string
  timestamp: number
}

// ============================================================
// 下载记录
// ============================================================
export type DownloadRecord = {
  id: string
  filename: string      // "react-docs.pdf"
  url: string           // 下载来源 URL
  fileSize: number      // 字节
  mime: string          // "application/pdf"
  dateKey: string
  timestamp: number
}

// ============================================================
// 复制记录
// ============================================================
export type CopyRecord = {
  id: string
  hostname: string
  /** 完整原文，不截断，不脱敏 */
  text: string
  dateKey: string
  timestamp: number
}

// ============================================================
// 日记忆（OPFS MD 文件格式约定）
// ============================================================
export type DailyMemoryMarkdown = {
  /** 日期 key */
  date: string
  /** LLM 总结的自由文本 */
  summary: string
  /** 关键词列表 */
  keywords: string[]
  /** 引用的 PageVisit ID / BookmarkChange ID 等 */
  sourceEventIds: string[]
  /** 手动追加笔记 */
  manualNotes?: string[]
  /** 状态 */
  status?: string
  /** 最后修改者 */
  lastModifiedBy?: string
}

// ============================================================
// 采集配置
// ============================================================
export type CollectionConfig = {
  // --- 页面采集 ---
  pageCaptureEnabled: boolean
  /** 最小有效浏览时长（毫秒），默认 180000 = 3 分钟 */
  pageMinDwellMs: number
  /** 巡检间隔（毫秒），默认 60000 = 1 分钟 */
  checkIntervalMs: number
  /** URL 忽略正则列表 */
  pageIgnorePatterns: string[]

  // --- 其他采集开关 ---
  bookmarkCaptureEnabled: boolean
  inputCaptureEnabled: boolean
  downloadCaptureEnabled: boolean
  copyCaptureEnabled: boolean
}
```

---

## 4. 采集配置

### 默认值

```typescript
export const DEFAULT_COLLECTION_CONFIG: CollectionConfig = {
  pageCaptureEnabled: true,
  pageMinDwellMs: 180_000,     // 3 分钟，可配置 1–30 分钟
  checkIntervalMs: 60_000,     // 1 分钟，可配置 30秒 / 1分钟 / 2分钟 / 5分钟
  pageIgnorePatterns: [
    // 搜索引擎结果页
    "google\\.com/search",
    "bing\\.com/search",
    "baidu\\.com/s",
    "duckduckgo\\.com/\\?q=",
    // Chrome 内部页面
    "chrome://",
    "chrome-extension://",
    "about:",
    // 本地开发
    "localhost:",
    "127\\.0\\.0\\.1",
    // 邮件
    "mail\\.google\\.com",
    "outlook\\.live\\.com",
    "outlook\\.office\\.com",
  ],
  bookmarkCaptureEnabled: true,
  inputCaptureEnabled: true,
  downloadCaptureEnabled: true,
  copyCaptureEnabled: true,
}
```

### 配置接口（`src/lib/memory/collection-config.ts`）

```typescript
// 读取配置（含默认值兜底）
getCollectionConfig(): Promise<CollectionConfig>

// 更新部分配置（增量合并）
updateCollectionConfig(partial: Partial<CollectionConfig>): Promise<CollectionConfig>

// 重置为默认
resetCollectionConfig(): Promise<CollectionConfig>

// 检查 URL 是否匹配任一忽略正则
isUrlIgnored(url: string, patterns: string[]): boolean

// 格式化日期 key
formatDateKey(timestamp: number): string  // → "2026-05-13"
```

### Options 页面展示项

- 5 个采集开关（toggle）
- 浏览时长阈值滑块（1–30 分钟）
- 巡检间隔选择（30 秒 / 1 分钟 / 2 分钟 / 5 分钟）
- 忽略 URL 正则列表（可编辑文本域，每行一个正则）
- 「应用」按钮
- 「重置默认」按钮

---

## 5. Content Script 端采集

`src/contents/lumino-input-watcher.ts`，注入到 `<all_urls>`。

### 注入时

1. 向 background 发送 `TAB_OPEN_MESSAGE`（含 tabId）
2. 注册事件监听

### 采集事件

```
┌─ 输入框 focus/blur
│   上报 INPUT_EVENT_MESSAGE
│   字段: hostname, nodeType, placeholder, text, inputSource, pastedLength
│
├─ 输入框 input（节流 2 秒）
│   上报 INPUT_EVENT_MESSAGE
│   字段: 同上 + inputSource = "typing" | "paste"
│
├─ paste 事件
│   标记 pendingPasteSource = true + pendingPastedLength
│   不单独上报，在下一个 input 事件中合并（区分手动输入 vs 粘贴）
│
└─ copy 事件
    上报 COPY_EVENT_MESSAGE
    字段: hostname, text（完整原文，不截断，不脱敏）
```

### 不再采集（相比旧版）

- ~~page_visit~~
- ~~page_scroll~~
- ~~page_click~~
- ~~SPA URL 变化检测~~

### 消息类型

```typescript
const TAB_OPEN_MESSAGE = "lumino/tab-open"
const INPUT_EVENT_MESSAGE = "lumino/input-event"
const COPY_EVENT_MESSAGE = "lumino/copy-event"
```

---

## 6. Background 端采集 + 巡检

`src/background.ts`，Service Worker。

### 消息接收

```
chrome.runtime.onMessage
  ├─ TAB_OPEN_MESSAGE
  │   → 写入 chrome.storage.local.lumino_tab_timers[tabId] = now
  │
  ├─ INPUT_EVENT_MESSAGE
  │   → 检查 config.inputCaptureEnabled
  │   → 写入 IDB input_events
  │
  └─ COPY_EVENT_MESSAGE
      → 检查 config.copyCaptureEnabled
      → 写入 IDB copy_records
```

### 直接 API 监听

```
chrome.bookmarks.onCreated
chrome.bookmarks.onRemoved
chrome.bookmarks.onChanged
  → 检查 config.bookmarkCaptureEnabled
  → 写入 IDB bookmark_changes

chrome.downloads.onCreated
  → 检查 config.downloadCaptureEnabled
  → 写入 IDB download_records
```

### 巡检流程

每 N 分钟由 `chrome.alarms` 触发（间隔从 `config.checkIntervalMs` 读取，默认 1 分钟）：

```
checkDwellAndCapture()
  1. 读取 config
  2. 如果 pageCaptureEnabled = false → return
  3. 读取 chrome.storage.local.lumino_tab_timers
  4. 获取 chrome.tabs.query({}) 当前所有 tabs

  5. 遍历 timers:
     for (tabId in timers):
       elapsed = now - timers[tabId]

       if tabId 不在当前 tabs:
         // tab 已关闭，内容拿不到了
         → 删除 timers[tabId]

       else if elapsed >= pageMinDwellMs:
         // 达标：注入采集脚本获取内容
         → capturePageContent(tabId, ignorePatterns)
         → 检查忽略正则 → 通过则写入 IDB page_visits
         → 删除 timers[tabId]

       else:
         // 未达标，等下次巡检
         → pass

  6. 遍历当前 tabs:
     for (tab in tabs):
       if tab.id 不在 timers:
         if tab.url 符合忽略正则 → pass
         → 写入 timers[tab.id] = now
```

### 巡检 alarm 管理

```typescript
const DWELL_CHECK_ALARM = "lumino/dwell-check"

// 根据 config.checkIntervalMs 动态注册 alarm
// 当用户修改巡检间隔配置时调用
async function rescheduleDwellAlarm(): Promise<void> {
  await chrome.alarms.clear(DWELL_CHECK_ALARM)
  const config = await getCollectionConfig()
  chrome.alarms.create(DWELL_CHECK_ALARM, {
    periodInMinutes: Math.max(0.5, config.checkIntervalMs / 60000)
  })
}
```

---

## 7. 页面内容采集模块

`src/lib/memory/page-capture.ts`

### 设计原则

- **可替换**：模块对外暴露单一接口 `capturePageContent(tabId, ignorePatterns)`，内部实现可自由更换
- **引入 turndown**：HTML → Markdown 转换，过滤噪音标签

### 接口

```typescript
/**
 * 注入脚本到指定 tab，采集完整页面内容。
 * 返回 PageVisitRecord，或 null（采集失败/被忽略/URL 匹配忽略正则）。
 */
export async function capturePageContent(
  tabId: number,
  ignorePatterns: string[]
): Promise<PageVisitRecord | null> {
  // 1. 获取 tab 信息
  const tab = await chrome.tabs.get(tabId)
  
  // 2. 检查忽略名单
  if (isUrlIgnored(tab.url ?? "", ignorePatterns)) {
    return null
  }

  // 3. 注入采集脚本
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractPageAsMarkdown  // 在页面上下文执行的函数
    // 注意：turndown 在页面上下文中需要提前注入或打包
  })

  const data = results[0]?.result as PageMarkdownData | undefined
  if (!data) return null

  // 4. 返回完整记录
  return {
    id: generateId(),
    url: data.url,
    title: data.title,
    hostname: data.hostname,
    markdown: data.markdown,
    lang: data.lang,
    dwellMs: /* 从 storage.tab_timers 计算 elapsed */,
    dateKey: formatDateKey(Date.now()),
    timestamp: Date.now()
  }
}

/**
 * 在页面上下文执行的采集函数。
 * 必须是一个独立的、可序列化的函数（不能引用外部作用域变量）。
 * turndown 库需要通过 plasmo 的构建系统打包到 content script bundle 中。
 */
function extractPageAsMarkdown(): PageMarkdownData {
  // turndown 在构建时通过 import 打包到 content script bundle
  const TurndownService = /* turndown 打包引用 */
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced"
  })
  
  // 过滤噪音标签
  td.remove([
    "nav", "footer", "aside",
    "script", "style", "svg", "noscript",
    "iframe", "form", "header"
  ])

  const markdown = td.turndown(document.body)

  return {
    url: location.href,
    title: document.title,
    hostname: location.hostname,
    markdown,
    lang: document.documentElement.lang || ""
  }
}

type PageMarkdownData = {
  url: string
  title: string
  hostname: string
  markdown: string
  lang: string
}
```

### 替换方式

如果想换掉 turndown 或用自研方案：

1. 修改 `extractPageAsMarkdown` 函数内部实现
2. 或替换 `capturePageContent` 中 `scripting.executeScript` 的 `func` 参数
3. 外部调用方不受影响——`capturePageContent` 接口签名不变

---

## 8. 文件结构

```
新建文件:
  src/lib/memory/page-capture.ts           — 页面内容采集模块（turndown）
  src/lib/memory/page-visit-idb.ts         — page_visits IDB CRUD
  src/lib/memory/input-event-idb.ts        — input_events IDB CRUD
  src/lib/memory/download-record-idb.ts    — download_records IDB CRUD
  src/lib/memory/copy-record-idb.ts        — copy_records IDB CRUD
  src/lib/memory/collection-config.ts      — 采集配置读写
  src/lib/memory/dwell-checker.ts          — 巡检逻辑 + alarm 管理
  src/lib/memory/daily-memory-md.ts        — OPFS MD 文件读写（日记忆）

修改文件:
  src/lib/db.ts                            — 版本升至 4，新建 5 张表，废弃 daily_memories/insights/profile_updates/layer1_events
  src/lib/memory/types.ts                  — 新增独立类型 + CollectionConfig；废弃 Layer1Event/DailyMemoryEntry/ConversationInsight 等 IDB 类型
  src/lib/memory/memory-idb.ts             — 移除 layer1_events/daily_memories/insights 方法，仅保留 threads 操作
  src/lib/memory/user-profile.ts           — 画像读写改为 OPFS profile.md
  src/lib/memory/daily-memory.ts           — 日记忆读写改为 OPFS memory-YYYY-MM-DD.md
  src/background.ts                        — 完全重写
  src/contents/lumino-input-watcher.ts     — 缩减为 input + copy
  src/options.tsx                          — 新增采集配置 UI

废弃删除:
  src/lib/memory/event-collector.ts        — Layer1Event 统一采集器
  src/lib/memory/event-store.ts            — Layer1Event 存储代理
  src/lib/memory/dwell-tracker.ts          — 内存 dwellMap
  src/lib/memory/privacy-filter.ts         — 正则配置替代
  src/lib/memory/retriever.ts              — 不再从 IDB 检索（后续从 OPFS MD 文件检索）
  src/lib/memory/search-index.ts           — 不再需要 BM25 搜索 IDB（后续改为文件搜索）
  src/lib/memory/bm25.ts                   — 同上
  src/lib/memory/tokenizer.ts              — 同上
  src/lib/memory/context-builder.ts        — 不再需要补全上下文
  src/lib/completion/*                     — 补全功能（禁用已久）
```

---

## 9. 实施顺序

### Phase 1：基础设施

| 步骤 | 文件 | 内容 |
|---|---|---|
| 1.1 | `package.json` | 添加 `turndown` 依赖 |
| 1.2 | `src/lib/memory/types.ts` | 新增 PageVisitRecord / InputEventRecord / DownloadRecord / CopyRecord / CollectionConfig；废弃 Layer1Event 相关 |
| 1.3 | `src/lib/db.ts` | 版本升至 4，新建 5 张表，废弃 layer1_events/daily_memories/insights/profile_updates |
| 1.4 | `src/lib/memory/collection-config.ts` | 配置读写 + formatDateKey + isUrlIgnored |

### Phase 2：IDB 操作层 + OPFS 文件层

| 步骤 | 文件 | 内容 |
|---|---|---|
| 2.1 | `src/lib/memory/page-visit-idb.ts` | 写入、按 dateKey 查询、清理 |
| 2.2 | `src/lib/memory/input-event-idb.ts` | 写入、按 dateKey 查询、清理 |
| 2.3 | `src/lib/memory/download-record-idb.ts` | 写入、按 dateKey 查询、清理 |
| 2.4 | `src/lib/memory/copy-record-idb.ts` | 写入、按 dateKey 查询、清理 |
| 2.5 | `src/lib/memory/memory-idb.ts` | 移除废弃方法，仅保留 threads 操作 |
| 2.6 | `src/lib/memory/daily-memory-md.ts` | OPFS MD 文件读写（memory-YYYY-MM-DD.md） |
| 2.7 | `src/lib/memory/user-profile.ts` | 画像读写改为 OPFS profile.md |
| 2.8 | `src/lib/memory/daily-memory.ts` | 日记忆逻辑改为调用 daily-memory-md.ts |

### Phase 3：采集模块

| 步骤 | 文件 | 内容 |
|---|---|---|
| 3.1 | `src/lib/memory/page-capture.ts` | turndown 封装，可替换模块 |
| 3.2 | `src/lib/memory/dwell-checker.ts` | 巡检逻辑 + alarm 管理 |
| 3.3 | `src/contents/lumino-input-watcher.ts` | 缩减为 input + copy 采集 |
| 3.4 | `src/background.ts` | 完全重写 |

### Phase 4：配置 UI + 清理

| 步骤 | 文件 | 内容 |
|---|---|---|
| 4.1 | `src/options.tsx` | 采集配置界面 |
| 4.2 | 废弃文件 | 删除 event-collector / event-store / dwell-tracker / privacy-filter / retriever / search-index / bm25 / tokenizer / context-builder / completion |
| 4.3 | 编译验证 | `npx tsc --noEmit` |

---

## 附录：完整数据流总览

```
Content Script 注入 (<all_urls>)
  │
  ├─ TAB_OPEN_MESSAGE ──────────► storage.tab_timers[tabId] = now
  ├─ INPUT_EVENT_MESSAGE ───────► IDB input_events
  └─ COPY_EVENT_MESSAGE ────────► IDB copy_records

chrome.bookmarks.on* ────────────► IDB bookmark_changes
chrome.downloads.onCreated ──────► IDB download_records

chrome.alarms (每 N 分钟，可配置)
  │
  ├─ 读 storage.tab_timers
  ├─ 对比 chrome.tabs.query({})
  ├─ 已关闭 → 清理记录
  ├─ 未达标 → 等下次
  └─ 已达标 → scripting.executeScript
                │
                ├─ turndown 采集完整 Markdown
                └─ IDB page_visits

日终处理 (每天定时，后续实现)
  │
  ├─ 从 IDB 各表聚合当天数据
  ├─ LLM 生成日记忆摘要
  └─ 写入 OPFS /lumino/memories/memory-YYYY-MM-DD.md

Agent 对话
  │
  ├─ 读 OPFS /lumino/memory/profile.md（自由格式，无 schema 约束）
  ├─ 读 OPFS /lumino/memories/memory-*.md（按日期检索）
  └─ 写 OPFS 追加笔记 / 修改画像
```
