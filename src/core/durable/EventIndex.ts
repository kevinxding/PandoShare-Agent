import type { EventEnvelope } from '../protocol/index.js'
import type { EventStore } from './EventStore.js'

export class EventIndex {
  constructor(private readonly eventStore: EventStore) {}

  readRunEvents(runId: string): Promise<EventEnvelope[]> {
    return this.eventStore.readRunEvents(runId)
  }

  readThreadEvents(threadId: string): Promise<EventEnvelope[]> {
    return this.eventStore.readThreadEvents(threadId)
  }
}
