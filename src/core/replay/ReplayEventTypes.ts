export const REPLAY_EVENT_TYPES = {
  reportRequested: 'replay_report_requested',
  reportGenerated: 'replay_report_generated',
  reportFailed: 'replay_report_failed',
  incidentDetected: 'replay_incident_detected',
  exportCreated: 'replay_export_created',
  queryRejected: 'replay_query_rejected',
} as const

export type ReplayEventType = typeof REPLAY_EVENT_TYPES[keyof typeof REPLAY_EVENT_TYPES]

export function isReplayEventType(value: string): value is ReplayEventType {
  return Object.values(REPLAY_EVENT_TYPES).includes(value as ReplayEventType)
}