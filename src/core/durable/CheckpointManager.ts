import { JsonlStore } from '../store/index.js'

export type KernelCheckpoint = {
  checkpointId: string
  workspaceId: string
  threadId?: string
  runId?: string
  goalId?: string
  loopId?: string
  createdAtMs: number
  status: 'safe_to_replay' | 'unsafe_to_replay'
  reason?: string
  payload?: unknown
}

export class CheckpointManager {
  constructor(private readonly store: JsonlStore<KernelCheckpoint>) {}

  async createCheckpoint(input: Omit<KernelCheckpoint, 'checkpointId' | 'createdAtMs' | 'status'> & {
    checkpointId?: string
    createdAtMs?: number
    status?: KernelCheckpoint['status']
  }): Promise<KernelCheckpoint> {
    const checkpoint: KernelCheckpoint = {
      checkpointId: input.checkpointId ?? `checkpoint_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      runId: input.runId,
      goalId: input.goalId,
      loopId: input.loopId,
      createdAtMs: input.createdAtMs ?? Date.now(),
      status: input.status ?? 'safe_to_replay',
      reason: input.reason,
      payload: input.payload,
    }
    await this.store.append(checkpoint)
    return checkpoint
  }

  async readLatestCheckpoint(input: { threadId?: string; runId?: string; goalId?: string; loopId?: string } = {}): Promise<KernelCheckpoint | undefined> {
    const records = await this.store.readRecords()
    return records
      .filter(record => input.threadId === undefined || record.threadId === input.threadId)
      .filter(record => input.runId === undefined || record.runId === input.runId)
      .filter(record => input.goalId === undefined || record.goalId === input.goalId)
      .filter(record => input.loopId === undefined || record.loopId === input.loopId)
      .sort((left, right) => right.createdAtMs - left.createdAtMs)[0]
  }

  async markUnsafeToReplay(checkpointId: string, reason: string): Promise<KernelCheckpoint> {
    const existing = (await this.store.readRecords()).find(record => record.checkpointId === checkpointId)
    if (!existing) throw new Error(`Missing checkpoint: ${checkpointId}`)
    const checkpoint = {
      ...existing,
      checkpointId: `${checkpointId}_unsafe_${Date.now()}`,
      createdAtMs: Date.now(),
      status: 'unsafe_to_replay' as const,
      reason,
    }
    await this.store.append(checkpoint)
    return checkpoint
  }
}
