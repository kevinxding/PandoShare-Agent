#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
const root = process.cwd()
const tmp = resolve(root, '.tmp-tui-launch-smoke')
await rm(tmp, { recursive: true, force: true })
await mkdir(tmp, { recursive: true })
try {
  const output = await run(process.execPath, [resolve(root, 'bin/pando.js'), 'tui', '--smoke'], tmp)
  assert(output.exitCode === 0, 'pando tui --smoke should exit 0: ' + output.stderr)
  assert(output.stdout.toLowerCase().includes('pando'), 'launch smoke should render Pando OpenTUI shell')
  console.log('tui launch smoke passed')
} finally {
  await rm(tmp, { recursive: true, force: true })
}
function run(command, args, cwd) { return new Promise(resolveRun => { const child = spawn(command, args, { cwd, windowsHide: true }); let stdout=''; let stderr=''; child.stdout.on('data', c => stdout += String(c)); child.stderr.on('data', c => stderr += String(c)); child.on('close', code => resolveRun({ exitCode: code, stdout, stderr })); child.on('error', error => resolveRun({ exitCode: 1, stdout, stderr: String(error) })); }) }
function assert(value, message) { if (!value) throw new Error(message) }
