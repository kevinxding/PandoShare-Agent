#!/usr/bin/env node
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
const tui = await import('../dist/src/tui/index.js')
const root = process.cwd()
const tmp = resolve(root, '.tmp-tui-shell-smoke')
await rm(tmp, { recursive: true, force: true })
await mkdir(tmp, { recursive: true })
let output = ''
try {
  const adapter = tui.createPandoTuiAdapter({ cwd: tmp, io: { output: { write: text => { output += text } } }, fake: true })
  await tui.runPandoTuiShell({ adapter, io: { output: { write: text => { output += text } } }, smoke: true })
  assert(output.includes('Pando TUI Shell v1'), 'shell should render title')
  assert(output.includes('Commands:'), 'shell should render command hints')
  console.log('tui shell smoke passed')
} finally {
  await rm(tmp, { recursive: true, force: true })
}
function assert(value, message) { if (!value) throw new Error(message) }
