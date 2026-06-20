#!/usr/bin/env node
import { mkdir, rm } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

const core = await import('../dist/src/core/index.js')

const root = process.cwd()
const smokeRoot = resolve(root, '.tmp-durable-smoke')
assertInside(root, smokeRoot)
await rm(smokeRoot, { recursive: true, force: true })
await mkdir(smokeRoot, { recursive: true })

try {
  await smokeEventSeq(core, resolve(smokeRoot, 'events'))
  await smokeCheckpointSnapshotHeartbeat(core, resolve(smokeRoot, 'state'))
  await smokeRecoveryDecision(core, resolve(smokeRoot, 'recovery'))
  await smokeAuditAndReplay(core, resolve(smokeRoot, 'audit'))
} finally {
  assertInside(root, smokeRoot)
  await rm(smokeRoot, { recursive: true, force: true })
}

console.log('durable smoke passed')

async function smokeEventSeq(core, workspaceRoot) {
  const durable = new core.DurableRuntime({ workspaceRoot, workspaceId: 'default' })
  const first = await durable.appendEvent({
    eventType: 'run_start',
    workspaceId: 'default',
    runId: 'run_seq_smoke',
    payload: { ok: true, apiKey: 'sk-secretsecretsecretsecret' },
  })
  assert(first.seq === 1, `expected first seq 1, got ${first.seq}`)
  assert(first.payload.apiKey === '<redacted>', 'event payload should redact api keys')
  let rejected = false
  try {
    await durable.appendEvent(core.createEventEnvelope({
      eventType: 'run_running',
      workspaceId: 'default',
      runId: 'run_seq_smoke',
      payload: { ok: true },
    }))
  } catch {
    rejected = true
  }
  assert(rejected, 'EventStore should reject pre-sequenced events by default')

  const concurrent = await Promise.all(
    Array.from({ length: 8 }, (_, index) => durable.appendEvent({
      eventType: 'model_response',
      workspaceId: 'default',
      runId: 'run_seq_smoke',
      payload: { index },
    })),
  )
  const seqs = concurrent.map(event => event.seq).sort((left, right) => left - right)
  assert(JSON.stringify(seqs) === JSON.stringify([2, 3, 4, 5, 6, 7, 8, 9]), `unexpected concurrent seqs: ${seqs.join(',')}`)

  const runEvents = await durable.readRunEvents('run_seq_smoke')
  assert(isStrictAscending(runEvents.map(event => event.seq)), 'readRunEvents should return seq ascending')
}

async function smokeCheckpointSnapshotHeartbeat(core, workspaceRoot) {
  const durable = new core.DurableRuntime({ workspaceRoot, workspaceId: 'default' })
  const start = await durable.appendEvent({
    eventType: 'run_start',
    workspaceId: 'default',
    runId: 'run_checkpoint_smoke',
    payload: { status: 'running' },
  })
  const checkpoint = await durable.createCheckpoint({
    workspaceId: 'default',
    runId: 'run_checkpoint_smoke',
    status: 'safe_to_replay',
    summary: 'safe checkpoint',
    lastEventSeq: start.seq,
    payload: { ok: true },
  })
  const latest = await durable.readLatestCheckpoint('run_checkpoint_smoke')
  assert(latest?.checkpointId === checkpoint.checkpointId, 'createCheckpoint should write checkpoint record')
  const events = await durable.readRunEvents('run_checkpoint_smoke')
  assert(events.some(event => event.eventType === 'checkpoint'), 'createCheckpoint should append checkpoint event')

  const interrupted = await durable.createCheckpoint({
    workspaceId: 'default',
    runId: 'run_interrupted_checkpoint_smoke',
    status: 'unsafe_to_replay',
    reason: 'interrupted_by_user',
    summary: 'interrupted checkpoint',
  })
  assert(interrupted.status === 'unsafe_to_replay', 'interrupted checkpoint must be unsafe_to_replay')

  const snapshot = await durable.writeRunSnapshot({
    workspaceId: 'default',
    runId: 'run_checkpoint_smoke',
    status: 'running',
    lastEventSeq: start.seq,
    activePhase: 'model',
  })
  const snapshots = await durable.readRunSnapshots('run_checkpoint_smoke')
  assert(snapshots[0]?.snapshotId === snapshot.snapshotId, 'RunSnapshot should be writable and readable')
  JSON.stringify(snapshot)

  const heartbeat = await durable.writeHeartbeat({
    workspaceId: 'default',
    workerId: 'worker_durable_smoke',
    workerType: 'agent',
    runId: 'run_checkpoint_smoke',
    status: 'running',
    lastHeartbeatAtMs: 1000,
  })
  assert(heartbeat.workerId === 'worker_durable_smoke', 'heartbeat should be writable')
  assert(await durable.heartbeatManager.isStale('worker_durable_smoke', 1200, 100), 'heartbeat should become stale after ttl')
}

async function smokeRecoveryDecision(core, workspaceRoot) {
  const durable = new core.DurableRuntime({ workspaceRoot, workspaceId: 'default' })
  const ledger = core.RunLedger.fromRuntimePaths(durable.paths)

  await appendLedger(ledger, 'run_recovery_completed', 'completed')
  const completed = await durable.decideRecovery({ runId: 'run_recovery_completed' })
  assert(completed.decision === 'already_completed', `expected already_completed, got ${completed.decision}`)

  const interruptedEvent = await durable.appendEvent({
    eventType: 'run_interrupted',
    workspaceId: 'default',
    runId: 'run_recovery_interrupted',
    payload: { status: 'interrupted' },
  })
  await appendLedger(ledger, 'run_recovery_interrupted', 'interrupted')
  await durable.writeRunSnapshot({
    workspaceId: 'default',
    runId: 'run_recovery_interrupted',
    status: 'interrupted',
    activePhase: 'interrupted',
    lastEventSeq: interruptedEvent.seq,
  })
  const interrupted = await durable.decideRecovery({ runId: 'run_recovery_interrupted' })
  assert(interrupted.decision === 'requires_human', `expected requires_human, got ${interrupted.decision}`)

  await durable.appendEvent({
    eventType: 'run_failed',
    workspaceId: 'default',
    runId: 'run_recovery_pending',
    payload: { status: 'failed' },
  })
  await appendLedger(ledger, 'run_recovery_pending', 'failed')
  await durable.createCheckpoint({
    workspaceId: 'default',
    runId: 'run_recovery_pending',
    status: 'partial_replay',
    summary: 'pending external effect checkpoint',
    pendingExternalEffects: [
      {
        effectId: 'effect_gateway_send',
        effectType: 'gateway_outbound',
        summary: 'outbound message may have been sent',
        confirmed: false,
      },
    ],
  })
  const pending = await durable.decideRecovery({ runId: 'run_recovery_pending' })
  assert(pending.decision === 'requires_human', `expected requires_human for pending effects, got ${pending.decision}`)

  const driftEvent = await durable.appendEvent({
    eventType: 'run_running',
    workspaceId: 'default',
    runId: 'run_recovery_corrupt',
    payload: { status: 'running' },
  })
  await appendLedger(ledger, 'run_recovery_corrupt', 'completed')
  await durable.writeRunSnapshot({
    workspaceId: 'default',
    runId: 'run_recovery_corrupt',
    status: 'running',
    activePhase: 'model',
    lastEventSeq: driftEvent.seq,
  })
  const corrupted = await durable.decideRecovery({ runId: 'run_recovery_corrupt' })
  assert(corrupted.decision === 'mark_corrupted', `expected mark_corrupted, got ${corrupted.decision}`)
}

async function smokeAuditAndReplay(core, workspaceRoot) {
  const durable = new core.DurableRuntime({ workspaceRoot, workspaceId: 'default' })
  const ledger = core.RunLedger.fromRuntimePaths(durable.paths)
  await durable.appendEvent({
    eventType: 'run_start',
    workspaceId: 'default',
    runId: 'run_audit_duplicate_terminal',
    payload: { status: 'running' },
  })
  await durable.appendEvent({
    eventType: 'run_complete',
    workspaceId: 'default',
    runId: 'run_audit_duplicate_terminal',
    payload: { status: 'completed' },
  })
  await durable.appendEvent({
    eventType: 'run_failed',
    workspaceId: 'default',
    runId: 'run_audit_duplicate_terminal',
    payload: { status: 'failed' },
  })
  await appendLedger(ledger, 'run_audit_duplicate_terminal', 'failed')
  const audit = await durable.auditRun('run_audit_duplicate_terminal')
  assert(audit.errors.some(error => error.includes('terminal')), 'audit should detect duplicate terminal event')

  await durable.appendEvent(core.createEventEnvelope({
    eventType: 'run_start',
    workspaceId: 'default',
    runId: 'run_audit_missing_checkpoint_seq',
    seq: 10,
    payload: { status: 'running' },
  }), { importMode: true })
  await durable.createCheckpoint({
    workspaceId: 'default',
    runId: 'run_audit_missing_checkpoint_seq',
    status: 'partial_replay',
    summary: 'missing seq checkpoint',
    lastEventSeq: 9,
  })
  const missingSeqAudit = await durable.auditRun('run_audit_missing_checkpoint_seq')
  assert(missingSeqAudit.errors.some(error => error.includes('checkpoint')), 'audit should detect missing checkpoint event seq')

  const replayEvents = await durable.readRunEvents('run_audit_duplicate_terminal')
  const timeline = new core.EventReplay().buildTimeline(replayEvents)
  const report = new core.ReplayReport().toMarkdown({
    runId: 'run_audit_duplicate_terminal',
    status: 'failed',
    timeline,
    checkpoints: await durable.readCheckpoints({ runId: 'run_audit_duplicate_terminal' }),
    recoveryDecision: await durable.decideRecovery({ runId: 'run_audit_duplicate_terminal' }),
    audit,
  })
  assert(report.includes('## Recovery'), 'replay report should include recovery decision')
  assert(report.includes('## Audit'), 'replay report should include audit result')
}

async function appendLedger(ledger, runId, status) {
  const now = Date.now()
  await ledger.append({
    runId,
    workspaceId: 'default',
    commandId: `cmd_${runId}`,
    commandType: 'agent.run',
    source: 'test',
    status,
    createdAtMs: now,
    updatedAtMs: now,
  })
}

function isStrictAscending(values) {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] <= values[index - 1]) return false
  }
  return true
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
