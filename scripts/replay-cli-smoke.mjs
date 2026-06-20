#!/usr/bin/env node
import { mkdir, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { relative, resolve } from 'node:path'

const core = await import('../dist/src/core/index.js')
const root = process.cwd()
const smokeRoot = resolve(root, '.tmp-replay-cli-smoke')
assertInside(root, smokeRoot)
await rm(smokeRoot, { recursive: true, force: true })
await mkdir(smokeRoot, { recursive: true })
try {
  const durable = new core.DurableRuntime({ workspaceRoot: smokeRoot, workspaceId: 'default' })
  await durable.appendEvent({ eventType: 'run_start', workspaceId: 'default', runId: 'run_cli_smoke', payload: { status: 'running' } })
  await durable.createCheckpoint({ workspaceId: 'default', runId: 'run_cli_smoke', payload: { ok: true } })
  await durable.appendEvent({ eventType: 'run_complete', workspaceId: 'default', runId: 'run_cli_smoke', payload: { status: 'completed' } })
  const pando = resolve(root, 'bin/pando.js')
  const run = spawnSync(process.execPath, [pando, 'replay', 'run', 'run_cli_smoke'], { cwd: smokeRoot, encoding: 'utf8' })
  assert(run.status === 0, `pando replay run failed: ${run.stderr}`)
  assert(run.stdout.includes('# Pando Replay Report'), 'pando replay run should output markdown')
  const incidents = spawnSync(process.execPath, [pando, 'replay', 'incidents', 'run_cli_smoke'], { cwd: smokeRoot, encoding: 'utf8' })
  assert(incidents.status === 0, `pando replay incidents failed: ${incidents.stderr}`)
  assert(incidents.stdout.includes('incident') || incidents.stdout.includes('No replay incidents'), 'incidents command should print summary')
  const exported = spawnSync(process.execPath, [pando, 'replay', 'export', '--run', 'run_cli_smoke', '--out', 'replay-bundle'], { cwd: smokeRoot, encoding: 'utf8' })
  assert(exported.status === 0, `pando replay export failed: ${exported.stderr}`)
  assert(exported.stdout.includes('Replay bundle exported'), 'export command should print bundle path')
  const invalid = spawnSync(process.execPath, [pando, 'replay', 'range'], { cwd: smokeRoot, encoding: 'utf8' })
  assert(invalid.status !== 0, 'invalid query should exit non-zero')
} finally {
  assertInside(root, smokeRoot)
  await rm(smokeRoot, { recursive: true, force: true })
}
console.log('replay cli smoke passed')

function assertInside(rootPath, targetPath) {
  const rel = relative(rootPath, targetPath)
  if (rel.startsWith('..') || rel === '' || resolve(rootPath, rel) !== targetPath) throw new Error(`Refusing to use path outside workspace: ${targetPath}`)
}
function assert(condition, message) {
  if (!condition) throw new Error(message)
}