import { AtomicFileStore, RuntimePaths } from '../store/index.js'

export class RuntimeStateStore {
  private readonly atomic = new AtomicFileStore()

  constructor(private readonly paths: RuntimePaths) {}

  readState<T>(name: string): Promise<T | undefined> {
    return this.atomic.readJson<T>(this.paths.statePath(name))
  }

  writeState(name: string, value: unknown): Promise<void> {
    return this.atomic.writeJson(this.paths.statePath(name), value)
  }
}
