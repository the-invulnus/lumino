# Lumino

[English](./README_EN.md) | 中文

> 将你浏览的一切，变为你构建的一切。

**Lumino** 是一款驻留在浏览器侧边栏的多模态 AI 助手。使用你自己的 LLM（兼容 OpenAI 协议即可），它能阅读网页、复刻设计、自动填写表单、管理文件，并与你的 Obsidian 笔记库集成——所有操作通过自托管 Agent 循环完成，确保你的数据隐私。

<p align="center">
  <img src="assets/screenshot-1280x800.png" alt="Lumino 截图" width="640" />
</p>

## 功能特性

### 🤖 多 Agent 模式

Lumino 内置四种 Agent，每种针对不同任务调优：

| Agent | 功能 |
|---|---|
| **Chat（通用）** | 全能助手 — 读写文件、浏览网页、爬取资源 |
| **Research（深度调研）** | 跨源深度搜索，将发现整理保存到笔记 |
| **Replicate（设计复刻）** | 提取任意页面的 DOM 结构、CSS 样式和资源 |
| **Automate（页面操控）** | 填写表单、点击元素、按键操作 — 自动化重复任务 |

你还可以创建**自定义 Agent**，配置专属的系统提示词和工具子集。

### 🛠 丰富的内置工具（23+ 个）

| 分类 | 工具 |
|---|---|
| **页面阅读** | `get_page_content` — 通过 Mozilla Readability 提取可读文本 |
| **浏览器交互** | `navigate`、`click_element`、`fill_form`、`press_key`、`scroll`、`screenshot`、`inspect_element`、`close_tab` |
| **页面爬取** | `scrape_structure`、`scrape_styles`、`scrape_resources`、`fetch_resource` |
| **文件系统** | `ls`、`read_file`、`write_file`、`edit_file`、`glob`、`grep`、`rm`、`export` |
| **系统** | `current_page`、`tabs` |
| **PDF** | `read_pdf` — 从 URL 或本地路径提取 PDF 文本 |
| **Obsidian** | 动态 MCP 工具 — `vault_list`、`vault_read`、`vault_write` 等 |

### 🔒 隐私优先

- **API Key 仅存储在本地** `chrome.storage.local` 中 — 不会同步到云端
- 所有 LLM 请求直接从你的浏览器发送到已配置的 API 端点
- 无遥测、无数据统计、无第三方服务器

### 🎨 其他亮点

- **三套主题** — Paper、ORYZO、Fictional
- **国际化** — 英文 / 中文运行时切换
- **OPFS 工作区** — 内置文件系统，在会话中存储和编辑文件
- **思考模式** — 可按模型配置推理/思考参数
- **Markdown 渲染** — 支持 KaTeX 数学公式 + DOMPurify 安全过滤

## 安装

### 方式一：Chrome 应用商店

<a href="https://chromewebstore.google.com/detail/lumino-browse-and-build-w/pgmojincedjeggjgfafpkbmloiiinplj"><img src="https://user-images.githubusercontent.com/585534/107280622-91a8ea80-6a26-11eb-8d07-77c548b28665.png" alt="Chrome 应用商店下载" height="48" /></a>

或在 [Chrome 应用商店](https://chromewebstore.google.com/) 中搜索 **"Lumino"**。

### 方式二：手动安装

```bash
git clone https://github.com/the-invulnus/lumino.git
cd lumino
pnpm install
pnpm build
```

然后打开 `chrome://extensions`，开启**开发者模式**，点击**加载已解压的扩展程序**，选择 `build/chrome-mv3-prod/` 文件夹。

### 方式三：开发模式

```bash
git clone https://github.com/the-invulnus/lumino.git
cd lumino
pnpm install
pnpm dev
```

加载 `build/chrome-mv3-dev` 目录作为未打包的扩展程序。源码改动会自动触发重新构建。

## 配置

安装完成后，打开**选项页**（右键扩展图标 → 选项）进行配置：

1. **LLM 连接** — 设置 OpenAI 兼容的 API 端点（Base URL、API Key、模型名称）。Lumino 兼容任何支持 OpenAI Chat Completions API 的服务商，包括 Ollama、vLLM、Groq、DeepSeek 以及本地模型。

2. **Obsidian 集成**（可选）— 启用 [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) 插件，然后输入你的 Vault 地址和 API Key。Agent 即可直接读写你的笔记。

3. **自定义 Agent**（可选）— 创建带有自定义系统提示词和精选工具集的新 Agent。

4. **主题与语言** — 选择配色方案，切换英文/中文。

## 使用

1. 点击 Chrome 工具栏中的 Lumino 图标打开侧边栏
2. 从侧边导航栏选择一个 Agent 模式（Chat、Research、Replicate 或 Automate）
3. 输入你的提示词 — Agent 将自主执行工具来完成你的任务
4. 每次工具调用都会以可展开卡片的形式展示，方便你查看输入输出
5. 在历史面板中切换不同会话

## 架构

Lumino 基于 [Plasmo](https://docs.plasmo.com/)（Chrome 扩展框架）构建，使用 React 18 和 TypeScript。采用自研 Agent 循环（`while(true)` + tool calling），不依赖第三方 AI SDK。

详细架构文档见 [CLAUDE.md](./CLAUDE.md)。

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | [Plasmo](https://docs.plasmo.com/) 0.90.5 |
| UI | React 18 + TypeScript 5.3 |
| Agent 循环 | 自研 `LlmClient` + `runAgentLoop()` |
| LLM 协议 | OpenAI 兼容 API |
| Schema 校验 | Zod 3.25 |
| 样式 | 纯 CSS 三层架构（tokens / layout / components） |
| 包管理 | pnpm |
| 测试 | Vitest + jsdom |
| 存储 | Chrome Storage API + IndexedDB + OPFS |

## 许可证

MIT © 2026 [the invulnus](https://github.com/the-invulnus)

## 致谢

- [Mozilla Readability](https://github.com/mozilla/readability) — 文章正文提取
- [pdf.js](https://mozilla.github.io/pdf.js/) — PDF 解析
- [KaTeX](https://katex.org/) — 数学公式渲染
- [Plasmo](https://docs.plasmo.com/) — 优秀的扩展开发框架