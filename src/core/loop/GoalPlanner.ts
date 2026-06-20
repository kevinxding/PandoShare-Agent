import { createGoalId, createPlanId, createTaskId } from './LoopIdentity.js'
import type { Goal, Plan, Task } from './LoopTypes.js'

export class GoalPlanner {
  createGoal(input: {
    goalId?: string
    objective: string
    successCriteria?: readonly string[]
    constraints?: readonly string[]
  }): Goal {
    const objective = input.objective.trim()
    if (!objective) throw new Error('Goal objective must not be empty')
    const createdAtMs = Date.now()
    return {
      goalId: input.goalId ?? createGoalId(createdAtMs),
      objective,
      successCriteria: input.successCriteria ?? [],
      constraints: input.constraints ?? [],
      status: 'created',
      createdAtMs,
    }
  }

  createPlan(goal: Goal): Plan {
    const createdAtMs = Date.now()
    const task: Task = {
      taskId: createTaskId(createdAtMs),
      goalId: goal.goalId,
      title: firstLine(goal.objective),
      status: 'queued',
      executionMode: 'code',
      verifier: {
        type: 'custom',
        name: 'manual_review',
      },
      requiresApproval: false,
    }
    return {
      planId: createPlanId(createdAtMs),
      goalId: goal.goalId,
      tasks: [task],
      createdAtMs,
    }
  }
}

function firstLine(value: string): string {
  return value.split(/\r?\n/)[0]?.trim().slice(0, 100) || 'Loop task'
}
