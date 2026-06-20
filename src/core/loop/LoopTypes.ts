import type { CommandEnvelope } from '../protocol/index.js'

export type GoalStatus = 'created' | 'planned' | 'running' | 'completed' | 'failed' | 'blocked'

export type TaskStatus = 'created' | 'queued' | 'running' | 'completed' | 'failed' | 'blocked'

export type AttemptStatus = 'created' | 'running' | 'completed' | 'failed'

export type TaskExecutionMode = 'code' | 'gui' | 'gateway' | 'mixed' | 'research'

export type LoopVerifierSpec =
  | {
      type: 'command'
      command: string
      cwd?: string
    }
  | {
      type: 'file'
      path: string
      exists?: boolean
      contains?: string
    }
  | {
      type: 'custom'
      name: string
    }

export type Goal = {
  goalId: string
  objective: string
  successCriteria: readonly string[]
  constraints: readonly string[]
  status: GoalStatus
  createdAtMs: number
}

export type Plan = {
  planId: string
  goalId: string
  tasks: readonly Task[]
  createdAtMs: number
}

export type Task = {
  taskId: string
  goalId: string
  title: string
  status: TaskStatus
  executionMode: TaskExecutionMode
  verifier: LoopVerifierSpec
  requiresApproval: boolean
}

export type Attempt = {
  attemptId: string
  taskId: string
  runId?: string
  status: AttemptStatus
  startedAtMs: number
  completedAtMs?: number
  checkpointId?: string
  summary?: string
}

export type VerificationResult = {
  ok: boolean
  verifierType: LoopVerifierSpec['type']
  message: string
}

export type HumanGateRequest = {
  gateId: string
  goalId: string
  taskId: string
  reason: string
  command: CommandEnvelope
  createdAtMs: number
}

export type LoopRuntimeResult = {
  goal: Goal
  plan: Plan
  task: Task
  attempt: Attempt
  verification: VerificationResult
}
