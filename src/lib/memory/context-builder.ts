// ============================================================
// 上下文组装器 — 将记忆、画像、Session 上下文打包为 LLM 可用格式
// ============================================================

import type { InputMeta, PageMeta } from "./types"
import { getSessionEvents } from "./event-store"
import { retrieveContext, formatRetrievalResult } from "./retriever"
import { loadUserProfile } from "./user-profile"
import type { CompletionContext, UserProfile } from "./types"

function formatSessionContext(
  events: Array<{
    type: string
    timestamp: number
    page?: PageMeta
    input?: InputMeta
  }>
): string {
  if (events.length === 0) {
    return "（Session 刚开始，暂无浏览上下文）"
  }

  const lines: string[] = []
  const seenUrls = new Set<string>()

  const pageEvents = events.filter((e) => e.page && e.type === "page_visit")
  for (const event of pageEvents.slice(-10).reverse()) {
    if (!seenUrls.has(event.page!.url)) {
      seenUrls.add(event.page!.url)
      lines.push(
        `- 📄 ${event.page!.title.slice(0, 60)} — ${event.page!.hostname}`
      )
    }
  }

  const inputEvents = events.filter(
    (e) => e.input && (e.type === "input_type" || e.type === "input_focus")
  )

  if (inputEvents.length > 0) {
    lines.push("")
    lines.push("最近的输入交互：")
    for (const event of inputEvents.slice(-5).reverse()) {
      const input = event.input!
      const text = input.text ? `"${input.text.slice(0, 60)}"` : "（聚焦）"
      lines.push(`- ⌨ ${input.nodeType} ${input.placeholder ? `(${input.placeholder})` : ""} ${text}`)
    }
  }

  return lines.join("\n")
}

function formatInputDescription(
  pageMeta: PageMeta,
  inputMeta: InputMeta,
  userText: string
): string {
  return `页面：${pageMeta.title}（${pageMeta.hostname}）
输入框类型：${inputMeta.nodeType}
placeholder：${inputMeta.placeholder || "无"}
用户在输入框中已输入的内容："""${userText}"""`
}

function formatProfile(profile: UserProfile): string {
  const parts: string[] = []

  if (profile.name) {
    parts.push(`名称：${profile.name}`)
  }
  if (profile.interests.length > 0) {
    parts.push(`关注领域：${profile.interests.join("、")}`)
  }
  if (profile.notes) {
    parts.push(`补充信息：${profile.notes}`)
  }

  return parts.length > 0 ? parts.join("\n") : "（画像尚未建立）"
}

export async function buildCompletionContext(
  pageMeta: PageMeta,
  inputMeta: InputMeta,
  userText: string
): Promise<CompletionContext> {
  const profile = await loadUserProfile()
  const sessionEvents = await getSessionEvents()
  const sessionContext = formatSessionContext(sessionEvents)
  const retrieval = await retrieveContext(sessionEvents)
  const relatedMemories = formatRetrievalResult(retrieval)
  const inputDescription = formatInputDescription(pageMeta, inputMeta, userText)

  return {
    profile,
    sessionContext,
    relatedMemories,
    inputDescription
  }
}

export function buildCompletionSystemPrompt(context: CompletionContext): string {
  return `你是 Lumino，一个浏览器内智能补全助手。你会在用户输入时提供精准的文本补全建议。

## 用户画像
${formatProfile(context.profile)}

## 当前浏览上下文
${context.sessionContext}

## 相关历史记忆
${context.relatedMemories}

## 补全规则
- 只返回补全部分，不要重复用户已输入的内容
- 补全应自然延续用户的输入意图
- 如果是搜索框，补全搜索查询
- 如果是表单，补全合理的内容
- 如果是聊天框，补全自然的对话
- 补全长度：10-80 个字符为佳
- 如果无法判断意图，返回空字符串
- 绝对不要返回解释性文字，只返回补全文本`
}

export function buildCompletionUserMessage(
  pageMeta: PageMeta,
  inputMeta: InputMeta,
  userText: string
): string {
  return `当前页面：${pageMeta.title}（${pageMeta.hostname}）
输入框提示：${inputMeta.placeholder || "无"}
用户已输入："""${userText}"""\n请提供补全：`
}
