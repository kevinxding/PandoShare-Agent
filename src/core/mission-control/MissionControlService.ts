import { resolve } from 'node:path'
import { BackendService } from '../backend/index.js'
import { missionControlEventId, redactObject } from './MissionControlEvents.js'
import { MissionControlProjector } from './MissionControlProjector.js'
import { listMissionControlActions, toBackendAction } from './MissionControlActions.js'
import { emptyApprovalSummary } from './MissionControlApprovals.js'
import { summarizeMissionControlHealth } from './MissionControlHealth.js'
import type { MissionControlActionRequest, MissionControlActionResult, MissionControlActiveWork, MissionControlOptions, MissionControlOverview, MissionControlQuery, MissionControlResponse } from './MissionControlTypes.js'

export class MissionControlService {
  private readonly workspaceRoot: string
  private readonly backend: BackendService
  private readonly projector = new MissionControlProjector()
  private readonly now: () => number

  constructor(options: MissionControlOptions) {
    this.workspaceRoot = resolve(options.workspaceRoot)
    this.backend = options.backend ?? new BackendService({ workspaceRoot: this.workspaceRoot, cwd: options.cwd ?? this.workspaceRoot, sessionId: options.sessionId ?? 'mission-' + Date.now(), source: 'web' })
    this.now = options.now ?? (() => Date.now())
  }

  getOverview(): MissionControlResponse<MissionControlOverview> {
    const backendStatus = redactObject(this.backend.status() as unknown as Record<string, unknown>)
    return this.wrap(this.projector.overview({ workspaceRoot: this.workspaceRoot, nowMs: this.now(), backendStatus }))
  }

  getActiveWork(): MissionControlResponse<MissionControlActiveWork> { return this.wrap(this.projector.activeWork()) }
  getRuntimeHealth(): MissionControlResponse<Record<string, unknown>> { return this.wrap(summarizeMissionControlHealth(this.getOverview().data)) }
  getRuns(query: MissionControlQuery = {}): MissionControlResponse<Array<Record<string, unknown>>> { return this.wrap([], queryWarning(query, 'runs')) }
  getThreads(query: MissionControlQuery = {}): MissionControlResponse<Array<Record<string, unknown>>> { return this.wrap([], queryWarning(query, 'threads')) }
  getGoals(query: MissionControlQuery = {}): MissionControlResponse<Array<Record<string, unknown>>> { return this.wrap([], queryWarning(query, 'goals')) }
  getLoops(query: MissionControlQuery = {}): MissionControlResponse<Array<Record<string, unknown>>> { return this.wrap([], queryWarning(query, 'loops')) }
  getGatewayStatus(): MissionControlResponse<Record<string, unknown>> { return this.wrap(this.getOverview().data.gateway) }
  getGuiStatus(): MissionControlResponse<Record<string, unknown>> { return this.wrap(this.getOverview().data.gui) }
  getModelStatus(): MissionControlResponse<Record<string, unknown>> { return this.wrap(this.getOverview().data.model) }
  getReplaySummary(query: MissionControlQuery = {}): MissionControlResponse<Record<string, unknown>> { return this.wrap({ ...this.getOverview().data.replay, query }) }
  getApprovals(_query: MissionControlQuery = {}): MissionControlResponse<Record<string, unknown>> { return this.wrap(emptyApprovalSummary()) }
  getCosts(_query: MissionControlQuery = {}): MissionControlResponse<Record<string, unknown>> { return this.wrap(this.getOverview().data.cost) }
  getEvents(query: MissionControlQuery = {}): MissionControlResponse<Array<Record<string, unknown>>> { return this.wrap(this.getOverview().data.recentEvents, queryWarning(query, 'events')) }

  getScheduledJobs(query: MissionControlQuery = {}): Promise<MissionControlResponse<unknown>> {
    return this.runScheduledBackend('scheduled.list', query as Record<string, unknown>)
  }

  getScheduledJob(jobId: string): Promise<MissionControlResponse<unknown>> {
    return this.runScheduledBackend('scheduled.get', { jobId })
  }

  getScheduledRuns(query: MissionControlQuery & { jobId?: string } = {}): Promise<MissionControlResponse<unknown>> {
    return this.runScheduledBackend('scheduled.runs', query as Record<string, unknown>)
  }

  getScheduledHealth(): Promise<MissionControlResponse<unknown>> {
    return this.runScheduledBackend('scheduled.health', {})
  }

  runScheduledAction(input: { action: string; payload?: Record<string, unknown>; requestId?: string }): Promise<MissionControlResponse<unknown>> {
    return this.runScheduledBackend(input.action, input.payload ?? {}, input.requestId)
  }

  actions(): MissionControlResponse<string[]> { return this.wrap(listMissionControlActions()) }

  async runAction(input: MissionControlActionRequest): Promise<MissionControlResponse<MissionControlActionResult>> {
    const backendAction = toBackendAction(input.action)
    const backend = await this.backend.handle({ action: backendAction, payload: input.payload ?? {}, requestId: input.requestId })
    return this.wrap({ action: input.action, backendAction, backend: redactObject(backend as unknown as Record<string, unknown>) as unknown as typeof backend }, backend.ok ? [] : ['BackendService returned a non-ok action response.'], backend.eventIds)
  }

  private async runScheduledBackend(action: string, payload: Record<string, unknown>, requestId?: string): Promise<MissionControlResponse<unknown>> {
    const backend = await this.backend.handle({ action, payload, requestId })
    return this.wrap(backend.data ?? backend.error ?? {}, backend.ok ? [] : ['BackendService returned a non-ok scheduled response.'], backend.eventIds)
  }

  private wrap<TData>(data: TData, warnings: string[] = [], eventIds: string[] = []): MissionControlResponse<TData> {
    return { requestId: missionControlEventId('mission_req', this.now()), ok: true, data, warnings, eventIds }
  }
}

function queryWarning(query: MissionControlQuery, label: string): string[] {
  return Object.keys(query).length ? [label + ' query is accepted by the contract; baseline store projection is empty until live runtime integration is enabled.'] : []
}
