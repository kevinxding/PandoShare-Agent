#!/usr/bin/env node
const core = await import('../dist/src/core/index.js')
function assert(condition, message) { if (!condition) throw new Error(message) }
const now = Date.UTC(2026, 0, 1, 0, 0, 0)
const every = core.parseScheduleInput('@every 5m', now).schedule
assert(every.kind === 'every' && every.intervalMs === 300000, '@every 5m should parse')
const cron = core.parseScheduleInput('*/5 * * * *', now).schedule
assert(cron.kind === 'cron' && cron.intervalMinutes === 5, '*/5 cron should parse')
const unsupported = core.parseScheduleInput('0 9 * * 1', now)
assert(unsupported.warnings.includes('unsupported_cron_expression'), 'complex cron should be explicit unsupported')
const daily = core.parseScheduleInput({ kind: 'daily', time: '09:30', timezone: 'UTC' }, now).schedule
assert(core.computeNextRunAtMs(daily, now) > now, 'daily should compute a next run')
console.log('scheduled automation parser smoke passed')
