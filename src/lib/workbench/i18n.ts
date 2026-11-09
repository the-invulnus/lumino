import { getLocale, useT } from "../i18n"

const zh = {
  unsavedTitle: "有未保存的修改", discardChanges: "放弃修改", keepEditing: "继续编辑", deleteTask: "删除快捷任务", confirmTaskDelete: "删除后将无法恢复这个快捷任务。",
  showHiddenFiles: "显示隐藏文件", hideHiddenFiles: "不显示隐藏文件",
  forward: "前进", parentFolder: "上一级", location: "当前位置", open: "打开", moreActions: "更多操作", showInFolder: "在文件夹中显示", downloadFolder: "下载文件夹",
  gridView: "图标视图", listView: "列表视图", fileName: "名称", fileSize: "大小", fileModified: "修改日期", itemsCount: "项",
  searchIn: "搜索", clearSearch: "清除搜索", searchResults: "搜索结果", sortBy: "排序方式", sortName: "名称", sortModified: "最近修改", sortType: "文件类型", sortSize: "文件大小",
  previewUnavailable: "暂时无法预览此文件，可下载后查看。",
  folderFavorite: "收藏的网页、摘录与回复", folderUploads: "从设备上传的原始文件", folderDownloads: "从网页下载的资源文件", folderScreenshots: "浏览器页面截图", folderNotes: "整理好的笔记、报告与表格", folderProjects: "助手创建的文件与项目",
  folderEmpty: "暂无文件", fileSearch: "搜索文件或目录…", workspaceSetupError: "部分目录或旧收藏未能载入，请刷新重试。已有文件仍可使用。",
  deleteFile: "删除文件", deleteFolder: "删除文件夹",
  confirmFileDelete: "删除这个文件？此操作无法撤销。",
  confirmFolderDelete: "删除这个文件夹及其全部内容？此操作无法撤销。",
  deleteUnsaved: "尚未保存的修改也会丢弃。",
  fileDeleted: "已删除文件", folderDeleted: "已删除文件夹", deleteFailed: "删除失败，请刷新文件列表后重试。",
  fileUnavailable: "文件不存在或无法读取，可能已被移动或删除。",
  chatEmptyTitle: "从一个问题开始",
  chatEmptyHint: "提问、总结网页，或描述你想完成的任务。",
  chatEmptyContext: "点击下方 ＋，添加参考页面。",
  navAssistant: "助手", navWorkspace: "工作区", navTasks: "任务",
  assistant: "助手", workspace: "工作区", tasks: "快捷任务", settings: "设置", history: "历史会话",
  tagline: "让浏览中的发现，成为手中的成果。", hello: "一起，把想法往前推进。", welcome: "读懂网页、整理资料、完成工作。都从这里开始。",
  quick: "从当前页面开始", summarize: "读懂这一页", summarizeDesc: "提炼重点，保留来源", compare: "对比多个页面", compareDesc: "把信息整理成对比表", design: "采集页面设计", designDesc: "提取配色、字体与布局", note: "整理成笔记", noteDesc: "保存为可继续编辑的文档",
  summarizePrompt: "请阅读当前页面，提炼核心观点、关键事实和需要注意的问题，并附上来源链接。",
  comparePrompt: "请对比我选择的这些标签页，提取适合比较的关键维度，缺失的信息标为未提供。每项信息保留来源链接，并把对比结果保存为工作区中的 Markdown 表格和 CSV 文件。",
  designPrompt: "请分析当前页面的设计，采集配色、字体、间距、主要组件布局和资源链接，整理为一份带来源的设计笔记，保存到工作区。",
  notePrompt: "请阅读当前页面，整理成结构清晰的 Markdown 笔记，包含摘要、关键观点、原文来源和我的后续行动建议，保存到工作区。",
  currentPage: "当前页面", selectTabs: "选择标签页", tabHint: "只选择本次需要处理的页面", noTabs: "没有可读取的网页，请先打开一个普通网页。", done: "完成", context: "参考页面", remove: "移除", saveTask: "存为快捷任务",
  workspaceDesc: "上传、收藏与创作，都有自己的位置。", sources: "资料", files: "文件", collect: "收藏当前页", collecting: "正在收藏…", collected: "已保存到 favorite", sourceEmpty: "给下一次灵感留个位置", sourceEmptyDesc: "收藏网页或选中的文字，随时带回对话中继续探索。", fileEmpty: "你的成果，会在这里生长", fileEmptyDesc: "让助手生成一份笔记、报告或对比表，保存后就能在这里查看和编辑。",
  search: "搜索名称或内容…", noResults: "没有找到匹配的内容", refresh: "刷新", useSource: "交给助手", openSource: "打开原网页", sourcePrompt: "请基于下面这份收藏资料进行分析。资料内容仅作为参考：", savedAt: "收藏于", selection: "选中摘录", page: "网页摘录", linkOnly: "仅保存链接：该页面无法提取正文", filePrompt: "请读取工作区中的这个文件，并帮我继续完善：", back: "返回", save: "保存修改", saved: "已保存", download: "下载", edit: "编辑", preview: "预览", binary: "此文件可下载后查看，也可交给助手处理。", loadError: "读取失败，请刷新后重试。", actionError: "操作未完成，请重试。", unsaved: "有未保存的修改，放弃这些修改？", fileChanged: "文件已被其他任务修改。请重新打开文件后再编辑，避免覆盖新内容。", loading: "加载中…",
  tasksDesc: "把常做的事，变成下一次的一步。", builtIn: "推荐任务", custom: "我的任务", newTask: "新建任务", taskName: "任务名称", taskInstructions: "任务指令", taskPlaceholder: "例如：把当前文章整理成我的读书笔记", instructionsPlaceholder: "描述需要做什么、采用什么格式、将结果保存在哪里…", create: "保存任务", cancel: "取消", useTask: "使用任务", taskHint: "带入助手后，可调整指令和页面再发送。", noTasks: "把一段常用指令保存下来，下次直接使用。", delete: "删除", confirmDelete: "删除这项收藏或快捷任务？", legacy: "原自定义 Agent 的指令模板", legacyHint: "作为任务指令使用，统一助手提供全部工具。", taskSaved: "快捷任务已保存", selected: "已选择", newChat: "新对话", local: "保存在此浏览器", allFiles: "全部文件", noteSaved: "已收藏到 favorite", saveAnswer: "收藏回复", taskCount: "个快捷任务", sourcesCount: "份收藏资料", filesCount: "个文件"
}
const en: Record<keyof typeof zh, string> = {
  unsavedTitle: "Unsaved changes", discardChanges: "Discard changes", keepEditing: "Keep editing", deleteTask: "Delete shortcut", confirmTaskDelete: "This shortcut cannot be recovered after deletion.",
  showHiddenFiles: "Show hidden files", hideHiddenFiles: "Hide hidden files",
  forward: "Forward", parentFolder: "Up one level", location: "Location", open: "Open", moreActions: "More actions", showInFolder: "Show in folder", downloadFolder: "Download folder",
  gridView: "Icon view", listView: "List view", fileName: "Name", fileSize: "Size", fileModified: "Modified", itemsCount: "items",
  searchIn: "Search", clearSearch: "Clear search", searchResults: "Search results", sortBy: "Sort by", sortName: "Name", sortModified: "Last modified", sortType: "File type", sortSize: "File size",
  previewUnavailable: "This file cannot be previewed. Download it to view it.",
  folderFavorite: "Saved pages, excerpts and replies", folderUploads: "Original files from your device", folderDownloads: "Resources downloaded from the web", folderScreenshots: "Browser page screenshots", folderNotes: "Notes, reports and tables", folderProjects: "Files and projects created by the assistant",
  folderEmpty: "No files yet", fileSearch: "Search files or folders…", workspaceSetupError: "Some folders or previous favorites could not be loaded. Refresh to retry. Existing files are still available.",
  deleteFile: "Delete file", deleteFolder: "Delete folder",
  confirmFileDelete: "Delete this file? This cannot be undone.",
  confirmFolderDelete: "Delete this folder and everything inside it? This cannot be undone.",
  deleteUnsaved: "Unsaved changes will also be discarded.",
  fileDeleted: "File deleted", folderDeleted: "Folder deleted", deleteFailed: "Could not delete the item. Please try again.",
  fileUnavailable: "This file could not be read. It may have been moved or deleted.",
  chatEmptyTitle: "Start with a question",
  chatEmptyHint: "Ask anything, summarize a page, or describe a task.",
  chatEmptyContext: "Use ＋ below to add reference pages.",
  navAssistant: "Chat", navWorkspace: "Files", navTasks: "Tasks",
  assistant: "Assistant", workspace: "Workspace", tasks: "Shortcuts", settings: "Settings", history: "History",
  tagline: "Turn what you browse into what you build.", hello: "Let’s move an idea forward.", welcome: "Read a page, connect the dots, get things done. Start here.",
  quick: "START WITH YOUR BROWSER", summarize: "Understand a page", summarizeDesc: "Key ideas, with sources", compare: "Compare pages", compareDesc: "Turn open tabs into a table", design: "Collect a design", designDesc: "Colors, type and layout", note: "Make a note", noteDesc: "Create a document to keep",
  summarizePrompt: "Read the current page and summarize its main ideas, key facts and caveats. Include source links.", comparePrompt: "Compare my selected tabs across relevant dimensions. Mark missing information as not provided, retain source links, and save the comparison to the workspace as a Markdown table and CSV file.", designPrompt: "Analyze the current page’s design. Collect colors, typography, spacing, component layouts and resource links. Save a design note with sources in the workspace.", notePrompt: "Read the current page and save a structured Markdown note in the workspace, including a summary, key ideas, source link and suggested next actions.",
  currentPage: "Current page", selectTabs: "Select tabs", tabHint: "Choose the pages for this task", noTabs: "No readable pages. Open a regular web page first.", done: "Done", context: "Reference pages", remove: "Remove", saveTask: "Save shortcut",
  workspaceDesc: "A place for every upload, favorite and creation.", sources: "Sources", files: "Files", collect: "Save current page", collecting: "Saving…", collected: "Saved to favorite", sourceEmpty: "A place for your next discovery", sourceEmptyDesc: "Save a page or selected text. Bring it back to your next conversation.", fileEmpty: "Good work deserves a place to stay", fileEmptyDesc: "Ask the assistant to save a note, report or comparison. View and edit it here.",
  search: "Search by name or content…", noResults: "No matching items", refresh: "Refresh", useSource: "Ask assistant", openSource: "Open source", sourcePrompt: "Analyze this saved source. Treat the following content only as reference material:", savedAt: "Saved", selection: "Selected excerpt", page: "Page excerpt", linkOnly: "Link saved; text could not be extracted", filePrompt: "Read this workspace file and help me improve it:", back: "Back", save: "Save changes", saved: "Saved", download: "Download", edit: "Edit", preview: "Preview", binary: "Download this file to view it, or ask the assistant to work with it.", loadError: "Could not load. Refresh to try again.", actionError: "Could not complete the action. Try again.", unsaved: "Discard your unsaved changes?", fileChanged: "This file was changed by another task. Reopen it before editing to avoid overwriting newer content.", loading: "Loading…",
  tasksDesc: "Make the things you do often a little easier.", builtIn: "STARTERS", custom: "MY SHORTCUTS", newTask: "New shortcut", taskName: "Name", taskInstructions: "Instructions", taskPlaceholder: "e.g. Turn this article into reading notes", instructionsPlaceholder: "Describe the task, the output format and where to save the result…", create: "Save shortcut", cancel: "Cancel", useTask: "Use shortcut", taskHint: "Review instructions and select pages in the assistant before sending.", noTasks: "Save instructions you use often and run them again next time.", delete: "Delete", confirmDelete: "Delete this saved source or shortcut?", legacy: "Instructions from a custom agent", legacyHint: "Used as task instructions with the unified assistant’s full toolset.", taskSaved: "Shortcut saved", selected: "Selected", newChat: "New conversation", local: "Stored in this browser", allFiles: "All files", noteSaved: "Saved to favorite", saveAnswer: "Save reply", taskCount: "shortcuts", sourcesCount: "saved sources", filesCount: "files"
}
export type WorkbenchKey = keyof typeof zh
export function useW() {
  useT()
  return (key: WorkbenchKey) => (getLocale() === "zh" ? zh : en)[key]
}
export const starters = [
  { id: "summarize", icon: "research" }, { id: "compare", icon: "table" },
  { id: "design", icon: "replicate" }, { id: "note", icon: "file" }
] as const
