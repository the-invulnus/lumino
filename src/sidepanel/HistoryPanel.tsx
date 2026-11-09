/**
 * 历史会话面板 — 从右侧滑出的全局会话列表
 *
 * AITOPIA 风格：遮罩层 + 300px 面板 + 搜索 + 会话卡片列表
 */

import { useEffect, useId, useMemo, useState } from "react"
import type { ChatThreadRecord } from "../lib/chat/thread-idb"
import { listThreads } from "../lib/chat/thread-idb"
import { getLocale, useT } from "../lib/i18n"
import { formatHistoryDate } from "../lib/format-time"
import { groupHistoryThreads } from "../lib/chat/history-groups"
import { displayContent, formatMessagePreview } from "./components/ChatMessageBlock"
import { readMessageContext } from "../lib/workbench/store"

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
    const raw = formatMessagePreview(user)
    const references = readMessageContext(raw)
    const text = displayContent(raw) || references.files.map(path => path.split("/").pop()).join(", ") || references.pages.map(page => page.title).join(", ") || emptyLabel
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
  const [allThreads, setAllThreads] = useState<ChatThreadRecord[]>([])
  const [now, setNow] = useState(() => new Date())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
  const [collapsedSearchGroups, setCollapsedSearchGroups] = useState<Set<string>>(() => new Set())
  const groupIdPrefix = useId()

  const t = useT()


  useEffect(() => {
    if (!open) return
    let cancelled = false
    listThreads().then(rows => { if (!cancelled) setAllThreads(rows) }).catch(() => {})
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    if (!open) return
    let timer: ReturnType<typeof setTimeout>
    function updateDate() {
      clearTimeout(timer)
      const current = new Date()
      setNow(current)
      const midnight = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1)
      timer = setTimeout(updateDate, midnight.getTime() - current.getTime() + 50)
    }
    function onVisible() { if (document.visibilityState === "visible") updateDate() }
    updateDate()
    window.addEventListener("focus", updateDate)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("focus", updateDate)
      document.removeEventListener("visibilitychange", onVisible)
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
  const groups = useMemo(() => groupHistoryThreads(filteredThreads, now), [filteredThreads, now])
  const locale = getLocale() === "zh" ? "zh-CN" : "en-US"
  const activeCollapsedGroups = search.trim() ? collapsedSearchGroups : collapsedGroups
  function toggleGroup(id: string) {
    const update = search.trim() ? setCollapsedSearchGroups : setCollapsedGroups
    update(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
            onChange={(e) => { setSearch(e.target.value); setCollapsedSearchGroups(new Set()) }}
          />
        </div>

        <div className="lm-history-panel-list">
          {filteredThreads.length === 0 ? (
            <p className="lm-history-panel-empty">
              {search.trim() ? t("history.notFound") : t("history.empty")}
            </p>
          ) : (
            groups.map(group => {
              const collapsed = activeCollapsedGroups.has(group.id)
              const contentId = `${groupIdPrefix}-${group.id}`
              return <section className="lm-history-group" key={group.id}>
              <h4 className="lm-history-group-title">
                <button className="lm-history-group-toggle" type="button" aria-expanded={!collapsed} aria-controls={collapsed ? undefined : contentId} onClick={() => toggleGroup(group.id)}>
                  <span className="lm-history-group-label">{group.month
                    ? group.month.toLocaleDateString(locale, { year: "numeric", month: "long" })
                    : t(`history.group.${group.period}`)}</span>
                  {collapsed && <span className="lm-history-group-count">{t("history.group.count", { count: group.threads.length })}</span>}
                  <svg className={`lm-history-group-chevron${collapsed ? "" : " is-open"}`} aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7"/></svg>
                </button>
              </h4>
              {!collapsed && <div className="lm-history-group-items" id={contentId}>
              {group.threads.map(record => (
              <div
                key={record.id}
                className="lm-history-item"
                onClick={() => onSelect(record.id)}
              >
                <div className="lm-history-item-body">
                  <div className="lm-history-item-header">
                    <span className="lm-history-item-title">
                      {record.title || t("thread.defaultTitle")}
                    </span>
                    <time className="lm-history-item-date" dateTime={new Date(record.updatedAt).toISOString()} title={formatHistoryDate(record.updatedAt)}>
                      {new Date(record.updatedAt).toLocaleString(locale, group.period === "today" || group.period === "yesterday"
                        ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
                        : { month: "numeric", day: "numeric" })}
                    </time>
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
              ))}
              </div>}
            </section>})
          )}
        </div>
      </div>
    </>
  )
}
