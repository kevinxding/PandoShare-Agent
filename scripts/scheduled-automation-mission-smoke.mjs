#!/usr/bin/env node
import { mkdir, rm } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
const core = await import('../dist/src/core/index.js')
const root = process.cwd()
function assert(condition, message) { if (!condition) throw new Error(message) }
function assertInside(rootPath, targetPath) { const rel = relative(rootPath, targetPath); if (rel.startsWith('..') || rel === '' || resolve(rootPath, rel) !== targetPath) throw new Error('Refusing path outside workspace: ' + targetPath) }
async function tempRoot(name) { const dir = resolve(root, name); assertInside(root, dir); await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true }); return dir }
const smokeRoot = await tempRoot('.tmp-scheduled-mission-smoke')
try {
  const service = new core.MissionControlService({ workspaceRoot: smokeRoot, cwd: smokeRoot, sessionId: 'scheduled-mission-smoke' })
  const created = await service.runScheduledAction({ action: 'scheduled.create', payload: { jobId: 'job_mission_smoke', title: 'Mission smoke', schedule: '@now', action: { type: 'system_event', payload: { ok: true } }, source: 'smoke' } })
  assert(created.ok, 'mission scheduled.create should succeed')
  const list = await service.getScheduledJobs({ limit: 5 })
  assert(JSON.stringify(list.data).includes('job_mission_smoke'), 'mission list should include job')
  const run = await service.runScheduledAction({ action: 'scheduled.runNow', payload: { jobId: 'job_mission_smoke' } })
  assert(JSON.stringify(run.data).includes('completed'), 'mission runNow should complete')
  const health = await service.getScheduledHealth()
  assert(health.ok, 'mission scheduled health should return ok')
  console.log('scheduled automation mission smoke passed')
} finally { await rm(smokeRoot, { recursive: true, force: true }) }
