import { JsonlStore } from '../store/index.js'
import type { ModelUsageRecord } from './ModelTypes.js'

export class CostTracker {
  constructor(private readonly store?: JsonlStore<ModelUsageRecord>) {}

  private readonly memory: ModelUsageRecord[] = []

  async recordUsage(record: Omit<ModelUsageRecord, 'createdAtMs'> & { createdAtMs?: number }): Promise<ModelUsageRecord> {
    const usage: ModelUsageRecord = {
      ...record,
      createdAtMs: record.createdAtMs ?? Date.now(),
    }
    this.memory.push(usage)
    await this.store?.append(usage)
    return usage
  }

  async readUsage(): Promise<ModelUsageRecord[]> {
    if (this.store) return this.store.readRecords()
    return [...this.memory]
  }
}
