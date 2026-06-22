#!/usr/bin/env node
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
const tui = await import('../dist/src/tui/index.js')
const root = process.cwd()
const tmp = resolve(root, '.tmp-tui-thread-smoke')
await rm(tmp, { recursive: true, force: true })
await mkdir(tmp, { recursive: true })
try {
  const adapter = tui.createPandoTuiAdapter({ cwd: tmp, io: { output: { write() {} } }, fake: true })
  const thread = await adapter.createThread('Thread smoke')
  await adapter.sendMessage(thread.threadId, 'Hello')
  const resumed = await adapter.resumeThread(thread.threadId)
  assert(resumed.metadata.threadId === thread.threadId, 'resume should return same thread')
  assert(resumed.messages.some(message => message.content === 'Hello'), 'resume should include user message')
  console.log('tui thread smoke passed')
} finally {
  await rm(tmp, { recursive: true, force: true })
}
function assert(value, message) { if (!value) throw new Error(message) }
