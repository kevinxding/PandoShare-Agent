import type { RunLedgerEntry } from '../agent/index.js'
import type { EventEnvelope } from '../protocol/index.js'
import { JsonlStore, RuntimePaths } from '../store/index.js'
import { CheckpointManager } from './CheckpointManager.js'
import type { CreateCheckpointInput, KernelCheckpoint } from './CheckpointTypes.js'
import { ConsistencyAudit, type ConsistencyAuditResult } from './ConsistencyAudit.js'
import { EventIndex } from './EventIndex.js'
import { EventStore, type DurableEventInput } from './EventStore.js'
import { HeartbeatManager, type KernelHeartbeat, type WriteHeartbeatInput } from './HeartbeatManager.js'
import { RecoveryPlanner } from './RecoveryPlanner.js'
import type { RecoveryDecision } from './RecoveryDecision.js'
import { RunSnapshotStore } from './RunSnapshotStore.js'
import type { RunSnapshot, WriteRunSnapshotInput } from './RunSnapshotTypes.js'
import { RuntimeStateStore } from './RuntimeStateStore.js'

export class DurableRuntime {
  readonly paths: RuntimePaths
  readonly eventStore: EventStore
  readonly eventIndex: EventIndex
  readonly checkpointManager: CheckpointManager
  readonly heartbeatManager: HeartbeatManager
  readonly runSnapshotStore: RunSnapshotStore
  readonly stateStore: RuntimeStateStore
  private readonly runLedgerStore: JsonlStore<RunLedgerEntry>
  private readonly recoveryPlanner = new RecoveryPlanner()
  private readonly consistencyAudit = new ConsistencyAudit()

  constructor(input: { workspaceRoot: string; workspaceId?: string }) {
    this.paths = new RuntimePaths(input)
    this.eventStore = new EventStore(this.paths)
    this.eventIndex = new EventIndex(this.eventStore)
    this.checkpointManager = new CheckpointManager(new JsonlStore(this.paths.checkpointsPath()))
    this.heartbeatManager = new HeartbeatManager(new JsonlStore(this.paths.heartbeatsPath()))
    this.runSnapshotStore = new RunSnapshotStore(new JsonlStore(this.paths.runSnapshotsPath()))
    this.runLedgerStore = new JsonlStore<RunLedgerEntry>(this.paths.queuePath('agent-run-ledger'))
    this.stateStore = new RuntimeStateStore(this.paths)
  }

  appendEvent(input: DurableEventInput | EventEnvelope, options?: { importMode?: boolean }): Promise<EventEnvelope> {
    return this.eventStore.append(input, options)
  }

  appendEvents(inputs: readonly (DurableEventInput | EventEnvelope)[], options?: { importMode?: boolean }): Promise<EventEnvelope[]> {
    return this.eventStore.appendMany(inputs, options)
  }

  async createCheckpoint(input: CreateCheckpointInput): Promise<KernelCheckpoint> {
    const latestSeq = await this.eventStore.latestSeq()
    const checkpoint = await this.checkpointManager.createCheckpoint(input, latestSeq)
    await this.appendEvent({
      eventType: 'checkpoint',
      workspaceId: checkpoint.workspaceId,
      threadId: checkpoint.threadId,
      runId: checkpoint.runId,
      goalId: checkpoint.goalId,
      loopId: checkpoint.loopId,
      payload: checkpoint,
    })
    return checkpoint
  }

  async writeRunSnapshot(input: WriteRunSnapshotInput): Promise<RunSnapshot> {
    if (input.lastEventSeq > 0 && !(await this.eventStore.hasSeq(input.lastEventSeq))) {
      throw new Error(`RunSnapshot references missing event seq ${input.lastEventSeq}`)
    }
    return this.runSnapshotStore.writeSnapshot(input)
  }

  async writeHeartbeat(input: WriteHeartbeatInput): Promise<KernelHeartbeat> {
    const lastSeq = input.lastSeq ?? await this.eventStore.latestSeq()
    const heartbeat = await this.heartbeatManager.writeHeartbeat({
      ...input,
      lastSeq,
    })
    await this.appendEvent({
      eventType: 'heartbeat',
      workspaceId: heartbeat.workspaceId,
      runId: heartbeat.runId,
      loopId: heartbeat.loopId,
      payload: heartbeat,
    })
    return heartbeat
  }

  readRunEvents(runId: string): Promise<EventEnvelope[]> {
    return this.eventIndex.readRunEvents(runId)
  }

  readThreadEvents(threadId: string): Promise<EventEnvelope[]> {
    return this.eventIndex.readThreadEvents(threadId)
  }

  readLatestCheckpoint(runId: string): Promise<KernelCheckpoint | undefined> {
    return this.checkpointManager.readLatestCheckpoint({ runId })
  }

  readRunSnapshots(runId: string): Promise<RunSnapshot[]> {
    return this.runSnapshotStore.readSnapshots(runId)
  }

  readHeartbeat(workerId: string): Promise<KernelHeartbeat | undefined> {
    return this.heartbeatManager.readHeartbeat(workerId)
  }

  async decideRecovery(input: {
    runId: string
    nowMs?: number
    heartbeatTtlMs?: number
    workerId?: string
  }): Promise<RecoveryDecision> {
    const runId = input.runId
    const latestRun = await this.readLatestRunLedger(runId)
    const latestSnapshot = await this.runSnapshotStore.readLatestSnapshot(runId)
    const latestCheckpoint = await this.checkpointManager.readLatestCheckpoint({ runId })
    const events = await this.readRunEvents(runId)
    const latestHeartbeat = input.workerId
      ? await this.heartbeatManager.readHeartbeat(input.workerId)
      : await this.heartbeatManager.readRunHeartbeat(runId)
    const nowMs = input.nowMs ?? Date.now()
    const heartbeatAgeMs = latestHeartbeat ? nowMs - latestHeartbeat.lastHeartbeatAtMs : undefined
    const heartbeatTtlMs = input.heartbeatTtlMs ?? 30_000
    return this.recoveryPlanner.decide({
      runId,
      latestRun,
      latestSnapshot,
      latestCheckpoint,
      events,
      latestHeartbeat,
      heartbeatAgeMs,
      heartbeatTtlMs,
      corruptionErrors: await this.detectCorruption(runId),
    })
  }

  async auditRun(runId: string): Promise<ConsistencyAuditResult> {
    const events = await this.readRunEvents(runId)
    const checkpoints = await this.checkpointManager.readCheckpoints({ runId })
    const snapshots = await this.runSnapshotStore.readSnapshots(runId)
    const latestRun = await this.readLatestRunLedger(runId)
    const recoveryDecision = await this.decideRecovery({ runId })
    const result = this.consistencyAudit.run({
      runId,
      events,
      checkpoints,
      snapshots,
      latestRun,
      recoveryDecision,
    })
    if (result.errors.length) {
      await this.appendCorruptionDetected(runId, result.errors)
    }
    return result
  }

  async readEvents(input: { threadId?: string; runId?: string; loopId?: string } = {}): Promise<EventEnvelope[]> {
    return this.eventStore.readEvents(input)
  }

  async readCheckpoints(input: { runId?: string; threadId?: string } = {}): Promise<KernelCheckpoint[]> {
    return this.checkpointManager.readCheckpoints(input)
  }

  private async readLatestRunLedger(runId: string): Promise<RunLedgerEntry | undefined> {
    return (await this.runLedgerStore.readRecords())
      .filter(entry => entry.runId === runId)
      .sort((left, right) => right.updatedAtMs - left.updatedAtMs)[0]
  }

  private async detectCorruption(runId: string): Promise<string[]> {
    const events = await this.readRunEvents(runId)
    const eventSeqs = new Set(events.map(event => event.seq))
    const checkpoints = await this.checkpointManager.readCheckpoints({ runId })
    const snapshots = await this.runSnapshotStore.readSnapshots(runId)
    const latestRun = await this.readLatestRunLedger(runId)
    const latestSnapshot = snapshots.sort((left, right) => right.lastEventSeq - left.lastEventSeq)[0]
    const errors: string[] = []
    for (const checkpoint of checkpoints) {
      if (checkpoint.lastEventSeq > 0 && !eventSeqs.has(checkpoint.lastEventSeq)) {
        errors.push(`checkpoint ${checkpoint.checkpointId} references missing event seq ${checkpoint.lastEventSeq}`)
      }
    }
    for (const snapshot of snapshots) {
      if (snapshot.lastEventSeq > 0 && !eventSeqs.has(snapshot.lastEventSeq)) {
        errors.push(`snapshot ${snapshot.snapshotId} references missing event seq ${snapshot.lastEventSeq}`)
      }
    }
    if (latestRun && latestSnapshot && latestRun.status !== latestSnapshot.status) {
      errors.push(`run ledger status ${latestRun.status} drifts from snapshot status ${latestSnapshot.status}`)
    }
    return errors
  }

  private async appendCorruptionDetected(runId: string, errors: readonly string[]): Promise<void> {
    const digest = errors.join('|').slice(0, 1000)
    const existing = (await this.readRunEvents(runId)).some(event =>
      event.eventType === 'run_corruption_detected' &&
      typeof event.payload === 'object' &&
      event.payload !== null &&
      'digest' in event.payload &&
      event.payload.digest === digest,
    )
    if (existing) return
    await this.appendEvent({
      eventType: 'run_corruption_detected',
      workspaceId: this.paths.workspaceId,
      runId,
      payload: {
        digest,
        errors,
      },
    })
  }
}
