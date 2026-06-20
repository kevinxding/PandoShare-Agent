import type { EventEnvelope } from '../protocol/index.js'
import type { ReplayTimelineItem } from './EventReplay.js'

export type ReplayScope =
  | 'run'
  | 'thread'
  | 'loop'
  | 'goal'
  | 'gui_action'
  | 'gateway_inbound'
  | 'gateway_delivery'
  | 'model_route'
  | 'checkpoint'
  | 'time_range'
  | 'workspace'

export type ReplayPayloadMode = 'none' | 'summary' | 'safe'
export type ReplayFormat = 'markdown' | 'json' | 'bundle'
export type ReplayRedactionMode = 'strict' | 'normal' | 'debug_safe'

export type ReplayQuery = {
  workspaceId: string
  scope: ReplayScope
  id?: string
  runId?: string
  threadId?: string
  loopId?: string
  goalId?: string
  taskId?: string
  attemptId?: string
  guiActionId?: string
  gatewayId?: string
  inboundId?: string
  deliveryId?: string
  routeId?: string
  checkpointId?: string
  fromSeq?: number
  toSeq?: number
  fromTimeMs?: number
  toTimeMs?: number
  includePayload?: ReplayPayloadMode
  includeArtifacts?: boolean
  includeLegacy?: boolean
  includeIncidents?: boolean
  followRelated?: boolean
  followDepth?: number
  format?: ReplayFormat
  redaction?: ReplayRedactionMode
  includeAll?: boolean
  caller?: 'cli' | 'server' | 'gateway' | 'test' | 'maintenance'
}

export type ReplayQueryErrorCode =
  | 'missing_scope'
  | 'missing_id'
  | 'invalid_scope'
  | 'invalid_range'
  | 'unbounded_workspace'
  | 'invalid_id'

export class ReplayQueryError extends Error {
  readonly code: ReplayQueryErrorCode
  readonly query: Partial<ReplayQuery>

  constructor(code: ReplayQueryErrorCode, message: string, query: Partial<ReplayQuery> = {}) {
    super(message)
    this.name = 'ReplayQueryError'
    this.code = code
    this.query = query
  }
}

export type ReplayNodeType =
  | 'event'
  | 'command'
  | 'run'
  | 'thread'
  | 'loop'
  | 'goal'
  | 'task'
  | 'attempt'
  | 'tool_call'
  | 'gui_action'
  | 'gateway_inbound'
  | 'gateway_outbound'
  | 'model_route'
  | 'checkpoint'
  | 'approval'
  | 'recovery'
  | 'artifact'
  | 'legacy'

export type ReplayEdgeType =
  | 'parent_event'
  | 'same_run'
  | 'same_thread'
  | 'command_to_run'
  | 'gateway_to_command'
  | 'loop_to_attempt'
  | 'attempt_to_run'
  | 'run_to_model'
  | 'run_to_tool'
  | 'tool_to_gui'
  | 'gui_to_checkpoint'
  | 'model_to_usage'
  | 'checkpoint_to_recovery'
  | 'approval_to_resolution'
  | 'fallback_to_model'
  | 'legacy_bridge'

export type ReplayNode = {
  nodeId: string
  type: ReplayNodeType
  label: string
  eventId?: string
  seq?: number
  importantId?: string
  legacy?: boolean
  payloadSummary?: unknown
}

export type ReplayEdge = {
  edgeId: string
  from: string
  to: string
  type: ReplayEdgeType
  synthetic: boolean
  reason?: string
}

export type ReplayGraph = {
  nodes: ReplayNode[]
  edges: ReplayEdge[]
  roots: string[]
  leaves: string[]
  orphanNodes: string[]
  warnings: string[]
}

export type ReplayProjectionStatus = 'unknown' | 'created' | 'running' | 'waiting' | 'completed' | 'failed' | 'blocked' | 'interrupted'

export type ReplayProjection<T = Record<string, unknown>> = {
  status: ReplayProjectionStatus
  summary: string
  importantIds: Record<string, string[]>
  timelineItems: ReplayTimelineItem[]
  warnings: string[]
  errors: string[]
  metrics: Record<string, number>
  data: T
}

export type ReplayProjections = {
  run: ReplayProjection
  thread: ReplayProjection
  loop: ReplayProjection
  gui: ReplayProjection
  gateway: ReplayProjection
  model: ReplayProjection
  checkpoint: ReplayProjection
  recovery: ReplayProjection
  approval: ReplayProjection
  tool: ReplayProjection
}

export type ReplayIncidentSeverity = 'info' | 'warning' | 'error' | 'critical'

export type ReplayIncidentKind =
  | 'missing_parent_event'
  | 'orphan_terminal_event'
  | 'duplicate_terminal_event'
  | 'run_without_checkpoint'
  | 'checkpoint_seq_missing'
  | 'unsafe_recovery_attempt'
  | 'pending_external_effect'
  | 'stuck_gui_action'
  | 'gateway_delivery_failed'
  | 'gateway_retry_exhausted'
  | 'loop_blocked'
  | 'loop_human_gate_pending'
  | 'model_fallback_exhausted'
  | 'model_budget_exceeded'
  | 'model_rate_limited'
  | 'approval_expired'
  | 'corruption_detected'
  | 'event_seq_gap'
  | 'event_out_of_order'
  | 'legacy_bridge_only'
  | 'payload_secret_suspected'
  | 'oversized_payload'
  | 'unknown_event_type'
  | 'replay_projection_mismatch'

export type ReplayIncident = {
  incidentId: string
  severity: ReplayIncidentSeverity
  kind: ReplayIncidentKind
  title: string
  message: string
  eventIds: string[]
  importantIds: Record<string, string[]>
  operatorAction?: string
}

export type ReplayRecommendationType =
  | 'inspect_run'
  | 'inspect_loop'
  | 'inspect_gui_action'
  | 'approve_or_reject'
  | 'rerun_readonly'
  | 'manual_recover'
  | 'repair_seq_maintenance'
  | 'open_gateway_delivery'
  | 'retry_gateway_delivery'
  | 'switch_model'
  | 'increase_budget'
  | 'compact_thread'
  | 'export_bundle'
  | 'file_issue'
  | 'no_action'

export type ReplayRecommendation = {
  recommendationId: string
  type: ReplayRecommendationType
  title: string
  description: string
  incidentIds: string[]
  commandHint?: string
  safeToAutoExecute: false
}

export type ReplayArtifactKind =
  | 'tool_result_ref'
  | 'screenshot_ref'
  | 'observation_ref'
  | 'diff_ref'
  | 'checkpoint_ref'
  | 'thread_export_ref'
  | 'gateway_raw_ref'
  | 'model_usage_ref'
  | 'legacy_ref'

export type ReplayArtifactRef = {
  artifactId: string
  kind: ReplayArtifactKind
  sourceEventId: string
  ref: string
  safeSummary: string
  missing?: boolean
  sizeBytes?: number
}

export type ReplayArtifactManifest = {
  artifacts: ReplayArtifactRef[]
  warnings: string[]
}

export type ReplayRedactionSummary = {
  mode: ReplayRedactionMode
  redactedFieldCount: number
  paths: string[]
  suspectedSecretPaths: string[]
}

export type ReplayReportV2 = {
  metadata: {
    reportId: string
    workspaceId: string
    generatedAtMs: number
    eventCount: number
  }
  query: ReplayQuery
  summary: string
  status: 'ok' | 'warning' | 'error'
  metrics: Record<string, number>
  timeline: ReplayTimelineItem[]
  causalGraphSummary: {
    nodeCount: number
    edgeCount: number
    rootCount: number
    leafCount: number
    orphanCount: number
  }
  graph: ReplayGraph
  projections: ReplayProjections
  incidents: ReplayIncident[]
  recommendations: ReplayRecommendation[]
  audit?: unknown
  recovery?: unknown
  checkpoints: unknown[]
  artifacts: ReplayArtifactManifest
  redactionSummary: ReplayRedactionSummary
  warnings: string[]
  errors: string[]
}

export type ReplayExportResult = {
  outputDir: string
  manifestPath: string
  files: string[]
  report: ReplayReportV2
}

export type ReplayOperatorSummary = {
  status: ReplayReportV2['status']
  summary: string
  topIncidents: ReplayIncident[]
  recommendations: ReplayRecommendation[]
}

export type ReplayReadResult = {
  events: EventEnvelope[]
  warnings: string[]
}