import type { EventEnvelope } from '../protocol/index.js'
import { createEventEnvelope } from '../protocol/index.js'
import { JsonlStore, RuntimePaths } from '../store/index.js'
import { CheckpointManager, type KernelCheckpoint } from './CheckpointManager.js'
import { HeartbeatManager, type KernelHeartbeat } from './HeartbeatManager.js'
import { RuntimeStateStore } from './RuntimeStateStore.js'

export class DurableRuntime {
  readonly paths: RuntimePaths
  readonly eventStore: JsonlStore<EventEnvelope>
  readonly checkpointManager: CheckpointManager
  readonly heartbeatManager: HeartbeatManager
  readonly stateStore: RuntimeStateStore

  constructor(input: { workspaceRoot: string; workspaceId?: string }) {
    this.paths = new RuntimePaths(input)
    this.eventStore = new JsonlStore<EventEnvelope>(this.paths.eventsPath())
    this.checkpointManager = new CheckpointManager(new JsonlStore(this.paths.checkpointsPath()))
    this.heartbeatManager = new HeartbeatManager(new JsonlStore(this.paths.heartbeatsPath()))
    this.stateStore = new RuntimeStateStore(this.paths)
  }

  appendEvent(event: EventEnvelope): Promise<void> {
    return this.eventStore.append(event)
  }

  async createCheckpoint(input: Parameters<CheckpointManager['createCheckpoint']>[0]): Promise<KernelCheckpoint> {
    const checkpoint = await this.checkpointManager.createCheckpoint(input)
    await this.appendEvent(createEventEnvelope({
      eventType: 'checkpoint',
      workspaceId: checkpoint.workspaceId,
      threadId: checkpoint.threadId,
      runId: checkpoint.runId,
      goalId: checkpoint.goalId,
      loopId: checkpoint.loopId,
      payload: checkpoint,
    }))
    return checkpoint
  }

  async writeHeartbeat(input: Parameters<HeartbeatManager['writeHeartbeat']>[0]): Promise<KernelHeartbeat> {
    const heartbeat = await this.heartbeatManager.writeHeartbeat(input)
    await this.appendEvent(createEventEnvelope({
      eventType: 'heartbeat',
      workspaceId: heartbeat.workspaceId,
      payload: heartbeat,
    }))
    return heartbeat
  }

  async readEvents(input: { threadId?: string; runId?: string; loopId?: string } = {}): Promise<EventEnvelope[]> {
    return (await this.eventStore.readRecords())
      .filter(event => input.threadId === undefined || event.threadId === input.threadId)
      .filter(event => input.runId === undefined || event.runId === input.runId)
      .filter(event => input.loopId === undefined || event.loopId === input.loopId)
  }
}
