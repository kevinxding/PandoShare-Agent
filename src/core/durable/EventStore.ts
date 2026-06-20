import {
  createEventEnvelope,
  createProtocolId,
  validateEventEnvelope,
  type EventEnvelope,
  type EventEnvelopeInput,
} from '../protocol/index.js'
import { JsonlStore, RuntimePaths } from '../store/index.js'
import { redactDurablePayload } from './DurableRedaction.js'
import { EventSeq } from './EventSeq.js'

export type DurableEventInput<TPayload = unknown> = Omit<EventEnvelopeInput<TPayload>, 'seq'> & {
  seq?: never
}

export type EventStoreAppendOptions = {
  importMode?: boolean
}

export class EventStore {
  private readonly store: JsonlStore<EventEnvelope>
  private readonly seq: EventSeq

  constructor(private readonly paths: RuntimePaths) {
    this.store = new JsonlStore<EventEnvelope>(paths.eventsPath())
    this.seq = new EventSeq(paths)
  }

  async append(input: DurableEventInput | EventEnvelope, options: EventStoreAppendOptions = {}): Promise<EventEnvelope> {
    if ('seq' in input && input.seq !== undefined && !options.importMode) {
      throw new Error('Durable EventStore rejects pre-sequenced events outside import mode')
    }
    const event = options.importMode && 'seq' in input && input.seq !== undefined
      ? this.importEvent(input as EventEnvelope)
      : await this.createDurableEvent(input as DurableEventInput)
    validateEventForStore(event)
    await this.store.append(event)
    return event
  }

  async appendMany(inputs: readonly (DurableEventInput | EventEnvelope)[], options: EventStoreAppendOptions = {}): Promise<EventEnvelope[]> {
    const written: EventEnvelope[] = []
    for (const input of inputs) {
      written.push(await this.append(input, options))
    }
    return written
  }

  async readEvents(input: { threadId?: string; runId?: string; loopId?: string } = {}): Promise<EventEnvelope[]> {
    return (await this.store.readRecords())
      .filter(event => input.threadId === undefined || event.threadId === input.threadId)
      .filter(event => input.runId === undefined || event.runId === input.runId)
      .filter(event => input.loopId === undefined || event.loopId === input.loopId)
      .sort((left, right) => left.seq - right.seq)
  }

  readRunEvents(runId: string): Promise<EventEnvelope[]> {
    return this.readEvents({ runId })
  }

  readThreadEvents(threadId: string): Promise<EventEnvelope[]> {
    return this.readEvents({ threadId })
  }

  async latestSeq(): Promise<number> {
    const records = await this.store.readRecords()
    return records.reduce((latest, event) => Math.max(latest, event.seq), 0)
  }

  async hasSeq(seq: number): Promise<boolean> {
    return (await this.store.readRecords()).some(event => event.seq === seq)
  }

  private async createDurableEvent(input: DurableEventInput): Promise<EventEnvelope> {
    const event = createEventEnvelope({
      eventId: input.eventId ?? createProtocolId('evt'),
      eventType: input.eventType,
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      runId: input.runId,
      goalId: input.goalId,
      loopId: input.loopId,
      taskId: input.taskId,
      toolCallId: input.toolCallId,
      parentEventId: input.parentEventId,
      createdAtMs: input.createdAtMs ?? Date.now(),
      seq: await this.seq.next(),
      payload: redactDurablePayload(input.payload),
    })
    return event
  }

  private importEvent(event: EventEnvelope): EventEnvelope {
    validateEventEnvelope(event)
    return {
      ...event,
      payload: redactDurablePayload(event.payload),
    }
  }
}

export function validateEventForStore(event: EventEnvelope): void {
  validateEventEnvelope(event)
  if (isRunEvent(event.eventType) && !event.runId) {
    throw new Error(`Run event ${event.eventType} requires runId`)
  }
}

function isRunEvent(eventType: string): boolean {
  return eventType.startsWith('run_') || eventType === 'kernel_persistence_failed'
}
