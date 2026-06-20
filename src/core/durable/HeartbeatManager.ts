import { JsonlStore } from '../store/index.js'

export type KernelHeartbeat = {
  heartbeatId: string
  workspaceId: string
  runtimeId: string
  kernel: string
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed'
  createdAtMs: number
  message?: string
  payload?: unknown
}

export class HeartbeatManager {
  constructor(private readonly store: JsonlStore<KernelHeartbeat>) {}

  async writeHeartbeat(input: Omit<KernelHeartbeat, 'heartbeatId' | 'createdAtMs'> & {
    heartbeatId?: string
    createdAtMs?: number
  }): Promise<KernelHeartbeat> {
    const heartbeat: KernelHeartbeat = {
      heartbeatId: input.heartbeatId ?? `heartbeat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      workspaceId: input.workspaceId,
      runtimeId: input.runtimeId,
      kernel: input.kernel,
      status: input.status,
      createdAtMs: input.createdAtMs ?? Date.now(),
      message: input.message,
      payload: input.payload,
    }
    await this.store.append(heartbeat)
    return heartbeat
  }

  async readHeartbeat(runtimeId: string): Promise<KernelHeartbeat | undefined> {
    return (await this.listHeartbeats({ runtimeId })).sort((left, right) => right.createdAtMs - left.createdAtMs)[0]
  }

  async listHeartbeats(input: { runtimeId?: string; kernel?: string } = {}): Promise<KernelHeartbeat[]> {
    return (await this.store.readRecords())
      .filter(record => input.runtimeId === undefined || record.runtimeId === input.runtimeId)
      .filter(record => input.kernel === undefined || record.kernel === input.kernel)
  }

  async isStale(runtimeId: string, staleAfterMs: number, nowMs = Date.now()): Promise<boolean> {
    const heartbeat = await this.readHeartbeat(runtimeId)
    if (!heartbeat) return true
    return nowMs - heartbeat.createdAtMs > staleAfterMs
  }
}
