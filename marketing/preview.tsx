/** Store artwork only: render the real app with isolated, fictional demo data. */
import { createRoot } from "react-dom/client"
import "../src/styles/components.css"
import "./preview.css"

const view = new URLSearchParams(location.search).get("view") || "assistant"
const tabs = [
  { id: 1, windowId: 1, title: "把阅读变成知识：三个实践方法", url: "https://example.com/reading", active: true },
  { id: 2, windowId: 1, title: "方案 A · 产品介绍", url: "https://example.com/product-a" },
  { id: 3, windowId: 1, title: "方案 B · 产品介绍", url: "https://example.com/product-b" }
]
const records: Record<string, unknown> = {
  lumino_locale: "zh", theme: "paper", baseUrl: "https://example.invalid/v1", apiKey: "demo-not-a-real-key", model: "demo",
  "lumino_task:reading": { id: "reading", title: "我的阅读笔记", prompt: "整理当前文章的观点、论据和启发，附上来源，保存到 notes/。", createdAt: 3 },
  "lumino_task:compare": { id: "compare", title: "产品选型对比", prompt: "对比选择的页面，列出定位、功能与适用场景，将结果保存为表格。", createdAt: 2 }
}
const listeners = new Set<(...args: any[]) => void>()
const event = () => ({ addListener: () => {}, removeListener: () => {} })
const storage = {
  get: async (keys?: string | string[]) => keys ? Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, records[k]])) : { ...records },
  set: async (values: Record<string, unknown>) => {
    Object.assign(records, values)
    const changes = Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }]))
    listeners.forEach(fn => fn(changes, "local"))
  },
  remove: async (key: string) => { delete records[key] }
}
Object.assign(globalThis, { chrome: {
  storage: { local: storage, sync: storage, onChanged: { addListener: (fn: (...args: any[]) => void) => listeners.add(fn), removeListener: (fn: (...args: any[]) => void) => listeners.delete(fn) } },
  runtime: { getURL: (path: string) => new URL(path, location.origin).href, sendMessage: async () => ({ runningThreadIds: [] }), onMessage: event(), openOptionsPage: () => {} },
  tabs: { query: async (query: { active?: boolean }) => query.active ? [tabs[0]] : tabs, onActivated: event(), onUpdated: event(), onRemoved: event() },
  windows: { getCurrent: async () => ({ id: 1 }) }
} })

const { putThread } = await import("../src/lib/chat/thread-idb")
const { withMessageContext } = await import("../src/lib/workbench/store")
const { writeWorkspaceFile } = await import("../src/lib/fs/workspace")
const { App } = await import("../src/sidepanel/App")

const note = "# 把阅读变成知识\n\n## 三个实践方法\n\n- 带着问题阅读，先明确自己想解决什么。\n- 用自己的话解释核心观点，保留原文来源。\n- 把收获转化成下一步行动，定期回看。\n\n## 下一步\n\n选择一篇正在读的文章，写下一个问题与一条行动。\n\n来源：https://example.com/reading\n"
await Promise.all([
  writeWorkspaceFile("notes/阅读笔记.md", note),
  writeWorkspaceFile("projects/方案对比.md", "# 方案对比\n\n| 维度 | 方案 A | 方案 B |\n| --- | --- | --- |\n| 定位 | 个人记录 | 团队协作 |\n| 重点 | 简洁易用 | 协作与分享 |\n"),
  writeWorkspaceFile("projects/方案对比.csv", "维度,方案 A,方案 B\n定位,个人记录,团队协作\n重点,简洁易用,协作与分享\n"),
  writeWorkspaceFile("uploads/阅读清单.txt", "记录值得阅读的文章，并给每篇文章写一个问题。"),
  writeWorkspaceFile("favorite/网页摘录.md", "# 网页摘录\n\n把想法写成可以执行的一步。\n\n来源：https://example.com/reading\n")
])
const compare = view === "compare"
await putThread({
  id: "store-demo", title: compare ? "产品方案对比" : "把阅读变成知识", mode: "chat", updatedAt: Date.now(),
  messages: compare ? [
    { role: "user", content: withMessageContext("对比这两个方案，整理成表格并保存到工作区。", tabs.slice(1), []) },
    { role: "assistant", content: "已按页面提供的信息整理：\n\n| 维度 | 方案 A | 方案 B |\n| --- | --- | --- |\n| 适合谁 | 个人用户 | 协作团队 |\n| 核心功能 | 记录与整理 | 协作与分享 |\n| 使用重点 | 简洁、易上手 | 多人共同维护 |\n\n**选择建议**\n\n个人记录优先考虑方案 A；需要多人协作时，可以进一步了解方案 B。页面未提供价格，需要另行确认。\n\n已保存 `projects/方案对比.md` 和 `projects/方案对比.csv`。\n\n来源：[方案 A](https://example.com/product-a) · [方案 B](https://example.com/product-b)" }
  ] : [
    { role: "user", content: withMessageContext("提炼文章的三个重点，结合我的阅读清单，整理成笔记。", [tabs[0]], ["uploads/阅读清单.txt"]) },
    { role: "assistant", content: null, tool_calls: [
      { id: "demo-read", type: "function", function: { name: "get_page_content", arguments: "{\"tabId\":1}" } },
      { id: "demo-save", type: "function", function: { name: "write_file", arguments: "{\"path\":\"notes/阅读笔记.md\"}" } }
    ] },
    { role: "tool", tool_call_id: "demo-read", content: "文章讨论带着问题阅读、用自己的话复述，以及将知识转化为行动。" },
    { role: "tool", tool_call_id: "demo-save", content: "已保存 notes/阅读笔记.md" },
    { role: "assistant", content: "这篇文章可以归纳为三个实践方法：\n\n1. **带着问题阅读**：先明确想解决的问题，再寻找相关信息。\n2. **用自己的话复述**：提炼观点与论据，同时保留原文来源。\n3. **转化成下一步行动**：从清单中选择一篇文章，写下一条可以实践的收获。\n\n已整理为 `notes/阅读笔记.md`，可以在工作区继续查看和编辑。\n\n来源：[把阅读变成知识](https://example.com/reading)" }
  ]
})

const copy: Record<string, { tag: string; title: string[]; description: string; features: string[] }> = {
  assistant: { tag: "01 / 网页助手", title: ["读懂这一页，", "留住好想法。"], description: "引用网页和文件，让总结、提问和笔记整理\n在同一个对话中完成。", features: ["网页与文件引用", "工具过程可折叠", "笔记保存到工作区"] },
  compare: { tag: "02 / 多页对比", title: ["多个标签页，", "一张对比表。"], description: "把分散的信息放在一起，\n形成带来源、可继续使用的结果。", features: ["同时引用多个页面", "保留来源链接", "生成 Markdown / CSV"] },
  workspace: { tag: "03 / 文件工作区", title: ["资料与成果，", "都有自己的位置。"], description: "上传、收藏、预览、编辑。\n文件随时可以交给助手继续处理。", features: ["固定目录分类管理", "图标与列表视图", "收藏网页和助手回复"] },
  tasks: { tag: "04 / 快捷任务", title: ["常做的事，", "下次少说一遍。"], description: "把自己的工作方法保存成指令，\n需要时一键带入对话。", features: ["内置四种常用任务", "保存自己的指令", "选择资料后主动运行"] }
}
const content = copy[view] || copy.assistant
document.getElementById("feature-copy")!.innerHTML = `<span class="eyebrow">${content.tag}</span><h1>${content.title.join("<br>")}</h1><p>${content.description.replace("\n", "<br>")}</p><ul>${content.features.map(text => `<li><span>✓</span>${text}</li>`).join("")}</ul>`
createRoot(document.getElementById("app")!).render(<App />)
if (view === "workspace" || view === "tasks") {
  const title = view === "workspace" ? "工作区" : "快捷任务"
  const select = setInterval(() => {
    const button = document.querySelector<HTMLButtonElement>(`.lm-icon-sidebar button[title="${title}"]`)
    if (button) { button.click(); clearInterval(select) }
  }, 50)
}
document.fonts.ready.then(() => { document.documentElement.dataset.ready = "true" })
