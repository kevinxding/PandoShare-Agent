#!/usr/bin/env node
import { mkdir, rm } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
const core = await import('../dist/src/core/index.js')
const root = process.cwd()
function assert(condition, message) { if (!condition) throw new Error(message) }
function assertInside(rootPath, targetPath) { const rel = relative(rootPath, targetPath); if (rel.startsWith('..') || rel === '' || resolve(rootPath, rel) !== targetPath) throw new Error('Refusing path outside workspace: ' + targetPath) }
async function tempRoot(name) { const dir = resolve(root, name); assertInside(root, dir); await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true }); return dir }
const smokeRoot = await tempRoot('.tmp-scheduled-backend-smoke')
try {
  const service = new core.BackendService({ workspaceRoot: smokeRoot, cwd: smokeRoot, sessionId: 'scheduled-backend-smoke' })
  const created = await service.handle({ action: 'scheduled.create', payload: { jobId: 'job_backend_smoke', title: 'Backend smoke', schedule: '@now', action: { type: 'system_event', payload: { ok: true } }, source: 'smoke' } })
  assert(created.ok, 'scheduled.create should succeed')
  const run = await service.handle({ action: 'scheduled.runNow', payload: { jobId: 'job_backend_smoke' } })
  assert(run.ok && run.data?.status === 'completed', 'scheduled.runNow should execute')
  const health = await service.handle({ action: 'system.health' })
  assert(health.ok && health.data?.kernels?.scheduled, 'system.health should include scheduled kernel')
  const status = service.status()
  assert(status.data?.supportedActions?.includes('scheduled.create'), 'backend status should expose scheduled actions')
  console.log('scheduled automation backend smoke passed')
} finally { await rm(smokeRoot, { recursive: true, force: true }) }
