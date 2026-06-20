export type RuntimeKernelName =
  | 'agent'
  | 'durable'
  | 'loop'
  | 'gui'
  | 'gateway'
  | 'model'
  | 'replay'

export type RuntimeIdentity = {
  workspaceId: string
  workspaceRoot: string
  sessionId: string
  runId?: string
  threadId?: string
  goalId?: string
  loopId?: string
}

export type RuntimeResult<TValue = unknown> = {
  ok: boolean
  value?: TValue
  message?: string
}
