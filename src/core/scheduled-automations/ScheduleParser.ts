import type { ScheduledAutomationSchedule } from './ScheduledAutomationTypes.js'

export type ParsedSchedule = {
  schedule: ScheduledAutomationSchedule
  warnings: string[]
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export function parseScheduleInput(input: string | Partial<ScheduledAutomationSchedule> | Record<string, unknown>, nowMs = Date.now()): ParsedSchedule {
  if (typeof input === 'string') return parseScheduleString(input, nowMs)
  const record = recordOrThrow(input, 'schedule')
  const kind = stringValue(record.kind)
  if (kind === 'once') {
    const runAtMs = numberValue(record.runAtMs) ?? parseIsoMs(stringValue(record.runAtIso)) ?? nowMs
    return { schedule: { kind: 'once', runAtMs, runAtIso: stringValue(record.runAtIso) }, warnings: [] }
  }
  if (kind === 'every') {
    const intervalMs = positiveInteger(record.intervalMs, 'schedule.intervalMs')
    return { schedule: { kind: 'every', intervalMs }, warnings: [] }
  }
  if (kind === 'daily') {
    const time = validateDailyTime(stringValue(record.time) ?? '')
    const timezone = stringValue(record.timezone) ?? 'local'
    const warnings = timezone === 'local' || timezone === 'UTC' ? [] : [`IANA timezone support is incomplete in v1; using local clock for ${timezone}.`]
    return { schedule: { kind: 'daily', time, timezone, warning: warnings[0] }, warnings }
  }
  if (kind === 'cron') {
    const expression = stringValue(record.expression) ?? ''
    return parseCronExpression(expression)
  }
  throw new Error('schedule.kind must be once, every, daily, or cron')
}

export function computeNextRunAtMs(schedule: ScheduledAutomationSchedule, nowMs = Date.now(), input: { afterRun?: boolean; previousRunAtMs?: number } = {}): number | undefined {
  if (schedule.kind === 'once') {
    if (input.afterRun) return undefined
    return Math.max(nowMs, schedule.runAtMs)
  }
  if (schedule.kind === 'every') {
    const base = input.afterRun ? nowMs : Math.max(nowMs, input.previousRunAtMs ?? nowMs)
    return base + schedule.intervalMs
  }
  if (schedule.kind === 'daily') {
    return nextDailyRun(schedule.time, schedule.timezone, nowMs + (input.afterRun ? 1 : 0))
  }
  if (schedule.kind === 'cron') {
    if (!schedule.intervalMinutes || schedule.unsupportedReason) return undefined
    return nextCronIntervalRun(schedule.intervalMinutes, nowMs + (input.afterRun ? 1 : 0))
  }
  return undefined
}

export function isUnsupportedSchedule(schedule: ScheduledAutomationSchedule): string | undefined {
  return schedule.kind === 'cron' ? schedule.unsupportedReason : undefined
}

function parseScheduleString(value: string, nowMs: number): ParsedSchedule {
  const raw = value.trim()
  if (!raw) throw new Error('schedule must be a non-empty string')
  if (raw === '@now' || raw === '@once') return { schedule: { kind: 'once', runAtMs: nowMs }, warnings: [] }
  const every = raw.match(/^@every\s+(\d+)\s*(ms|s|m|h)$/i)
  if (every) {
    const count = Number(every[1])
    const unit = every[2]!.toLowerCase()
    const factor = unit === 'ms' ? 1 : unit === 's' ? 1000 : unit === 'm' ? MINUTE_MS : HOUR_MS
    return { schedule: { kind: 'every', intervalMs: count * factor }, warnings: [] }
  }
  return parseCronExpression(raw)
}

function parseCronExpression(expression: string): ParsedSchedule {
  const raw = expression.trim()
  const match = raw.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/)
  if (!match) return unsupportedCron(raw)
  const intervalMinutes = Number(match[1])
  if (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0) return unsupportedCron(raw)
  return { schedule: { kind: 'cron', expression: raw, intervalMinutes }, warnings: [] }
}

function unsupportedCron(expression: string): ParsedSchedule {
  return { schedule: { kind: 'cron', expression, unsupportedReason: 'unsupported_cron_expression' }, warnings: ['unsupported_cron_expression'] }
}

function nextDailyRun(time: string, timezone: string, nowMs: number): number {
  const [hourRaw, minuteRaw] = time.split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  const now = new Date(nowMs)
  if (timezone === 'UTC') {
    const candidate = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0, 0)
    return candidate > nowMs ? candidate : candidate + DAY_MS
  }
  const candidate = new Date(now)
  candidate.setHours(hour, minute, 0, 0)
  if (candidate.getTime() <= nowMs) candidate.setDate(candidate.getDate() + 1)
  return candidate.getTime()
}

function nextCronIntervalRun(intervalMinutes: number, nowMs: number): number {
  const now = new Date(nowMs)
  const currentMinute = now.getUTCMinutes()
  const nextMinute = Math.floor(currentMinute / intervalMinutes) * intervalMinutes + intervalMinutes
  const candidate = new Date(now)
  candidate.setUTCSeconds(0, 0)
  if (nextMinute >= 60) {
    candidate.setUTCHours(candidate.getUTCHours() + 1, nextMinute % 60, 0, 0)
  } else {
    candidate.setUTCMinutes(nextMinute, 0, 0)
  }
  return candidate.getTime()
}

function validateDailyTime(value: string): string {
  const match = value.match(/^(\d{2}):(\d{2})$/)
  if (!match) throw new Error('daily schedule time must use HH:mm')
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error('daily schedule time must use HH:mm')
  return value
}

function positiveInteger(value: unknown, name: string): number {
  const number = numberValue(value)
  if (!Number.isInteger(number) || number === undefined || number <= 0) throw new Error(name + ' must be a positive integer')
  return number
}

function recordOrThrow(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(name + ' must be an object')
  return value as Record<string, unknown>
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseIsoMs(value: string | undefined): number | undefined {
  if (!value) return undefined
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : undefined
}
