#!/usr/bin/env node
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
const tui = await import('../dist/src/tui/index.js')
const root = process.cwd()
const tmp = resolve(root, '.tmp-tui-adapter-smoke')
await rm(tmp, { recursive: true, force: true })
await mkdir(tmp, { recursive: true })
try {
  const adapter = tui.createPandoTuiAdapter({ cwd: tmp, io: { output: { write() {} } }, fake: true })
  const models = await adapter.listModels()
  assert(models.some(model => model.provider === 'minimax-cn'), 'adapter should expose builtin models')
  const thread = await adapter.createThread('Adapter smoke')
  const result = await adapter.sendMessage(thread.threadId, 'Hello')
  assert(result.finalText.includes('Pando TUI adapter'), 'adapter fake send should return text')
  const snapshot = await adapter.snapshot()
  assert(snapshot.threads.length === 1, 'snapshot should include created thread')
  assert(snapshot.messages.length === 2, 'snapshot should include persisted messages')
  await adapter.writePromptDraft('persist this draft')
  assert((await adapter.readPromptDraft())?.text === 'persist this draft', 'adapter should read prompt draft after writing')
  const stash = await adapter.pushPromptStash('remember this prompt')
  assert(stash.text === 'remember this prompt', 'adapter should create prompt stash entries')
  assert((await adapter.listPromptStash()).length === 1, 'adapter should list prompt stash entries')
  adapter.close()
  const resumedAdapter = tui.createPandoTuiAdapter({ cwd: tmp, io: { output: { write() {} } }, fake: true })
  assert((await resumedAdapter.readPromptDraft())?.text === 'persist this draft', 'prompt draft should persist across adapter instances')
  await resumedAdapter.clearPromptDraft()
  assert(await resumedAdapter.readPromptDraft() === undefined, 'cleared prompt draft should not be returned')
  assert((await resumedAdapter.listPromptStash())[0]?.text === 'remember this prompt', 'prompt stash should persist across adapter instances')
  const popped = await resumedAdapter.popPromptStash()
  assert(popped?.id === stash.id, 'adapter should pop the latest prompt stash entry')
  assert((await resumedAdapter.listPromptStash()).length === 0, 'popped prompt stash should be removed')
  await resumedAdapter.pushPromptStash('remove me')
  const removable = (await resumedAdapter.listPromptStash())[0]
  await resumedAdapter.removePromptStash(removable.id)
  assert((await resumedAdapter.listPromptStash()).length === 0, 'adapter should remove prompt stash entries by id')
  resumedAdapter.close()
  console.log('tui adapter smoke passed')
} finally {
  await rm(tmp, { recursive: true, force: true })
}
function assert(value, message) { if (!value) throw new Error(message) }
