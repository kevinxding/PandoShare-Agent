#!/usr/bin/env node
import { mkdir, rm } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
const core = await import('../dist/src/core/index.js')
const root = process.cwd()
function assert(condition, message) { if (!condition) throw new Error(message) }
function assertInside(rootPath, targetPath) { const rel = relative(rootPath, targetPath); if (rel.startsWith('..') || rel === '' || resolve(rootPath, rel) !== targetPath) throw new Error('Refusing path outside workspace: ' + targetPath) }
async function tempRoot(name) { const dir = resolve(root, name); assertInside(root, dir); await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true }); return dir }
const smokeRoot = await tempRoot('.tmp-scheduled-replay-smoke')
try {
  const durable = new core.DurableRuntime({ workspaceRoot: smokeRoot, workspaceId: 'default' })
  const runtime = new core.ScheduledAutomationRuntime({ workspaceRoot: smokeRoot, workspaceId: 'default', durable, now: () => 3000 })
  await runtime.createJob({ jobId: 'job_replay_smoke', title: 'Replay smoke', schedule: '@now', action: { type: 'system_event', payload: { ok: true } }, source: 'smoke' })
  await runtime.tick({ nowMs: 3000 })
  const timeline = new core.EventReplay().buildTimeline(await durable.readEvents())
  assert(timeline.some(item => item.category === 'scheduled'), 'replay timeline should categorize scheduled events')
  console.log('scheduled automation replay smoke passed')
} finally { await rm(smokeRoot, { recursive: true, force: true }) }
