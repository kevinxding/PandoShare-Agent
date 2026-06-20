import { AtomicFileStore, FileLock, RuntimePaths } from '../store/index.js'

type EventSeqState = {
  workspaceId: string
  latestSeq: number
  updatedAtMs: number
}

export class EventSeq {
  private readonly atomic = new AtomicFileStore()
  private readonly lock = new FileLock()

  constructor(private readonly paths: RuntimePaths) {}

  async next(): Promise<number> {
    return this.lock.withLock(this.paths.eventSeqPath(), async () => {
      const state = await this.read()
      const nextSeq = state.latestSeq + 1
      await this.atomic.writeJson(this.paths.eventSeqPath(), {
        workspaceId: this.paths.workspaceId,
        latestSeq: nextSeq,
        updatedAtMs: Date.now(),
      } satisfies EventSeqState)
      return nextSeq
    })
  }

  async latest(): Promise<number> {
    return (await this.read()).latestSeq
  }

  private async read(): Promise<EventSeqState> {
    return (await this.atomic.readJson<EventSeqState>(this.paths.eventSeqPath())) ?? {
      workspaceId: this.paths.workspaceId,
      latestSeq: 0,
      updatedAtMs: 0,
    }
  }
}
