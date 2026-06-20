import type { EventEnvelope } from '../protocol/index.js'

export type ReplayTimelineItem = {
  eventId: string
  seq: number
  eventType: string
  createdAtMs: number
  category: 'run' | 'model' | 'tool' | 'approval' | 'gui' | 'loop' | 'gateway' | 'checkpoint' | 'heartbeat' | 'other'
  warning?: string
  payload: unknown
}

export class EventReplay {
  buildTimeline(events: readonly EventEnvelope[]): ReplayTimelineItem[] {
    return [...events]
      .sort((left, right) => left.seq - right.seq)
      .map(event => ({
        eventId: event.eventId,
        seq: event.seq,
        eventType: event.eventType,
        createdAtMs: event.createdAtMs,
        category: categoryForEvent(event.eventType),
        warning: missingFieldWarning(event),
        payload: event.payload,
      }))
  }
}

function categoryForEvent(eventType: string): ReplayTimelineItem['category'] {
  if (eventType.startsWith('run_')) return 'run'
  if (eventType.startsWith('model_')) return 'model'
  if (eventType.startsWith('tool_')) return 'tool'
  if (eventType.startsWith('approval')) return 'approval'
  if (eventType.startsWith('gui_')) return 'gui'
  if (eventType.startsWith('loop_')) return 'loop'
  if (eventType.startsWith('gateway_')) return 'gateway'
  if (eventType === 'checkpoint') return 'checkpoint'
  if (eventType === 'heartbeat') return 'heartbeat'
  return 'other'
}

function missingFieldWarning(event: EventEnvelope): string | undefined {
  if (!event.eventId || !event.eventType || !event.workspaceId) return 'event is missing a required replay field'
  return undefined
}
