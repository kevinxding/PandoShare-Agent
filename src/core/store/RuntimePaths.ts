import { join, resolve } from 'node:path'

export type RuntimePathsInput = {
  workspaceRoot: string
  workspaceId?: string
}

export class RuntimePaths {
  readonly workspaceRoot: string
  readonly workspaceId: string
  readonly root: string

  constructor(input: RuntimePathsInput) {
    this.workspaceRoot = resolve(input.workspaceRoot)
    this.workspaceId = input.workspaceId ?? 'default'
    this.root = join(this.workspaceRoot, '.pandoshare', 'core')
  }

  eventsPath(): string {
    return join(this.root, 'events', `${safeId(this.workspaceId)}.jsonl`)
  }

  eventSeqPath(): string {
    return join(this.root, 'state', `${safeId(this.workspaceId)}-event-seq.json`)
  }

  checkpointsPath(): string {
    return join(this.root, 'checkpoints', `${safeId(this.workspaceId)}.jsonl`)
  }

  heartbeatsPath(): string {
    return join(this.root, 'heartbeats', `${safeId(this.workspaceId)}.jsonl`)
  }

  runSnapshotsPath(): string {
    return join(this.root, 'run-snapshots', `${safeId(this.workspaceId)}.jsonl`)
  }

  statePath(name: string): string {
    return join(this.root, 'state', `${safeId(name)}.json`)
  }

  queuePath(name: string): string {
    return join(this.root, 'queues', `${safeId(name)}.jsonl`)
  }
}

export function safeId(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`Invalid runtime id: ${value}`)
  return value
}
