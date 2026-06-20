import { AtomicFileStore } from '../store/index.js'
import type { DurableRuntime } from '../durable/index.js'
import { projectLoopState, type LoopState } from './LoopProjector.js'

export type LoopStateCacheRecord = {
  derivedFromSeq: number
  projectedAtMs: number
  state: LoopState
}

export class LoopStateStore {
  private readonly files = new AtomicFileStore()

  constructor(private readonly durable: DurableRuntime) {}

  async read(loopId: string): Promise<LoopStateCacheRecord> {
    const events = await this.durable.readEvents({ loopId })
    const latestSeq = events.reduce((latest, event) => Math.max(latest, event.seq), 0)
    const cached = await this.files.readJson<LoopStateCacheRecord>(this.path(loopId))
    if (cached && cached.derivedFromSeq >= latestSeq) return cached
    return this.refreshFromEvents(loopId, events)
  }

  async refresh(loopId: string): Promise<LoopStateCacheRecord> {
    return this.refreshFromEvents(loopId, await this.durable.readEvents({ loopId }))
  }

  private async refreshFromEvents(loopId: string, events: Awaited<ReturnType<DurableRuntime['readEvents']>>): Promise<LoopStateCacheRecord> {
    const record: LoopStateCacheRecord = {
      derivedFromSeq: events.reduce((latest, event) => Math.max(latest, event.seq), 0),
      projectedAtMs: Date.now(),
      state: projectLoopState(events),
    }
    await this.files.writeJson(this.path(loopId), record)
    return record
  }

  private path(loopId: string): string {
    return this.durable.paths.statePath(`loop-state-${loopId}`)
  }
}
