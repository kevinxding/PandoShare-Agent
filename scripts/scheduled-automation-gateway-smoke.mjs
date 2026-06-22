#!/usr/bin/env node
import { mkdir, rm } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
const core = await import('../dist/src/core/index.js')
const root = process.cwd()
function assert(condition, message) { if (!condition) throw new Error(message) }
function assertInside(rootPath, targetPath) { const rel = relative(rootPath, targetPath); if (rel.startsWith('..') || rel === '' || resolve(rootPath, rel) !== targetPath) throw new Error('Refusing path outside workspace: ' + targetPath) }
async function tempRoot(name) { const dir = resolve(root, name); assertInside(root, dir); await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true }); return dir }
const smokeRoot = await tempRoot('.tmp-scheduled-gateway-smoke')
try {
  const gateway = new core.GatewayDaemon({ workspaceRoot: smokeRoot, workspaceId: 'default' })
  const runtime = new core.ScheduledAutomationRuntime({ workspaceRoot: smokeRoot, workspaceId: 'default', durable: gateway.durable, gateway, loopWake: gateway.wakeScheduler, now: () => 2000 })
  await runtime.createJob({ jobId: 'job_gateway_smoke', title: 'Gateway smoke', schedule: '@now', action: { type: 'gateway_message', payload: { channelId: 'local', userId: 'operator', text: 'hello scheduled' } }, delivery: { mode: 'gateway' }, source: 'smoke' })
  const tick = await runtime.tick({ nowMs: 2000 })
  assert(tick.runs[0].status === 'completed', 'gateway job should complete')
  const status = await gateway.status()
  assert(status.queuedOutboundCount >= 1, 'gateway outbound queue should receive scheduled message')
  console.log('scheduled automation gateway smoke passed')
} finally { await rm(smokeRoot, { recursive: true, force: true }) }
