import { expect, it } from "vitest"
import { groupHistoryThreads } from "./history-groups"
import type { ChatThreadRecord } from "./thread-idb"

const thread = (id: string, date: Date): ChatThreadRecord => ({ id, updatedAt: date.getTime(), messages: [] })
const ids = (groups: ReturnType<typeof groupHistoryThreads>) => groups.map(group => [group.id, group.threads.map(item => item.id)])

it("groups by last activity in descending order without mutating the source list", () => {
  const now = new Date(2026, 10, 15, 12)
  const records = [
    thread("month", new Date(2026, 10, 2)), thread("today-early", new Date(2026, 10, 15, 8)),
    thread("old", new Date(2025, 11, 31)), thread("week", new Date(2026, 10, 12)),
    thread("today-late", new Date(2026, 10, 15, 11)), thread("yesterday", new Date(2026, 10, 14)),
    thread("october", new Date(2026, 9, 31))
  ]
  const original = [...records]
  expect(ids(groupHistoryThreads(records, now))).toEqual([
    ["today", ["today-late", "today-early"]], ["yesterday", ["yesterday"]],
    ["last7Days", ["week"]], ["thisMonth", ["month"]],
    ["month-2026-10", ["october"]], ["month-2025-12", ["old"]]
  ])
  expect(records).toEqual(original)
})

it("uses inclusive local calendar boundaries rather than rolling 24-hour intervals", () => {
  const now = new Date(2026, 10, 15, 23, 59)
  const records = [
    thread("today", new Date(2026, 10, 15)), thread("yesterday", new Date(2026, 10, 14, 23, 59, 59, 999)),
    thread("week", new Date(2026, 10, 9)), thread("month", new Date(2026, 10, 8, 23, 59, 59, 999))
  ]
  expect(ids(groupHistoryThreads(records, now))).toEqual([
    ["today", ["today"]], ["yesterday", ["yesterday"]], ["last7Days", ["week"]], ["thisMonth", ["month"]]
  ])
})

it("keeps recent days from the previous month out of the monthly group", () => {
  const records = [thread("yesterday", new Date(2026, 9, 31)), thread("recent", new Date(2026, 9, 26)), thread("older", new Date(2026, 9, 25))]
  expect(ids(groupHistoryThreads(records, new Date(2026, 10, 1)))).toEqual([
    ["yesterday", ["yesterday"]], ["last7Days", ["recent"]], ["month-2026-10", ["older"]]
  ])
})

it("handles leap days and distinguishes the same month in different years", () => {
  const records = [thread("leap", new Date(2024, 1, 29)), thread("recent", new Date(2024, 1, 24)), thread("february", new Date(2024, 1, 1)), thread("last-year", new Date(2023, 1, 1))]
  expect(ids(groupHistoryThreads(records, new Date(2024, 2, 1)))).toEqual([
    ["yesterday", ["leap"]], ["last7Days", ["recent"]], ["month-2024-2", ["february"]], ["month-2023-2", ["last-year"]]
  ])
})

it("handles calendar dates across daylight-saving changes", () => {
  const records = [thread("yesterday", new Date(2026, 10, 1, 0, 30)), thread("recent", new Date(2026, 9, 27)), thread("older", new Date(2026, 9, 26, 23, 59))]
  expect(ids(groupHistoryThreads(records, new Date(2026, 10, 2)))).toEqual([
    ["yesterday", ["yesterday"]], ["last7Days", ["recent"]], ["month-2026-10", ["older"]]
  ])
})

it("omits all empty groups", () => {
  expect(groupHistoryThreads([], new Date(2026, 10, 15))).toEqual([])
})
