/**
 * English dictionary
 *
 * key 命名：点分命名空间。新增 key 时 en.ts 与 zh.ts 必须同步。
 */

export const en: Record<string, string> = {
  // ── 内置 Agent 名称/描述 ──
  "agent.chat.name": "Chat",
  "agent.chat.desc": "All-in-one: read & write files, control pages, scrape resources",
  "agent.research.name": "Research",
  "agent.research.desc": "Deep search across sources, save summaries to your notes",
  "agent.replicate.name": "Replicate",
  "agent.replicate.desc": "Extract structure & styles, replicate any page's design",
  "agent.automate.name": "Automate",
  "agent.automate.desc": "Auto-fill forms, click & type — automate repetitive pages",

  // ── 聊天界面 ──
  "chat.send": "Send",
  "chat.stop": "Stop generating",
  "chat.placeholder": "Enter to send, Shift+Enter for new line",
  "chat.composerAria": "Message input",
  "chat.loading": "Loading…",
  "chat.emptyHintNoThread": "Type a message below to start a new conversation.",
  "chat.emptyHintNewThread": "Type and send below to begin.",
  "chat.editHint": "Enter to send · Shift+Enter for new line · Esc to cancel",
  "chat.notConfigured": "Please set up Base URL, API Key, and Model in Settings first.",
  "chat.openSettings": "Open Settings",
  "chat.error.read": "Failed to load conversation.",
  "chat.error.start": "Failed to start. Please retry.",
  "chat.error.config": "Please configure Base URL, API Key, and Model in Settings first.",
  "chat.error.modelRequest": "Model request failed. Please check your configuration and retry.",

  // 聊天操作按钮
  "chat.tooltip.rename": "Click to rename conversation",
  "chat.tooltip.newThread": "New conversation",
  "chat.tooltip.deleteThread": "Delete this conversation",
  "chat.confirmDeleteThread": "Delete this conversation?",
  "chat.tooltip.history": "History",
  "chat.action.regenerate": "Regenerate",
  "chat.action.retry": "Retry",
  "chat.action.copy": "Copy",
  "chat.action.copyMessage": "Copy message",
  "chat.action.delete": "Delete",
  "chat.action.deleteMessage": "Delete this message",
  "chat.action.edit": "Edit",
  "chat.action.editMessage": "Edit message",

  // ── 会话默认标题 ──
  "thread.defaultTitle": "New chat",
  "thread.placeholder": "Chat",
  "thread.empty": "Empty chat",

  // ── 导航栏 ──
  "nav.home": "Home",
  "nav.settings": "Settings",
  "nav.ariaLabel": "Navigation",

  // ── 首页 ──
  "home.tagline": "Turn what you browse into what you build.",
  "home.recent": "Recent chats",
  "home.historyTooltip": "History",

  // ── 历史面板 ──
  "history.title": "History ({count})",
  "history.search": "Search chats…",
  "history.empty": "No history yet",
  "history.notFound": "No matching chats found",
  "history.delete": "Delete",

  // ── 设置页导航 ──
  "option.nav.llm": "Model",
  "option.nav.obsidian": "Obsidian",
  "option.nav.agents": "Agents",
  "option.nav.general": "General",

  // LLM 面板
  "option.llm.title": "Model Connection",
  "option.llm.desc": "Configure an OpenAI-compatible API. Once connected, the agent will talk to the model through this API.",

  // 思考配置（thinking mode）
  "option.thinking.title": "Thinking Mode Config",
  "option.thinking.desc": "Each mode corresponds to a set of request-body fields. Configure the JSON to match your model, then pick a mode during agent chat.",
  "option.thinking.reset": "Reset",
  "option.thinking.resetConfirm": "Reset will overwrite your current thinking mode config. Continue?",
  "option.thinking.label": "Label",
  "option.thinking.rename": "Rename",
  "option.thinking.configure": "Configure request body",
  "option.thinking.remove": "Remove",
  "option.thinking.add": "Add mode",
  "option.thinking.save": "Save",
  "option.thinking.cancel": "Cancel",
  "option.thinking.bodyInvalidJson": "Invalid JSON — mode body not saved until fixed",
  "option.thinking.bodyMustObject": "Body must be a JSON object (not array/primitive)",

  // Obsidian 面板
  "option.obsidian.title": "Obsidian Integration",
  "option.obsidian.desc": "Connect to the Obsidian Local REST API so the agent can read and write your vault directly.",
  "option.obsidian.enable": "Enable Obsidian integration",
  "option.obsidian.apiKeyPlaceholder": "Get it from Obsidian settings",
  "option.obsidian.whatTitle": "What is this?",
  "option.obsidian.whatDesc": "Obsidian is a local note-taking app. After connecting, the agent can read your notes, create new ones, and append content to existing notes — so it can save research, meeting summaries, or any output directly into your vault.",
  "option.obsidian.setupTitle": "How to set up",
  "option.obsidian.step1": "Install the \"Local REST API with MCP\" community plugin in Obsidian (Settings → Community plugins → Browse → search \"Local REST API with MCP\" → Install → Enable).",
  "option.obsidian.step2": "Open the plugin's settings (Settings → Community plugins → Local REST API with MCP).",
  "option.obsidian.step3": "Copy the API key shown in the plugin settings and paste it below. The default address is http://127.0.0.1:27123 — leave it as is unless you changed the port.",
  "option.obsidian.step4": "Keep Obsidian running while using this feature.",

  // 自定义 Agent 面板
  "option.agents.title": "Custom Agents",
  "option.agents.desc": "Create your own AI agents with a dedicated system prompt and tool set.",
  "option.agents.noTools": "No tools",
  "option.agents.toolCount": "{n} tools",
  "option.agents.edit": "Edit",
  "option.agents.delete": "Delete",
  "option.agents.new": "New Agent",
  "option.agents.editTitle": "Edit Agent",
  "option.agents.newTitle": "New Agent",
  "option.agents.name": "Name",
  "option.agents.namePlaceholder": "My assistant",
  "option.agents.icon": "Icon",
  "option.agents.prompt": "System Prompt",
  "option.agents.promptPlaceholder": "You are a…",
  "option.agents.tools": "Available tools",
  "option.agents.create": "Create",
  "option.agents.update": "Update",
  "option.agents.cancel": "Cancel",

  // 设置页通用
  "option.save": "Save",
  "option.saving": "Saving…",
  "option.saveSettings": "Save Settings",
  "option.saved": "Saved",
  "option.saveFailed": "Save failed",

  // 通用语言切换
  "option.language": "Language",
  "option.languageEn": "English",
  "option.languageZh": "中文",

  // ── 工具组标签（options 页工具选择器）──
  "toolgroup.fs": "File System",
  "toolgroup.browser": "Browser",
  "toolgroup.scrape": "Page Scraping",
  "toolgroup.pdf": "PDF",

  // 文件系统工具
  "tool.ls.desc": "List files and subdirectories in a workspace folder",
  "tool.read_file.desc": "Read file contents in the workspace, with pagination",
  "tool.write_file.desc": "Create or overwrite a file in the workspace",
  "tool.edit_file.desc": "Apply precise string-replacement edits to a file",
  "tool.glob.desc": "Find files matching a glob pattern",
  "tool.grep.desc": "Search text across workspace files",
  "tool.rm.desc": "Delete a file or empty directory in the workspace",
  "tool.export.desc": "Export a workspace file or folder to your local downloads",

  // 浏览器系统工具
  "tool.current_page.desc": "Get the URL and title of the active tab",
  "tool.tabs.desc": "List all open tabs in the browser",

  // 页面阅读工具
  "tool.get_page_content.desc": "Read the visible text content of the current page",
  
  // 浏览器交互工具
  "tool.inspect_element.desc": "Inspect the DOM structure of interactive elements",
  "tool.fill_form.desc": "Auto-fill a form on the page",
  "tool.click_element.desc": "Click a specified element on the page",
  "tool.screenshot.desc": "Take a screenshot of the current page",
  "tool.scroll.desc": "Scroll the page to a position or element",
  "tool.press_key.desc": "Simulate key presses on the page",
  "tool.navigate.desc": "Open a URL in a new tab",
  "tool.close_tab.desc": "Close a specified tab",

  // 页面爬取工具
  "tool.scrape_structure.desc": "Extract the runtime DOM structure of the current page",
  "tool.scrape_styles.desc": "Get the full computed styles of page elements",
  "tool.scrape_resources.desc": "Discover external resource URLs referenced by the page",
  "tool.fetch_resource.desc": "Fetch resource content via SW, bypassing CORS",

  // PDF 工具
  "tool.read_pdf.desc": "Extract text from a PDF (by workspace path or URL)",

  // ── 工具调用展示（聊天消息内）──
  "toolcall.loadingSkill": "Loading skill: {name}",
  "toolcall.download": "Download {path}",
  "toolcall.result": "Result · {name}",

  // ── 推理过程展示 ──
  "reasoning.title": "Thinking",
  "thinking.modeLabel": "Thinking mode",

  // ── 悬浮按钮 ──
  "floatButton.ariaLabel": "Open Lumino side panel",

  // ── 时间 ──
  "time.justNow": "just now",
  "time.minAgo": "{n} min ago",
  "time.hourAgo": "{n} h ago",
  "time.yesterdayWithTime": "yesterday {time}"
}
