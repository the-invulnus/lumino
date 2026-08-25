/**
 * 中文词典
 *
 * key 命名：点分命名空间。新增 key 时 en.ts 与 zh.ts 必须同步。
 */

export const zh: Record<string, string> = {
  // ── 内置 Agent 名称/描述 ──
  "agent.chat.name": "通用",
  "agent.chat.desc": "全能助手：读写文件、操控页面、爬取资源",
  "agent.research.name": "深度调研",
  "agent.research.desc": "多源深度搜索，要点直接存进笔记",
  "agent.replicate.name": "设计复刻",
  "agent.replicate.desc": "提取结构与样式，复刻任意页面设计",
  "agent.automate.name": "页面操控",
  "agent.automate.desc": "自动填表、点击、输入，告别重复操作",

  // ── 聊天界面 ──
  "chat.send": "发送",
  "chat.stop": "停止生成",
  "chat.placeholder": "Enter 发送，Shift+Enter 换行",
  "chat.composerAria": "对话输入",
  "chat.loading": "正在加载…",
  "chat.emptyHintNoThread": "在下方输入消息，开始新的对话。",
  "chat.emptyHintNewThread": "在下方输入后发送即可。",
  "chat.editHint": "Enter 发送 · Shift+Enter 换行 · Esc 取消",
  "chat.notConfigured": "请先在设置中填写 Base URL、API Key 与模型。",
  "chat.openSettings": "打开设置",
  "chat.error.read": "读取会话失败。",
  "chat.error.start": "启动失败，请重试。",
  "chat.error.config": "请先在设置页配置 Base URL、API Key 和模型。",
  "chat.error.modelRequest": "请求模型失败，请检查配置后重试。",

  // 聊天操作按钮
  "chat.tooltip.rename": "点击修改会话名称",
  "chat.tooltip.newThread": "新建会话",
  "chat.tooltip.deleteThread": "删除此会话",
  "chat.confirmDeleteThread": "确认删除？",
  "chat.tooltip.history": "历史会话",
  "chat.action.regenerate": "重新生成",
  "chat.action.retry": "重试",
  "chat.action.copy": "复制",
  "chat.action.copyMessage": "复制消息内容",
  "chat.action.delete": "删除",
  "chat.action.deleteMessage": "删除此消息",
  "chat.action.edit": "编辑",
  "chat.action.editMessage": "编辑消息",

  // ── 会话默认标题 ──
  "thread.defaultTitle": "新会话",
  "thread.placeholder": "会话",
  "thread.empty": "空会话",

  // ── 导航栏 ──
  "nav.home": "首页",
  "nav.settings": "设置",
  "nav.ariaLabel": "功能导航",

  // ── 首页 ──
  "home.tagline": "从浏览到产出，一步到位。",
  "home.recent": "最近会话",
  "home.historyTooltip": "历史会话",

  // ── 历史面板 ──
  "history.title": "历史会话 ({count})",
  "history.search": "搜索会话...",
  "history.empty": "暂无历史会话",
  "history.notFound": "未找到匹配的会话",
  "history.delete": "删除",

  // ── 设置页导航 ──
  "option.nav.llm": "模型",
  "option.nav.obsidian": "Obsidian",
  "option.nav.agents": "智能体",
  "option.nav.general": "通用",

  // LLM 面板
  "option.llm.title": "模型连接",
  "option.llm.desc": "配置 OpenAI 兼容 API，连接完成后 Agent 将通过此 API 与模型通信。",

  // 思考配置（thinking mode）
  "option.thinking.title": "思考模式配置",
  "option.thinking.desc": "每个模式对应一组请求体字段，请按你的模型配置对应 JSON。配置后可在 Agent 对话时选择使用哪个模式。",
  "option.thinking.reset": "重置",
  "option.thinking.resetConfirm": "重置将覆盖你当前的思考模式配置，是否继续？",
  "option.thinking.label": "标签",
  "option.thinking.rename": "重命名",
  "option.thinking.configure": "配置请求体",
  "option.thinking.remove": "删除",
  "option.thinking.add": "添加模式",
  "option.thinking.save": "保存",
  "option.thinking.cancel": "取消",
  "option.thinking.bodyInvalidJson": "JSON 非法——修复后才能保存此模式",
  "option.thinking.bodyMustObject": "请求体必须是 JSON 对象（不能是数组或基本值）",

  // Obsidian 面板
  "option.obsidian.title": "Obsidian 集成",
  "option.obsidian.desc": "连接 Obsidian Local REST API 后，Agent 可以直接读写你的 vault。",
  "option.obsidian.enable": "启用 Obsidian 集成",
  "option.obsidian.apiKeyPlaceholder": "在 Obsidian 设置中获取",
  "option.obsidian.whatTitle": "这是什么功能？",
  "option.obsidian.whatDesc": "Obsidian 是一款本地笔记应用。连接后，Agent 可以读取你的笔记、新建笔记、向已有笔记追加内容——把调研结果、会议纪要或任何输出直接存进你的 vault。",
  "option.obsidian.setupTitle": "如何配置",
  "option.obsidian.step1": "在 Obsidian 中安装社区插件 \"Local REST API with MCP\"（设置 → 第三方插件 → 浏览 → 搜索 \"Local REST API with MCP\" → 安装 → 启用）。",
  "option.obsidian.step2": "打开该插件的设置页（设置 → 第三方插件 → Local REST API with MCP）。",
  "option.obsidian.step3": "复制插件设置里显示的 API Key，粘贴到下方。默认地址是 http://127.0.0.1:27123，没改过端口就不用动。",
  "option.obsidian.step4": "使用此功能时请保持 Obsidian 开启。",

  // 自定义 Agent 面板
  "option.agents.title": "自定义智能体",
  "option.agents.desc": "创建你自己的 AI 智能体，配置专属系统提示词和可用工具。",
  "option.agents.noTools": "无工具",
  "option.agents.toolCount": "{n} 个工具",
  "option.agents.edit": "编辑",
  "option.agents.delete": "删除",
  "option.agents.new": "新建智能体",
  "option.agents.editTitle": "编辑智能体",
  "option.agents.newTitle": "新建智能体",
  "option.agents.name": "名称",
  "option.agents.namePlaceholder": "我的助手",
  "option.agents.icon": "图标",
  "option.agents.prompt": "系统提示词",
  "option.agents.promptPlaceholder": "你是一个...",
  "option.agents.tools": "可用工具",
  "option.agents.create": "创建",
  "option.agents.update": "更新",
  "option.agents.cancel": "取消",

  // 设置页通用
  "option.save": "保存",
  "option.saving": "保存中...",
  "option.saveSettings": "保存设置",
  "option.saved": "已保存",
  "option.saveFailed": "保存失败",

  // 通用语言切换
  "option.language": "语言",
  "option.languageEn": "English",
  "option.languageZh": "中文",

  // ── 工具组标签（options 页工具选择器）──
  "toolgroup.fs": "文件系统",
  "toolgroup.browser": "浏览器",
  "toolgroup.scrape": "页面爬取",
  "toolgroup.pdf": "PDF",

  // 文件系统工具
  "tool.ls.desc": "列出工作区目录中的文件和子目录",
  "tool.read_file.desc": "读取工作区中的文件内容，支持分页",
  "tool.write_file.desc": "在工作区中创建或覆写文件",
  "tool.edit_file.desc": "对文件执行精确的字符串替换编辑",
  "tool.glob.desc": "根据 glob 模式查找匹配的文件",
  "tool.grep.desc": "在工作区文件中搜索文本",
  "tool.rm.desc": "删除工作区中的文件或空目录",
  "tool.export.desc": "将工作区文件或目录导出到本地下载目录",

  // 浏览器系统工具
  "tool.current_page.desc": "获取当前活跃标签页的 URL 和标题",
  "tool.tabs.desc": "列出浏览器中所有打开的标签页",

  // 页面阅读工具
  "tool.get_page_content.desc": "读取当前页面的可见文本内容",
  
  // 浏览器交互工具
  "tool.inspect_element.desc": "探查页面可交互元素的 DOM 结构",
  "tool.fill_form.desc": "在页面中自动填充表单",
  "tool.click_element.desc": "点击页面中的指定元素",
  "tool.screenshot.desc": "对当前页面进行截图",
  "tool.scroll.desc": "在页面中滚动到指定位置或元素",
  "tool.press_key.desc": "在页面中模拟按键操作",
  "tool.navigate.desc": "在新标签页中打开指定 URL",
  "tool.close_tab.desc": "关闭指定的标签页",

  // 页面爬取工具
  "tool.scrape_structure.desc": "提取当前页面的运行时 DOM 结构",
  "tool.scrape_styles.desc": "获取页面元素的完整计算样式",
  "tool.scrape_resources.desc": "发现页面引用的外部资源 URL",
  "tool.fetch_resource.desc": "通过 SW 获取资源内容，无 CORS 限制",

  // PDF 工具
  "tool.read_pdf.desc": "提取 PDF 文本（按工作区路径或 URL）",

  // ── 工具调用展示（聊天消息内）──
  "toolcall.loadingSkill": "加载技能：{name}",
  "toolcall.download": "下载 {path}",
  "toolcall.result": "结果 · {name}",

  // ── 推理过程展示 ──
  "reasoning.title": "思考过程",
  "thinking.modeLabel": "思考模式",

  // ── 悬浮按钮 ──
  "floatButton.ariaLabel": "打开 Lumino 侧边栏",

  // ── 时间 ──
  "time.justNow": "刚刚",
  "time.minAgo": "{n} 分钟前",
  "time.hourAgo": "{n} 小时前",
  "time.yesterdayWithTime": "昨天 {time}"
}
