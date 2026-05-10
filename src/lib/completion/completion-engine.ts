// ============================================================
// 补全引擎 — Background 端处理补全请求，调用 LLM
// ============================================================

import type { OpenAiChatMessage } from "../chat/openai-messages"
import { requestChatCompletionTurn } from "../llm/openai"
import { getLlmSettings, hasCompleteLlmSettings } from "../settings"
import {
  buildCompletionContext,
  buildCompletionSystemPrompt,
  buildCompletionUserMessage
} from "../memory/context-builder"
import {
  COMPLETION_RESULT_MESSAGE,
  type RequestCompletionMessage,
  type CompletionResultMessage,
  type ActiveCompletion
} from "../memory/types"

/** 已发送但尚未接受的补全 */
const activeCompletions = new Map<string, ActiveCompletion>()

/**
 * 处理来自 content script 的补全请求。
 */
export async function handleCompletionRequest(
  message: RequestCompletionMessage,
  senderTabId: number
): Promise<void> {
  const { payload } = message

  try {
    const context = await buildCompletionContext(
      payload.pageMeta,
      payload.inputMeta,
      payload.userText
    )

    const settings = await getLlmSettings()

    if (!hasCompleteLlmSettings(settings)) {
      sendNoCompletion(payload.tabId, payload.inputId, payload.userText)
      return
    }

    const systemPrompt = buildCompletionSystemPrompt(context)
    const userMessage = buildCompletionUserMessage(
      payload.pageMeta,
      payload.inputMeta,
      payload.userText
    )

    const messages: OpenAiChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ]

    const result = await requestChatCompletionTurn(settings, {
      messages,
      toolChoice: "none"
    })

    const completion = result.message.content?.trim() ?? ""

    if (
      completion.length === 0 ||
      completion === "null" ||
      completion === "undefined"
    ) {
      sendNoCompletion(payload.tabId, payload.inputId, payload.userText)
      return
    }

    const completionId = crypto.randomUUID()

    const active: ActiveCompletion = {
      id: completionId,
      tabId: payload.tabId,
      inputId: payload.inputId,
      completion,
      userText: payload.userText,
      expiresAt: Date.now() + 30_000
    }

    activeCompletions.set(completionId, active)
    cleanExpiredCompletions()

    const resultMessage: CompletionResultMessage = {
      type: COMPLETION_RESULT_MESSAGE,
      payload: {
        id: completionId,
        tabId: payload.tabId,
        inputId: payload.inputId,
        completion,
        userText: payload.userText
      }
    }

    chrome.tabs.sendMessage(payload.tabId, resultMessage).catch(() => {
      // Tab 可能已关闭
    })
  } catch (error) {
    console.error("[Lumino] 补全请求失败", error)
    sendNoCompletion(payload.tabId, payload.inputId, payload.userText)
  }
}

function sendNoCompletion(
  tabId: number,
  inputId: string,
  userText: string
): void {
  const message: CompletionResultMessage = {
    type: COMPLETION_RESULT_MESSAGE,
    payload: {
      id: "",
      tabId,
      inputId,
      completion: null,
      userText
    }
  }

  chrome.tabs.sendMessage(tabId, message).catch(() => {})
}

export function handleCompletionAccept(
  completionId: string
): ActiveCompletion | undefined {
  const completion = activeCompletions.get(completionId)
  if (completion) {
    activeCompletions.delete(completionId)
  }
  return completion
}

export function handleCompletionReject(completionId: string): void {
  activeCompletions.delete(completionId)
}

function cleanExpiredCompletions(): void {
  const now = Date.now()
  for (const [id, completion] of activeCompletions) {
    if (completion.expiresAt < now) {
      activeCompletions.delete(id)
    }
  }
}
