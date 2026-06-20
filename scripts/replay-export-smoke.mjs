#!/usr/bin/env node
import { mkdir, readFile, rm } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

const core = await import('../dist/src/core/index.js')
const root = process.cwd()
const smokeRoot = resolve(root, '.tmp-replay-export-smoke')
assertInside(root, smokeRoot)
await rm(smokeRoot, { recursive: true, force: true })
await mkdir(smokeRoot, { recursive: true })
try {
  await main(core, smokeRoot)
} finally {
  assertInside(root, smokeRoot)
  await rm(smokeRoot, { recursive: true, force: true })
}

async function seedCrossCore(core, workspaceRoot, options = {}) {
  const durable = new core.DurableRuntime({ workspaceRoot, workspaceId: 'default' })
  const runId = options.runId ?? 'run_replay_smoke'
  const loopId = options.loopId ?? 'loop_replay_smoke'
  const goalId = options.goalId ?? 'goal_replay_smoke'
  const inboundId = options.inboundId ?? 'inbound_replay_smoke'
  const deliveryId = options.deliveryId ?? 'delivery_replay_smoke'
  const routeId = options.routeId ?? 'route_replay_smoke'
  const guiActionId = options.guiActionId ?? 'gui_replay_smoke'
  await durable.appendEvent({ eventType: 'gateway_inbound_received', workspaceId: 'default', payload: { inboundId, channelId: 'local', textPreview: 'start loop' } })
  await durable.appendEvent({ eventType: 'gateway_command_created', workspaceId: 'default', loopId, payload: { inboundId, commandId: 'cmd_replay_smoke', commandType: 'loop.create', loopId } })
  await durable.appendEvent({ eventType: 'loop_goal_created', workspaceId: 'default', loopId, goalId, payload: { loopId, goalId, objective: 'replay smoke' } })
  await durable.appendEvent({ eventType: 'loop_task_created', workspaceId: 'default', loopId, goalId, taskId: 'task_replay_smoke', payload: { taskId: 'task_replay_smoke', title: 'Replay task' } })
  await durable.appendEvent({ eventType: 'loop_attempt_started', workspaceId: 'default', loopId, goalId, taskId: 'task_replay_smoke', runId, payload: { attemptId: 'attempt_replay_smoke', taskId: 'task_replay_smoke', runId } })
  await durable.appendEvent({ eventType: 'run_start', workspaceId: 'default', threadId: 'thread_replay_smoke', runId, loopId, goalId, payload: { status: 'running' } })
  await durable.appendEvent({ eventType: 'model_route_selected', workspaceId: 'default', runId, loopId, payload: { routeId, profileId: 'build', taskType: 'code', selectedProviderId: 'cheap', selectedModelId: 'cheap-model' } })
  await durable.appendEvent({ eventType: 'tool_call', workspaceId: 'default', runId, loopId, toolCallId: 'tool_replay_smoke', payload: { toolCallId: 'tool_replay_smoke', toolName: 'gui_action', resultRef: 'tool-result-1' } })
  await durable.appendEvent({ eventType: 'gui_action_completed', workspaceId: 'default', runId, loopId, toolCallId: 'tool_replay_smoke', payload: { guiActionId, action: 'click', state: 'completed', screenshotRef: 'screenshot-1' } })
  const checkpoint = await durable.createCheckpoint({ workspaceId: 'default', threadId: 'thread_replay_smoke', runId, goalId, loopId, payload: { ok: true, checkpointRef: 'checkpoint-ref-1' } })
  await durable.appendEvent({ eventType: 'run_complete', workspaceId: 'default', threadId: 'thread_replay_smoke', runId, loopId, goalId, payload: { status: 'completed', checkpointId: checkpoint.checkpointId } })
  await durable.appendEvent({ eventType: 'loop_attempt_completed', workspaceId: 'default', loopId, goalId, taskId: 'task_replay_smoke', runId, payload: { attemptId: 'attempt_replay_smoke', checkpointId: checkpoint.checkpointId, summary: 'done' } })
  await durable.appendEvent({ eventType: 'gateway_outbound_delivered', workspaceId: 'default', loopId, payload: { inboundId, deliveryId, channelId: 'local', status: 'delivered' } })
  return { durable, runId, loopId, goalId, inboundId, deliveryId, routeId, guiActionId, checkpointId: checkpoint.checkpointId }
}

function assertInside(rootPath, targetPath) {
  const rel = relative(rootPath, targetPath)
  if (rel.startsWith('..') || rel === '' || resolve(rootPath, rel) !== targetPath) throw new Error(`Refusing to use path outside workspace: ${targetPath}`)
}
function assert(condition, message) {
  if (!condition) throw new Error(message)
}async function main(core, smokeRoot) {
  const ids = await seedCrossCore(core, smokeRoot)
  const out = resolve(smokeRoot, 'bundle')
  const result = await new core.ReplayService(ids.durable).exportBundle({ workspaceId: 'default', scope: 'run', runId: ids.runId }, out)
  for (const name of ['report.md', 'report.json', 'events.jsonl', 'graph.json', 'artifacts-manifest.json']) {
    assert(result.files.some(path => path.endsWith(name)), `bundle should include ${name}`)
    const text = await readFile(resolve(out, name), 'utf8')
    assert(text.length > 0, `${name} should not be empty`)
  }
  const manifest = JSON.parse(await readFile(resolve(out, 'artifacts-manifest.json'), 'utf8'))
  assert(manifest.artifacts.some(item => item.kind === 'screenshot_ref'), 'artifact manifest should include screenshot ref')
  assert(manifest.artifacts.some(item => item.kind === 'tool_result_ref'), 'artifact manifest should include tool result ref')
  assert(manifest.artifacts.some(item => item.kind === 'checkpoint_ref'), 'artifact manifest should include checkpoint ref')
  console.log('replay export smoke passed')
}