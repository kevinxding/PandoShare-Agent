import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { extname, join, relative, resolve, sep } from 'node:path'

import { AgentKernel } from '../core/agent/index.js'
import { MissionControlService } from '../core/mission-control/index.js'
import { LocalApprovalStore, type StoredApprovalDecision, type StoredApprovalRecord } from '../services/approvalStore/index.js'
import { loadRuntimeConfig } from '../services/preflight/index.js'
import { resolveDefaultModel, type ProjectConfig } from '../services/config/index.js'
import { createGuiBackendFromMcpConnections } from '../services/gui/index.js'
import { closeMcpConnections, connectConfiguredMcpServers, type McpServerConnection } from '../services/mcp/index.js'
import { createTerminalApprovalHandler } from '../services/permissions/terminalApproval.js'
import { LocalThreadStore, modelMetadata, type ThreadMetadata, type ThreadSummary } from '../services/threadStore/index.js'
import { createRuntimeToolRegistry, type ToolRegistry } from '../tools.js'
import type { AgentEvent } from '../services/events/index.js'
import type { PandoPromptDraft, PandoPromptStashEntry, PandoTuiAdapter as AdapterApi, PandoTuiFileMention, PandoTuiIo, PandoTuiMessage, PandoTuiModel, PandoTuiSendOptions, PandoTuiSendResult, PandoTuiSnapshot, PandoTuiWorkspaceChange, PandoTuiWorkspaceDiff } from './PandoTuiTypes.js'

type AdapterOptions = {
  cwd: string
  configPath?: string
  provider?: string
  model?: string
  threadId?: string
  resumeLast?: boolean
  newThread?: boolean
  goalId?: string
  io: PandoTuiIo
  fake?: boolean
}

const BUILTIN_PROVIDERS = ['minimax-cn', 'deepseek', 'openai', 'openai-codex', 'custom']
const FILE_MENTION_SCAN_LIMIT = 1000
const FILE_MENTION_RESULT_LIMIT = 240
const FILE_MENTION_MAX_DEPTH = 5
const WORKSPACE_DIFF_CHAR_LIMIT = 16000
const PROMPT_STASH_LIMIT = 20
const PROMPT_STASH_PATH = ['.pandoshare', 'tui', 'prompt-stash.jsonl']
const PROMPT_DRAFT_PATH = ['.pandoshare', 'tui', 'prompt-draft.json']
const FILE_MENTION_EXCLUDED_DIRS = new Set(['.git', '.pandoshare', 'node_modules', 'dist', 'build', 'coverage', '.next', '.cache'])
const FILE_MENTION_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.json',
  '.md',
  '.txt',
  '.toml',
  '.yaml',
  '.yml',
  '.css',
  '.html',
  '.mjs',
  '.cjs',
  '.py',
  '.rs',
])

export class PandoTuiRuntimeAdapter implements AdapterApi {
  private readonly threadStore: LocalThreadStore
  private readonly approvalStore: LocalApprovalStore
  private readonly events: AgentEvent[] = []
  private config?: ProjectConfig
  private registry?: ToolRegistry
  private mcpConnections: McpServerConnection[] = []
  private activeThreadId?: string
  private selectedProvider?: string
  private selectedModel?: string
  private initialized?: Promise<void>

  constructor(private readonly options: AdapterOptions) {
    this.threadStore = new LocalThreadStore(options.cwd)
    this.approvalStore = new LocalApprovalStore(options.cwd)
    this.activeThreadId = options.threadId
    this.selectedProvider = options.provider
    this.selectedModel = options.model
  }

  async listThreads(): Promise<ThreadSummary[]> {
    return this.threadStore.listThreadSummaries({ limit: 20 })
  }

  async createThread(title?: string): Promise<ThreadMetadata> {
    await this.ensureInitialized()
    const config = this.currentConfig()
    const model = resolveDefaultModel(config)
    const record = await this.threadStore.createThread({
      sessionId: 'tui-' + Date.now(),
      cwd: this.options.cwd,
      title,
      model: modelMetadata(model),
      permissions: config.permissions,
      goalId: this.options.goalId,
    })
    this.activeThreadId = record.metadata.threadId
    return record.metadata
  }

  async resumeThread(threadId: string): Promise<{ metadata: ThreadMetadata; messages: PandoTuiMessage[] }> {
    const record = await this.threadStore.openThread(threadId, 'tui-' + Date.now())
    this.activeThreadId = record.metadata.threadId
    return { metadata: record.metadata, messages: await this.readTuiMessages(record.metadata.threadId) }
  }

  async sendMessage(threadId: string | undefined, text: string, options?: PandoTuiSendOptions): Promise<PandoTuiSendResult> {
    if (this.options.fake) return this.sendFakeMessage(threadId, text, options)
    await this.ensureInitialized()
    const config = this.currentConfig()
    const connections = this.mcpConnections
    const engine = new AgentKernel({
      cwd: this.options.cwd,
      sessionId: 'tui-' + Date.now(),
      commandSource: 'cli',
      config,
      modelOverride: this.modelOverride(),
      registry: this.registry,
      threadId: threadId ?? this.activeThreadId,
      resumeLast: !threadId && !this.activeThreadId ? this.options.resumeLast : false,
      newThread: !threadId && !this.activeThreadId ? this.options.newThread : false,
      goalId: this.options.goalId,
      requestToolApproval: createTerminalApprovalHandler({ input: this.options.io.input, output: this.options.io.output }),
      stream: true,
      onEvent: async event => {
        this.events.push(event)
        await options?.onEvent?.(event)
        if (event.type === 'agent_message_delta') await options?.onDelta?.(event.delta)
      },
      metadata: { guiBackend: createGuiBackendFromMcpConnections(connections), tui: true },
    })
    const output = await engine.run(text)
    this.activeThreadId = engine.threadId() ?? this.activeThreadId
    return { threadId: this.activeThreadId, finalText: output.finalText, events: engine.events() }
  }

  async streamEvents(threadId: string): Promise<AgentEvent[]> {
    return this.threadStore.readEvents(threadId)
  }

  async listModels(): Promise<PandoTuiModel[]> {
    await this.ensureInitialized()
    const config = this.currentConfig()
    const selected = resolveDefaultModel(config)
    const providerIds = new Set([...BUILTIN_PROVIDERS, ...Object.keys(config.providers ?? {})])
    return [...providerIds].map(provider => {
      const configured = config.providers?.[provider]
      const name = provider === selected.provider.id ? (selected.model ?? selected.provider.defaultModel) : configured?.model
      return {
        provider,
        name,
        label: configured?.name ?? provider,
        selected: provider === selected.provider.id,
        status: provider === selected.provider.id ? 'selected' : configured ? 'configured' : 'builtin',
      }
    })
  }

  async selectModel(provider: string, model?: string): Promise<void> {
    this.selectedProvider = provider
    this.selectedModel = model
    this.config = applyModelOverride(this.currentConfig(), { provider, model })
  }

  async listWorkspaceFiles(): Promise<PandoTuiFileMention[]> {
    const files: PandoTuiFileMention[] = []
    await collectWorkspaceFiles(this.options.cwd, this.options.cwd, files, 0)
    return files
      .sort((left, right) => (right.mtimeMs ?? 0) - (left.mtimeMs ?? 0) || left.path.localeCompare(right.path))
      .slice(0, FILE_MENTION_RESULT_LIMIT)
  }

  async listWorkspaceChanges(): Promise<PandoTuiWorkspaceChange[]> {
    const result = await runGitStatusShort(this.options.cwd)
    if (result.exitCode !== 0) return []
    return parseGitStatusShort(result.stdout)
  }

  async readWorkspaceChangeDiff(path: string): Promise<PandoTuiWorkspaceDiff> {
    const changes = await this.listWorkspaceChanges()
    const change = changes.find(item => item.path === path)
    const status = change?.status ?? ''
    const staged = await runGitCommand(this.options.cwd, ['diff', '--cached', '--', path])
    const unstaged = await runGitCommand(this.options.cwd, ['diff', '--', path])
    const parts = [
      staged.exitCode === 0 && staged.stdout.trim() ? staged.stdout.trimEnd() : undefined,
      unstaged.exitCode === 0 && unstaged.stdout.trim() ? unstaged.stdout.trimEnd() : undefined,
    ].filter((part): part is string => Boolean(part))

    if (parts.length > 0) {
      const limited = limitWorkspaceDiffText(parts.join('\n\n'))
      return { path, status, kind: 'diff', text: limited.text, truncated: limited.truncated }
    }

    if (change?.status === '??') {
      const filePath = safeWorkspacePath(this.options.cwd, path)
      const content = filePath ? await readFile(filePath, 'utf8').catch(() => '') : ''
      if (content.trim()) {
        const limited = limitWorkspaceDiffText(content)
        return { path, status, kind: 'file', text: limited.text, truncated: limited.truncated }
      }
    }

    return { path, status, kind: 'none', text: 'No textual diff is available for this change.', truncated: false }
  }

  async listPromptStash(): Promise<PandoPromptStashEntry[]> {
    return readPromptStash(this.options.cwd)
  }

  async pushPromptStash(text: string): Promise<PandoPromptStashEntry> {
    const entry = createPromptStashEntry(text)
    const entries = [...await readPromptStash(this.options.cwd), entry].slice(-PROMPT_STASH_LIMIT)
    await writePromptStash(this.options.cwd, entries)
    return entry
  }

  async popPromptStash(): Promise<PandoPromptStashEntry | undefined> {
    const entries = await readPromptStash(this.options.cwd)
    const entry = entries.at(-1)
    if (!entry) return
    await writePromptStash(this.options.cwd, entries.slice(0, -1))
    return entry
  }

  async removePromptStash(id: string): Promise<void> {
    const entries = await readPromptStash(this.options.cwd)
    await writePromptStash(this.options.cwd, entries.filter(entry => entry.id !== id))
  }

  async readPromptDraft(): Promise<PandoPromptDraft | undefined> {
    return readPromptDraft(this.options.cwd)
  }

  async writePromptDraft(text: string): Promise<void> {
    return writePromptDraft(this.options.cwd, text)
  }

  async clearPromptDraft(): Promise<void> {
    return clearPromptDraft(this.options.cwd)
  }

  async listApprovals(): Promise<StoredApprovalRecord[]> {
    return this.approvalStore.readPending()
  }

  async answerApproval(id: string, decision: StoredApprovalDecision): Promise<StoredApprovalRecord | undefined> {
    return this.approvalStore.resolveApproval(id, { decision, resolvedBy: 'pando-tui' })
  }

  async getMissionOverview(): Promise<Record<string, unknown>> {
    return new MissionControlService({ workspaceRoot: this.options.cwd, cwd: this.options.cwd, sessionId: 'tui-mission' }).getOverview() as unknown as Record<string, unknown>
  }

  async snapshot(): Promise<PandoTuiSnapshot> {
    await this.ensureInitialized()
    const threads = await this.listThreads()
    const activeThreadId = this.activeThreadId ?? threads[0]?.metadata.threadId
    const messages = activeThreadId ? await this.readTuiMessages(activeThreadId) : []
    const mission = await this.getMissionOverview()
    return {
      title: 'Pando TUI',
      activeThreadId,
      threads,
      messages,
      models: await this.listModels(),
      approvals: await this.listApprovals(),
      mission,
      statusLines: this.statusLines(mission),
    }
  }

  close(): void {
    closeMcpConnections(this.mcpConnections)
    this.mcpConnections = []
  }

  private async ensureInitialized(): Promise<void> {
    this.initialized ??= this.initialize()
    await this.initialized
  }

  private async initialize(): Promise<void> {
    const { config } = await loadRuntimeConfig(this.options.cwd, this.options.configPath)
    this.config = applyModelOverride(config, { provider: this.selectedProvider, model: this.selectedModel })
    if (!this.options.fake) {
      const { registry, mcpConnections } = await createRuntimeToolRegistry({
        config: this.config,
        mcp: { sessionId: 'tui-' + Date.now(), emitEvent: event => { this.events.push(event) } },
      })
      this.registry = registry
      this.mcpConnections = mcpConnections
    }
    await this.approvalStore.ensure()
  }

  private currentConfig(): ProjectConfig {
    if (!this.config) return applyModelOverride({}, { provider: this.selectedProvider, model: this.selectedModel })
    return this.config
  }

  private modelOverride(): { provider?: string; name?: string } | undefined {
    if (!this.selectedProvider && !this.selectedModel) return undefined
    return { provider: this.selectedProvider, name: this.selectedModel }
  }

  private async readTuiMessages(threadId: string): Promise<PandoTuiMessage[]> {
    return (await this.threadStore.readMessages(threadId)).map(message => ({ role: message.role as PandoTuiMessage['role'], content: message.content }))
  }

  private async sendFakeMessage(threadId: string | undefined, text: string, options?: PandoTuiSendOptions): Promise<PandoTuiSendResult> {
    const metadata = threadId ? (await this.threadStore.openThread(threadId, 'tui-fake')).metadata : await this.createThread('TUI smoke')
    this.activeThreadId = metadata.threadId
    const finalText = 'Hello from Pando TUI adapter.'
    await options?.onDelta?.(finalText)
    const existing = await this.threadStore.readMessages(metadata.threadId)
    await this.threadStore.writeMessages(metadata.threadId, [
      ...existing,
      { role: 'user', content: text },
      { role: 'assistant', content: finalText },
    ])
    return { threadId: metadata.threadId, finalText, events: [] }
  }

  private statusLines(mission: Record<string, unknown>): string[] {
    const data = typeof mission.data === 'object' && mission.data ? mission.data as Record<string, unknown> : {}
    const gui = typeof data.gui === 'object' && data.gui ? data.gui as Record<string, unknown> : {}
    const gateway = typeof data.gateway === 'object' && data.gateway ? data.gateway as Record<string, unknown> : {}
    const model = typeof data.model === 'object' && data.model ? data.model as Record<string, unknown> : {}
    return [
      'GUI: ' + String(gui.status ?? 'baseline'),
      'Gateway: ' + String(gateway.status ?? 'baseline'),
      'Model: ' + String(model.status ?? 'baseline'),
      'Loop/Context/Cost: Coming from Pando adapter',
    ]
  }
}

export function createPandoTuiAdapter(options: AdapterOptions): PandoTuiRuntimeAdapter {
  return new PandoTuiRuntimeAdapter(options)
}

function applyModelOverride(config: ProjectConfig, override: { provider?: string; model?: string }): ProjectConfig {
  if (!override.provider && !override.model) return config
  return {
    ...config,
    model: {
      ...(config.model ?? {}),
      provider: override.provider ?? config.model?.provider,
      name: override.model ?? (override.provider ? undefined : config.model?.name),
    },
  }
}

async function collectWorkspaceFiles(root: string, dir: string, files: PandoTuiFileMention[], depth: number): Promise<void> {
  if (files.length >= FILE_MENTION_SCAN_LIMIT || depth > FILE_MENTION_MAX_DEPTH) return
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return
  }
  entries.sort((left, right) => left.localeCompare(right))
  for (const name of entries) {
    if (files.length >= FILE_MENTION_SCAN_LIMIT) return
    const fullPath = join(dir, name)
    const info = await stat(fullPath).catch(() => undefined)
    if (!info) continue
    if (info.isDirectory()) {
      if (FILE_MENTION_EXCLUDED_DIRS.has(name)) continue
      await collectWorkspaceFiles(root, fullPath, files, depth + 1)
      continue
    }
    if (!info.isFile()) continue
    if (!isMentionableFile(name)) continue
    const path = relative(root, fullPath).split(sep).join('/')
    if (!path || path.startsWith('..')) continue
    files.push({ path, kind: 'file', mtimeMs: statMtimeMs(info) })
  }
}

function statMtimeMs(value: unknown): number | undefined {
  const mtimeMs = (value as { mtimeMs?: unknown }).mtimeMs
  return typeof mtimeMs === 'number' && Number.isFinite(mtimeMs) ? mtimeMs : undefined
}

async function readPromptStash(root: string): Promise<PandoPromptStashEntry[]> {
  const path = promptStashPath(root)
  const text = await readFile(path, 'utf8').catch(() => '')
  return parsePromptStashJsonl(text)
}

async function writePromptStash(root: string, entries: readonly PandoPromptStashEntry[]): Promise<void> {
  const path = promptStashPath(root)
  await mkdir(join(root, '.pandoshare', 'tui'), { recursive: true })
  const text = entries.length > 0 ? entries.map(entry => JSON.stringify(entry)).join('\n') + '\n' : ''
  await writeFile(path, text, 'utf8')
}

function promptStashPath(root: string): string {
  return join(root, ...PROMPT_STASH_PATH)
}

async function readPromptDraft(root: string): Promise<PandoPromptDraft | undefined> {
  const text = await readFile(promptDraftPath(root), 'utf8').catch(() => '')
  if (!text.trim()) return
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    if (typeof parsed.text !== 'string' || !parsed.text.trim()) return
    const updatedAtMs = typeof parsed.updatedAtMs === 'number' && Number.isFinite(parsed.updatedAtMs) ? parsed.updatedAtMs : Date.now()
    return { text: parsed.text, updatedAtMs }
  } catch {
    return
  }
}

async function writePromptDraft(root: string, text: string): Promise<void> {
  if (!text.trim()) {
    await clearPromptDraft(root)
    return
  }
  await mkdir(join(root, '.pandoshare', 'tui'), { recursive: true })
  await writeFile(promptDraftPath(root), JSON.stringify({ text, updatedAtMs: Date.now() } satisfies PandoPromptDraft) + '\n', 'utf8')
}

async function clearPromptDraft(root: string): Promise<void> {
  await rm(promptDraftPath(root), { force: true })
}

function promptDraftPath(root: string): string {
  return join(root, ...PROMPT_DRAFT_PATH)
}

function parsePromptStashJsonl(text: string): PandoPromptStashEntry[] {
  return text
    .split(/\r?\n/g)
    .map(line => parsePromptStashLine(line))
    .filter((entry): entry is PandoPromptStashEntry => Boolean(entry))
    .slice(-PROMPT_STASH_LIMIT)
}

function parsePromptStashLine(line: string): PandoPromptStashEntry | undefined {
  if (!line.trim()) return
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>
    if (typeof parsed.id !== 'string' || typeof parsed.text !== 'string') return
    const createdAtMs = typeof parsed.createdAtMs === 'number' && Number.isFinite(parsed.createdAtMs) ? parsed.createdAtMs : Date.now()
    return { id: parsed.id, text: parsed.text, createdAtMs }
  } catch {
    return
  }
}

function createPromptStashEntry(text: string): PandoPromptStashEntry {
  return {
    id: 'stash_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    text,
    createdAtMs: Date.now(),
  }
}

function runGitStatusShort(cwd: string): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return runGitCommand(cwd, ['status', '--short', '--untracked-files=all'])
}

function runGitCommand(cwd: string, args: string[]): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise(resolveRun => {
    const child = spawn('git', args, { cwd, windowsHide: true })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      child.kill()
    }, 5000)
    child.stdout?.on('data', chunk => {
      stdout += String(chunk)
      if (stdout.length > 256 * 1024) child.kill()
    })
    child.stderr?.on('data', chunk => {
      stderr += String(chunk)
    })
    child.on('error', error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveRun({ exitCode: 1, stdout, stderr: stderr + String(error.message) })
    })
    child.on('close', exitCode => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveRun({ exitCode, stdout, stderr })
    })
  })
}

function limitWorkspaceDiffText(text: string): { text: string; truncated: boolean } {
  if (text.length <= WORKSPACE_DIFF_CHAR_LIMIT) return { text, truncated: false }
  return { text: text.slice(0, WORKSPACE_DIFF_CHAR_LIMIT) + '\n... diff truncated ...', truncated: true }
}

function safeWorkspacePath(root: string, path: string): string | undefined {
  const resolved = resolve(root, path)
  const relativePath = relative(root, resolved)
  if (!relativePath || relativePath.startsWith('..') || relativePath.includes('..' + sep)) return
  return resolved
}

function parseGitStatusShort(text: string): PandoTuiWorkspaceChange[] {
  return text
    .split(/\r?\n/g)
    .map(line => parseGitStatusShortLine(line))
    .filter((change): change is PandoTuiWorkspaceChange => Boolean(change))
}

function parseGitStatusShortLine(line: string): PandoTuiWorkspaceChange | undefined {
  if (line.length < 4) return
  const staged = line[0] === ' ' ? '' : line[0]
  const unstaged = line[1] === ' ' ? '' : line[1]
  const rawPath = line.slice(3).trim()
  if (!rawPath) return
  const path = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) ?? rawPath : rawPath
  return {
    path: path.split(sep).join('/'),
    status: (staged + unstaged) || 'clean',
    staged,
    unstaged,
  }
}

function isMentionableFile(name: string): boolean {
  if (name === 'package.json' || name === 'tsconfig.json' || name === 'README.md' || name === 'AGENTS.md') return true
  return FILE_MENTION_EXTENSIONS.has(extname(name).toLowerCase())
}
