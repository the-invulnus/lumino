# Lumino - AI 网页助手、总结与笔记

简体中文 · [English](README_EN.md)

> 把网页，变成成果。

Lumino 是浏览器侧边栏中的 AI 助手。引用正在阅读的网页、多个标签页或工作区文件，在同一个对话中完成总结、对比、笔记整理和网页操作。

![Lumino](assets/promo-tiles/marquee-promo-1400x560.jpg)

## 功能

- **统一助手**：网页问答、文章总结、多页对比、页面设计采集和浏览器操作。
- **明确的引用**：网页和文件以 chip 展示；网页引用可切回原标签页，文件引用可打开预览。
- **文件工作区**：上传、收藏、搜索、排序、预览、文本编辑和导出；支持图标与列表视图。
- **固定目录**：`uploads/` 保存上传文件，`downloads/` 保存下载资源，`favorite/` 保存收藏，`screenshots/` 保存截图，`notes/` 整理笔记，`projects/` 保存助手的新建成果。
- **快捷任务**：保存常用指令，一键带入对话；由用户主动运行，不是定时任务。
- **历史会话**：搜索、按时间分组、折叠分组，以及消息编辑和重新生成。
- **可查看的执行过程**：工具调用与思考过程可以整体收起，运行时可以停止任务。
- **可选 Obsidian MCP**：配置兼容服务后，读取和整理自己的笔记。
- **自动选择语言**：首次使用跟随 Chrome 界面语言，中文环境使用中文，其余使用 English；支持手动切换并保留已有偏好。

## 安装

[从 Chrome 应用商店安装](https://chromewebstore.google.com/detail/pgmojincedjeggjgfafpkbmloiiinplj)

手动安装：下载可用的扩展 ZIP，解压后打开 `chrome://extensions`，启用“开发者模式”，点击“加载已解压的扩展程序”，选择解压目录。

从源码构建：

```bash
git clone https://github.com/the-invulnus/lumino.git
cd lumino
pnpm install
pnpm build
```

加载 `build/chrome-mv3-prod/`。开发时运行 `pnpm dev` 并加载 `build/chrome-mv3-dev/`；运行 `pnpm package` 生成 `build/chrome-mv3-prod.zip`。

## 首次使用

1. 打开扩展设置，填写 OpenAI 兼容接口地址、API Key 和支持工具调用的模型名称。
2. 点击 Lumino 图标打开侧边栏。
3. 选择参考网页，或上传并引用文件，输入任务。
4. 在工作区中查看和继续处理生成的文件；把常用指令保存为快捷任务。

Lumino 不内置模型访问额度。模型服务的效果、可用性与费用由你选择的提供方决定。Obsidian 集成需要单独运行兼容的 MCP 服务，并在设置中启用。

## 数据与隐私

凭证保存在 `chrome.storage.local`；会话使用 IndexedDB，文件使用浏览器 OPFS。执行任务时，相关对话、网页内容、截图或文件片段会按功能需要发送给你配置的模型服务或 Obsidian 服务。Lumino 不将这些数据上传到开发者服务器，不内置广告或行为分析。主题与旧自定义 Agent 配置可能使用 Chrome 同步存储。

详见[隐私政策](PRIVACY.md)。卸载扩展会移除其本地数据，请先导出需要保留的文件。

## 开发

Plasmo · React 18 · TypeScript · Vitest · IndexedDB / OPFS

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm package
```

商店素材与中英文文案见 [marketing](marketing/README.md)。

MIT © 2026 [the invulnus](https://github.com/the-invulnus)
