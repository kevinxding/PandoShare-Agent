import { JsonlStore } from '../store/index.js'
import type { GuiRuntimeActionRecord } from './GuiTypes.js'

export class GuiObservationStore {
  constructor(private readonly store: JsonlStore<GuiRuntimeActionRecord>) {}

  record(action: GuiRuntimeActionRecord): Promise<void> {
    return this.store.append(action)
  }

  readAll(): Promise<GuiRuntimeActionRecord[]> {
    return this.store.readRecords()
  }
}
