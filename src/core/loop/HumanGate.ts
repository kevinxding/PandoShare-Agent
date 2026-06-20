import { createCommandEnvelope, type CommandEnvelope } from '../protocol/index.js'
import type { DurableRuntime } from '../durable/index.js'
import { LOOP_EVENT_TYPES } from './LoopEventTypes.js'
import { createGateId } from './LoopIdentity.js'
import type { HumanGateRequest, Task } from './LoopTypes.js'

export class HumanGate {
  constructor(private readonly durable?: DurableRuntime) {}

  async createRequest(input: {
    workspaceId: string
    loopId: string
    goalId: string
    task: Task
    reason: string
    risk?: string
  }): Promise<HumanGateRequest> {
    const createdAtMs = Date.now()
    const gateId = createGateId(createdAtMs)
    const command: CommandEnvelope = createCommandEnvelope({
      commandType: 'approval.request',
      workspaceId: input.workspaceId,
      goalId: input.goalId,
      loopId: input.loopId,
      source: 'daemon',
      payload: {
        kind: 'loop',
        gateId,
        reason: input.reason,
        risk: input.risk,
        targetId: input.task.taskId,
        requestedAction: input.task.title,
      },
    })
    const request: HumanGateRequest = {
      gateId,
      goalId: input.goalId,
      taskId: input.task.taskId,
      reason: input.reason,
      risk: input.risk,
      requestedAction: input.task.title,
      command,
      createdAtMs,
    }
    await this.durable?.appendEvent({
      eventType: LOOP_EVENT_TYPES.humanGateRequested,
      workspaceId: input.workspaceId,
      loopId: input.loopId,
      goalId: input.goalId,
      taskId: input.task.taskId,
      createdAtMs,
      payload: request,
    })
    return request
  }

  async resolveRequest(input: {
    workspaceId: string
    loopId: string
    goalId: string
    taskId?: string
    gateId: string
    approved: boolean
    resolvedBy?: string
    reason?: string
  }): Promise<void> {
    await this.durable?.appendEvent({
      eventType: LOOP_EVENT_TYPES.humanGateResolved,
      workspaceId: input.workspaceId,
      loopId: input.loopId,
      goalId: input.goalId,
      taskId: input.taskId,
      payload: {
        gateId: input.gateId,
        approved: input.approved,
        resolvedBy: input.resolvedBy,
        reason: input.reason,
        resolvedAtMs: Date.now(),
      },
    })
  }
}
