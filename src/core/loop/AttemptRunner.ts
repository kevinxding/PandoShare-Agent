import { createCommandEnvelope } from '../protocol/index.js'
import type { AgentKernel } from '../agent/index.js'
import type { Attempt, Task } from './LoopTypes.js'

export class AttemptRunner {
  constructor(private readonly agentKernel: Pick<AgentKernel, 'submitRun' | 'recordCoreEvent'>) {}

  async run(input: {
    workspaceId: string
    goalId: string
    task: Task
  }): Promise<Attempt> {
    const attempt: Attempt = {
      attemptId: `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      taskId: input.task.taskId,
      status: 'running',
      startedAtMs: Date.now(),
    }
    const command = createCommandEnvelope({
      commandType: 'agent.run',
      workspaceId: input.workspaceId,
      goalId: input.goalId,
      source: 'daemon',
      payload: {
        prompt: [
          `Goal task: ${input.task.title}`,
          '',
          `Execution mode: ${input.task.executionMode}`,
          'Complete the task and report the result.',
        ].join('\n'),
      },
    })
    await this.agentKernel.recordCoreEvent({
      eventType: 'loop_attempt',
      workspaceId: input.workspaceId,
      goalId: input.goalId,
      taskId: input.task.taskId,
      payload: {
        phase: 'started',
        attemptId: attempt.attemptId,
      },
    })
    try {
      const result = await this.agentKernel.submitRun(command)
      await this.agentKernel.recordCoreEvent({
        eventType: 'loop_attempt',
        workspaceId: input.workspaceId,
        goalId: input.goalId,
        runId: result.runId,
        taskId: input.task.taskId,
        payload: {
          phase: 'completed',
          attemptId: attempt.attemptId,
          checkpointId: result.checkpointId,
        },
      })
      return {
        ...attempt,
        runId: result.runId,
        status: 'completed',
        completedAtMs: Date.now(),
        checkpointId: result.checkpointId,
        summary: result.finalText.slice(0, 500),
      }
    } catch (error) {
      await this.agentKernel.recordCoreEvent({
        eventType: 'loop_attempt',
        workspaceId: input.workspaceId,
        goalId: input.goalId,
        taskId: input.task.taskId,
        payload: {
          phase: 'failed',
          attemptId: attempt.attemptId,
          message: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  }
}
