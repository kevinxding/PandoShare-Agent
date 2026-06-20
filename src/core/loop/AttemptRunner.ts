import { createCommandEnvelope } from '../protocol/index.js'
import type { AgentKernel } from '../agent/index.js'
import { LOOP_EVENT_TYPES } from './LoopEventTypes.js'
import { createAttemptId } from './LoopIdentity.js'
import type { Attempt, Task } from './LoopTypes.js'

export class AttemptRunner {
  constructor(private readonly agentKernel: Pick<AgentKernel, 'submitRun' | 'recordCoreEvent'>) {}

  async run(input: {
    workspaceId: string
    loopId: string
    goalId: string
    task: Task
    attemptId?: string
  }): Promise<Attempt> {
    const startedAtMs = Date.now()
    const attempt: Attempt = {
      attemptId: input.attemptId ?? createAttemptId(startedAtMs),
      taskId: input.task.taskId,
      status: 'running',
      startedAtMs,
    }
    const command = createCommandEnvelope({
      commandType: 'agent.run',
      workspaceId: input.workspaceId,
      goalId: input.goalId,
      loopId: input.loopId,
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
      eventType: LOOP_EVENT_TYPES.attemptStarted,
      workspaceId: input.workspaceId,
      loopId: input.loopId,
      goalId: input.goalId,
      taskId: input.task.taskId,
      payload: {
        attemptId: attempt.attemptId,
        taskId: input.task.taskId,
        title: input.task.title,
        startedAtMs,
      },
    })
    try {
      const result = await this.agentKernel.submitRun(command)
      await this.agentKernel.recordCoreEvent({
        eventType: LOOP_EVENT_TYPES.attemptCompleted,
        workspaceId: input.workspaceId,
        loopId: input.loopId,
        goalId: input.goalId,
        runId: result.runId,
        taskId: input.task.taskId,
        payload: {
          attemptId: attempt.attemptId,
          taskId: input.task.taskId,
          runId: result.runId,
          checkpointId: result.checkpointId,
          summary: result.finalText.slice(0, 500),
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
        eventType: LOOP_EVENT_TYPES.attemptFailed,
        workspaceId: input.workspaceId,
        loopId: input.loopId,
        goalId: input.goalId,
        taskId: input.task.taskId,
        payload: {
          attemptId: attempt.attemptId,
          taskId: input.task.taskId,
          message: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  }
}
