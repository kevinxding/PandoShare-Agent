import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { LocalThreadStore, type ThreadMetadata, type ThreadModelMetadata } from '../threadStore/index.js'
import type { PermissionConfig } from '../../Tool.js'

export type WorkspaceProject = {
  id: string
  name: string
  createdAtMs: number
  updatedAtMs: number
  archivedAtMs?: number
}

export type WorkspacePinKind = 'project' | 'conversation'

export type WorkspacePin = {
  id: string
  kind: WorkspacePinKind
  sourceId: string
  sourceName: string
  label: string
  createdAtMs: number
  updatedAtMs: number
}

export type WorkspaceConversationScope =
  | { type: 'global' }
  | { type: 'project'; projectId?: string; projectName?: string }

export type WorkspaceConversationInput = {
  sessionId: string
  cwd: string
  title?: string
  scope: WorkspaceConversationScope
  model?: ThreadModelMetadata
  permissions?: PermissionConfig
  goalId?: string
}

export type WorkspaceSnapshot = {
  pinnedItems: Array<{
    id: string
    kind: 'project' | 'chat'
    sourceId: string
    sourceName: string
    label: string
  }>
  projects: Array<{
    id: string
    name: string
    chats: Array<{ id: string; name: string; pinned: boolean }>
  }>
  chats: Array<{ id: string; name: string; pinned: boolean }>
}

const WORKSPACE_DIR = '.pandoshare/workspace'
const PROJECTS_FILE = 'projects.jsonl'
const PINS_FILE = 'pins.jsonl'

export class LocalWorkspaceStore {
  readonly root: string
  readonly threadStore: LocalThreadStore

  constructor(readonly workspaceRoot: string) {
    this.root = resolve(workspaceRoot, WORKSPACE_DIR)
    this.threadStore = new LocalThreadStore(workspaceRoot)
  }

  async createProject(input: { title?: string; projectId?: string } = {}): Promise<WorkspaceProject> {
    const now = Date.now()
    const project: WorkspaceProject = {
      id: sanitizeWorkspaceId(input.projectId ?? `project_${now}_${shortId()}`),
      name: normalizeTitle(input.title, '新项目'),
      createdAtMs: now,
      updatedAtMs: now,
    }

    await this.ensureRoot()
    await appendJsonLine(this.projectsPath(), project)
    return project
  }

  async listProjects(): Promise<WorkspaceProject[]> {
    await this.ensureRoot()
    const latestById = new Map<string, WorkspaceProject>()
    for (const project of await readJsonLines<WorkspaceProject>(this.projectsPath())) {
      latestById.set(project.id, project)
    }

    return [...latestById.values()]
      .filter(project => project.archivedAtMs === undefined)
      .sort((left, right) => right.updatedAtMs - left.updatedAtMs)
  }

  async createConversation(input: WorkspaceConversationInput): Promise<ThreadMetadata> {
    const project = input.scope.type === 'project' ? await this.resolveProject(input.scope) : undefined
    const record = await this.threadStore.createThread({
      sessionId: input.sessionId,
      cwd: input.cwd,
      title: normalizeTitle(input.title, '新会话'),
      model: input.model,
      permissions: input.permissions,
      goalId: input.goalId,
      projectId: project?.id,
      projectName: project?.name,
    })

    return record.metadata
  }

  async setPinnedItem(input: { kind: WorkspacePinKind; id: string; title?: string }): Promise<WorkspacePin> {
    const now = Date.now()
    const source = await this.resolvePinSource(input)
    const pin: WorkspacePin = {
      id: `${source.kind === 'project' ? 'project' : 'chat'}:${source.sourceId}`,
      kind: source.kind,
      sourceId: source.sourceId,
      sourceName: source.sourceName,
      label: `置顶 ${source.sourceName}`,
      createdAtMs: now,
      updatedAtMs: now,
    }
    const pins = (await this.listPins()).filter(existing => existing.id !== pin.id)
    await this.writePins([pin, ...pins])
    return pin
  }

  async unsetPinnedItem(id: string): Promise<boolean> {
    const pins = await this.listPins()
    const normalizedId = normalizePinId(id)
    const nextPins = pins.filter(pin => pin.id !== normalizedId && pin.sourceId !== id)

    if (nextPins.length === pins.length) {
      return false
    }

    await this.writePins(nextPins)
    return true
  }

  async readSnapshot(): Promise<WorkspaceSnapshot> {
    const [projects, pins, summaries] = await Promise.all([
      this.listProjects(),
      this.listPins(),
      this.threadStore.listThreadSummaries(),
    ])
    const projectPins = new Set(pins.filter(pin => pin.kind === 'project').map(pin => pin.sourceId))
    const chatPins = new Set(pins.filter(pin => pin.kind === 'conversation').map(pin => pin.sourceId))
    const threads = summaries.map(summary => summary.metadata).filter(metadata => metadata.archivedAtMs === undefined)
    const projectById = new Map(projects.map(project => [project.id, project]))
    const outputProjects = projects.map(project => ({
      id: project.id,
      name: project.name,
      pinned: projectPins.has(project.id),
      chats: threads
        .filter(thread => thread.projectId === project.id || (!thread.projectId && thread.projectName === project.name))
        .sort((left, right) => right.updatedAtMs - left.updatedAtMs)
        .map(thread => ({
          id: thread.threadId,
          name: thread.title,
          pinned: chatPins.has(thread.threadId) || thread.pinned === true,
        })),
    }))

    for (const thread of threads) {
      if (!thread.projectId || projectById.has(thread.projectId)) {
        continue
      }
      outputProjects.push({
        id: thread.projectId,
        name: thread.projectName ?? thread.projectId,
        pinned: projectPins.has(thread.projectId),
        chats: [
          {
            id: thread.threadId,
            name: thread.title,
            pinned: chatPins.has(thread.threadId) || thread.pinned === true,
          },
        ],
      })
    }

    const projectThreadIds = new Set(outputProjects.flatMap(project => project.chats.map(chat => chat.id)))
    const chats = threads
      .filter(thread => !projectThreadIds.has(thread.threadId))
      .sort((left, right) => right.updatedAtMs - left.updatedAtMs)
      .map(thread => ({
        id: thread.threadId,
        name: thread.title,
        pinned: chatPins.has(thread.threadId) || thread.pinned === true,
      }))

    return {
      pinnedItems: pins.map(pin => ({
        id: pin.id,
        kind: pin.kind === 'project' ? 'project' : 'chat',
        sourceId: pin.sourceId,
        sourceName: pin.sourceName,
        label: pin.label,
      })),
      projects: outputProjects.map(({ pinned: _pinned, ...project }) => project),
      chats,
    }
  }

  private async resolveProject(scope: Extract<WorkspaceConversationScope, { type: 'project' }>): Promise<WorkspaceProject> {
    const projects = await this.listProjects()
    const byId = scope.projectId ? projects.find(project => project.id === scope.projectId) : undefined
    if (byId) {
      return byId
    }

    const byName = scope.projectName ? projects.find(project => project.name === scope.projectName) : undefined
    if (byName) {
      return byName
    }

    return this.createProject({ title: scope.projectName })
  }

  private async resolvePinSource(input: { kind: WorkspacePinKind; id: string; title?: string }): Promise<{
    kind: WorkspacePinKind
    sourceId: string
    sourceName: string
  }> {
    if (input.kind === 'project') {
      const project = (await this.listProjects()).find(project => project.id === input.id)
      return {
        kind: 'project',
        sourceId: input.id,
        sourceName: project?.name ?? normalizeTitle(input.title, input.id),
      }
    }

    const thread = await this.tryReadThread(input.id)
    return {
      kind: 'conversation',
      sourceId: input.id,
      sourceName: thread?.title ?? normalizeTitle(input.title, input.id),
    }
  }

  private async tryReadThread(threadId: string): Promise<ThreadMetadata | undefined> {
    try {
      return await this.threadStore.readMetadata(threadId)
    } catch {
      return undefined
    }
  }

  private async listPins(): Promise<WorkspacePin[]> {
    await this.ensureRoot()
    return readJsonLines<WorkspacePin>(this.pinsPath())
  }

  private async writePins(pins: WorkspacePin[]): Promise<void> {
    await this.ensureRoot()
    await writeJsonLines(this.pinsPath(), pins)
  }

  private async ensureRoot(): Promise<void> {
    await mkdir(this.root, { recursive: true })
  }

  private projectsPath(): string {
    return join(this.root, PROJECTS_FILE)
  }

  private pinsPath(): string {
    return join(this.root, PINS_FILE)
  }
}

function normalizeTitle(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizePinId(id: string): string {
  if (id.startsWith('project:') || id.startsWith('chat:')) {
    return id
  }
  return `chat:${id}`
}

function sanitizeWorkspaceId(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid workspace id: ${id}`)
  }
  return id
}

async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await appendFile(path, `${JSON.stringify(value)}\n`, 'utf8')
}

async function writeJsonLines(path: string, values: readonly unknown[]): Promise<void> {
  await writeFile(path, values.map(value => JSON.stringify(value)).join('\n') + (values.length ? '\n' : ''), 'utf8')
}

async function readJsonLines<T>(path: string): Promise<T[]> {
  if (!(await exists(path))) {
    return []
  }

  const text = await readFile(path, 'utf8')
  return text
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line) as T)
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 10)
}
