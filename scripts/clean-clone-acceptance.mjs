#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { access, rm } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

const root = process.cwd()
const requiredSrc = resolve(root, 'src')
await access(requiredSrc)

const cleanupTargets = [
  'dist',
  '.pandoshare',
  '.tmp-kernel-smoke',
  '.tmp-durable-smoke',
  '.tmp-loop-core-smoke',
  '.tmp-loop-projection-smoke',
  '.tmp-loop-recovery-smoke',
  '.tmp-gui-runtime-smoke',
  '.tmp-gui-approval-smoke',
  '.tmp-gui-recovery-smoke',
  '.tmp-gateway-core-smoke',
  '.tmp-gateway-command-smoke',
  '.tmp-gateway-delivery-smoke',
  '.tmp-gateway-approval-smoke',
  '.tmp-gateway-recovery-smoke',
  '.tmp-model-router-smoke',
  '.tmp-replay-api-smoke',
]

for (const target of cleanupTargets) {
  const fullPath = resolve(root, target)
  assertInside(root, fullPath)
  await rm(fullPath, { recursive: true, force: true })
}

const result = await run(npmCommand(), ['run', 'acceptance:full'])
if (result.exitCode !== 0) {
  process.exit(result.exitCode ?? 1)
}

console.log('clean clone acceptance passed')

function run(command, args) {
  return new Promise(resolveRun => {
    const spec = spawnSpec(command, args)
    const child = spawn(spec.command, spec.args, {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.on('close', (exitCode, signal) => resolveRun({ exitCode, signal }))
    child.on('error', error => {
      console.error(error instanceof Error ? error.message : String(error))
      resolveRun({ exitCode: 1, signal: undefined })
    })
  })
}

function spawnSpec(command, args) {
  if (process.platform === 'win32' && /\.cmd$/i.test(command)) {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', command, ...args] }
  }
  return { command, args }
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function assertInside(rootPath, targetPath) {
  const rel = relative(rootPath, targetPath)
  if (rel.startsWith('..') || rel === '' || resolve(rootPath, rel) !== targetPath) {
    throw new Error(`Refusing path outside workspace: ${targetPath}`)
  }
}
