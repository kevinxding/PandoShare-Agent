import type { AgentEvent } from '../services/events/index.js'
import type { StoredApprovalDecision, StoredApprovalRecord } from '../services/approvalStore/index.js'
import type { ThreadMetadata, ThreadSummary } from '../services/threadStore/index.js'

export type PandoTuiIo = {
  input?: unknown
  output: { write(text: string): void }
  error?: { write(text: string): void }
}

export type PandoTuiOptions = {
  cwd: string
  configPath?: string
  provider?: string
  model?: string
  threadId?: string
  resumeLast?: boolean
  newThread?: boolean
  goalId?: string
  smoke?: boolean
  plain?: boolean
  io: PandoTuiIo
}

export type PandoTuiModel = {
  provider: string
  name?: string
  label: string
  selected: boolean
  status: 'configured' | 'builtin' | 'selected'
}

export type PandoTuiFileMention = {
  path: string
  kind: 'file'
  mtimeMs?: number
}

export type PandoTuiWorkspaceChange = {
  path: string
  status: string
  staged: string
  unstaged: string
}

export type PandoTuiWorkspaceDiff = {
  path: string
  status: string
  kind: 'diff' | 'file' | 'none'
  text: string
  truncated: boolean
}

export type PandoTuiMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'event'
  content: string
}

export type PandoPromptStashEntry = {
  id: string
  text: string
  createdAtMs: number
}

export type PandoPromptDraft = {
  text: string
  updatedAtMs: number
}

export type PandoTuiSendOptions = {
  onDelta?: (delta: string) => void | Promise<void>
  onEvent?: (event: AgentEvent) => void | Promise<void>
}

export type PandoTuiSendResult = {
  threadId?: string
  finalText: string
  events: readonly AgentEvent[]
}

export type PandoTuiSnapshot = {
  title: string
  activeThreadId?: string
  threads: ThreadSummary[]
  messages: PandoTuiMessage[]
  models: PandoTuiModel[]
  approvals: StoredApprovalRecord[]
  mission: Record<string, unknown>
  statusLines: string[]
}

export type PandoTuiAdapter = {
  listThreads(): Promise<ThreadSummary[]>
  createThread(title?: string): Promise<ThreadMetadata>
  resumeThread(threadId: string): Promise<{ metadata: ThreadMetadata; messages: PandoTuiMessage[] }>
  sendMessage(threadId: string | undefined, text: string, options?: PandoTuiSendOptions): Promise<PandoTuiSendResult>
  streamEvents(threadId: string): Promise<AgentEvent[]>
  listModels(): Promise<PandoTuiModel[]>
  selectModel(provider: string, model?: string): Promise<void>
  listWorkspaceFiles(): Promise<PandoTuiFileMention[]>
  listWorkspaceChanges(): Promise<PandoTuiWorkspaceChange[]>
  readWorkspaceChangeDiff(path: string): Promise<PandoTuiWorkspaceDiff>
  listPromptStash(): Promise<PandoPromptStashEntry[]>
  pushPromptStash(text: string): Promise<PandoPromptStashEntry>
  popPromptStash(): Promise<PandoPromptStashEntry | undefined>
  removePromptStash(id: string): Promise<void>
  readPromptDraft(): Promise<PandoPromptDraft | undefined>
  writePromptDraft(text: string): Promise<void>
  clearPromptDraft(): Promise<void>
  listApprovals(): Promise<StoredApprovalRecord[]>
  answerApproval(id: string, decision: StoredApprovalDecision): Promise<StoredApprovalRecord | undefined>
  getMissionOverview(): Promise<Record<string, unknown>>
  snapshot(): Promise<PandoTuiSnapshot>
  close(): void
}
