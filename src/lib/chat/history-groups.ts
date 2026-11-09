import type { ChatThreadRecord } from "./thread-idb"

export type HistoryGroup = {
  id: string
  period: "today" | "yesterday" | "last7Days" | "thisMonth" | "month"
  month?: Date
  threads: ChatThreadRecord[]
}

/** Calendar boundaries follow the user's timezone, including daylight-saving changes. */
export function groupHistoryThreads(threads: ChatThreadRecord[], now = new Date()): HistoryGroup[] {
  const year = now.getFullYear(), month = now.getMonth(), day = now.getDate()
  const today = new Date(year, month, day).getTime()
  const yesterday = new Date(year, month, day - 1).getTime()
  // Seven calendar days including today. Earlier groups take precedence.
  const last7Days = new Date(year, month, day - 6).getTime()
  const thisMonth = new Date(year, month, 1).getTime()
  const groups = new Map<string, HistoryGroup>()

  for (const thread of [...threads].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const time = thread.updatedAt
    const period: HistoryGroup["period"] = time >= today ? "today"
      : time >= yesterday ? "yesterday"
      : time >= last7Days ? "last7Days"
      : time >= thisMonth ? "thisMonth" : "month"
    const date = new Date(time)
    const monthStart = period === "month" ? new Date(date.getFullYear(), date.getMonth(), 1) : undefined
    const id = monthStart ? `month-${monthStart.getFullYear()}-${monthStart.getMonth() + 1}` : period
    let group = groups.get(id)
    if (!group) {
      group = { id, period, month: monthStart, threads: [] }
      groups.set(id, group)
    }
    group.threads.push(thread)
  }
  return [...groups.values()]
}
