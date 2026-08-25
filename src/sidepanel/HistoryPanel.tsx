/**
 * 历史会话面板 — 从右侧滑出的全局会话列表
 *
 * AITOPIA 风格：遮罩层 + 300px 面板 + 搜索 + 会话卡片列表
 */

import { useEffect, useMemo, useState } from "react"
import type { ChatThreadRecord } from "../lib/chat/thread-idb"
import { listThreads } from "../lib/chat/thread-idb"
import { getAllAgents } from "../lib/chat/builtin-agents"
import { NavIcon } from "./IconSidebar"
import { useT } from "../lib/i18n"
import { formatHistoryDate } from "../lib/format-time"
import { displayContent } from "./components/ChatMessageBlock"

function getThreadPreview(record: ChatThreadRecord, emptyLabel: string): string {
  // 取第一条 assistant 消息的内容作为预览
  const assistant = record.messages.find((m) => m.role === "assistant")
  if (assistant?.content) {
    const text = typeof assistant.content === "string"
      ? assistant.content
      : Array.isArray(assistant.content)
        ? assistant.content.map((p) => (p as { text?: string }).text ?? "").join(" ")
        : ""
    return text.slice(0, 50).replace(/\s+/g, " ")
  }
  // 回退：第一条 user 消息
  const user = record.messages.find((m) => m.role === "user")
  if (user?.content) {
    const text = typeof user.content === "string" ? displayContent(user.content) : ""
    return text.slice(0, 50).replace(/\s+/g, " ")
  }
  return emptyLabel
}

export function HistoryPanel({
  open,
  onSelect,
  onDelete,
  onClose
}: {
  open: boolean
  onSelect: (threadId: string) => void
  onDelete: (threadId: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState("")
  const [agentMap, setAgentMap] = useState<Record<string, string>>({})
  const [allThreads, setAllThreads] = useState<ChatThreadRecord[]>([])

  const t = useT()

  useEffect(() => {
    getAllAgents().then((agents) => {
      const map: Record<string, string> = {}
      for (const a of agents) {
        map[a.id] = a.name  // 存的是 i18n key，展示时由 t() 解析
      }
      setAgentMap(map)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (open) {
      listThreads().then(setAllThreads).catch(() => {})
    }
  }, [open])

  async function handleDelete(threadId: string) {
    await onDelete(threadId)
    // 删除后刷新列表
    const rows = await listThreads()
    setAllThreads(rows)
  }

  // 打开时锁定背景滚动，避免列表滚动穿透到下层页面
  useEffect(() => {
    if (!open) return
    const body = document.body
    const prev = body.style.overflow
    body.style.overflow = "hidden"
    return () => { body.style.overflow = prev }
  }, [open])

  function getAgentLabelKey(mode?: string): string {
    if (!mode) return "agent.chat.name"
    return agentMap[mode] || "agent.chat.name"
  }

  const filteredThreads = useMemo(() => {
    if (!search.trim()) return allThreads
    const q = search.trim().toLowerCase()
    return allThreads.filter((thread) => {
      const title = (thread.title ?? "").toLowerCase()
      const preview = getThreadPreview(thread, t("thread.empty")).toLowerCase()
      return title.includes(q) || preview.includes(q)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allThreads, search])

  return (
    <>
      {/* 遮罩层 */}
      <div
        className={`lm-history-overlay${open ? " lm-history-overlay--active" : ""}`}
        onClick={onClose}
      />

      {/* 面板 */}
      <div className={`lm-history-panel${open ? " lm-history-panel--open" : ""}`}>
        <div className="lm-history-panel-header">
          <h3 className="lm-history-panel-title">{t("history.title", { count: allThreads.length })}</h3>
          <button className="lm-history-panel-close" onClick={onClose} type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="lm-history-panel-search">
          <input
            type="text"
            className="lm-history-search-input"
            placeholder={t("history.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="lm-history-panel-list">
          {filteredThreads.length === 0 ? (
            <p className="lm-history-panel-empty">
              {search.trim() ? t("history.notFound") : t("history.empty")}
            </p>
          ) : (
            filteredThreads.map((record) => {
              const agentLabel = t(getAgentLabelKey(record.mode))
              return (
              <div
                key={record.id}
                className="lm-history-item"
                onClick={() => onSelect(record.id)}
              >
                <div className="lm-history-item-left">
                  <span className="lm-history-item-agent" title={agentLabel}>
                    <NavIcon icon={record.mode || "chat"} />
                  </span>
                  <span className="lm-history-item-agent-label">{agentLabel}</span>
                </div>
                <div className="lm-history-item-body">
                  <div className="lm-history-item-header">
                    <span className="lm-history-item-title">
                      {record.title || t("thread.defaultTitle")}
                    </span>
                    <span className="lm-history-item-date">
                      {formatHistoryDate(record.updatedAt)}
                    </span>
                  </div>
                  <div className="lm-history-item-preview">
                    <span>{getThreadPreview(record, t("thread.empty"))}</span>
                    <button
                      className="lm-history-item-delete"
                      title={t("history.delete")}
                      onClick={(e) => { e.stopPropagation(); handleDelete(record.id) }}
                      type="button"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
