## Lumino Agent 可集成的工具全景

基于 Lumino 当前的架构（Plasmo + Manifest V3 + OpenAI function calling），已有的 12 个工具集中在 **内存/文件/标签页读取** 三块。下面按层次梳理可以扩展的方向，按**可实现性、浏览器 API 丰富度、用户体验价值**排序：

---

### **🔴 第一梯队：页面交互层**（最能激活"陪伴浏览"场景）

当前 Lumino 只能 **读** 标签页信息，完全无法与页面**交互**。这是最大的空白。

| 工具 | Chrome API | 价值 |
|---|---|---|
| `get_page_content` | `scripting.executeScript` + `document.body.innerText` | 提取当前页面内容，让 Agent"看到"用户在看的文章、表单、商品 |
| `fill_form` | `scripting.executeScript` + DOM 操作 | 帮用户自动填表，"帮我把这个表单填完" |
| `click_element` | `scripting.executeScript` + `element.click()` | 模拟点击，"帮我点那个蓝色按钮" |
| `extract_table` | `scripting.executeScript` + 表格解析 | 提取页面中的表格数据，结构化返回 |
| `screenshot` | `tabs.captureVisibleTab` | 截图当前页面，用于视觉分析（搭配 vision 模型） |
| `scroll_to` | `scripting.executeScript` + `window.scrollTo` | 滚动页面，"翻到评论区" |
| `find_in_page` | `scripting.executeScript` + `window.find()` | 页面内搜索文本 |
| `take_selection` | `scripting.executeScript` + `window.getSelection()` | 获取用户选中的文本，"帮我翻译/总结/解释这段" |
| `inject_highlight` | `scripting.executeScript` + CSS 高亮 | 高亮页面中的关键词 |

---

### **🔴 第二梯队：浏览器控制层**（增强用户对浏览器的操控）

| 工具 | Chrome API | 价值 |
|---|---|---|
| `open_tab` | `tabs.create` | 打开新标签页，"帮我打开 GitHub trending" |
| `close_tab` | `tabs.remove` | 关闭标签页 |
| `switch_tab` | `tabs.update` | 切到指定标签页 |
| `group_tabs` | `tabGroups` | 分组管理标签页，"把关于机器学习的那几个标签页归类" |
| `move_tab` | `tabs.move` | 移动标签页位置/窗口 |
| `reload_tab` | `tabs.reload` | 刷新页面 |
| `go_back` / `go_forward` | `tabs.goBack` / `tabs.goForward` | 前进/后退导航 |
| `bookmark` | `bookmarks.create` / `bookmarks.search` | 书签增删改查，"把这个页面收藏" |
| `history_search` | `history.search` | 搜索浏览历史，"我上周看的那个文章找一下" |
| `download` | `downloads.download` | 触发下载（已有 export 工具，可扩展 URL 下载） |

---

### **🔴 第三梯队：智能感知层**（主动而非被动）

| 工具 | 实现方式 | 价值 |
|---|---|---|
| `detect_page_type` | 页面内容分析 | 自动识别文章/表单/商品/视频/文档，"这看起来是一篇技术博客，需要我总结吗？" |
| `watch_page_change` | MutationObserver + content script | 监听页面 DOM 变化，"商品价格变了" |
| `compare_pages` | 缓存页面内容 + diff | 对比两个页面的内容差异 |
| `extract_structured_data` | JSON-LD / Schema.org 解析 + LLM | 提取页面结构化信息 |

---

### **🔴 第四梯队：通知与后台层**

| 工具 | Chrome API | 价值 |
|---|---|---|
| `set_reminder` | `alarms.create` + `notifications.create` | "30 分钟后提醒我回到这个页面" |
| `notify` | `notifications.create` | 弹出系统通知 |
| `set_timer` | `alarms` | 定时任务，"每 10 分钟检查一次这个页面" |

---

### **🔴 第五梯队：存储与外联层**

| 工具 | Chrome API | 价值 |
|---|---|---|
| `clipboard_write` | `navigator.clipboard.writeText` | 把内容写入剪贴板 |
| `clipboard_read` | `navigator.clipboard.readText` | 读取剪贴板内容 |
| `cookies_get` / `cookies_set` | `cookies` API | 读写 cookie（用于跨站操作） |

---

### **🎯 优先级建议**

结合 Lumino 的"陪伴型助手"定位，我建议的集成顺序：

1. **`get_page_content`** + **`take_selection`** — 让 Agent 真正"看见"页面
2. **`fill_form`** + **`click_element`** — 让 Agent 从旁观者变成参与者
3. **`open_tab` / `switch_tab` / `close_tab`** + **`group_tabs`** — 标签页管理全家桶
4. **`screenshot`** — 视觉能力（需要 vision model）
5. **`bookmark` / `history_search`** — 信息检索增强
6. **`set_reminder` / `notify`** — 后台提醒

这些工具都需要在 `manifest.json` 中注册对应的权限（`scripting`、`tabGroups`、`bookmarks`、`history`、`notifications`、`alarms`、`downloads`、`cookies`、`clipboardRead`），并且在 `tool-definitions.ts` 和 `tool-registry.ts` 中注册。
