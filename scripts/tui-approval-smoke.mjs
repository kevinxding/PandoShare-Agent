#!/usr/bin/env node
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { testRender } from '@opentui/solid'
import { jsx } from '../dist/src/tui/opentui/pando-jsx/jsx-runtime.js'
import { PandoTuiApp } from '../dist/src/tui/opentui/PandoOpenTuiRenderer.js'

const tui = await import('../dist/src/tui/index.js')
const approvals = await import('../dist/src/services/approvalStore/index.js')
const root = process.cwd()
const tmp = resolve(root, '.tmp-tui-approval-smoke')
await rm(tmp, { recursive: true, force: true })
await mkdir(tmp, { recursive: true })
try {
  const store = new approvals.LocalApprovalStore(tmp)
  await store.createPending({
    approvalId: 'approval_tui_smoke',
    threadId: 'thread_tui_smoke',
    request: {
      toolName: 'shell',
      toolUse: { id: 'tool_use_tui_smoke', name: 'shell', input: { command: 'echo hi', token: 'sk-secretsecretsecret' } },
      safety: 'workspace_write',
      risk: 'medium',
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
      sandboxMode: 'workspace-write',
      reason: 'Run a shell command for the TUI smoke.',
    },
  })
  const adapter = tui.createPandoTuiAdapter({ cwd: tmp, io: { output: { write() {} } }, fake: true })
  const pending = await adapter.listApprovals()
  assert(pending.length === 1, 'adapter should list pending approval')
  assert(!JSON.stringify(pending).includes('sk-secretsecretsecret'), 'approval should be redacted')
  const snapshot = {
    title: 'Pando TUI approval smoke',
    activeThreadId: 'thread_tui_smoke',
    threads: [],
    messages: [],
    models: [{ provider: 'fake', name: 'fake-model', label: 'Fake', selected: true, status: 'selected' }],
    approvals: pending,
    mission: {},
    statusLines: ['GUI: baseline'],
  }
  const renderAdapter = {
    async snapshot() { return snapshot },
    async createThread() { throw new Error('not used') },
    async resumeThread() { throw new Error('not used') },
    async sendMessage() { throw new Error('prompt should be disabled while approval is pending') },
    async streamEvents() { return [] },
    async listModels() { return snapshot.models },
    async selectModel() {},
    async listWorkspaceFiles() { return [] },
    async listWorkspaceChanges() { return [] },
    async readWorkspaceChangeDiff(path) { return { path, status: '', kind: 'none', text: '', truncated: false } },
    async listPromptStash() { return [] },
    async pushPromptStash(text) { return { id: 'stash_approval_smoke', text, createdAtMs: Date.now() } },
    async popPromptStash() { return undefined },
    async removePromptStash() {},
    async readPromptDraft() { return undefined },
    async writePromptDraft() {},
    async clearPromptDraft() {},
    async listApprovals() { return pending },
    async answerApproval(id, decision) { return adapter.answerApproval(id, decision) },
    async getMissionOverview() { return {} },
    close() {},
  }
  const setup = await testRender(() => jsx(PandoTuiApp, {
    adapter: renderAdapter,
    initialSnapshot: snapshot,
    startInSession: true,
    onExit: () => undefined,
  }), { width: 118, height: 34, autoFocus: true })
  try {
    await setup.flush()
    const frame = setup.captureCharFrame()
    assert(frame.includes('1 Approval'), 'footer should show pending approval count')
    assert(frame.includes('Review pending approval'), 'prompt should explain that approval is blocking input')
    assert(frame.includes('Permission required'), 'approval card should be visible')
    assert(frame.includes('Shell'), 'approval card should classify the tool')
    assert(frame.includes('echo hi'), 'approval card should show the command summary')
    assert(frame.includes('Allow once'), 'approval card should show allow-once action')
    assert(!frame.includes('sk-secretsecretsecret'), 'approval card should not render secret values')
  } finally {
    setup.renderer.destroy()
  }
  const decision = await adapter.answerApproval('approval_tui_smoke', 'approve_once')
  assert(decision?.status === 'approved', 'adapter should approve pending approval')
  console.log('tui approval smoke passed')
} finally {
  await rm(tmp, { recursive: true, force: true })
}
function assert(value, message) { if (!value) throw new Error(message) }
