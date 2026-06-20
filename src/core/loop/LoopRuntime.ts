import { DurableRuntime } from '../durable/index.js'
import { AgentKernel } from '../agent/index.js'
import { AttemptRunner } from './AttemptRunner.js'
import { GoalPlanner } from './GoalPlanner.js'
import { HumanGate } from './HumanGate.js'
import { LoopVerifier } from './LoopVerifier.js'
import { TaskQueue } from './TaskQueue.js'
import type { Goal, LoopRuntimeResult, Task } from './LoopTypes.js'

export type CoreLoopRuntimeOptions = {
  workspaceRoot: string
  workspaceId?: string
  agentKernel: AgentKernel
  maxAttempts?: number
}

export class LoopRuntime {
  private readonly workspaceId: string
  private readonly durable: DurableRuntime
  private readonly planner = new GoalPlanner()
  private readonly queue = new TaskQueue()
  private readonly verifier = new LoopVerifier()
  private readonly humanGate = new HumanGate()
  private readonly attempts: AttemptRunner

  constructor(private readonly options: CoreLoopRuntimeOptions) {
    this.workspaceId = options.workspaceId ?? 'default'
    this.durable = new DurableRuntime({ workspaceRoot: options.workspaceRoot, workspaceId: this.workspaceId })
    this.attempts = new AttemptRunner(options.agentKernel)
  }

  async runGoal(input: {
    objective: string
    successCriteria?: readonly string[]
    constraints?: readonly string[]
    task?: Partial<Task>
  }): Promise<LoopRuntimeResult> {
    let goal: Goal = this.planner.createGoal(input)
    const plan = this.planner.createPlan(goal)
    const plannedTask = {
      ...plan.tasks[0]!,
      ...input.task,
    }
    this.queue.enqueue(plannedTask)
    goal = { ...goal, status: 'running' }
    const task = this.queue.next()
    if (!task) throw new Error('LoopRuntime has no task to run')
    if (task.requiresApproval) {
      this.humanGate.createRequest({
        workspaceId: this.workspaceId,
        goalId: goal.goalId,
        task,
        reason: 'Task requires approval.',
      })
    }
    await this.durable.appendEvent({
      eventType: 'loop_iteration',
      workspaceId: this.workspaceId,
      goalId: goal.goalId,
      taskId: task.taskId,
      payload: {
        phase: 'started',
        task,
      },
    })
    const attempt = await this.attempts.run({
      workspaceId: this.workspaceId,
      goalId: goal.goalId,
      task,
    })
    const verification = await this.verifier.verify(task.verifier)
    const checkpoint = await this.durable.createCheckpoint({
      workspaceId: this.workspaceId,
      goalId: goal.goalId,
      payload: {
        taskId: task.taskId,
        attemptId: attempt.attemptId,
        verification,
      },
    })
    await this.durable.appendEvent({
      eventType: 'loop_iteration',
      workspaceId: this.workspaceId,
      goalId: goal.goalId,
      taskId: task.taskId,
      payload: {
        phase: 'completed',
        attemptId: attempt.attemptId,
        checkpointId: checkpoint.checkpointId,
        verification,
      },
    })
    return {
      goal: {
        ...goal,
        status: verification.ok ? 'completed' : 'blocked',
      },
      plan,
      task: {
        ...task,
        status: verification.ok ? 'completed' : 'blocked',
      },
      attempt: {
        ...attempt,
        checkpointId: checkpoint.checkpointId,
      },
      verification,
    }
  }
}
