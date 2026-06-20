export type GuiRuntimeAction = {
  action: string
  target?: string
  text?: string
  keys?: readonly string[]
  x?: number
  y?: number
  timeoutMs?: number
  verify?: boolean | string
}

export type GuiObservation = {
  observationId: string
  createdAtMs: number
  screenshotRef?: string
  summary: string
}

export type GuiVerification = {
  ok: boolean
  message: string
  screenshotRef?: string
}

export type GuiRuntimeActionRecord = {
  actionId: string
  beforeObservation: GuiObservation
  action: GuiRuntimeAction
  afterObservation: GuiObservation
  verification: GuiVerification
  screenshotRef?: string
  eventId: string
}

export type GuiAdapterResult = {
  ok: boolean
  message: string
  screenshotRef?: string
}

export type GuiAdapter = {
  observe(): Promise<GuiObservation>
  act(action: GuiRuntimeAction): Promise<GuiAdapterResult>
  verify(action: GuiRuntimeAction): Promise<GuiVerification>
}
