import { createCommandEnvelope, type CommandEnvelope } from '../protocol/index.js'
import type { HumanGateRequest, Task } from './LoopTypes.js'

export class HumanGate {
  createRequest(input: {
    workspaceId: string
    goalId: string
    task: Task
    reason: string
  }): HumanGateRequest {
    const command: CommandEnvelope = createCommandEnvelope({
      commandType: 'approval.request',
      workspaceId: input.workspaceId,
      goalId: input.goalId,
      source: 'daemon',
      payload: {
        kind: 'loop',
        reason: input.reason,
        targetId: input.task.taskId,
        requestedAction: input.task.title,
      },
    })
    return {
      gateId: `gate_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      goalId: input.goalId,
      taskId: input.task.taskId,
      reason: input.reason,
      command,
      createdAtMs: Date.now(),
    }
  }
}
