import { createProtocolId } from '../protocol/index.js'
import { JsonlStore } from '../store/index.js'
import { redactDurablePayload } from './DurableRedaction.js'
import {
  validateCheckpoint,
  type CreateCheckpointInput,
  type KernelCheckpoint,
} from './CheckpointTypes.js'

export class CheckpointStore {
  constructor(private readonly store: JsonlStore<KernelCheckpoint>) {}

  async createCheckpoint(input: CreateCheckpointInput, latestEventSeq: number): Promise<KernelCheckpoint> {
    const checkpoint: KernelCheckpoint = {
      checkpointId: input.checkpointId ?? createProtocolId('checkpoint'),
      workspaceId: input.workspaceId,
      runId: input.runId,
      threadId: input.threadId,
      goalId: input.goalId,
      loopId: input.loopId,
      commandId: input.commandId,
      status: input.status ?? 'safe_to_replay',
      reason: input.reason,
      lastEventSeq: input.lastEventSeq ?? latestEventSeq,
      createdAtMs: input.createdAtMs ?? Date.now(),
      summary: input.summary ?? 'checkpoint',
      snapshotRef: input.snapshotRef,
      unsafeToReplayToolCallIds: [...(input.unsafeToReplayToolCallIds ?? [])],
      pendingExternalEffects: [...(input.pendingExternalEffects ?? [])],
      payload: redactDurablePayload(input.payload),
    }
    validateCheckpoint(checkpoint, latestEventSeq)
    await this.store.append(checkpoint)
    return checkpoint
  }

  async readLatestCheckpoint(input: { threadId?: string; runId?: string; goalId?: string; loopId?: string } = {}): Promise<KernelCheckpoint | undefined> {
    return (await this.readCheckpoints(input)).sort((left, right) => {
      if (right.lastEventSeq !== left.lastEventSeq) return right.lastEventSeq - left.lastEventSeq
      return right.createdAtMs - left.createdAtMs
    })[0]
  }

  async readCheckpoints(input: { threadId?: string; runId?: string; goalId?: string; loopId?: string } = {}): Promise<KernelCheckpoint[]> {
    return (await this.store.readRecords())
      .filter(record => input.threadId === undefined || record.threadId === input.threadId)
      .filter(record => input.runId === undefined || record.runId === input.runId)
      .filter(record => input.goalId === undefined || record.goalId === input.goalId)
      .filter(record => input.loopId === undefined || record.loopId === input.loopId)
  }

  async markUnsafeToReplay(checkpointId: string, reason: string, latestEventSeq: number): Promise<KernelCheckpoint> {
    const existing = (await this.store.readRecords()).find(record => record.checkpointId === checkpointId)
    if (!existing) throw new Error(`Missing checkpoint: ${checkpointId}`)
    return this.createCheckpoint({
      ...existing,
      checkpointId: `${checkpointId}_unsafe_${Date.now()}`,
      status: 'unsafe_to_replay',
      reason,
    }, latestEventSeq)
  }
}
