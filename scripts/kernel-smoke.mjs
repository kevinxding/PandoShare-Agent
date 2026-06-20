#!/usr/bin/env node
import { appendFile, mkdir, rm } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

const core = await import('../dist/src/core/index.js')

const root = process.cwd()
const smokeRoot = resolve(root, '.tmp-kernel-smoke')
assertInside(root, smokeRoot)
await rm(smokeRoot, { recursive: true, force: true })
await mkdir(smokeRoot, { recursive: true })

try {
  await smokeProtocol(core)
  await smokeRunStateMachine(core)
  await smokeStoreAndDurable(core, smokeRoot)
  await smokeLoopRuntime(core, smokeRoot)
  await smokeGuiRuntime(core, smokeRoot)
  await smokeGatewayRouter(core)
  await smokeModelRouter(core)
  await smokeReplay(core, smokeRoot)
} finally {
  assertInside(root, smokeRoot)
  await rm(smokeRoot, { recursive: true, force: true })
}

console.log('kernel smoke passed')

async function smokeProtocol(core) {
  const command = core.createCommandEnvelope({
    commandType: 'agent.run',
    workspaceId: 'default',
    source: 'test',
    payload: { prompt: 'hello' },
  })
  assert(core.isCommandEnvelope(command), 'command envelope should validate')
  const event = core.createEventEnvelope({
    eventType: 'run_start',
    workspaceId: 'default',
    payload: { ok: true },
  })
  assert(core.isEventEnvelope(event), 'event envelope should validate')
  assert(event.seq > 0, 'event seq should be positive')
}

async function smokeRunStateMachine(core) {
  const events = []
  const stateMachine = new core.RunStateMachine(event => events.push(event))
  const command = core.createCommandEnvelope({
    commandType: 'agent.run',
    workspaceId: 'default',
    threadId: 'thread_smoke',
    source: 'test',
    payload: { prompt: 'state smoke' },
  })
  const started = await stateMachine.startRun(command)
  assert(started.status === 'running', `expected running, got ${started.status}`)
  const completed = await stateMachine.completeRun(started.runId)
  assert(completed.status === 'completed', `expected completed, got ${completed.status}`)
  assert(events.some(event => event.eventType === 'run_start'), 'state machine should emit run_start')
  assert(events.some(event => event.eventType === 'run_complete'), 'state machine should emit run_complete')
  let illegal = false
  try {
    await stateMachine.interruptRun(started.runId)
  } catch {
    illegal = true
  }
  assert(illegal, 'completed run should reject illegal transition')
}

async function smokeStoreAndDurable(core, workspaceRoot) {
  const jsonlPath = resolve(workspaceRoot, 'records.jsonl')
  const jsonl = new core.JsonlStore(jsonlPath)
  await jsonl.append({ id: 1 })
  await jsonl.append({ id: 2 })
  await appendFile(jsonlPath, '{bad json\n', 'utf8')
  const read = await jsonl.read()
  assert(read.records.length === 2, `expected 2 valid records, got ${read.records.length}`)
  assert(read.corruptRecords.length === 1, `expected 1 corrupt record, got ${read.corruptRecords.length}`)

  const atomic = new core.AtomicFileStore()
  const atomicPath = resolve(workspaceRoot, 'atomic.json')
  const created = await atomic.writeIfMissing(atomicPath, '{"first":true}\n')
  const skipped = await atomic.writeIfMissing(atomicPath, '{"first":false}\n')
  assert(created === true && skipped === false, 'writeIfMissing should create once and never overwrite')

  const durable = new core.DurableRuntime({ workspaceRoot, workspaceId: 'default' })
  const checkpoint = await durable.createCheckpoint({
    workspaceId: 'default',
    threadId: 'thread_kernel_smoke',
    runId: 'run_kernel_smoke',
    payload: { ok: true },
  })
  const latest = await durable.checkpointManager.readLatestCheckpoint({ threadId: 'thread_kernel_smoke' })
  assert(latest?.checkpointId === checkpoint.checkpointId, 'latest checkpoint should be readable')
  const heartbeat = await durable.writeHeartbeat({
    workspaceId: 'default',
    runtimeId: 'runtime_kernel_smoke',
    kernel: 'gateway',
    status: 'running',
    createdAtMs: 1000,
  })
  assert(heartbeat.runtimeId === 'runtime_kernel_smoke', 'heartbeat should be written')
  assert(await durable.heartbeatManager.isStale('runtime_kernel_smoke', 100, 1200), 'heartbeat should be stale')
  const durableEvents = await durable.readEvents()
  assert(durableEvents.some(event => event.eventType === 'checkpoint'), 'checkpoint should also write EventEnvelope')
  assert(durableEvents.some(event => event.eventType === 'heartbeat'), 'heartbeat should also write EventEnvelope')
}

async function smokeLoopRuntime(core, workspaceRoot) {
  const mockAgent = {
    async submit(command) {
      assert(command.commandType === 'agent.run', 'loop should submit through AgentKernel command')
      return { finalText: 'mock loop run completed' }
    },
  }
  const runtime = new core.LoopRuntime({
    workspaceRoot,
    workspaceId: 'default',
    agentKernel: mockAgent,
  })
  const result = await runtime.runGoal({
    objective: 'Create one minimal task.',
    task: {
      verifier: { type: 'custom', name: 'kernel_smoke' },
    },
  })
  assert(result.goal.status === 'completed', `expected completed goal, got ${result.goal.status}`)
  assert(result.attempt.status === 'completed', `expected completed attempt, got ${result.attempt.status}`)
  assert(result.attempt.checkpointId, 'loop attempt should be checkpointed')
}

async function smokeGuiRuntime(core, workspaceRoot) {
  const runtime = new core.GuiRuntime({ workspaceRoot, workspaceId: 'default' })
  const record = await runtime.act({ action: 'click', x: 1, y: 2, verify: true })
  assert(record.verification.ok === true, 'mock GUI verification should pass')
  assert(record.eventId, 'GUI action should record an event id')
}

async function smokeGatewayRouter(core) {
  const router = new core.GatewayCommandRouter('default')
  const route = router.route({
    messageId: 'gw_msg_kernel_smoke',
    channel: 'local',
    userId: 'user',
    text: '/goal build the kernel',
    createdAtMs: Date.now(),
  })
  assert(route.command.commandType === 'loop.goal', `expected loop.goal, got ${route.command.commandType}`)
  assert(route.command.source === 'gateway', 'gateway command source should be gateway')
}

async function smokeModelRouter(core) {
  const router = core.ModelRouter.fromConfig({
    model: { provider: 'deepseek', name: 'deepseek-v4-flash' },
  })
  const cheap = router.selectModel({ taskType: 'cheap' })
  assert(cheap.provider.id === 'deepseek', `expected deepseek cheap model, got ${cheap.provider.id}`)
  const longContext = router.selectModel({ taskType: 'long_context' })
  assert(longContext.capabilities.longContext === true, 'long_context route should expose long context capability')
}

async function smokeReplay(core, workspaceRoot) {
  const durable = new core.DurableRuntime({ workspaceRoot, workspaceId: 'default' })
  await durable.appendEvent(core.createEventEnvelope({
    eventType: 'run_start',
    workspaceId: 'default',
    threadId: 'thread_replay_smoke',
    runId: 'run_replay_smoke',
    payload: { status: 'running' },
  }))
  await durable.appendEvent(core.createEventEnvelope({
    eventType: 'model_response',
    workspaceId: 'default',
    threadId: 'thread_replay_smoke',
    runId: 'run_replay_smoke',
    payload: { text: 'ok' },
  }))
  const reader = new core.ReplayReader(durable)
  const events = await reader.read({ runId: 'run_replay_smoke' })
  const timeline = new core.EventReplay().buildTimeline(events)
  const markdown = new core.ReplayReport().toMarkdown({ timeline })
  assert(timeline.length === 2, `expected 2 replay events, got ${timeline.length}`)
  assert(markdown.includes('model/model_response'), 'replay markdown should include model response timeline')
}

function assertInside(rootPath, targetPath) {
  const rel = relative(rootPath, targetPath)
  if (rel.startsWith('..') || rel === '' || resolve(rootPath, rel) !== targetPath) {
    throw new Error(`Refusing to use path outside workspace: ${targetPath}`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
