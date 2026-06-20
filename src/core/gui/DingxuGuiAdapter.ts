import { runGuiAction, type GuiActionBackend } from '../../services/gui/index.js'
import type { GuiAdapter, GuiAdapterResult, GuiObservation, GuiRuntimeAction, GuiVerification } from './GuiTypes.js'

export class DingxuGuiAdapter implements GuiAdapter {
  constructor(private readonly backend?: GuiActionBackend) {}

  async observe(): Promise<GuiObservation> {
    const screenshot = await this.backend?.screenshot?.({ action: 'observe' })
    return {
      observationId: `gui_obs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      createdAtMs: Date.now(),
      screenshotRef: screenshot?.screenshotPath,
      summary: screenshot?.message ?? 'GUI observation captured through Dingxu adapter.',
    }
  }

  async act(action: GuiRuntimeAction): Promise<GuiAdapterResult> {
    const result = await runGuiAction(action, this.backend)
    return {
      ok: result.ok,
      message: result.message,
      screenshotRef: result.screenshotPath,
    }
  }

  async verify(action: GuiRuntimeAction): Promise<GuiVerification> {
    const screenshot = await this.backend?.screenshot?.(action)
    return {
      ok: screenshot?.ok ?? true,
      message: screenshot?.message ?? 'GUI verification completed.',
      screenshotRef: screenshot?.screenshotPath,
    }
  }
}

export class MockGuiAdapter implements GuiAdapter {
  async observe(): Promise<GuiObservation> {
    return {
      observationId: `gui_obs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      createdAtMs: Date.now(),
      summary: 'Mock GUI observation.',
    }
  }

  async act(action: GuiRuntimeAction): Promise<GuiAdapterResult> {
    return {
      ok: true,
      message: `Mock GUI action completed: ${action.action}`,
    }
  }

  async verify(): Promise<GuiVerification> {
    return {
      ok: true,
      message: 'Mock GUI verification completed.',
    }
  }
}
