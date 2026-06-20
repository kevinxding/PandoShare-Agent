export type ModelHealthStatus = 'ok' | 'degraded' | 'rate_limited' | 'auth_failed' | 'unavailable'

export type ModelHealthRecord = {
  provider: string
  model?: string
  status: ModelHealthStatus
  message?: string
  updatedAtMs: number
}

export class ModelHealth {
  private readonly records = new Map<string, ModelHealthRecord>()

  set(record: Omit<ModelHealthRecord, 'updatedAtMs'> & { updatedAtMs?: number }): void {
    this.records.set(key(record.provider, record.model), {
      ...record,
      updatedAtMs: record.updatedAtMs ?? Date.now(),
    })
  }

  get(provider: string, model?: string): ModelHealthRecord {
    return this.records.get(key(provider, model)) ?? {
      provider,
      model,
      status: 'ok',
      updatedAtMs: Date.now(),
    }
  }
}

function key(provider: string, model?: string): string {
  return `${provider}:${model ?? ''}`
}
