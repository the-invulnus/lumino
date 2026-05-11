// ============================================================
// 记忆调度器 — chrome.alarms 注册定时任务
// ============================================================
// 注意：当前主动 AI 功能已禁用，此模块的定时任务不再被调用。
// 保留代码以备后续恢复。

import { STORAGE_KEY_DAILY_SCHEDULE } from "./types"

const DAILY_ALARM_NAME = "lumino-daily-memory" as const
const STORAGE_CLEANUP_ALARM_NAME = "lumino-storage-cleanup" as const
const PROFILE_UPDATE_ALARM_NAME = "lumino-profile-update" as const

export type DailyScheduleConfig = {
  /** 小时（0-23），默认 22（晚上 10 点） */
  hour: number
  /** 分钟（0-59），默认 0 */
  minute: number
}

const DEFAULT_SCHEDULE: DailyScheduleConfig = {
  hour: 22,
  minute: 0
}

/**
 * 加载用户配置的日记忆生成时间。
 */
export async function getDailySchedule(): Promise<DailyScheduleConfig> {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY_DAILY_SCHEDULE)
    const raw = data[STORAGE_KEY_DAILY_SCHEDULE] as DailyScheduleConfig | undefined

    if (
      raw &&
      typeof raw.hour === "number" &&
      raw.hour >= 0 &&
      raw.hour <= 23 &&
      typeof raw.minute === "number" &&
      raw.minute >= 0 &&
      raw.minute <= 59
    ) {
      return raw
    }
  } catch {
    // fall through to default
  }

  return DEFAULT_SCHEDULE
}

/**
 * 保存用户配置的日记忆生成时间。
 */
export async function saveDailySchedule(
  config: DailyScheduleConfig
): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_DAILY_SCHEDULE]: config })
}

/**
 * 计算下一次 alarm 触发时间（毫秒）。
 * chrome.alarms 的 when 使用 Unix epoch ms。
 */
function computeNextAlarmMs(hour: number, minute: number): number {
  const now = new Date()
  const target = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0,
    0
  )

  // 如果今天的目标时间已过，则调度到明天
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }

  return target.getTime()
}

/**
 * 注册日记忆生成定时任务。
 */
export async function scheduleDailyMemory(
  config?: DailyScheduleConfig
): Promise<void> {
  const schedule = config ?? (await getDailySchedule())

  // 先清除旧的 alarm
  await chrome.alarms.clear(DAILY_ALARM_NAME)

  // periodInMinutes = 24 * 60 = 1440（每天一次）
  chrome.alarms.create(DAILY_ALARM_NAME, {
    when: computeNextAlarmMs(schedule.hour, schedule.minute),
    periodInMinutes: 24 * 60
  })
}

/**
 * 注册存储清理定时任务（每天执行一次）。
 */
export function scheduleStorageCleanup(): void {
  chrome.alarms.create(STORAGE_CLEANUP_ALARM_NAME, {
    periodInMinutes: 24 * 60
  })
}

/**
 * 注册用户画像更新定时任务（每 6 小时一次）。
 */
export function scheduleProfileUpdate(): void {
  chrome.alarms.create(PROFILE_UPDATE_ALARM_NAME, {
    periodInMinutes: 6 * 60
  })
}

/**
 * 检查是否是日记忆 alarm。
 */
export function isDailyMemoryAlarm(name: string): boolean {
  return name === DAILY_ALARM_NAME
}

/**
 * 检查是否是存储清理 alarm。
 */
export function isStorageCleanupAlarm(name: string): boolean {
  return name === STORAGE_CLEANUP_ALARM_NAME
}

/**
 * 检查是否是画像更新 alarm。
 */
export function isProfileUpdateAlarm(name: string): boolean {
  return name === PROFILE_UPDATE_ALARM_NAME
}

/**
 * 初始化所有定时任务。
 * 注意：主动 AI 功能已禁用，此函数不再被 background.ts 调用。
 */
export async function initializeAllSchedules(): Promise<void> {
  await scheduleDailyMemory()
  scheduleStorageCleanup()
  scheduleProfileUpdate()
}
