import type { RunStatus } from '../agent/index.js'

export type RunSnapshotActivePhase =
  | 'starting'
  | 'model'
  | 'tool'
  | 'approval'
  | 'checkpoint'
  | 'completed'
  | 'failed'
  | 'interrupted'

export type RunSnapshot = {
  snapshotId: string
  workspaceId: string
  runId: string
  threadId?: string
  status: RunStatus
  lastEventSeq: number
  activePhase: RunSnapshotActivePhase
  activeToolCallId?: string
  activeApprovalId?: string
  activeModelRequestId?: string
  loopTaskId?: string
  guiActionId?: string
  gatewayDeliveryId?: string
  retryCount: number
  createdAtMs: number
}

export type WriteRunSnapshotInput = Omit<RunSnapshot, 'snapshotId' | 'createdAtMs' | 'retryCount'> & {
  snapshotId?: string
  createdAtMs?: number
  retryCount?: number
}
