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

function formatHistoryDate(updatedAt: number): string {
  const d = new Date(updatedAt)
  const now = new Date()
  const hours = String(d.getHours()).padStart(2, "0")
  const mins = String(d.getMinutes()).padStart(2, "0")
  const timeStr = `${hours}:${mins}`

  // 当天只显示时间
  if (d.toDateString() === now.toDateString()) return timeStr

  // 昨天
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${timeStr}`

  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}/${month}/${day} ${timeStr}`
}

function getThreadPreview(record: ChatThreadRecord): string {
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
    const text = typeof user.content === "string" ? user.content : ""
    return text.slice(0, 50).replace(/\s+/g, " ")
  }
  return "空会话"
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

  useEffect(() => {
    getAllAgents().then((agents) => {
      const map: Record<string, string> = {}
      for (const a of agents) {
        map[a.id] = a.name
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

  function getAgentLabel(mode?: string): string {
    if (!mode) return "通用"
    return agentMap[mode] || "通用"
  }

  const filteredThreads = useMemo(() => {
    if (!search.trim()) return allThreads
    const q = search.trim().toLowerCase()
    return allThreads.filter((t) => {
      const title = (t.title ?? "").toLowerCase()
      const preview = getThreadPreview(t).toLowerCase()
      return title.includes(q) || preview.includes(q)
    })
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
          <h3 className="lm-history-panel-title">历史会话 ({allThreads.length})</h3>
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
            placeholder="搜索会话..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="lm-history-panel-list">
          {filteredThreads.length === 0 ? (
            <p className="lm-history-panel-empty">
              {search.trim() ? "未找到匹配的会话" : "暂无历史会话"}
            </p>
          ) : (
            filteredThreads.map((record) => (
              <div
                key={record.id}
                className="lm-history-item"
                onClick={() => onSelect(record.id)}
              >
                <div className="lm-history-item-left">
                  <span className="lm-history-item-agent" title={getAgentLabel(record.mode)}>
                    <NavIcon icon={record.mode || "chat"} />
                  </span>
                  <span className="lm-history-item-agent-label">{getAgentLabel(record.mode)}</span>
                </div>
                <div className="lm-history-item-body">
                  <div className="lm-history-item-header">
                    <span className="lm-history-item-title">
                      {record.title || "新会话"}
                    </span>
                    <span className="lm-history-item-date">
                      {formatHistoryDate(record.updatedAt)}
                    </span>
                  </div>
                  <div className="lm-history-item-preview">
                    <span>{getThreadPreview(record)}</span>
                    <button
                      className="lm-history-item-delete"
                      title="删除"
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
            ))
          )}
        </div>
      </div>
    </>
  )
}
