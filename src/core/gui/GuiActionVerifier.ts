import type { GuiAdapter, GuiRuntimeAction, GuiVerification } from './GuiTypes.js'

export class GuiActionVerifier {
  constructor(private readonly adapter: GuiAdapter) {}

  verify(action: GuiRuntimeAction): Promise<GuiVerification> {
    return this.adapter.verify(action)
  }
}
