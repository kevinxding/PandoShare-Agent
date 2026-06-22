#!/usr/bin/env node
import { mkdir, rm } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
const core = await import('../dist/src/core/index.js')
const root = process.cwd()
function assert(condition, message) { if (!condition) throw new Error(message) }
function assertInside(rootPath, targetPath) { const rel = relative(rootPath, targetPath); if (rel.startsWith('..') || rel === '' || resolve(rootPath, rel) !== targetPath) throw new Error('Refusing path outside workspace: ' + targetPath) }
async function tempRoot(name) { const dir = resolve(root, name); assertInside(root, dir); await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true }); return dir }
const smokeRoot = await tempRoot('.tmp-scheduled-runtime-smoke')
try {
  const durable = new core.DurableRuntime({ workspaceRoot: smokeRoot, workspaceId: 'default' })
  const runtime = new core.ScheduledAutomationRuntime({ workspaceRoot: smokeRoot, workspaceId: 'default', durable, now: () => 1000 })
  const job = await runtime.createJob({ jobId: 'job_runtime_smoke', title: 'Runtime smoke', schedule: '@now', action: { type: 'system_event', payload: { text: 'ok' } }, source: 'smoke' })
  const tick = await runtime.tick({ nowMs: 1000 })
  assert(tick.processedCount === 1 && tick.runs[0].status === 'completed', 'runtime should execute due job')
  assert((await runtime.tick({ nowMs: 1000 })).processedCount === 0, 'runtime should not duplicate same slot')
  const events = await durable.readEvents()
  assert(events.some(event => event.eventType === 'scheduled_run_completed'), 'runtime should emit scheduled event')
  assert((await runtime.getJob(job.jobId)).lastRunId === tick.runs[0].runId, 'job should point at last run')
  console.log('scheduled automation runtime smoke passed')
} finally { await rm(smokeRoot, { recursive: true, force: true }) }
