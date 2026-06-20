import { isDangerousGuiAction, createEventEnvelope } from '../protocol/index.js'
import { DurableRuntime } from '../durable/index.js'
import { JsonlStore, RuntimePaths } from '../store/index.js'
import { DingxuGuiAdapter, MockGuiAdapter } from './DingxuGuiAdapter.js'
import { GuiActionVerifier } from './GuiActionVerifier.js'
import { GuiObservationStore } from './GuiObservationStore.js'
import type { GuiAdapter, GuiObservation, GuiRuntimeAction, GuiRuntimeActionRecord } from './GuiTypes.js'

export class GuiRuntime {
  private readonly workspaceId: string
  private readonly durable: DurableRuntime
  private readonly adapter: GuiAdapter
  private readonly store: GuiObservationStore
  private readonly verifier: GuiActionVerifier

  constructor(input: {
    workspaceRoot: string
    workspaceId?: string
    adapter?: GuiAdapter
  }) {
    this.workspaceId = input.workspaceId ?? 'default'
    this.durable = new DurableRuntime({ workspaceRoot: input.workspaceRoot, workspaceId: this.workspaceId })
    this.adapter = input.adapter ?? new MockGuiAdapter()
    this.verifier = new GuiActionVerifier(this.adapter)
    const paths = new RuntimePaths({ workspaceRoot: input.workspaceRoot, workspaceId: this.workspaceId })
    this.store = new GuiObservationStore(new JsonlStore(paths.queuePath('gui-actions')))
  }

  static fromDingxu(input: ConstructorParameters<typeof GuiRuntime>[0] & {
    backend?: ConstructorParameters<typeof DingxuGuiAdapter>[0]
  }): GuiRuntime {
    return new GuiRuntime({
      ...input,
      adapter: new DingxuGuiAdapter(input.backend),
    })
  }

  observe(): Promise<GuiObservation> {
    return this.adapter.observe()
  }

  async act(action: GuiRuntimeAction): Promise<GuiRuntimeActionRecord> {
    if (isDangerousGuiAction(action.action)) {
      throw new Error(`GUI action requires approval: ${action.action}`)
    }
    const beforeObservation = await this.observe()
    await this.durable.appendEvent(createEventEnvelope({
      eventType: 'gui_action',
      workspaceId: this.workspaceId,
      payload: {
        phase: 'started',
        action,
        beforeObservation,
      },
    }))
    const result = await this.adapter.act(action)
    const afterObservation = await this.observe()
    const verification = action.verify ? await this.verifier.verify(action) : {
      ok: result.ok,
      message: result.message,
      screenshotRef: result.screenshotRef,
    }
    const event = createEventEnvelope({
      eventType: 'gui_action',
      workspaceId: this.workspaceId,
      payload: {
        phase: 'completed',
        action,
        result,
        verification,
      },
    })
    await this.durable.appendEvent(event)
    const record: GuiRuntimeActionRecord = {
      actionId: `gui_action_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      beforeObservation,
      action,
      afterObservation,
      verification,
      screenshotRef: verification.screenshotRef ?? result.screenshotRef,
      eventId: event.eventId,
    }
    await this.record(record)
    return record
  }

  record(record: GuiRuntimeActionRecord): Promise<void> {
    return this.store.record(record)
  }
}
