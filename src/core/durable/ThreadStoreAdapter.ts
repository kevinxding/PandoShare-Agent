import type { LocalThreadStore } from '../../services/threadStore/index.js'
import type { AgentEvent } from '../../services/events/index.js'
import {
  agentEventToEnvelope,
  createInMemoryEventSequencer,
  type EventEnvelope,
} from '../protocol/index.js'

// TODO: legacy adapter. ThreadStore keeps its existing file layout while core replay reads EventEnvelope views.
export class ThreadStoreAdapter {
  constructor(
    private readonly store: LocalThreadStore,
    private readonly workspaceId = 'default',
  ) {}

  async appendLegacyEvent(threadId: string, event: AgentEvent): Promise<EventEnvelope> {
    await this.store.appendEvent(threadId, event)
    return agentEventToEnvelope(event, {
      workspaceId: this.workspaceId,
    })
  }

  async readEventEnvelopes(threadId: string): Promise<EventEnvelope[]> {
    const sequencer = createInMemoryEventSequencer()
    return (await this.store.readEvents(threadId)).map(event =>
      agentEventToEnvelope(event, {
        workspaceId: this.workspaceId,
        sequencer,
      }),
    )
  }
}
