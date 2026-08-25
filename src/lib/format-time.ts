/**
 * 共享相对时间格式化
 *
 * 统一 ChatView / HomePage / HistoryPanel 三处的时间显示逻辑，
 * 按 locale 输出（en: "just now" / "5 min ago" / "yesterday" / "3/15"；zh: "刚刚" / "5 分钟前" / "昨天" / "3/15"）。
 */

import { t, type Locale } from "./i18n"

/** 聊天列表用的简短相对时间（"刚刚 / N 分钟前 / N 小时前 / 月日"） */
export function formatRelativeTime(updatedAt: number): string {
  const diff = Date.now() - updatedAt
  if (diff < 60_000) return t("time.justNow")
  if (diff < 3600_000) return t("time.minAgo", { n: Math.floor(diff / 60_000) })
  if (diff < 86400_000) return t("time.hourAgo", { n: Math.floor(diff / 3600_000) })
  return new Date(updatedAt).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })
}

/** 历史面板/首页用的带时分的时间（当天显 HH:MM，昨天显 "昨天 HH:MM"，更早显 YYYY/MM/DD HH:MM） */
export function formatHistoryDate(updatedAt: number, _locale?: Locale): string {
  const d = new Date(updatedAt)
  const now = new Date()
  const hours = String(d.getHours()).padStart(2, "0")
  const mins = String(d.getMinutes()).padStart(2, "0")
  const timeStr = `${hours}:${mins}`

  if (d.toDateString() === now.toDateString()) return timeStr

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return t("time.yesterdayWithTime", { time: timeStr })

  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}/${month}/${day} ${timeStr}`
}
