#!/usr/bin/env node
import { mkdir, rm } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

const core = await import('../dist/src/core/index.js')
const server = await import('../dist/src/server/index.js')
const root = process.cwd()
const smokeRoot = resolve(root, '.tmp-replay-api-smoke')
assertInside(root, smokeRoot)
await rm(smokeRoot, { recursive: true, force: true })
await mkdir(smokeRoot, { recursive: true })
let handle
try {
  const durable = new core.DurableRuntime({ workspaceRoot: smokeRoot, workspaceId: 'default' })
  await durable.appendEvent({ eventType: 'run_start', workspaceId: 'default', runId: 'run_api_smoke', payload: { status: 'running', apiKey: 'sk-api-secretsecretsecret' } })
  await durable.createCheckpoint({ workspaceId: 'default', runId: 'run_api_smoke', payload: { ok: true } })
  await durable.appendEvent({ eventType: 'run_complete', workspaceId: 'default', runId: 'run_api_smoke', payload: { status: 'completed' } })
  handle = await server.startPandoServer({ cwd: smokeRoot, host: '127.0.0.1', port: 0 })
  const jsonResponse = await fetch(`${handle.url}/api/replay/run/run_api_smoke`)
  const json = await jsonResponse.json()
  assert(json.ok === true, 'replay run endpoint should return ok JSON')
  assert(JSON.stringify(json).includes('run_api_smoke'), 'JSON should include run id')
  assert(!JSON.stringify(json).includes('sk-api-secretsecretsecret'), 'JSON response must not leak secret')
  const markdownResponse = await fetch(`${handle.url}/api/replay/run/run_api_smoke?format=markdown`)
  const markdown = await markdownResponse.text()
  assert(markdown.includes('# Pando Replay Report'), 'format=markdown should return markdown')
  const invalid = await fetch(`${handle.url}/api/replay/run/bad id`)
  assert(invalid.status >= 400, 'invalid id should return error')
} finally {
  if (handle) await handle.close()
  assertInside(root, smokeRoot)
  await rm(smokeRoot, { recursive: true, force: true })
}
console.log('replay api smoke passed')

function assertInside(rootPath, targetPath) {
  const rel = relative(rootPath, targetPath)
  if (rel.startsWith('..') || rel === '' || resolve(rootPath, rel) !== targetPath) throw new Error(`Refusing to use path outside workspace: ${targetPath}`)
}
function assert(condition, message) {
  if (!condition) throw new Error(message)
}