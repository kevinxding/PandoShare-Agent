#!/usr/bin/env node
import { mkdir, rm } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
const core = await import('../dist/src/core/index.js')
const root = process.cwd()
function assert(condition, message) { if (!condition) throw new Error(message) }
function assertInside(rootPath, targetPath) { const rel = relative(rootPath, targetPath); if (rel.startsWith('..') || rel === '' || resolve(rootPath, rel) !== targetPath) throw new Error('Refusing path outside workspace: ' + targetPath) }
async function tempRoot(name) { const dir = resolve(root, name); assertInside(root, dir); await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true }); return dir }
const { LocalAutomationQueue } = await import('../dist/src/services/automationQueue/index.js')
const smokeRoot = await tempRoot('.tmp-scheduled-store-smoke')
try {
  const store = new core.ScheduledAutomationStore(smokeRoot, 'default')
  const job = await store.createJob({ jobId: 'job_store_smoke', title: 'Store smoke', schedule: '@now', action: { type: 'system_event', payload: { text: 'ok' } }, source: 'smoke', nextRunAtMs: 100 })
  assert(job.jobId === 'job_store_smoke', 'job should persist')
  assert((await store.readJobs()).length === 1, 'readJobs should return one job')
  assert((await store.listDueJobs(100)).length === 1, 'job should be due')
  const run = await store.recordRunStart({ runId: 'run_store_smoke', jobId: job.jobId, workspaceId: 'default', reason: 'scheduled', scheduledForMs: 100, actionType: 'system_event', deliveryMode: 'none', attempt: 1 })
  await store.completeRun(run, { status: 'completed', message: 'ok' })
  assert((await store.listDueJobs(100)).length === 0, 'same job and slot should be idempotent')
  await new LocalAutomationQueue(smokeRoot).createSchedule({ schedule: '*/5 * * * *', command: 'goal status' })
  assert((await store.readLegacyScheduleProjections()).length === 1, 'legacy schedules should project read-only')
  console.log('scheduled automation store smoke passed')
} finally { await rm(smokeRoot, { recursive: true, force: true }) }
