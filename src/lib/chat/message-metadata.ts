// Match only generated timestamp headers at the start, including duplicates
// saved by older versions after regenerating the first turn.
const CURRENT_TIME_PREFIX = /^(?:\[Current Time: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\]\r?\n\r?\n)+/

export function stripCurrentTime(content: string): string {
  return content.replace(CURRENT_TIME_PREFIX, "")
}

export function buildUserInputWithTime(userInput: string): string {
  return `[Current Time: ${new Date().toISOString()}]\n\n${stripCurrentTime(userInput)}`
}
