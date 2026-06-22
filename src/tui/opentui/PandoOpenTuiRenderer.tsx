/** @jsxImportSource #pando-opentui */
import { createCliRenderer } from '@opentui/core'
import { render, testRender, useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/solid'
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { KeyEvent, ScrollBoxRenderable } from '@opentui/core'
import 'opentui-spinner/solid'

import type { StoredApprovalDecision, StoredApprovalRecord } from '../../services/approvalStore/index.js'
import type { AgentEvent } from '../../services/events/index.js'
import type { PandoPromptStashEntry, PandoTuiAdapter, PandoTuiFileMention, PandoTuiIo, PandoTuiMessage, PandoTuiSnapshot, PandoTuiWorkspaceChange, PandoTuiWorkspaceDiff } from '../PandoTuiTypes.js'
import {
  activePandoPromptInputForTest,
  insertNewlineActivePandoPrompt,
  PandoPromptFrame,
  promptFileMentionBaseForTrigger,
  type PandoPromptRef,
  submitActivePandoPrompt,
  submitActivePandoPromptForTest,
} from './PandoPrompt.js'
import { createPandoCommands, PANDO_COMMAND_PALETTE, type PandoCommand } from './PandoCommands.js'
import { PandoCommandPalette } from './PandoCommandPalette.js'
import { deleteDialogFilterBackwardWord, PandoDialogSelect, type PandoDialogSelectOption } from './PandoDialogSelect.js'
import { isPandoKey, pandoKeybindings, pandoKeyLabel, pandoPrimaryKeyLabel } from './PandoKeymap.js'

type PandoOpenTuiRendererOptions = {
  adapter: PandoTuiAdapter
  io: PandoTuiIo
  smoke?: boolean
  startInSession?: boolean
}

type DialogName = 'commands' | 'models' | 'threads' | 'approvals' | 'help' | 'keys' | 'status' | 'events' | 'search' | 'messageActions' | 'userMessages' | 'promptHistory' | 'promptStash' | 'queue' | 'files' | 'changes' | 'changeDetail' | undefined

let lastEnterSubmitAtMs = 0

type PandoToolActivityStatus = 'running' | 'completed' | 'failed'

type PandoToolActivity = {
  toolUseId: string
  toolName: string
  input?: Record<string, unknown>
  label: string
  title: string
  detail?: string
  contentPreview?: string
  status: PandoToolActivityStatus
  startedAtMs: number
  completedAtMs?: number
  durationMs?: number
}

type PandoPatchPreviewRow = {
  kind: 'remove' | 'add'
  oldLineNumber?: string
  newLineNumber?: string
  text: string
}

type PandoPatchPreviewData = {
  path?: string
  hunkHeader: string
  rows: PandoPatchPreviewRow[]
  truncated: boolean
}

type PandoQueuedPrompt = {
  id: string
  text: string
  createdAtMs: number
}

type PandoMarkdownBlock =
  | { kind: 'text'; lines: string[] }
  | { kind: 'code'; language?: string; lines: string[] }

type PandoStatusField = {
  label: string
  value: string
  tone: TuiEventTone
}

type PandoStatusSection = {
  title: string
  subtitle?: string
  tone: TuiEventTone
  fields: PandoStatusField[]
}

type PandoToast = {
  id: string
  title: string
  message?: string
  tone: TuiEventTone
  createdAtMs: number
}

type PandoTuiAppProps = {
  adapter: PandoTuiAdapter
  initialSnapshot: PandoTuiSnapshot
  startInSession: boolean
  smoke?: boolean
  onExit: () => void
}

const thinkingFrames = ['-', '\\', '|', '/']
const revealCharsPerChunk = 10
const revealDelayMs = 8
const revealDelayCharLimit = 4000
const messageScrollPageRows = 12
const maxPromptStashEntries = 20
const promptDraftSaveDelayMs = 250
const toastDurationMs = 2600

const colors = {
  bg: '#050505',
  panel: '#1e1e1e',
  panel2: '#121212',
  border: '#303030',
  accent: '#57a6ff',
  accent2: '#f7b955',
  text: '#e8e8e8',
  muted: '#858585',
  dim: '#5f5f5f',
  danger: '#ff6b6b',
  success: '#60d394',
}

type DataEmitter = {
  on?(event: 'data', handler: (chunk: unknown) => void): void
  off?(event: 'data', handler: (chunk: unknown) => void): void
  removeListener?(event: 'data', handler: (chunk: unknown) => void): void
}

function submitActivePromptFromTerminal(): void {
  const now = Date.now()
  if (now - lastEnterSubmitAtMs < 150) return
  lastEnterSubmitAtMs = now
  submitActivePandoPrompt()
}

function insertNewlineActivePromptFromTerminal(): void {
  insertNewlineActivePandoPrompt()
}

function chunkHasEnter(chunk: unknown): boolean {
  return chunkHasSubmitEnter(chunk)
}

function chunkHasSubmitEnter(chunk: unknown): boolean {
  if (typeof chunk === 'string') return chunk.includes('\r')
  if (chunk instanceof Uint8Array) return chunk.includes(13)
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk).includes(13)
  return false
}

function chunkIsLinefeedOnly(chunk: unknown): boolean {
  if (typeof chunk === 'string') return chunk === '\n'
  if (chunk instanceof Uint8Array) return chunk.length === 1 && chunk[0] === 10
  if (chunk instanceof ArrayBuffer) {
    const bytes = new Uint8Array(chunk)
    return bytes.length === 1 && bytes[0] === 10
  }
  return false
}

export async function runPandoOpenTuiRenderer(options: PandoOpenTuiRendererOptions): Promise<void> {
  const initialSnapshot = await options.adapter.snapshot()
  const startInSession = options.startInSession ?? Boolean(initialSnapshot.activeThreadId && initialSnapshot.messages.length > 0)
  if (options.smoke) {
    const setup = await testRender(() => (
      <PandoTuiApp
        adapter={options.adapter}
        initialSnapshot={initialSnapshot}
        startInSession={startInSession}
        smoke={true}
        onExit={() => undefined}
      />
    ), { width: 118, height: 34 })
    await setup.flush()
    options.io.output.write(setup.captureCharFrame())
    setup.renderer.destroy()
    options.adapter.close()
    return
  }

  const renderer = await createCliRenderer({
    stdin: options.io.input as never,
    stdout: options.io.output as never,
    externalOutputMode: 'passthrough',
    screenMode: 'alternate-screen',
    exitOnCtrlC: false,
    useMouse: true,
    targetFps: 45,
    gatherStats: false,
    autoFocus: true,
    openConsoleOnError: false,
  })

  const terminalInput = options.io.input as unknown as DataEmitter
  const terminalEnterFallback = (chunk: unknown) => {
    if (chunkIsLinefeedOnly(chunk)) {
      insertNewlineActivePromptFromTerminal()
      return
    }
    if (chunkHasSubmitEnter(chunk)) submitActivePromptFromTerminal()
  }
  terminalInput.on?.('data', terminalEnterFallback)

  await new Promise<void>(async resolveExit => {
    let closed = false
    const close = () => {
      if (closed) return
      closed = true
      options.adapter.close()
      if (terminalInput.off) terminalInput.off('data', terminalEnterFallback)
      else terminalInput.removeListener?.('data', terminalEnterFallback)
      if (!renderer.isDestroyed) renderer.destroy()
      resolveExit()
    }
    ;(renderer as unknown as { once(event: string, callback: () => void): void }).once('destroy', close)
    await render(() => (
      <PandoTuiApp
        adapter={options.adapter}
        initialSnapshot={initialSnapshot}
        startInSession={startInSession}
        onExit={close}
      />
    ), renderer)
  })
}

export function PandoTuiApp(props: PandoTuiAppProps) {
  const [activeThreadId, setActiveThreadId] = createSignal(props.initialSnapshot.activeThreadId)
  const [threads, setThreads] = createSignal(props.initialSnapshot.threads)
  const [messages, setMessages] = createSignal<PandoTuiMessage[]>(props.initialSnapshot.messages)
  const [eventMessages, setEventMessages] = createSignal<PandoTuiMessage[]>([])
  const [eventLog, setEventLog] = createSignal<AgentEvent[]>([])
  const [toolActivities, setToolActivities] = createSignal<PandoToolActivity[]>([])
  const [models, setModels] = createSignal(props.initialSnapshot.models)
  const [approvals, setApprovals] = createSignal(props.initialSnapshot.approvals)
  const [mission, setMission] = createSignal(props.initialSnapshot.mission)
  const [statusLines, setStatusLines] = createSignal(props.initialSnapshot.statusLines)
  const [workspaceFiles, setWorkspaceFiles] = createSignal<PandoTuiFileMention[]>([])
  const [workspaceChanges, setWorkspaceChanges] = createSignal<PandoTuiWorkspaceChange[]>([])
  const [selectedWorkspaceChange, setSelectedWorkspaceChange] = createSignal<PandoTuiWorkspaceChange | undefined>(undefined)
  const [workspaceChangeDiff, setWorkspaceChangeDiff] = createSignal<PandoTuiWorkspaceDiff | undefined>(undefined)
  const [busy, setBusy] = createSignal(false)
  const [mode, setMode] = createSignal<'home' | 'session'>(props.startInSession ? 'session' : 'home')
  const [dialog, setDialog] = createSignal<DialogName>(undefined)
  const [showRuntimeDetails, setShowRuntimeDetails] = createSignal(false)
  const [promptRef, setPromptRef] = createSignal<PandoPromptRef | undefined>(undefined)
  const [promptHistory, setPromptHistory] = createSignal(promptHistoryFromMessages(props.initialSnapshot.messages))
  const [promptHistoryCursor, setPromptHistoryCursor] = createSignal(promptHistory().length)
  const [promptStash, setPromptStash] = createSignal<PandoPromptStashEntry[]>([])
  const [promptDraft, setPromptDraft] = createSignal('')
  const [queuedPrompts, setQueuedPrompts] = createSignal<PandoQueuedPrompt[]>([])
  const [toast, setToast] = createSignal<PandoToast | undefined>(undefined)
  let promptDraftSaveTimer: ReturnType<typeof setTimeout> | undefined
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let promptDraftRestored = false
  let promptDraftWarningShown = false
  const selectedModel = createMemo(() => models().find(model => model.selected) ?? models()[0])
  const renderer = useRenderer()
  const commands = createMemo(() => createPandoCommands({
    mode: mode(),
    hasThreads: threads().length > 0,
    hasApprovals: approvals().length > 0,
    hasMessages: messages().length > 0,
    hasAssistantMessages: Boolean(lastAssistantMessageContent(messages())),
    hasUserMessages: Boolean(lastUserMessageEntry(messages())),
    hasPromptHistory: promptHistory().length > 0,
    hasPromptStash: promptStash().length > 0,
    hasQueuedPrompts: queuedPrompts().length > 0,
    hasEvents: eventTimelineEntries(eventLog()).length > 0,
    showRuntimeDetails: showRuntimeDetails(),
    actions: {
      showCommands: () => setDialog('commands'),
      showThreads: () => setDialog('threads'),
      showModels: () => setDialog('models'),
      showApprovals: () => setDialog('approvals'),
      showHelp: () => setDialog('help'),
      showKeys: () => setDialog('keys'),
      showStatus: () => setDialog('status'),
      showEvents: () => setDialog('events'),
      showChanges,
      showSearch: () => setDialog('search'),
      showMessageActions: () => setDialog('messageActions'),
      showUserMessages: () => setDialog('userMessages'),
      showPromptHistory: () => setDialog('promptHistory'),
      showPromptStash: () => setDialog('promptStash'),
      showQueue: () => setDialog('queue'),
      showFiles,
      copyLastAssistant,
      copyTranscript,
      restoreLastUserMessage,
      pasteClipboard,
      stashPrompt,
      popPromptStash,
      toggleRuntimeDetails: () => setShowRuntimeDetails(value => !value),
      newThread,
      exit: props.onExit,
    },
  }))

  function requestTuiRender() {
    if (!renderer.isDestroyed) renderer.requestRender()
  }

  createEffect(() => {
    const ref = promptRef()
    if (!ref || promptDraftRestored) return
    promptDraftRestored = true
    void restorePromptDraft(ref)
  })

  onCleanup(() => {
    if (promptDraftSaveTimer) clearTimeout(promptDraftSaveTimer)
    if (toastTimer) clearTimeout(toastTimer)
  })

  onMount(() => {
    const internal = renderer._internalKeyInput as { onInternal(event: 'keypress', handler: (event: KeyEvent) => void): void; offInternal?: (event: 'keypress', handler: (event: KeyEvent) => void) => void }
    const handler = (event: KeyEvent) => {
      if (!isPlainEnterEvent(event) || dialog()) return
      event.preventDefault()
      event.stopPropagation()
      submitActivePromptFromTerminal()
    }
    internal.onInternal('keypress', handler)
    onCleanup(() => {
      internal.offInternal?.('keypress', handler)
    })
  })

  useKeyboard(event => {
    if (dialog()) {
      if (isPandoKey(event, 'app.exit')) {
        event.preventDefault()
        props.onExit()
      }
      return
    }
    if (isPandoKey(event, 'input.submit')) {
      event.preventDefault()
      submitActivePromptFromTerminal()
      return
    }
    if (isPandoKey(event, 'input.history.prev')) {
      event.preventDefault()
      recallPromptHistory(-1)
      return
    }
    if (isPandoKey(event, 'input.history.next')) {
      event.preventDefault()
      recallPromptHistory(1)
      return
    }
    if (isPandoKey(event, 'app.exit')) {
      event.preventDefault()
      props.onExit()
      return
    }
    if (isPandoKey(event, 'command.palette.show')) {
      event.preventDefault()
      runPandoCommand(commands(), PANDO_COMMAND_PALETTE)
      return
    }
    if (isPandoKey(event, 'keys.show')) {
      event.preventDefault()
      runPandoCommand(commands(), 'keys.show')
      return
    }
    if (isPandoKey(event, 'model.list')) {
      event.preventDefault()
      runPandoCommand(commands(), 'model.list')
      return
    }
    if (isPandoKey(event, 'thread.list')) {
      event.preventDefault()
      runPandoCommand(commands(), 'thread.list')
    }
  })

  onMount(() => {
    void refreshChrome()
    void refreshPromptStash()
    void refreshEvents(activeThreadId())
  })

  async function refreshChrome() {
    const snapshot = await props.adapter.snapshot()
    setThreads(snapshot.threads)
    setModels(snapshot.models)
    setApprovals(snapshot.approvals)
    setMission(snapshot.mission)
    setStatusLines(snapshot.statusLines)
    if (snapshot.activeThreadId) setActiveThreadId(snapshot.activeThreadId)
    if (mode() === 'session' || props.startInSession) setMessages(snapshot.messages)
    requestTuiRender()
  }

  async function refreshPromptStash() {
    try {
      setPromptStash(await props.adapter.listPromptStash())
      requestTuiRender()
    } catch (error) {
      showToast('Prompt stash failed', errorMessage(error), 'warning')
    }
  }

  async function refreshEvents(threadId: string | undefined) {
    if (!threadId) {
      setEventLog([])
      return
    }
    try {
      setEventLog(await props.adapter.streamEvents(threadId))
      requestTuiRender()
    } catch (error) {
      showToast('Events failed', errorMessage(error), 'warning')
    }
  }

  async function restorePromptDraft(ref: PandoPromptRef) {
    try {
      const draft = await props.adapter.readPromptDraft()
      if (!draft?.text || ref.current.trim()) return
      ref.set(draft.text)
      ref.focus()
      setPromptDraft(draft.text)
      setPromptHistoryCursor(promptHistory().length)
      requestTuiRender()
    } catch (error) {
      reportPromptDraftFailure(error)
    }
  }

  function handlePromptChange(text: string) {
    setPromptDraft(text)
    schedulePromptDraftSave(text)
  }

  function schedulePromptDraftSave(text: string) {
    if (promptDraftSaveTimer) clearTimeout(promptDraftSaveTimer)
    promptDraftSaveTimer = setTimeout(() => {
      promptDraftSaveTimer = undefined
      void persistPromptDraft(text)
    }, promptDraftSaveDelayMs)
  }

  async function persistPromptDraft(text: string) {
    try {
      if (text.trim()) await props.adapter.writePromptDraft(text)
      else await props.adapter.clearPromptDraft()
    } catch (error) {
      reportPromptDraftFailure(error)
    }
  }

  function clearPromptDraftNow() {
    if (promptDraftSaveTimer) {
      clearTimeout(promptDraftSaveTimer)
      promptDraftSaveTimer = undefined
    }
    setPromptDraft('')
    void props.adapter.clearPromptDraft().catch(error => reportPromptDraftFailure(error))
  }

  function reportPromptDraftFailure(error: unknown) {
    if (promptDraftWarningShown) return
    promptDraftWarningShown = true
    showToast('Prompt draft failed', errorMessage(error), 'warning')
  }

  function showToast(title: string, message: string | undefined, tone: TuiEventTone) {
    if (toastTimer) clearTimeout(toastTimer)
    setToast({
      id: 'toast_' + Date.now().toString(36),
      title,
      message,
      tone,
      createdAtMs: Date.now(),
    })
    toastTimer = setTimeout(() => {
      toastTimer = undefined
      setToast(undefined)
      requestTuiRender()
    }, toastDurationMs)
    ;(toastTimer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.()
    requestTuiRender()
  }

  function showErrorToast(title: string, error: unknown) {
    showToast(title, errorMessage(error), 'danger')
  }

  function appendPromptHistory(text: string) {
    let nextLength = promptHistory().length
    setPromptHistory(current => {
      const trimmed = text.trim()
      if (!trimmed) return current
      const withoutDuplicateTail = current.at(-1) === trimmed ? current : [...current, trimmed]
      const next = withoutDuplicateTail.slice(-50)
      nextLength = next.length
      return next
    })
    setPromptHistoryCursor(nextLength)
    clearPromptDraftNow()
  }

  function replacePromptHistoryFromMessages(nextMessages: readonly PandoTuiMessage[]) {
    const next = promptHistoryFromMessages(nextMessages)
    setPromptHistory(next)
    setPromptHistoryCursor(next.length)
    setPromptDraft('')
  }

  function recallPromptHistory(direction: -1 | 1) {
    if (busy() || dialog()) return
    const ref = promptRef()
    if (!ref) return
    const history = promptHistory()
    if (!history.length) return
    const cursor = promptHistoryCursor()
    if (cursor === history.length) setPromptDraft(ref.current)
    const nextCursor = Math.max(0, Math.min(history.length, cursor + direction))
    setPromptHistoryCursor(nextCursor)
    ref.set(nextCursor === history.length ? promptDraft() : history[nextCursor] ?? '')
    ref.focus()
    requestTuiRender()
  }

  function selectPromptHistory(text: string) {
    const ref = promptRef()
    if (!ref) return
    ref.set(text)
    ref.focus()
    setPromptDraft(text)
    setPromptHistoryCursor(promptHistory().length)
    requestTuiRender()
  }

  async function stashPrompt() {
    const ref = promptRef()
    if (!ref) return
    const text = ref.current.trim()
    if (!text) {
      showToast('Prompt stash', 'prompt is empty', 'warning')
      return
    }
    const entry = await props.adapter.pushPromptStash(text)
    setPromptStash(current => [...current.filter(item => item.id !== entry.id), entry].slice(-maxPromptStashEntries))
    ref.reset()
    ref.focus()
    clearPromptDraftNow()
    setPromptHistoryCursor(promptHistory().length)
    showToast('Prompt stash', `stashed prompt draft . ${text.length} chars`, 'success')
    requestTuiRender()
  }

  async function popPromptStash() {
    const entry = await props.adapter.popPromptStash()
    if (!entry) {
      showToast('Prompt stash', 'stash is empty', 'warning')
      setPromptStash([])
      return
    }
    setPromptStash(await props.adapter.listPromptStash())
    loadPromptStashEntry(entry)
    showToast('Prompt stash', `restored latest prompt . ${entry.text.length} chars`, 'success')
  }

  async function selectPromptStash(entry: PandoPromptStashEntry) {
    await props.adapter.removePromptStash(entry.id)
    setPromptStash(current => current.filter(item => item.id !== entry.id))
    loadPromptStashEntry(entry)
    showToast('Prompt stash', `restored stashed prompt . ${entry.text.length} chars`, 'success')
  }

  function loadPromptStashEntry(entry: PandoPromptStashEntry) {
    const ref = promptRef()
    if (!ref) return
    ref.set(entry.text)
    ref.focus()
    setPromptDraft(entry.text)
    setPromptHistoryCursor(promptHistory().length)
    setDialog(undefined)
    requestTuiRender()
  }

  async function showFiles() {
    setDialog('files')
    try {
      setWorkspaceFiles(await props.adapter.listWorkspaceFiles())
      requestTuiRender()
    } catch (error) {
      setWorkspaceFiles([])
      showErrorToast('Files failed', error)
    }
  }

  async function showChanges() {
    setDialog('changes')
    setWorkspaceChangeDiff(undefined)
    try {
      setWorkspaceChanges(await props.adapter.listWorkspaceChanges())
      requestTuiRender()
    } catch (error) {
      setWorkspaceChanges([])
      showErrorToast('Changes failed', error)
    }
  }

  async function selectWorkspaceChange(change: PandoTuiWorkspaceChange) {
    setSelectedWorkspaceChange(change)
    setWorkspaceChangeDiff(undefined)
    setDialog('changeDetail')
    requestTuiRender()
    try {
      setWorkspaceChangeDiff(await props.adapter.readWorkspaceChangeDiff(change.path))
      requestTuiRender()
    } catch (error) {
      setWorkspaceChangeDiff({ path: change.path, status: change.status, kind: 'none', text: errorMessage(error), truncated: false })
      showErrorToast('Diff failed', error)
    }
  }

  function selectWorkspaceFile(path: string) {
    const ref = promptRef()
    if (!ref) return
    const next = composePromptWithInsertion(ref.current, '@' + path)
    ref.set(next)
    ref.focus()
    setPromptDraft(next)
    setPromptHistoryCursor(promptHistory().length)
    requestTuiRender()
  }

  async function submitPrompt(value?: string) {
    const text = (value ?? '').trim()
    if (!text) return
    if (runSlashCommandInput(text, commands())) return
    if (busy()) {
      queuePrompt(text)
      return
    }
    await startPrompt(text)
  }

  function queuePrompt(text: string) {
    const entry = createQueuedPrompt(text)
    const nextCount = queuedPrompts().length + 1
    setQueuedPrompts(current => [...current, entry].slice(-20))
    clearPromptDraftNow()
    setPromptHistoryCursor(promptHistory().length)
    showToast('Prompt queued', `${nextCount} queued . ${compactText(text.replace(/\s+/g, ' '), 80)}`, 'info')
    requestTuiRender()
  }

  async function startPrompt(text: string) {
    appendPromptHistory(text)
    setDialog(undefined)
    setBusy(true)
    setMode('session')
    setEventMessages([])
    setToolActivities([])
    setMessages(current => [...current, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    requestTuiRender()

    let streamedText = ''
    let receivedDelta = false
    const appendAssistantDelta = async (delta: string) => {
      if (!delta) return
      receivedDelta = true
      await revealAssistantText(delta, chunk => {
        streamedText += chunk
        setMessages(current => replaceLastAssistantMessage(current, streamedText))
        requestTuiRender()
      })
    }

    try {
      const result = await props.adapter.sendMessage(activeThreadId(), text, {
        onDelta: appendAssistantDelta,
        onEvent: event => {
          setEventLog(current => [...current, event].slice(-400))
          setToolActivities(current => updateToolActivities(current, event))
          const formatted = formatAgentEventMessage(event)
          if (!formatted) return
          const message: PandoTuiMessage = { role: 'event', content: formatted }
          setEventMessages(current => [...current, message].slice(-24))
          requestTuiRender()
        },
      })
      if (result.threadId) setActiveThreadId(result.threadId)
      if (!receivedDelta && result.finalText) {
        await appendAssistantDelta(result.finalText)
      } else if (result.finalText && streamedText !== result.finalText) {
        streamedText = result.finalText
        setMessages(current => replaceLastAssistantMessage(current, result.finalText))
        requestTuiRender()
      }
      await refreshChrome()
      await refreshEvents(result.threadId ?? activeThreadId())
    } catch (error) {
      setMessages(current => replaceLastAssistantMessage(current, 'Error: ' + errorMessage(error)))
      requestTuiRender()
    } finally {
      setBusy(false)
      requestTuiRender()
      startNextQueuedPrompt()
    }
  }

  function startNextQueuedPrompt() {
    if (busy()) return
    const next = takeNextQueuedPrompt()
    if (!next) return
    void startPrompt(next.text)
  }

  function takeNextQueuedPrompt(): PandoQueuedPrompt | undefined {
    let next: PandoQueuedPrompt | undefined
    setQueuedPrompts(current => {
      next = current[0]
      return current.slice(1)
    })
    return next
  }

  function promoteQueuedPrompt(id: string) {
    let selected: PandoQueuedPrompt | undefined
    setQueuedPrompts(current => {
      selected = current.find(prompt => prompt.id === id)
      if (!selected) return current
      return [selected, ...current.filter(prompt => prompt.id !== id)]
    })
    if (selected) showToast('Prompt queue', `moved prompt to front . ${compactText(selected.text.replace(/\s+/g, ' '), 80)}`, 'success')
    setDialog(undefined)
    requestTuiRender()
    startNextQueuedPrompt()
  }

  function removeQueuedPrompt(id: string) {
    let removed: PandoQueuedPrompt | undefined
    setQueuedPrompts(current => {
      removed = current.find(prompt => prompt.id === id)
      return current.filter(prompt => prompt.id !== id)
    })
    if (removed) showToast('Prompt queue', `removed queued prompt . ${compactText(removed.text.replace(/\s+/g, ' '), 80)}`, 'warning')
    setDialog(undefined)
    requestTuiRender()
  }

  function clearQueuedPrompts() {
    const count = queuedPrompts().length
    setQueuedPrompts([])
    if (count > 0) showToast('Prompt queue', `${count} removed`, 'warning')
    setDialog(undefined)
    requestTuiRender()
  }

  async function newThread() {
    const thread = await props.adapter.createThread('Pando TUI chat')
    setActiveThreadId(thread.threadId)
    setMessages([])
    setEventMessages([])
    setEventLog([])
    setToolActivities([])
    setQueuedPrompts([])
    setMode('home')
    setDialog(undefined)
    clearPromptDraftNow()
    requestTuiRender()
    await refreshChrome()
  }

  async function copyLastAssistant() {
    const content = lastAssistantMessageContent(messages())
    if (!content) return
    try {
      await copyTextToClipboard(content)
      showToast('Clipboard', `copied last assistant message . ${content.length} chars`, 'success')
    } catch (error) {
      showErrorToast('Clipboard failed', error)
    }
  }

  async function copyTranscript() {
    const transcript = formatTranscriptMessages(messages())
    if (!transcript) {
      showToast('Transcript', 'current thread has no messages to copy', 'warning')
      return
    }
    try {
      await copyTextToClipboard(transcript)
      showToast('Transcript', `copied session transcript . ${transcript.length} chars`, 'success')
    } catch (error) {
      showErrorToast('Transcript copy failed', error)
    }
  }

  function restoreLastUserMessage() {
    const entry = lastUserMessageEntry(messages())
    if (!entry) {
      showToast('Prompt', 'no previous user message to edit', 'warning')
      return
    }
    restoreUserMessage(entry.message, entry.index)
  }

  function restoreUserMessage(message: PandoTuiMessage, index: number) {
    const ref = promptRef()
    if (!ref) return
    const content = message.content.trim()
    if (!content) {
      showToast('Prompt', 'user message is empty #' + (index + 1), 'warning')
      return
    }
    ref.set(message.content)
    ref.focus()
    setPromptDraft(message.content)
    setPromptHistoryCursor(promptHistory().length)
    setDialog(undefined)
    showToast('Prompt', `loaded user message #${index + 1} . ${message.content.length} chars`, 'success')
    requestTuiRender()
  }

  async function copyMessage(message: PandoTuiMessage, index: number) {
    const content = message.content
    if (!content.trim()) {
      showToast('Clipboard', 'message is empty #' + (index + 1), 'warning')
      return
    }
    try {
      await copyTextToClipboard(content)
      showToast('Clipboard', `copied ${message.role} message #${index + 1} . ${content.length} chars`, 'success')
    } catch (error) {
      showErrorToast('Clipboard failed', error)
    }
  }

  async function copyEvent(event: AgentEvent, index: number) {
    try {
      const text = JSON.stringify(event, null, 2)
      await copyTextToClipboard(text)
      showToast('Event', `copied event #${index + 1} . ${event.type}`, 'success')
    } catch (error) {
      showErrorToast('Event copy failed', error)
    }
  }

  function replacePromptWithMessage(message: PandoTuiMessage, index: number) {
    const ref = promptRef()
    if (!ref) return
    const content = message.content.trim()
    if (!content) {
      showToast('Prompt', 'message is empty #' + (index + 1), 'warning')
      return
    }
    ref.set(content)
    ref.focus()
    setPromptDraft(content)
    setPromptHistoryCursor(promptHistory().length)
    showToast('Prompt', `loaded ${message.role} message #${index + 1} . ${content.length} chars`, 'success')
    requestTuiRender()
  }

  function quoteMessageIntoPrompt(message: PandoTuiMessage, index: number) {
    const ref = promptRef()
    if (!ref) return
    const quote = formatPromptQuote(message, index)
    if (!quote) {
      showToast('Prompt', 'message is empty #' + (index + 1), 'warning')
      return
    }
    const next = composePromptWithBlock(ref.current, quote)
    ref.set(next)
    ref.focus()
    setPromptDraft(next)
    setPromptHistoryCursor(promptHistory().length)
    showToast('Prompt', `quoted ${message.role} message #${index + 1} . ${quote.length} chars`, 'success')
    requestTuiRender()
  }

  async function pasteClipboard() {
    const ref = promptRef()
    if (!ref) return
    try {
      const clipboard = normalizeClipboardText(await readTextFromClipboard())
      if (!clipboard) {
        showToast('Clipboard', 'clipboard is empty', 'warning')
        return
      }
      const next = composePromptWithClipboard(ref.current, clipboard)
      ref.set(next)
      ref.focus()
      setPromptDraft(next)
      setPromptHistoryCursor(promptHistory().length)
      showToast('Clipboard', `pasted text into prompt . ${clipboard.length} chars`, 'success')
    } catch (error) {
      showErrorToast('Clipboard failed', error)
    }
  }

  function appendUiEvent(label: string, title: string, footer: string | undefined, tone: TuiEventTone) {
    const message: PandoTuiMessage = {
      role: 'event',
      content: JSON.stringify({ label, title, footer, tone } satisfies TuiStructuredBlock),
    }
    setEventMessages(current => [...current, message].slice(-24))
    requestTuiRender()
  }

  async function resumeThread(threadId: string) {
    const result = await props.adapter.resumeThread(threadId)
    setActiveThreadId(result.metadata.threadId)
    setMessages(result.messages)
    replacePromptHistoryFromMessages(result.messages)
    setEventMessages([])
    await refreshEvents(result.metadata.threadId)
    setToolActivities([])
    setQueuedPrompts([])
    setMode('session')
    setDialog(undefined)
    requestTuiRender()
    await refreshChrome()
  }

  async function selectModel(provider: string, name?: string) {
    await props.adapter.selectModel(provider, name)
    setDialog(undefined)
    requestTuiRender()
    await refreshChrome()
  }

  async function answerApproval(approvalId: string, decision: StoredApprovalDecision) {
    await props.adapter.answerApproval(approvalId, decision)
    setDialog(undefined)
    requestTuiRender()
    await refreshChrome()
  }

  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={colors.bg}>
      {() => mode() === 'home' ? (
        <PandoHomeView
          submitPrompt={submitPrompt}
          dialogOpen={Boolean(dialog())}
          busy={busy()}
          queuedCount={queuedPrompts().length}
          approvalCount={approvals().length}
          selectedModel={selectedModel()}
          onPromptRef={setPromptRef}
          onPromptChange={handlePromptChange}
          onCommandTrigger={() => setDialog('commands')}
          onFileMentionTrigger={showFiles}
        />
      ) : (
        <PandoSessionView
          messages={messages()}
          eventMessages={eventMessages()}
          toolActivities={toolActivities()}
          showRuntimeDetails={showRuntimeDetails()}
          submitPrompt={submitPrompt}
          dialogOpen={Boolean(dialog())}
          busy={busy()}
          queuedCount={queuedPrompts().length}
          approvalCount={approvals().length}
          approvals={approvals()}
          answerApproval={answerApproval}
          openApprovals={() => setDialog('approvals')}
          selectedModel={selectedModel()}
          activeThreadId={activeThreadId()}
          statusLines={statusLines()}
          onPromptRef={setPromptRef}
          onPromptChange={handlePromptChange}
          onCommandTrigger={() => setDialog('commands')}
          onFileMentionTrigger={showFiles}
        />
      )}
      {() => (
        <PandoFooter
          selectedModel={selectedModel()}
          statusLines={statusLines()}
          approvalCount={approvals().length}
          queuedCount={queuedPrompts().length}
          eventCount={eventTimelineEntries(eventLog()).length}
          showRuntimeDetails={showRuntimeDetails()}
          openStatus={() => setDialog('status')}
          openEvents={() => setDialog('events')}
          openApprovals={() => setDialog('approvals')}
          openQueue={() => setDialog('queue')}
        />
      )}
      {() => dialog() ? (
        <PandoDialogLayer
          dialog={dialog()}
          threads={threads()}
          messages={messages()}
          events={eventLog()}
          promptHistory={promptHistory()}
          promptStash={promptStash()}
          queuedPrompts={queuedPrompts()}
          workspaceFiles={workspaceFiles()}
          workspaceChanges={workspaceChanges()}
          selectedWorkspaceChange={selectedWorkspaceChange()}
          workspaceChangeDiff={workspaceChangeDiff()}
          models={models()}
          approvals={approvals()}
          mission={mission()}
          statusLines={statusLines()}
          copyEvent={copyEvent}
          activeThreadId={activeThreadId()}
          close={() => setDialog(undefined)}
          newThread={newThread}
          resumeThread={resumeThread}
          selectModel={selectModel}
          answerApproval={answerApproval}
          selectPromptHistory={selectPromptHistory}
          selectPromptStash={selectPromptStash}
          promoteQueuedPrompt={promoteQueuedPrompt}
          removeQueuedPrompt={removeQueuedPrompt}
          clearQueuedPrompts={clearQueuedPrompts}
          selectWorkspaceFile={selectWorkspaceFile}
          selectWorkspaceChange={selectWorkspaceChange}
          openChanges={showChanges}
          copyMessage={copyMessage}
          restoreUserMessage={restoreUserMessage}
          replacePromptWithMessage={replacePromptWithMessage}
          quoteMessageIntoPrompt={quoteMessageIntoPrompt}
          exit={props.onExit}
          commands={commands()}
        />
      ) : undefined}
      {() => <PandoToastOverlay toast={toast()} />}
    </box>
  )
}

function PandoHomeView(props: {
  submitPrompt: (value?: string) => void
  dialogOpen: boolean
  busy: boolean
  queuedCount: number
  approvalCount: number
  selectedModel?: { provider: string; name?: string; label: string }
  onPromptRef: (ref: PandoPromptRef | undefined) => void
  onPromptChange: (value: string) => void
  onCommandTrigger: () => void
  onFileMentionTrigger: () => void
}) {
  const dimensions = useTerminalDimensions()
  const promptWidth = createMemo(() => Math.max(68, Math.min(92, Math.floor(dimensions().width * 0.72))))
  return (
    <box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center" paddingX={2}>
      <box height={2} flexShrink={1} />
      <ascii_font text="pando" font="block" color={[colors.dim, colors.text]} />
      <box height={1} />
      <PandoPromptFrame
        width={promptWidth()}
        placeholder={props.busy ? 'Queue next prompt...' : 'Ask anything... "Fix broken tests"'}
        disabledPlaceholder={props.approvalCount > 0 ? approvalPlaceholder(props.approvalCount) : undefined}
        onSubmit={props.submitPrompt}
        dialogOpen={props.dialogOpen}
        disabled={props.approvalCount > 0}
        selectedModel={props.selectedModel}
        colors={colors}
        id="pando-home-prompt-input"
        onRef={props.onPromptRef}
        onChange={props.onPromptChange}
        onCommandTrigger={props.onCommandTrigger}
        onFileMentionTrigger={props.onFileMentionTrigger}
      />
      <box width={promptWidth()} flexDirection="row" justifyContent="flex-end" paddingTop={1}>
        <text fg={colors.muted}>{pandoPrimaryKeyLabel('input.submit')} send   {pandoPrimaryKeyLabel('input.newline')} newline   {pandoPrimaryKeyLabel('input.history.prev')} recall   /prompt-history   {pandoPrimaryKeyLabel('thread.list')} threads   {pandoPrimaryKeyLabel('model.list')} models   {pandoPrimaryKeyLabel('command.palette.show')} commands</text>
      </box>
      <box height={2} />
      <box flexDirection="row">
        <text fg={colors.accent2}>Tip</text>
        <text fg={colors.muted}> Press {pandoPrimaryKeyLabel('model.list')} to quickly switch between configured models</text>
      </box>
      <box flexGrow={1} minHeight={0} />
    </box>
  )
}

function PandoSessionView(props: {
  messages: PandoTuiMessage[]
  eventMessages: PandoTuiMessage[]
  toolActivities: PandoToolActivity[]
  showRuntimeDetails: boolean
  submitPrompt: (value?: string) => void
  dialogOpen: boolean
  busy: boolean
  queuedCount: number
  approvalCount: number
  approvals: PandoTuiSnapshot['approvals']
  answerApproval: (approvalId: string, decision: StoredApprovalDecision) => Promise<void>
  openApprovals: () => void
  selectedModel?: { provider: string; name?: string; label: string }
  activeThreadId?: string
  statusLines: string[]
  onPromptRef: (ref: PandoPromptRef | undefined) => void
  onPromptChange: (value: string) => void
  onCommandTrigger: () => void
  onFileMentionTrigger: () => void
}) {
  let scroll: ScrollBoxRenderable | undefined
  let scrollTimer: ReturnType<typeof setTimeout> | undefined
  const toBottom = () => {
    if (scrollTimer) clearTimeout(scrollTimer)
    scrollTimer = setTimeout(() => scrollToBottom(scroll), 0)
  }
  const splitMessages = createMemo(() => splitMessagesForActivity(props.messages, props.toolActivities.length > 0))

  onMount(toBottom)
  onCleanup(() => {
    if (scrollTimer) clearTimeout(scrollTimer)
  })
  createEffect(() => {
    props.messages.map(message => message.content.length).join(':')
    props.eventMessages.map(message => message.content.length).join(':')
    props.toolActivities.map(activity => `${activity.toolUseId}:${activity.status}:${activity.contentPreview?.length ?? 0}`).join(':')
    props.busy
    toBottom()
  })

  useKeyboard(event => {
    if (props.dialogOpen) return
    if (isPandoKey(event, 'messages.page_up')) {
      event.preventDefault()
      scrollMessageBox(scroll, 'page_up')
      return
    }
    if (isPandoKey(event, 'messages.page_down')) {
      event.preventDefault()
      scrollMessageBox(scroll, 'page_down')
      return
    }
    if (isPandoKey(event, 'messages.line_up')) {
      event.preventDefault()
      scrollMessageBox(scroll, 'line_up')
      return
    }
    if (isPandoKey(event, 'messages.line_down')) {
      event.preventDefault()
      scrollMessageBox(scroll, 'line_down')
      return
    }
    if (isPandoKey(event, 'messages.first')) {
      event.preventDefault()
      scrollMessageBox(scroll, 'first')
      return
    }
    if (isPandoKey(event, 'messages.last')) {
      event.preventDefault()
      scrollMessageBox(scroll, 'last')
    }
  })

  return (
    <box flexGrow={1} minHeight={0} flexDirection="column" paddingX={4} paddingTop={2}>
      <scrollbox
        id="pando-message-scroll"
        ref={(element: ScrollBoxRenderable) => { scroll = element }}
        flexGrow={1}
        stickyScroll={true}
        stickyStart="bottom"
        viewportOptions={{ paddingRight: 1 }}
        verticalScrollbarOptions={{
          visible: true,
          trackOptions: {
            backgroundColor: colors.panel2,
            foregroundColor: colors.border,
          },
        }}
      >
        <box height={1} flexShrink={0} />
        <For each={splitMessages().before}>
          {(message) => <PandoMessageRow message={message} showRuntimeDetails={props.showRuntimeDetails} />}
        </For>
        <PandoToolActivityPanel activities={props.toolActivities} showRuntimeDetails={props.showRuntimeDetails} />
        <For each={props.eventMessages}>
          {(message) => <PandoMessageRow message={message} showRuntimeDetails={props.showRuntimeDetails} />}
        </For>
        <For each={splitMessages().after}>
          {(message) => <PandoMessageRow message={message} showRuntimeDetails={props.showRuntimeDetails} />}
        </For>
        <Show when={props.busy}>
          <PandoThinkingIndicator selectedModel={props.selectedModel} queuedCount={props.queuedCount} />
        </Show>
      </scrollbox>
      <Show when={props.approvals[0]}>
        {(approval) => (
          <PandoApprovalCard
            approval={approval()}
            remainingCount={Math.max(0, props.approvals.length - 1)}
            answerApproval={props.answerApproval}
            openApprovals={props.openApprovals}
          />
        )}
      </Show>
      <PandoPromptFrame
        placeholder={props.busy ? 'Queue next prompt...' : 'Continue the task...'}
        disabledPlaceholder={props.approvalCount > 0 ? approvalPlaceholder(props.approvalCount) : undefined}
        onSubmit={props.submitPrompt}
        dialogOpen={props.dialogOpen}
        disabled={props.approvalCount > 0}
        selectedModel={props.selectedModel}
        colors={colors}
        id="pando-session-prompt-input"
        onRef={props.onPromptRef}
        onChange={props.onPromptChange}
        onCommandTrigger={props.onCommandTrigger}
        onFileMentionTrigger={props.onFileMentionTrigger}
      />
      <box height={1} flexShrink={0} />
    </box>
  )
}

function PandoThinkingIndicator(props: { selectedModel?: { provider: string; name?: string; label: string }; queuedCount?: number }) {
  return (
    <box flexDirection="row" flexShrink={0} gap={1} paddingY={1}>
      <spinner frames={thinkingFrames} interval={80} color={colors.accent} />
      <text fg={colors.muted}>Pando is thinking</text>
      <text fg={colors.dim}> . {modelLabel(props.selectedModel)}</text>
      <Show when={(props.queuedCount ?? 0) > 0}>
        <text fg={colors.accent}> . {props.queuedCount} queued</text>
      </Show>
    </box>
  )
}

function PandoApprovalCard(props: {
  approval: StoredApprovalRecord
  remainingCount: number
  answerApproval: (approvalId: string, decision: StoredApprovalDecision) => Promise<void>
  openApprovals: () => void
}) {
  const request = () => props.approval.request
  const display = createMemo(() => toolDisplayFor(request().toolName, request().toolUse.input))
  const approvalId = () => props.approval.approvalId
  const decide = (decision: StoredApprovalDecision) => {
    void props.answerApproval(approvalId(), decision)
  }
  return (
    <box flexShrink={0} flexDirection="column" backgroundColor={colors.panel} border={['left']} borderColor={colors.accent2} paddingX={2} paddingY={1}>
      <box flexDirection="row" justifyContent="space-between">
        <box flexDirection="row" gap={1}>
          <text fg={colors.accent2}>Permission required</text>
          <text fg={colors.muted}>{request().risk} risk</text>
        </box>
        <Show when={props.remainingCount > 0}>
          <text fg={colors.dim}>+{props.remainingCount} more</text>
        </Show>
      </box>
      <box flexDirection="row" gap={1}>
        <text fg={eventToneColor(display().tone)}>{display().label}</text>
        <text fg={colors.text} wrapMode="word">{display().title}</text>
      </box>
      <Show when={request().reason}>
        <text fg={colors.muted} wrapMode="word">{request().reason}</text>
      </Show>
      <Show when={approvalDetail(props.approval)}>
        <text fg={colors.dim} wrapMode="word">{approvalDetail(props.approval)}</text>
      </Show>
      <box flexDirection="row" gap={2} paddingTop={1}>
        <text fg={colors.accent} onMouseUp={() => decide('approve_once')}>Allow once</text>
        <text fg={colors.accent} onMouseUp={() => decide('approve_always')}>Allow always</text>
        <text fg={colors.danger} onMouseUp={() => decide('reject')}>Reject</text>
        <text fg={colors.muted} onMouseUp={props.openApprovals}>More</text>
      </box>
    </box>
  )
}

function PandoToolActivityPanel(props: { activities: readonly PandoToolActivity[]; showRuntimeDetails: boolean }) {
  return (
    <Show when={props.activities.length > 0}>
      <box flexShrink={0} flexDirection="column" backgroundColor={colors.panel2} border={['left']} borderColor={colors.border} paddingX={2} paddingY={1}>
        <box flexDirection="row" gap={1}>
          <text fg={colors.muted}>Activity</text>
          <text fg={colors.dim}>{props.activities.length} tool{props.activities.length === 1 ? '' : 's'}</text>
        </box>
        <For each={props.activities}>
          {(activity) => (
            <box flexDirection="column" flexShrink={0}>
              <box flexDirection="row" gap={1}>
                <Show when={activity.status === 'running'} fallback={<text fg={toolActivityColor(activity)}>{toolActivityStatusLabel(activity)}</text>}>
                  <spinner frames={thinkingFrames} interval={80} color={toolActivityColor(activity)} />
                </Show>
                <text fg={toolActivityColor(activity)}>{activity.label}</text>
                <text fg={colors.text} wrapMode="word">{activity.title}</text>
                <Show when={activity.durationMs !== undefined}>
                  <text fg={colors.dim}> . {activity.durationMs}ms</text>
                </Show>
              </box>
              <Show when={props.showRuntimeDetails || activity.status === 'failed' || activityShowsPreviewByDefault(activity)}>
                <PandoToolOutputBlock
                  toolName={activity.toolName}
                  input={activity.input}
                  content={activity.contentPreview ?? activity.detail}
                  failed={activity.status === 'failed'}
                />
              </Show>
            </box>
          )}
        </For>
      </box>
    </Show>
  )
}

function PandoToolOutputBlock(props: {
  toolName?: string
  input?: Record<string, unknown>
  content?: string
  failed?: boolean
}) {
  const [expanded, setExpanded] = createSignal(false)
  const command = props.input ? firstString(props.input, ['command', 'cmd', 'script', 'code']) : undefined
  const filePath = props.input ? firstString(props.input, ['path', 'filePath', 'filename', 'targetPath']) : undefined
  const codePreview = createMemo(() => toolCodePreview(props.toolName, props.input, props.content, expanded()))
  const patchPreview = createMemo(() => toolPatchPreview(props.toolName, props.input, expanded()))
  const lines = createMemo(() => collapseOutputLines(props.content ?? '', expanded() ? 60 : 5, expanded() ? 5000 : 420))
  const expandable = createMemo(() => Boolean(
    toolPatchPreview(props.toolName, props.input, false)?.truncated
    || toolCodePreview(props.toolName, props.input, props.content, false)?.truncated
    || collapseOutputLines(props.content ?? '', 5, 420).truncated,
  ))
  const toggleExpanded = () => {
    if (!expandable()) return
    setExpanded(value => !value)
  }
  return (
    <box flexDirection="column" flexShrink={0} border={['left']} borderColor={props.failed ? colors.danger : colors.border} paddingLeft={2} onMouseUp={toggleExpanded}>
      <Show when={filePath}>
        <text fg={colors.dim} wrapMode="word">Path {filePath}</text>
      </Show>
      <Show when={command}>
        <text fg={colors.text} wrapMode="word">$ {command}</text>
      </Show>
      <Show when={patchPreview()}>
        {(patch) => <PandoPatchPreview patch={patch()} filePath={filePath} result={toolResultSummary(props.content)} expanded={expanded()} expandable={expandable()} />}
      </Show>
      <Show when={!patchPreview() && codePreview()}>
        {(preview) => <PandoCodePreview preview={preview()} failed={props.failed} expanded={expanded()} expandable={expandable()} />}
      </Show>
      <Show when={!patchPreview() && !codePreview()}>
        <For each={lines().visible}>
          {line => <text fg={props.failed ? colors.danger : colors.muted} wrapMode="word">{line || ' '}</text>}
        </For>
        <Show when={expandable()}>
          <PandoExpandHint hiddenLineCount={lines().hiddenLineCount} expanded={expanded()} />
        </Show>
      </Show>
    </box>
  )
}

function PandoCodePreview(props: { preview: { lines: string[]; truncated: boolean; hiddenLineCount: number }; failed?: boolean; expanded: boolean; expandable: boolean }) {
  return (
    <box flexDirection="column" flexShrink={0} backgroundColor={colors.panel} paddingLeft={1}>
      <For each={props.preview.lines}>
        {(line, index) => (
          <box flexDirection="row" gap={1}>
            <text fg={colors.dim}>{String(index() + 1).padStart(2, ' ')}</text>
            <text fg={props.failed ? colors.danger : colors.text} wrapMode="word">{line || ' '}</text>
          </box>
        )}
      </For>
      <Show when={props.expandable}>
        <PandoExpandHint hiddenLineCount={props.preview.hiddenLineCount} expanded={props.expanded} />
      </Show>
    </box>
  )
}

function PandoPatchPreview(props: {
  patch: PandoPatchPreviewData
  filePath?: string
  result?: string
  expanded: boolean
  expandable: boolean
}) {
  return (
    <box flexDirection="column" flexShrink={0} backgroundColor={colors.panel} paddingLeft={1}>
      <box flexDirection="row" gap={1}>
        <text fg={colors.accent2}>Patch</text>
        <text fg={colors.muted}>{props.filePath ?? props.patch.path ?? 'workspace file'}</text>
        <Show when={props.result}>
          <text fg={colors.dim}> . {props.result}</text>
        </Show>
      </box>
      <text fg={colors.dim}>{props.patch.hunkHeader}</text>
      <For each={props.patch.rows}>
        {row => (
          <box flexDirection="row" gap={1}>
            <text fg={colors.dim}>{row.oldLineNumber ?? ' '}</text>
            <text fg={colors.dim}>{row.newLineNumber ?? ' '}</text>
            <text fg={row.kind === 'remove' ? colors.danger : colors.success}>{row.kind === 'remove' ? '-' : '+'}</text>
            <text fg={row.kind === 'remove' ? colors.danger : colors.success} wrapMode="word">{row.text || ' '}</text>
          </box>
        )}
      </For>
      <Show when={props.expandable}>
        <PandoExpandHint hiddenLineCount={0} expanded={props.expanded} label={props.patch.truncated ? 'patch preview truncated . ' : undefined} />
      </Show>
    </box>
  )
}

function PandoExpandHint(props: { hiddenLineCount: number; expanded: boolean; label?: string }) {
  return (
    <text fg={colors.dim}>
      {expandHintText(props.hiddenLineCount, props.expanded, props.label)}
    </text>
  )
}

function expandHintText(hiddenLineCount: number, expanded: boolean, label?: string): string {
  const hidden = hiddenLineCount > 0 ? `${hiddenLineCount} more line(s) hidden . ` : ''
  return `${label ?? hidden}${expanded ? 'Click to collapse' : 'Click to expand'}`
}

function PandoMessageRow(props: { message: PandoTuiMessage; showRuntimeDetails: boolean }) {
  if (props.message.role === 'user') {
    return (
      <box flexDirection="column" flexShrink={0} backgroundColor={colors.panel} border={['left']} borderColor={colors.accent} paddingX={2} paddingY={1}>
        <PandoMessageContent message={props.message} />
      </box>
    )
  }

  if (props.message.role === 'event') {
    const block = parseStructuredBlock(props.message.content)
    const showDetail = props.showRuntimeDetails || block.tone === 'danger' || block.tone === 'warning'
    return (
      <box flexDirection="column" flexShrink={0} border={['left']} borderColor={eventToneColor(block.tone)} paddingX={2} paddingY={0}>
        <box flexDirection="row" gap={1}>
          <text fg={eventToneColor(block.tone)}>{block.label}</text>
          <text fg={colors.muted}>{block.title}</text>
          <Show when={block.footer}>
            <text fg={colors.dim}> . {block.footer}</text>
          </Show>
        </box>
        <Show when={showDetail && block.detail}>
          <text fg={colors.muted} wrapMode="word">{block.detail}</text>
        </Show>
      </box>
    )
  }

  if (props.message.role === 'assistant') {
    return (
      <box flexDirection="column" flexShrink={0} gap={0} paddingY={1}>
        <PandoMessageContent message={props.message} />
      </box>
    )
  }

  return (
    <box flexDirection="column" flexShrink={0} border={['left']} borderColor={colors.border} paddingX={2} paddingY={0}>
      <box flexDirection="row" gap={1}>
        <text fg={toolMessageColor(props.message.content)}>{toolMessageLabel(props.message.content)}</text>
        <text fg={colors.muted}>{toolMessageTitle(props.message.content)}</text>
      </box>
      <Show when={props.showRuntimeDetails || toolMessageIsFailure(props.message.content)}>
        <PandoToolOutputBlock
          toolName={parseToolMessage(props.message.content)?.toolName}
          input={parseToolMessage(props.message.content)?.input}
          content={toolMessagePreview(props.message.content)}
          failed={toolMessageIsFailure(props.message.content)}
        />
      </Show>
    </box>
  )
}

function PandoMessageContent(props: { message: PandoTuiMessage }) {
  if (props.message.role === 'assistant') return <PandoAssistantMessageContent content={props.message.content} />
  return (
    <For each={messageLines(props.message.content)}>
      {line => <text fg={props.message.role === 'tool' ? colors.muted : colors.text} wrapMode="word">{line || ' '}</text>}
    </For>
  )
}

function PandoAssistantMessageContent(props: { content: string }) {
  return (
    <For each={messageBlocksFromMarkdown(props.content)}>
      {block => (
        <Show
          when={block.kind === 'code'}
          fallback={
            <For each={block.lines}>
              {line => <text fg={colors.text} wrapMode="word">{line || ' '}</text>}
            </For>
          }
        >
          <PandoMarkdownCodeBlock block={block as Extract<PandoMarkdownBlock, { kind: 'code' }>} />
        </Show>
      )}
    </For>
  )
}

function PandoMarkdownCodeBlock(props: { block: Extract<PandoMarkdownBlock, { kind: 'code' }> }) {
  return (
    <box flexDirection="column" flexShrink={0} backgroundColor={colors.panel} border={['left']} borderColor={colors.border} paddingLeft={1} paddingY={0}>
      <text fg={colors.dim}>{props.block.language ? `code ${props.block.language}` : 'code'}</text>
      <For each={props.block.lines.length ? props.block.lines : ['']}>
        {(line, index) => (
          <box flexDirection="row" gap={1}>
            <text fg={colors.dim}>{String(index() + 1).padStart(2, ' ')}</text>
            <text fg={colors.text} wrapMode="word">{line || ' '}</text>
          </box>
        )}
      </For>
    </box>
  )
}

function toolMessageTitle(content: string): string {
  const parsed = parseToolMessage(content)
  if (parsed?.toolName) return toolDisplayFor(parsed.toolName, parsed.input, parsed.contentPreview ?? parsed.error).title
  if (parsed?.ok !== undefined) return parsed.ok ? 'completed' : 'failed'
  return 'result'
}

function toolMessageLabel(content: string): string {
  const parsed = parseToolMessage(content)
  if (!parsed?.toolName) return parsed?.ok === false ? 'Tool failed' : 'Tool'
  const display = toolDisplayFor(parsed.toolName, parsed.input, parsed.contentPreview ?? parsed.error)
  return parsed.ok === false || parsed.error ? `${display.label} failed` : display.label
}

function toolMessageColor(content: string): string {
  const parsed = parseToolMessage(content)
  if (parsed?.ok === false || parsed?.error) return colors.danger
  if (!parsed?.toolName) return colors.accent
  return eventToneColor(toolDisplayFor(parsed.toolName, parsed.input).tone)
}

function toolMessagePreview(content: string): string {
  const parsed = parseToolMessage(content)
  if (!parsed) return content
  const lines = [
    parsed.ok === undefined ? undefined : parsed.ok ? 'ok: true' : 'ok: false',
    contentFieldFromJson(parsed.contentPreview ?? '') ?? parsed.contentPreview,
    parsed.error,
  ].filter((line): line is string => Boolean(line))
  return lines.join('\n') || content
}

function parseToolMessage(content: string): { toolName?: string; ok?: boolean; contentPreview?: string; error?: string; input?: Record<string, unknown> } | undefined {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    const toolUse = recordValue(parsed.toolUse)
    return {
      toolName: stringValue(parsed.toolName) ?? stringValue(parsed.name),
      ok: typeof parsed.ok === 'boolean' ? parsed.ok : undefined,
      contentPreview: stringValue(parsed.contentPreview) ?? stringValue(parsed.content),
      error: stringValue(parsed.error) ?? stringValue(parsed.message),
      input: recordValue(parsed.input) ?? recordValue(toolUse?.input),
    }
  } catch {
    return undefined
  }
}

function toolMessageIsFailure(content: string): boolean {
  const parsed = parseToolMessage(content)
  return parsed?.ok === false || Boolean(parsed?.error)
}

function updateToolActivities(current: readonly PandoToolActivity[], event: AgentEvent): PandoToolActivity[] {
  if (event.type !== 'tool_call_started' && event.type !== 'tool_call_completed') return [...current]
  const display = toolDisplayFor(event.toolName, event.type === 'tool_call_started' ? event.input : undefined, event.type === 'tool_call_completed' ? event.contentPreview : undefined)
  const existingIndex = current.findIndex(activity => activity.toolUseId === event.toolUseId)
  const existing = existingIndex >= 0 ? current[existingIndex] : undefined
  const nextActivity: PandoToolActivity = event.type === 'tool_call_started'
    ? {
        toolUseId: event.toolUseId,
        toolName: event.toolName,
        input: event.input,
        label: display.label,
        title: display.title,
        detail: display.detail,
        status: 'running',
        startedAtMs: event.createdAtMs,
      }
    : {
        toolUseId: event.toolUseId,
        toolName: event.toolName,
        input: existing?.input,
        label: existing?.label ?? display.label,
        title: existing?.title ?? display.title,
        detail: existing?.detail ?? display.detail,
        contentPreview: event.contentPreview,
        status: event.ok ? 'completed' : 'failed',
        startedAtMs: existing?.startedAtMs ?? event.createdAtMs,
        completedAtMs: event.createdAtMs,
        durationMs: event.durationMs,
      }
  const next = existingIndex >= 0
    ? current.map((activity, index) => index === existingIndex ? nextActivity : activity)
    : [...current, nextActivity]
  return next.slice(-8)
}

function toolActivityColor(activity: PandoToolActivity): string {
  if (activity.status === 'failed') return colors.danger
  if (activity.status === 'completed') return colors.success
  return colors.accent
}

function toolActivityStatusLabel(activity: PandoToolActivity): string {
  switch (activity.status) {
    case 'running':
      return 'run'
    case 'completed':
      return 'done'
    case 'failed':
      return 'fail'
  }
}

function activityShowsPreviewByDefault(activity: PandoToolActivity): boolean {
  const kind = toolDisplayKind(activity.toolName)
  return activity.status === 'completed' && (kind === 'write' || kind === 'edit')
}

function PandoFooter(props: {
  selectedModel?: { provider: string; name?: string; label: string }
  statusLines: string[]
  approvalCount: number
  queuedCount: number
  eventCount: number
  showRuntimeDetails: boolean
  openStatus: () => void
  openEvents: () => void
  openApprovals: () => void
  openQueue: () => void
}) {
  return (
    <box width="100%" flexShrink={0} flexDirection="row" justifyContent="space-between" paddingX={4} paddingBottom={1}>
      <box flexDirection="row">
        <text fg={colors.accent}>Build</text>
        <text fg={colors.muted}> . {compactFooterModelLabel(props.selectedModel)}</text>
      </box>
      <box flexDirection="row" gap={1}>
        <For each={footerStatusFields(props.statusLines)}>
          {field => <PandoFooterStatusBadge field={field} openStatus={props.openStatus} />}
        </For>
        <Show when={props.approvalCount > 0}>
          <text fg={colors.accent2} onMouseUp={props.openApprovals}>
            {props.approvalCount} Approval{props.approvalCount === 1 ? '' : 's'}
          </text>
        </Show>
        <Show when={props.queuedCount > 0}>
          <text fg={colors.accent} onMouseUp={props.openQueue}>
            {props.queuedCount} queued
          </text>
        </Show>
        <Show when={props.eventCount > 0}>
          <text fg={colors.muted} onMouseUp={props.openEvents}>
            {props.eventCount} events
          </text>
        </Show>
        <text fg={props.showRuntimeDetails ? colors.accent2 : colors.dim}>
          det:{props.showRuntimeDetails ? 'on' : 'off'}
        </text>
        <text fg={colors.muted}>{footerShortcutLabel('keys.show')} keys</text>
        <text fg={colors.muted}>{footerShortcutLabel('command.palette.show')} cmd</text>
        <text fg={colors.muted} onMouseUp={props.openStatus}>/status</text>
      </box>
    </box>
  )
}

function PandoFooterStatusBadge(props: { field: PandoStatusField; openStatus: () => void }) {
  return (
    <text fg={eventToneColor(props.field.tone)} onMouseUp={props.openStatus}>
      {shortFooterLabel(props.field.label)}:{shortFooterValue(props.field.value)}
    </text>
  )
}

function PandoToastOverlay(props: { toast?: PandoToast }) {
  const dimensions = useTerminalDimensions()
  return (
    <Show when={props.toast}>
      {(toast) => (
        <box
          position="absolute"
          top={2}
          right={3}
          maxWidth={Math.max(24, Math.min(58, dimensions().width - 8))}
          flexDirection="column"
          backgroundColor={colors.panel}
          border={['left', 'right']}
          borderColor={eventToneColor(toast().tone)}
          paddingX={2}
          paddingY={1}
          zIndex={1200}
        >
          <box flexDirection="row" gap={1}>
            <text fg={eventToneColor(toast().tone)}>{toastToneLabel(toast().tone)}</text>
            <text fg={colors.text}>{toast().title}</text>
          </box>
          <Show when={toast().message}>
            {(message) => <text fg={colors.muted} wrapMode="word" width="100%">{message()}</text>}
          </Show>
        </box>
      )}
    </Show>
  )
}

function PandoDialogLayer(props: {
  dialog: DialogName
  threads: PandoTuiSnapshot['threads']
  messages: readonly PandoTuiMessage[]
  events: readonly AgentEvent[]
  promptHistory: readonly string[]
  promptStash: readonly PandoPromptStashEntry[]
  queuedPrompts: readonly PandoQueuedPrompt[]
  workspaceFiles: readonly PandoTuiFileMention[]
  workspaceChanges: readonly PandoTuiWorkspaceChange[]
  selectedWorkspaceChange?: PandoTuiWorkspaceChange
  workspaceChangeDiff?: PandoTuiWorkspaceDiff
  models: PandoTuiSnapshot['models']
  approvals: PandoTuiSnapshot['approvals']
  mission: PandoTuiSnapshot['mission']
  statusLines: string[]
  copyEvent: (event: AgentEvent, index: number) => void | Promise<void>
  activeThreadId?: string
  close: () => void
  newThread: () => Promise<void>
  resumeThread: (threadId: string) => Promise<void>
  selectModel: (provider: string, name?: string) => Promise<void>
  answerApproval: (approvalId: string, decision: StoredApprovalDecision) => Promise<void>
  selectPromptHistory: (text: string) => void
  selectPromptStash: (entry: PandoPromptStashEntry) => void | Promise<void>
  promoteQueuedPrompt: (id: string) => void
  removeQueuedPrompt: (id: string) => void
  clearQueuedPrompts: () => void
  selectWorkspaceFile: (path: string) => void
  selectWorkspaceChange: (change: PandoTuiWorkspaceChange) => void | Promise<void>
  openChanges: () => void | Promise<void>
  copyMessage: (message: PandoTuiMessage, index: number) => void | Promise<void>
  restoreUserMessage: (message: PandoTuiMessage, index: number) => void
  replacePromptWithMessage: (message: PandoTuiMessage, index: number) => void
  quoteMessageIntoPrompt: (message: PandoTuiMessage, index: number) => void
  exit: () => void
  commands: readonly PandoCommand[]
}) {
  return (
    <Show when={props.dialog}>
      <box position="absolute" top={3} left="18%" width="64%" flexDirection="column" backgroundColor={colors.panel2} border={true} borderColor={colors.border} paddingX={2} paddingY={1} zIndex={1000}>
        <Show when={props.dialog === 'commands'}>
          <PandoCommandPalette commands={props.commands} colors={colors} close={props.close} />
        </Show>
        <Show when={props.dialog === 'models'}>
          <PandoDialogSelect
            title="Models"
            placeholder="Search models..."
            options={modelDialogOptions(props.models, props.selectModel)}
            current={currentModelDialogValue(props.models)}
            colors={colors}
            close={props.close}
          />
        </Show>
        <Show when={props.dialog === 'threads'}>
          <PandoDialogSelect
            title="Threads"
            placeholder="Search threads..."
            options={threadDialogOptions(props.threads, props.activeThreadId, props.newThread, props.resumeThread)}
            current={props.activeThreadId}
            colors={colors}
            close={props.close}
          />
        </Show>
        <Show when={props.dialog === 'approvals'}>
          <PandoDialogSelect
            title="Approvals"
            placeholder="Search approvals..."
            options={approvalDialogOptions(props.approvals, props.answerApproval)}
            colors={colors}
            close={props.close}
          />
        </Show>
        <Show when={props.dialog === 'help'}>
          <PandoDialogSelect
            title="Help"
            placeholder="Search shortcuts..."
            options={helpDialogOptions(props.commands, props.close)}
            colors={colors}
            close={props.close}
          />
        </Show>
        <Show when={props.dialog === 'keys'}>
          <PandoDialogSelect
            title="Keyboard shortcuts"
            placeholder="Search shortcuts..."
            options={keysDialogOptions()}
            colors={colors}
            close={props.close}
          />
        </Show>
        <Show when={props.dialog === 'status'}>
          <PandoStatusDialog mission={props.mission} statusLines={props.statusLines} close={props.close} />
        </Show>
        <Show when={props.dialog === 'events'}>
          <PandoDialogSelect
            title="Event timeline"
            placeholder="Search events..."
            options={eventTimelineDialogOptions(props.events, props.copyEvent)}
            colors={colors}
            close={props.close}
          />
        </Show>
        <Show when={props.dialog === 'search'}>
          <PandoDialogSelect
            title="Search messages"
            placeholder="Search current thread..."
            options={messageSearchDialogOptions(props.messages, props.copyMessage)}
            colors={colors}
            close={props.close}
          />
        </Show>
        <Show when={props.dialog === 'messageActions'}>
          <PandoDialogSelect
            title="Message actions"
            placeholder="Search message actions..."
            options={messageActionDialogOptions(props.messages, {
              copyMessage: props.copyMessage,
              replacePromptWithMessage: props.replacePromptWithMessage,
              quoteMessageIntoPrompt: props.quoteMessageIntoPrompt,
            })}
            colors={colors}
            close={props.close}
          />
        </Show>
        <Show when={props.dialog === 'userMessages'}>
          <PandoDialogSelect
            title="Previous user messages"
            placeholder="Search user messages..."
            options={userMessageDialogOptions(props.messages, props.restoreUserMessage)}
            colors={colors}
            close={props.close}
          />
        </Show>
        <Show when={props.dialog === 'promptHistory'}>
          <PandoDialogSelect
            title="Prompt history"
            placeholder="Search previous prompts..."
            options={promptHistoryDialogOptions(props.promptHistory, props.selectPromptHistory)}
            colors={colors}
            close={props.close}
          />
        </Show>
        <Show when={props.dialog === 'promptStash'}>
          <PandoDialogSelect
            title="Prompt stash"
            placeholder="Search stashed prompts..."
            options={promptStashDialogOptions(props.promptStash, props.selectPromptStash)}
            colors={colors}
            close={props.close}
          />
        </Show>
        <Show when={props.dialog === 'queue'}>
          <PandoDialogSelect
            title="Queued prompts"
            placeholder="Search queued prompts..."
            options={queuedPromptDialogOptions(props.queuedPrompts, props.promoteQueuedPrompt, props.removeQueuedPrompt, props.clearQueuedPrompts)}
            colors={colors}
            close={props.close}
          />
        </Show>
        <Show when={props.dialog === 'files'}>
          <PandoDialogSelect
            title="Files"
            placeholder="Search files..."
            options={fileMentionDialogOptions(props.workspaceFiles, props.selectWorkspaceFile)}
            colors={colors}
            close={props.close}
          />
        </Show>
        <Show when={props.dialog === 'changes'}>
          <PandoDialogSelect
            title="Workspace changes"
            placeholder="Search changed files..."
            options={workspaceChangeDialogOptions(props.workspaceChanges, props.selectWorkspaceChange)}
            colors={colors}
            close={props.close}
          />
        </Show>
        <Show when={props.dialog === 'changeDetail'}>
          <PandoWorkspaceChangeDetail
            change={props.selectedWorkspaceChange}
            diff={props.workspaceChangeDiff}
            insertFile={props.selectWorkspaceFile}
            back={props.openChanges}
            close={props.close}
          />
        </Show>
      </box>
    </Show>
  )
}

function PandoWorkspaceChangeDetail(props: {
  change?: PandoTuiWorkspaceChange
  diff?: PandoTuiWorkspaceDiff
  insertFile: (path: string) => void
  back: () => void | Promise<void>
  close: () => void
}) {
  const dimensions = useTerminalDimensions()
  const maxHeight = createMemo(() => Math.max(8, Math.min(22, Math.floor(dimensions().height * 0.62))))
  const path = createMemo(() => props.change?.path ?? props.diff?.path ?? 'No file selected')
  const status = createMemo(() => props.diff?.status || props.change?.status || '')
  const lines = createMemo(() => {
    const text = props.diff?.text ?? 'Loading diff...'
    return text.split(/\r?\n/g).slice(0, 240)
  })
  const insert = () => {
    const filePath = props.change?.path ?? props.diff?.path
    if (!filePath) return
    props.insertFile(filePath)
    props.close()
  }
  return (
    <>
      <box flexDirection="row" justifyContent="space-between" paddingBottom={1}>
        <box flexDirection="row" gap={1}>
          <text fg={colors.text}>Workspace change</text>
          <text fg={colors.dim}>{status()}</text>
        </box>
        <text fg={colors.muted} onMouseUp={props.close}>{pandoKeyLabel('dialog.close')} close</text>
      </box>
      <box flexDirection="column" backgroundColor={colors.panel} border={['left']} borderColor={colors.accent} paddingX={2} paddingY={1}>
        <box flexDirection="row" gap={1}>
          <text fg={colors.accent}>{path()}</text>
          <Show when={props.diff?.kind}>
            {(kind) => <text fg={colors.dim}> . {kind()}</text>}
          </Show>
          <Show when={props.diff?.truncated}>
            <text fg={colors.accent2}> . truncated</text>
          </Show>
        </box>
        <box flexDirection="row" gap={2} paddingTop={1}>
          <text fg={colors.accent} onMouseUp={insert}>Mention @file</text>
          <text fg={colors.muted} onMouseUp={props.back}>Back to changes</text>
        </box>
      </box>
      <box height={1} />
      <scrollbox
        maxHeight={maxHeight()}
        stickyScroll={false}
        verticalScrollbarOptions={{
          visible: true,
          trackOptions: {
            backgroundColor: colors.panel2,
            foregroundColor: colors.border,
          },
        }}
      >
        <box flexDirection="column" backgroundColor={colors.panel2} paddingX={2} paddingY={1}>
          <For each={lines()}>
            {line => <text fg={workspaceDiffLineColor(line)} wrapMode="word">{line || ' '}</text>}
          </For>
        </box>
      </scrollbox>
      <box height={1} />
      <box flexDirection="row" justifyContent="space-between">
        <text fg={colors.muted}>Select Mention @file to reference this change in the prompt.</text>
        <text fg={colors.muted}>{lines().length} line(s)</text>
      </box>
    </>
  )
}

function PandoStatusDialog(props: {
  mission: PandoTuiSnapshot['mission']
  statusLines: readonly string[]
  close: () => void
}) {
  const dimensions = useTerminalDimensions()
  const sections = createMemo(() => statusCardSections(props.mission, props.statusLines))
  const maxHeight = createMemo(() => Math.max(8, Math.min(22, Math.floor(dimensions().height * 0.62))))
  return (
    <>
      <box flexDirection="row" justifyContent="space-between" paddingBottom={1}>
        <box flexDirection="row" gap={1}>
          <text fg={colors.text}>Status</text>
          <text fg={colors.dim}>Mission Control</text>
        </box>
        <text fg={colors.muted} onMouseUp={props.close}>{pandoKeyLabel('dialog.close')} close</text>
      </box>
      <scrollbox
        maxHeight={maxHeight()}
        stickyScroll={false}
        verticalScrollbarOptions={{
          visible: true,
          trackOptions: {
            backgroundColor: colors.panel2,
            foregroundColor: colors.border,
          },
        }}
      >
        <For each={sections()}>
          {section => (
            <box flexDirection="column" flexShrink={0} backgroundColor={colors.panel} border={['left']} borderColor={eventToneColor(section.tone)} paddingX={2} paddingY={1}>
              <box flexDirection="row" gap={1}>
                <text fg={eventToneColor(section.tone)}>{section.title}</text>
                <Show when={section.subtitle}>
                  <text fg={colors.dim}> . {section.subtitle}</text>
                </Show>
              </box>
              <For each={section.fields}>
                {field => <PandoStatusFieldRow field={field} />}
              </For>
            </box>
          )}
        </For>
      </scrollbox>
      <box height={1} />
      <box flexDirection="row" justifyContent="space-between">
        <text fg={colors.muted}>/status shows runtime, mission, gateway, GUI, model, loop, and cost signals</text>
        <text fg={colors.muted}>{sections().length} section(s)</text>
      </box>
    </>
  )
}

function PandoStatusFieldRow(props: { field: PandoStatusField }) {
  return (
    <box flexDirection="row" gap={1}>
      <text fg={colors.dim}>{props.field.label}</text>
      <text fg={eventToneColor(props.field.tone)} wrapMode="word">{props.field.value || '-'}</text>
    </box>
  )
}

function modelDialogOptions(
  models: PandoTuiSnapshot['models'],
  selectModel: (provider: string, name?: string) => Promise<void>,
): Array<PandoDialogSelectOption<string>> {
  return models.map(model => ({
    title: model.provider,
    value: modelDialogValue(model),
    category: model.status === 'selected' || model.selected ? 'Current' : 'Available',
    description: model.name ?? model.label,
    footer: model.status,
    suggested: model.selected,
    onSelect: () => selectModel(model.provider, model.name),
  }))
}

function modelDialogValue(model: PandoTuiSnapshot['models'][number]): string {
  return model.provider + ':' + (model.name ?? '')
}

function currentModelDialogValue(models: PandoTuiSnapshot['models']): string | undefined {
  const current = models.find(model => model.selected || model.status === 'selected')
  return current ? modelDialogValue(current) : undefined
}

function threadDialogOptions(
  threads: PandoTuiSnapshot['threads'],
  activeThreadId: string | undefined,
  newThread: () => Promise<void>,
  resumeThread: (threadId: string) => Promise<void>,
): Array<PandoDialogSelectOption<string>> {
  return [
    {
      title: '+ New thread',
      value: '__new_thread__',
      category: 'Action',
      description: 'Start a fresh Pando conversation.',
      footer: 'new',
      onSelect: newThread,
    },
    ...threads.slice(0, 25).map(thread => ({
      title: thread.metadata.title,
      value: thread.metadata.threadId,
      category: thread.metadata.threadId === activeThreadId ? 'Current' : 'Recent',
      description: thread.metadata.threadId,
      footer: compactUpdatedAt(thread.metadata.updatedAtMs),
      suggested: thread.metadata.threadId === activeThreadId,
      onSelect: () => resumeThread(thread.metadata.threadId),
    })),
  ]
}

function approvalDialogOptions(
  approvals: readonly StoredApprovalRecord[],
  answerApproval: (approvalId: string, decision: StoredApprovalDecision) => Promise<void>,
): Array<PandoDialogSelectOption<string>> {
  if (approvals.length === 0) {
    return [{
      title: 'No pending approvals',
      value: '__no_pending_approvals__',
      category: 'Status',
      description: 'There are no permission requests waiting for a decision.',
      footer: 'idle',
      disabled: true,
    }]
  }

  return approvals.flatMap(approval => {
    const tool = approval.request.toolName
    const summary = compactApprovalInput(approval)
    const category = `${tool} . ${approval.approvalId}`
    return [
      {
        title: 'Approve once',
        value: approval.approvalId + ':approve_once',
        category,
        description: summary,
        footer: 'this call',
        onSelect: () => answerApproval(approval.approvalId, 'approve_once'),
      },
      {
        title: 'Approve always',
        value: approval.approvalId + ':approve_always',
        category,
        description: summary,
        footer: 'thread',
        onSelect: () => answerApproval(approval.approvalId, 'approve_always'),
      },
      {
        title: 'Reject',
        value: approval.approvalId + ':reject',
        category,
        description: summary,
        footer: 'deny',
        onSelect: () => answerApproval(approval.approvalId, 'reject'),
      },
      {
        title: 'Cancel',
        value: approval.approvalId + ':cancel',
        category,
        description: summary,
        footer: 'skip',
        onSelect: () => answerApproval(approval.approvalId, 'cancel'),
      },
    ]
  })
}

type PandoEventTimelineEntry = {
  event: AgentEvent
  index: number
  block: TuiStructuredBlock
}

function eventTimelineDialogOptions(
  events: readonly AgentEvent[],
  copyEvent: (event: AgentEvent, index: number) => void | Promise<void>,
): Array<PandoDialogSelectOption<string>> {
  const entries = eventTimelineEntries(events)
  if (entries.length === 0) {
    return [{
      title: 'No events yet',
      value: '__no_events__',
      category: 'Status',
      description: 'Run a prompt or resume a thread with recorded events to inspect the timeline.',
      footer: 'idle',
      disabled: true,
    }]
  }

  return entries.map(entry => ({
    title: `${entry.block.label}: ${entry.block.title}`,
    value: entry.event.id,
    category: eventTimelineCategory(entry.event.type),
    description: compactText([entry.block.detail, entry.event.id].filter(Boolean).join(' . '), 220),
    footer: eventTimelineFooter(entry),
    suggested: entry.index === events.length - 1,
    onSelect: () => copyEvent(entry.event, entry.index),
  }))
}

function eventTimelineEntries(events: readonly AgentEvent[]): PandoEventTimelineEntry[] {
  return events
    .map((event, index): PandoEventTimelineEntry | undefined => {
      const block = eventTimelineBlock(event)
      return block ? { event, index, block } : undefined
    })
    .filter((entry): entry is PandoEventTimelineEntry => Boolean(entry))
    .reverse()
}

function eventTimelineBlock(event: AgentEvent): TuiStructuredBlock | undefined {
  if (event.type === 'agent_message_delta') return undefined
  const structured = eventToStructuredBlock(event)
  if (structured) return structured
  switch (event.type) {
    case 'agent_message_completed':
      return { label: 'Assistant', title: 'message completed', detail: event.textPreview, tone: 'success' }
    case 'tool_result':
      {
        const display = toolDisplayFor(event.toolName, undefined, event.contentPreview)
        return {
          label: event.ok ? 'Tool result' : 'Tool failed',
          title: display.title,
          detail: event.contentPreview,
          tone: event.ok ? 'success' : 'danger',
        }
      }
  }
}

function eventTimelineCategory(type: AgentEvent['type']): string {
  if (type.startsWith('run_') || type.startsWith('turn_')) return 'Run'
  if (type.startsWith('model_') || type.startsWith('agent_')) return 'Model'
  if (type.startsWith('tool_')) return 'Tools'
  if (type.startsWith('approval_')) return 'Approvals'
  if (type.startsWith('gui_')) return 'GUI'
  if (type.startsWith('context_') || type.startsWith('compaction_')) return 'Context'
  if (type.startsWith('mcp_')) return 'MCP'
  if (type.startsWith('preflight_')) return 'Preflight'
  return 'Events'
}

function eventTimelineFooter(entry: PandoEventTimelineEntry): string {
  const parts = [
    '#' + (entry.index + 1),
    entry.event.type,
    compactEventTime(entry.event.createdAtMs),
    entry.block.footer,
  ].filter((part): part is string => Boolean(part))
  return compactText(parts.join(' . '), 90)
}

function compactEventTime(value: number | undefined): string | undefined {
  if (!value) return
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return
  return date.toISOString().slice(11, 19)
}

function messageSearchDialogOptions(
  messages: readonly PandoTuiMessage[],
  selectMessage: (message: PandoTuiMessage, index: number) => void | Promise<void>,
): Array<PandoDialogSelectOption<string>> {
  if (messages.length === 0) {
    return [{
      title: 'No messages',
      value: '__no_messages__',
      category: 'Status',
      description: 'The current thread has no searchable messages yet.',
      footer: 'empty',
      disabled: true,
    }]
  }

  return messages.map((message, index) => ({
    title: searchMessageTitle(message, index),
    value: 'message:' + index,
    category: titleCase(message.role),
    description: compactText(trimMessage(message.content).replace(/\n/g, ' '), 180),
    footer: 'copy #' + (index + 1),
    onSelect: () => selectMessage(message, index),
  }))
}

type MessageActionHandlers = {
  copyMessage: (message: PandoTuiMessage, index: number) => void | Promise<void>
  replacePromptWithMessage: (message: PandoTuiMessage, index: number) => void
  quoteMessageIntoPrompt: (message: PandoTuiMessage, index: number) => void
}

function messageActionDialogOptions(
  messages: readonly PandoTuiMessage[],
  actions: MessageActionHandlers,
): Array<PandoDialogSelectOption<string>> {
  const entries = recentMessageEntries(messages, 40)
  if (entries.length === 0) {
    return [{
      title: 'No messages',
      value: '__no_message_actions__',
      category: 'Status',
      description: 'The current thread has no message actions yet.',
      footer: 'empty',
      disabled: true,
    }]
  }

  return entries.flatMap(({ message, index }) => {
    const category = `#${index + 1} ${titleCase(message.role)}`
    const description = compactText(trimMessage(message.content).replace(/\n/g, ' '), 160)
    return [
      {
        title: 'Copy message',
        value: `copy:${index}`,
        category,
        description,
        footer: 'copy',
        onSelect: () => actions.copyMessage(message, index),
      },
      {
        title: 'Use as prompt',
        value: `prompt:${index}`,
        category,
        description,
        footer: 'prompt',
        onSelect: () => actions.replacePromptWithMessage(message, index),
      },
      {
        title: 'Quote into prompt',
        value: `quote:${index}`,
        category,
        description,
        footer: 'quote',
        onSelect: () => actions.quoteMessageIntoPrompt(message, index),
      },
    ]
  })
}

function recentMessageEntries(
  messages: readonly PandoTuiMessage[],
  limit: number,
): Array<{ message: PandoTuiMessage; index: number }> {
  return messages
    .map((message, index) => ({ message, index }))
    .filter(entry => entry.message.content.trim().length > 0)
    .slice(-limit)
    .reverse()
}

function userMessageDialogOptions(
  messages: readonly PandoTuiMessage[],
  restoreUserMessage: (message: PandoTuiMessage, index: number) => void,
): Array<PandoDialogSelectOption<string>> {
  const entries = recentUserMessageEntries(messages, 40)
  if (entries.length === 0) {
    return [{
      title: 'No previous user messages',
      value: '__no_user_messages__',
      category: 'Status',
      description: 'Send a prompt first, then use this picker to edit it.',
      footer: 'empty',
      disabled: true,
    }]
  }

  return entries.map(({ message, index }, position) => ({
    title: compactText(trimMessage(message.content).replace(/\n/g, ' '), 80),
    value: 'user:' + index,
    category: 'Previous user messages',
    description: message.content.includes('\n') ? compactText(trimMessage(message.content), 180) : undefined,
    footer: position === 0 ? 'latest' : '#' + (index + 1),
    onSelect: () => restoreUserMessage(message, index),
  }))
}

function recentUserMessageEntries(
  messages: readonly PandoTuiMessage[],
  limit: number,
): Array<{ message: PandoTuiMessage; index: number }> {
  return messages
    .map((message, index) => ({ message, index }))
    .filter(entry => entry.message.role === 'user' && entry.message.content.trim().length > 0)
    .slice(-limit)
    .reverse()
}

function searchMessageTitle(message: PandoTuiMessage, index: number): string {
  const firstLine = messageLines(message.content)[0] ?? ''
  const preview = compactText(firstLine || message.role, 54)
  return `${index + 1}. ${preview}`
}

function promptHistoryDialogOptions(
  history: readonly string[],
  selectPrompt: (text: string) => void,
): Array<PandoDialogSelectOption<string>> {
  if (history.length === 0) {
    return [{
      title: 'No prompt history',
      value: '__no_prompt_history__',
      category: 'Status',
      description: 'Submit a prompt first, then reuse it from here.',
      footer: 'empty',
      disabled: true,
    }]
  }

  const newestFirst = [...history].reverse()
  return newestFirst.map((prompt, index) => ({
    title: compactText(prompt.replace(/\s+/g, ' '), 80),
    value: 'prompt:' + index,
    category: 'Recent prompts',
    description: prompt.includes('\n') ? compactText(prompt, 180) : undefined,
    footer: index === 0 ? 'latest' : `${index + 1}`,
    onSelect: () => selectPrompt(prompt),
  }))
}

function promptStashDialogOptions(
  stash: readonly PandoPromptStashEntry[],
  selectPrompt: (entry: PandoPromptStashEntry) => void | Promise<void>,
): Array<PandoDialogSelectOption<string>> {
  if (stash.length === 0) {
    return [{
      title: 'No stashed prompts',
      value: '__no_prompt_stash__',
      category: 'Status',
      description: 'Use /stash to save the current prompt draft.',
      footer: 'empty',
      disabled: true,
    }]
  }

  return [...stash].reverse().map((entry, index) => ({
    title: compactText(entry.text.replace(/\s+/g, ' '), 80),
    value: entry.id,
    category: 'Stashed prompts',
    description: entry.text.includes('\n') ? compactText(entry.text, 180) : undefined,
    footer: index === 0 ? 'latest' : `${index + 1}`,
    onSelect: () => selectPrompt(entry),
  }))
}

function queuedPromptDialogOptions(
  queued: readonly PandoQueuedPrompt[],
  promotePrompt: (id: string) => void,
  removePrompt: (id: string) => void,
  clearPrompts: () => void,
): Array<PandoDialogSelectOption<string>> {
  if (queued.length === 0) {
    return [{
      title: 'No queued prompts',
      value: '__no_queued_prompts__',
      category: 'Status',
      description: 'Type while Pando is answering to queue the next prompt.',
      footer: 'idle',
      disabled: true,
    }]
  }

  return [
    {
      title: 'Clear queued prompts',
      value: '__clear_queued_prompts__',
      category: 'Action',
      description: `${queued.length} prompt${queued.length === 1 ? '' : 's'} will be removed from the queue.`,
      footer: 'clear',
      onSelect: clearPrompts,
    },
    ...queued.flatMap((prompt, index) => {
      const description = compactText(prompt.text.replace(/\s+/g, ' '), 180)
      const category = `#${index + 1} queued`
      return [
        {
          title: 'Send next',
          value: `promote:${prompt.id}`,
          category,
          description,
          footer: index === 0 ? 'next' : 'prioritize',
          onSelect: () => promotePrompt(prompt.id),
        },
        {
          title: 'Remove',
          value: `remove:${prompt.id}`,
          category,
          description,
          footer: 'remove',
          onSelect: () => removePrompt(prompt.id),
        },
      ]
    }),
  ]
}

function createPromptStashEntry(text: string): PandoPromptStashEntry {
  return {
    id: 'stash_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    text,
    createdAtMs: Date.now(),
  }
}

function createQueuedPrompt(text: string): PandoQueuedPrompt {
  return {
    id: 'queue_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    text,
    createdAtMs: Date.now(),
  }
}

function fileMentionDialogOptions(
  files: readonly PandoTuiFileMention[],
  selectFile: (path: string) => void,
): Array<PandoDialogSelectOption<string>> {
  if (files.length === 0) {
    return [{
      title: 'No files found',
      value: '__no_files__',
      category: 'Status',
      description: 'No mentionable workspace files were found yet.',
      footer: 'empty',
      disabled: true,
    }]
  }

  const recent = recentFileMentions(files, 8)
  return [
    ...recent.map(file => fileMentionOption(file, 'Recent files', 'recent:' + file.path, selectFile)),
    ...files.map(file => fileMentionOption(file, fileMentionCategory(file.path), file.path, selectFile)),
  ]
}

function fileMentionOption(
  file: PandoTuiFileMention,
  category: string,
  value: string,
  selectFile: (path: string) => void,
): PandoDialogSelectOption<string> {
  return {
    title: file.path.split('/').at(-1) ?? file.path,
    value,
    category,
    description: '@' + file.path,
    footer: category === 'Recent files' ? 'recent' : file.kind,
    onSelect: () => selectFile(file.path),
  }
}

function workspaceChangeDialogOptions(
  changes: readonly PandoTuiWorkspaceChange[],
  selectChange: (change: PandoTuiWorkspaceChange) => void | Promise<void>,
): Array<PandoDialogSelectOption<string>> {
  if (changes.length === 0) {
    return [{
      title: 'No workspace changes',
      value: '__no_workspace_changes__',
      category: 'Status',
      description: 'git status is clean or no Git repository was available.',
      footer: 'clean',
      disabled: true,
    }]
  }

  return changes.map(change => ({
    title: change.path.split('/').at(-1) ?? change.path,
    value: change.path,
    category: workspaceChangeCategory(change),
    description: '@' + change.path,
    footer: workspaceChangeStatusLabel(change),
    onSelect: () => selectChange(change),
  }))
}

function workspaceChangeCategory(change: PandoTuiWorkspaceChange): string {
  if (change.status === '??') return 'Untracked'
  if (change.staged && change.unstaged) return 'Staged and unstaged'
  if (change.staged) return 'Staged'
  if (change.unstaged) return 'Modified'
  return 'Changed'
}

function workspaceChangeStatusLabel(change: PandoTuiWorkspaceChange): string {
  const parts = [
    change.staged ? 'index ' + change.staged : undefined,
    change.unstaged ? 'worktree ' + change.unstaged : undefined,
  ].filter((part): part is string => Boolean(part))
  return parts.join(' . ') || change.status
}

function workspaceDiffLineColor(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return colors.dim
  if (line.startsWith('+')) return colors.success
  if (line.startsWith('-')) return colors.danger
  if (line.startsWith('@@')) return colors.accent2
  if (line.startsWith('diff ') || line.startsWith('index ')) return colors.muted
  return colors.text
}

function recentFileMentions(
  files: readonly PandoTuiFileMention[],
  limit: number,
): PandoTuiFileMention[] {
  return [...files]
    .sort((left, right) => (right.mtimeMs ?? 0) - (left.mtimeMs ?? 0) || left.path.localeCompare(right.path))
    .slice(0, limit)
}

function fileMentionCategory(path: string): string {
  const index = path.lastIndexOf('/')
  return index > 0 ? path.slice(0, index) : 'Workspace root'
}

function helpDialogOptions(
  commands: readonly PandoCommand[] = [],
  close: () => void = () => undefined,
): Array<PandoDialogSelectOption<string>> {
  const shortcutOptions: Array<PandoDialogSelectOption<string>> = Object.entries(pandoKeybindings).map(([name, binding]) => ({
    title: binding.description,
    value: 'key:' + name,
    category: helpCategory(name),
    description: name,
    footer: pandoKeyLabel(name as keyof typeof pandoKeybindings),
    disabled: true,
  }))

  const slashOptions: Array<PandoDialogSelectOption<string>> = commands
    .filter(command => command.hidden !== true && command.slashName)
    .map(command => ({
      title: command.title,
      value: 'command:' + command.name,
      category: 'Slash commands',
      description: command.description,
      footer: slashCommandHelpFooter(command),
      disabled: command.enabled === false,
      onSelect: () => {
        close()
        void command.run()
      },
    }))

  return [
    {
      title: 'Pando TUI help',
      value: '__help_summary__',
      category: 'Overview',
      description: 'Search shortcuts and slash commands. Use /keys for the focused shortcut reference.',
      footer: pandoPrimaryKeyLabel('command.palette.show') + ' commands',
      disabled: true,
    },
    ...slashOptions,
    ...shortcutOptions,
  ]
}

function keysDialogOptions(): Array<PandoDialogSelectOption<string>> {
  return Object.entries(pandoKeybindings).map(([name, binding]) => ({
    title: binding.description,
    value: 'key:' + name,
    category: helpCategory(name),
    description: name,
    footer: pandoKeyLabel(name as keyof typeof pandoKeybindings),
    disabled: true,
  }))
}

function helpCategory(name: string): string {
  if (name.startsWith('input.')) return 'Input'
  if (name.startsWith('dialog.')) return 'Dialog'
  if (name.startsWith('messages.')) return 'Messages'
  if (name.startsWith('thread.')) return 'Session'
  if (name.startsWith('model.')) return 'Agent'
  if (name.startsWith('command.')) return 'System'
  if (name.startsWith('keys.')) return 'System'
  if (name.startsWith('app.')) return 'System'
  return 'Pando'
}

function slashCommandHelpFooter(command: PandoCommand): string {
  const aliases = command.slashAliases?.length ? ' /' + command.slashAliases.join(' /') : ''
  return '/' + command.slashName + aliases
}

type TuiEventTone = 'info' | 'success' | 'warning' | 'danger'

type TuiStructuredBlock = {
  label: string
  title: string
  detail?: string
  footer?: string
  tone: TuiEventTone
}

type ToolDisplayKind = 'shell' | 'read' | 'write' | 'edit' | 'gui' | 'web' | 'mcp' | 'task' | 'search' | 'generic'

type ToolDisplay = {
  kind: ToolDisplayKind
  label: string
  title: string
  detail?: string
  tone: TuiEventTone
}

function formatAgentEventMessage(event: AgentEvent): string | undefined {
  const block = eventToStructuredBlock(event)
  return block ? JSON.stringify(block) : undefined
}

function toolDisplayFor(toolName: string, input?: Record<string, unknown>, contentPreview?: string): ToolDisplay {
  const kind = toolDisplayKind(toolName)
  const label = toolDisplayLabel(kind)
  const title = toolDisplayTitle(kind, toolName, input, contentPreview)
  return {
    kind,
    label,
    title,
    detail: toolDisplayDetail(input),
    tone: toolDisplayTone(kind),
  }
}

function toolDisplayKind(toolName: string): ToolDisplayKind {
  const name = toolName.toLowerCase()
  if (name.startsWith('mcp__') || name.includes('mcp_resource')) return 'mcp'
  if (name.includes('gui') || name.includes('visual') || name.includes('windows')) return 'gui'
  if (name.includes('web_search') || name.includes('web_fetch') || name === 'web' || name.includes('browser')) return 'web'
  if (name.includes('tool_search') || name === 'glob' || name.includes('grep') || name.includes('search')) return 'search'
  if (name.includes('apply_patch') || name.includes('edit') || name.includes('patch')) return 'edit'
  if (name.includes('file_write') || name.includes('write_file') || name.includes('create_file') || name.includes('write')) return 'write'
  if (name.includes('file_read') || name.includes('read_file') || name === 'read' || name.includes('read')) return 'read'
  if (name.includes('shell') || name.includes('bash') || name.includes('powershell') || name.includes('command') || name === 'repl') return 'shell'
  if (name.startsWith('task_') || name.includes('todo') || name.includes('goal') || name.includes('schedule') || name.includes('remote_trigger') || name.includes('send_message')) return 'task'
  return 'generic'
}

function toolDisplayLabel(kind: ToolDisplayKind): string {
  switch (kind) {
    case 'shell':
      return 'Shell'
    case 'read':
      return 'Read'
    case 'write':
      return 'Write'
    case 'edit':
      return 'Edit'
    case 'gui':
      return 'GUI'
    case 'web':
      return 'Web'
    case 'mcp':
      return 'MCP'
    case 'task':
      return 'Task'
    case 'search':
      return 'Search'
    case 'generic':
      return 'Tool'
  }
}

function toolDisplayTone(kind: ToolDisplayKind): TuiEventTone {
  switch (kind) {
    case 'write':
    case 'edit':
    case 'gui':
      return 'warning'
    case 'shell':
    case 'web':
    case 'mcp':
    case 'search':
    case 'read':
    case 'task':
    case 'generic':
      return 'info'
  }
}

function toolDisplayTitle(kind: ToolDisplayKind, toolName: string, input?: Record<string, unknown>, contentPreview?: string): string {
  const fromInput = toolTitleFromInput(kind, input)
  if (fromInput) return compactText(fromInput, 100)
  if (contentPreview) return compactText(contentPreview, 100)
  if (kind === 'mcp') return compactMcpToolName(toolName)
  return toolName
}

function toolTitleFromInput(kind: ToolDisplayKind, input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return
  switch (kind) {
    case 'shell':
      return firstString(input, ['command', 'cmd', 'script', 'code'])
    case 'read':
    case 'write':
    case 'edit':
      return firstString(input, ['path', 'filePath', 'filename', 'targetPath', 'cwd'])
    case 'web':
      return firstString(input, ['url', 'query', 'q'])
    case 'search':
      return firstString(input, ['query', 'q', 'pattern', 'glob'])
    case 'gui': {
      const action = firstString(input, ['action'])
      const target = firstString(input, ['target', 'text', 'keys'])
      if (action && target) return `${action} ${target}`
      return action ?? target
    }
    case 'task':
      return firstString(input, ['title', 'goal', 'objective', 'message', 'threadId'])
    case 'mcp':
    case 'generic':
      return firstString(input, ['name', 'toolName', 'query', 'path', 'command', 'action'])
  }
}

function toolDisplayDetail(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return
  const text = JSON.stringify(input)
  if (!text || text === '{}') return
  return compactText(text, 220)
}

function firstString(input: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = stringValue(input[key])
    if (value?.trim()) return value.trim()
  }
}

function compactMcpToolName(toolName: string): string {
  const parts = toolName.split('__')
  if (parts.length >= 3) return `${parts[1]}/${parts.slice(2).join('__')}`
  return toolName
}

function eventToStructuredBlock(event: AgentEvent): TuiStructuredBlock | undefined {
  switch (event.type) {
    case 'agent_message_delta':
    case 'agent_message_completed':
    case 'tool_result':
      return undefined
    case 'model_request_started':
      return {
        label: 'Model',
        title: `${event.provider}/${event.model}`,
        detail: `round ${event.round}, ${event.toolCount} tool(s) available`,
        tone: 'info',
      }
    case 'model_response_completed':
      return {
        label: 'Model',
        title: event.toolCalls.length ? `requested ${event.toolCalls.length} tool call(s)` : 'response completed',
        detail: event.textPreview,
        footer: `round ${event.round}`,
        tone: 'success',
      }
    case 'model_retry_scheduled':
      return {
        label: 'Retry',
        title: `${event.provider}/${event.model}`,
        detail: `${event.category}: ${event.message}`,
        footer: `${event.nextAttempt}/${event.maxRetries} in ${event.delayMs}ms`,
        tone: 'warning',
      }
    case 'tool_call_started':
      {
        const display = toolDisplayFor(event.toolName, event.input)
        return {
          label: display.label,
          title: display.title,
          detail: undefined,
          footer: event.safety,
          tone: display.tone,
        }
      }
    case 'tool_call_completed':
      {
        const display = toolDisplayFor(event.toolName, undefined, event.contentPreview)
        return {
          label: event.ok ? display.label : `${display.label} failed`,
          title: display.title,
          detail: event.contentPreview,
          footer: event.durationMs + 'ms',
          tone: event.ok ? 'success' : 'danger',
        }
      }
    case 'approval_requested':
      return {
        label: 'Approval',
        title: event.toolName,
        detail: event.reason,
        footer: event.risk,
        tone: 'warning',
      }
    case 'approval_completed':
      return {
        label: 'Approval',
        title: event.toolName,
        detail: event.reason,
        footer: event.approved ? 'approved' : 'denied',
        tone: event.approved ? 'success' : 'danger',
      }
    case 'gui_action_started':
      return {
        label: 'GUI',
        title: event.action,
        detail: event.target,
        tone: 'info',
      }
    case 'gui_action_completed':
      return {
        label: event.ok ? 'GUI' : 'GUI failed',
        title: event.method,
        detail: event.message,
        footer: event.fallbackUsed ? 'fallback' : undefined,
        tone: event.ok ? 'success' : 'danger',
      }
    case 'gui_action_failed':
      return {
        label: 'GUI failed',
        title: event.method,
        detail: event.message,
        footer: event.failureClass,
        tone: 'danger',
      }
    case 'gui_action_verified':
      return {
        label: 'GUI verify',
        title: event.ok ? 'verified' : 'verification failed',
        detail: event.message,
        tone: event.ok ? 'success' : 'danger',
      }
    case 'context_built':
      return {
        label: 'Context',
        title: `${event.retainedMessageCount}/${event.sourceMessageCount} messages retained`,
        detail: `dropped ${event.droppedMessageCount}, estimated ${event.estimatedChars} chars`,
        footer: event.compactionSummaryIncluded ? 'compacted' : undefined,
        tone: event.droppedMessageCount > 0 ? 'warning' : 'info',
      }
    case 'compaction_started':
      return {
        label: 'Compact',
        title: event.reason,
        detail: `window ${event.windowId}, ${event.sourceMessageCount} source message(s)`,
        footer: event.phase,
        tone: 'warning',
      }
    case 'compaction_completed':
      return {
        label: 'Compact',
        title: `covered ${event.coveredMessageCount} message(s)`,
        detail: `retained ${event.retainedMessageCount}, summary ${event.summaryChars} chars`,
        footer: `window ${event.windowId}`,
        tone: 'success',
      }
    case 'compaction_failed':
      return {
        label: 'Compact failed',
        title: event.compactionId,
        detail: event.message,
        footer: `window ${event.windowId}`,
        tone: 'danger',
      }
    case 'mcp_server_started':
      return { label: 'MCP', title: event.serverName, detail: event.command, tone: 'info' }
    case 'mcp_server_connected':
      return { label: 'MCP', title: event.serverName, footer: `${event.toolCount} tools`, tone: 'success' }
    case 'mcp_server_failed':
      return { label: 'MCP failed', title: event.serverName, detail: event.message, tone: 'danger' }
    case 'run_started':
      return { label: 'Run', title: event.runId, detail: event.promptPreview, tone: 'info' }
    case 'run_completed':
      return {
        label: 'Run',
        title: 'completed',
        detail: event.finalTextPreview,
        footer: `${event.durationMs}ms`,
        tone: 'success',
      }
    case 'run_failed':
      return { label: 'Run failed', title: event.runId, detail: event.message, footer: `${event.durationMs}ms`, tone: 'danger' }
    case 'turn_started':
      return { label: 'Turn', title: 'started', detail: event.promptPreview, tone: 'info' }
    case 'turn_completed':
      return { label: 'Turn', title: 'completed', detail: event.finalTextPreview, footer: `${event.durationMs}ms`, tone: 'success' }
    case 'turn_failed':
      return { label: 'Turn failed', title: event.message, footer: `${event.durationMs}ms`, tone: 'danger' }
    case 'tool_loop_stopped':
      return { label: 'Tool loop', title: 'stopped', detail: event.message, footer: `${event.maxToolRounds} rounds`, tone: 'warning' }
    case 'preflight_started':
      return { label: 'Preflight', title: 'started', detail: event.cwd, tone: 'info' }
    case 'preflight_completed':
      return {
        label: 'Preflight',
        title: event.ok ? 'completed' : 'failed checks',
        detail: event.failedCheckIds.join(', '),
        tone: event.ok ? 'success' : 'warning',
      }
    case 'preflight_failed':
      return { label: 'Preflight failed', title: event.message, tone: 'danger' }
  }
}

function parseStructuredBlock(content: string): TuiStructuredBlock {
  try {
    const parsed = JSON.parse(content) as Partial<TuiStructuredBlock>
    if (typeof parsed.label === 'string' && typeof parsed.title === 'string') {
      return {
        label: parsed.label,
        title: parsed.title,
        detail: typeof parsed.detail === 'string' ? compactText(parsed.detail, 180) : undefined,
        footer: typeof parsed.footer === 'string' ? parsed.footer : undefined,
        tone: isTuiEventTone(parsed.tone) ? parsed.tone : 'info',
      }
    }
  } catch {
    // Fall through to a generic event block.
  }
  return { label: 'Event', title: compactText(content, 120), tone: 'info' }
}

function isTuiEventTone(value: unknown): value is TuiEventTone {
  return value === 'info' || value === 'success' || value === 'warning' || value === 'danger'
}

function eventToneColor(tone: TuiEventTone): string {
  switch (tone) {
    case 'success':
      return colors.success
    case 'warning':
      return colors.accent2
    case 'danger':
      return colors.danger
    case 'info':
      return colors.accent
  }
}

function toastToneLabel(tone: TuiEventTone): string {
  switch (tone) {
    case 'success':
      return 'ok'
    case 'warning':
      return 'warn'
    case 'danger':
      return 'err'
    case 'info':
      return 'info'
  }
}

function statusCardSections(
  mission: Record<string, unknown>,
  statusLines: readonly string[],
): PandoStatusSection[] {
  const sections: PandoStatusSection[] = []
  const root = recordValue(mission) ?? {}
  const summaryFields = statusLines.map(statusLineField)
  if (summaryFields.length > 0) {
    sections.push({
      title: 'Summary',
      subtitle: 'runtime at a glance',
      tone: summaryFields.some(field => field.tone === 'danger') ? 'danger' : summaryFields.some(field => field.tone === 'warning') ? 'warning' : 'info',
      fields: summaryFields,
    })
  }

  const missionFields: PandoStatusField[] = []
  addStatusField(missionFields, 'ok', root.ok)
  addStatusField(missionFields, 'requestId', root.requestId)
  const eventIds = Array.isArray(root.eventIds) ? root.eventIds : []
  if (eventIds.length > 0) addStatusField(missionFields, 'eventIds', eventIds)
  if (missionFields.length > 0) {
    sections.push({
      title: 'Mission',
      subtitle: 'current control plane',
      tone: root.ok === false ? 'danger' : root.ok === true ? 'success' : 'info',
      fields: missionFields,
    })
  }

  const warnings = Array.isArray(root.warnings) ? root.warnings : []
  if (warnings.length > 0) {
    sections.push({
      title: 'Warnings',
      tone: 'warning',
      fields: warnings.map((warning, index) => ({
        label: 'warning ' + (index + 1),
        value: compactMissionValue(warning),
        tone: 'warning',
      })),
    })
  }

  const data = recordValue(root.data) ?? {}
  const preferred = ['health', 'gui', 'gateway', 'model', 'loop', 'context', 'cost', 'approvals', 'replay', 'durable', 'agent', 'workspace']
  const seen = new Set<string>()
  for (const key of preferred) {
    if (key in data) {
      addStatusSection(sections, key, data[key])
      seen.add(key)
    }
  }
  for (const [key, value] of Object.entries(data)) {
    if (!seen.has(key)) addStatusSection(sections, key, value)
  }

  return sections.length > 0 ? sections : [{
    title: 'Status unavailable',
    tone: 'warning',
    fields: [{ label: 'status', value: 'Mission Control did not return status data.', tone: 'warning' }],
  }]
}

function addStatusSection(
  sections: PandoStatusSection[],
  section: string,
  value: unknown,
): void {
  const record = recordValue(value)
  if (!record) {
    sections.push({
      title: titleCase(section),
      tone: statusTone(value),
      fields: [{ label: 'value', value: compactMissionValue(value), tone: statusTone(value) }],
    })
    return
  }

  const fields: PandoStatusField[] = []
  if ('status' in record) addStatusField(fields, 'status', record.status)
  for (const [key, item] of Object.entries(record)) {
    if (key === 'status') continue
    if (key === 'checks' && Array.isArray(item)) {
      for (const [index, check] of item.entries()) {
        const checkRecord = recordValue(check)
        addStatusField(fields, String(checkRecord?.id ?? 'check ' + (index + 1)), check)
      }
      continue
    }
    addStatusField(fields, key, item)
  }
  if (fields.length === 0) addStatusField(fields, section, record)
  sections.push({
    title: titleCase(section),
    subtitle: statusSubtitle(record),
    tone: fields.some(field => field.tone === 'danger') ? 'danger' : fields.some(field => field.tone === 'warning') ? 'warning' : fields.some(field => field.tone === 'success') ? 'success' : 'info',
    fields,
  })
}

function addStatusField(
  fields: PandoStatusField[],
  label: string,
  value: unknown,
): void {
  if (value === undefined) return
  fields.push({
    label,
    value: compactMissionValue(value),
    tone: statusTone(value),
  })
}

function statusLineField(line: string, index: number): PandoStatusField {
  const split = line.indexOf(':')
  const label = split > 0 ? line.slice(0, split).trim() : 'line ' + (index + 1)
  const value = split > 0 ? line.slice(split + 1).trim() : line
  return { label, value, tone: statusTone(value) }
}

function footerStatusFields(statusLines: readonly string[]): PandoStatusField[] {
  return statusLines
    .map(statusLineField)
    .filter(field => ['gui', 'gateway', 'model'].includes(field.label.toLowerCase()))
    .slice(0, 3)
}

function shortFooterLabel(label: string): string {
  const first = label.split('/')[0]?.trim() || label
  const aliases: Record<string, string> = {
    GUI: 'GUI',
    Gateway: 'GW',
    Model: 'Model',
  }
  return aliases[first] ?? compactText(first, 7)
}

function shortFooterValue(value: string): string {
  const normalized = value.toLowerCase()
  if (normalized === 'baseline') return 'base'
  if (normalized === 'selected') return 'sel'
  if (normalized === 'degraded') return 'degr'
  if (normalized === 'connected') return 'conn'
  return compactText(value, 6)
}

function footerShortcutLabel(name: keyof typeof pandoKeybindings): string {
  return pandoPrimaryKeyLabel(name)
    .replace(/ctrl/g, 'c')
    .replace(/alt/g, 'a')
    .replace(/shift/g, 's')
}

function statusSubtitle(record: Record<string, unknown>): string | undefined {
  if (typeof record.status === 'string') return record.status
  if (typeof record.summary === 'string') return compactText(record.summary, 64)
  if (typeof record.message === 'string') return compactText(record.message, 64)
}

function statusTone(value: unknown): TuiEventTone {
  const record = recordValue(value)
  if (record && 'status' in record) return statusTone(record.status)
  if (typeof value === 'boolean') return value ? 'success' : 'danger'
  const text = String(value ?? '').toLowerCase()
  if (text.includes('fail') || text.includes('error') || text.includes('blocked') || text.includes('down') || text.includes('unhealthy')) return 'danger'
  if (text.includes('warn') || text.includes('degraded') || text.includes('stale') || text.includes('missing')) return 'warning'
  if (text.includes('ok') || text.includes('ready') || text.includes('running') || text.includes('connected') || text.includes('healthy') || text.includes('selected') || text.includes('enabled')) return 'success'
  return 'info'
}

function compactMissionValue(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return compactText(value, 180)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return compactText(JSON.stringify(value), 180)
}

function submitActivePromptFromTerminalForTest(): void {
  submitActivePromptFromTerminal()
}

function runPandoCommand(commands: readonly PandoCommand[], name: string): void {
  const command = commands.find(item => item.name === name)
  if (!command || command.enabled === false) return
  void command.run()
}

function runSlashCommandInput(text: string, commands: readonly PandoCommand[]): boolean {
  const parsed = parseBareSlashCommand(text)
  if (!parsed) return false
  const command = commands.find(item => item.slashName === parsed || item.slashAliases?.includes(parsed))
  if (!command) return false
  if (command.enabled === false) return true
  void command.run()
  return true
}

function parseBareSlashCommand(text: string): string | undefined {
  if (!text.startsWith('/') || text.startsWith('//')) return
  const body = text.slice(1).trim()
  if (!body || body.includes(' ') || body.includes('\t') || body.includes('\n')) return
  return body
}

function isEnterKey(name: string): boolean {
  const normalized = name.toLowerCase()
  return normalized === 'return' || normalized === 'enter' || normalized === 'linefeed' || normalized === 'kpenter'
}

function isPlainEnterEvent(event: KeyEvent): boolean {
  return isEnterKey(event.name) && !event.shift && !event.ctrl && !event.meta && !event.super && !event.hyper
}

function modelLabel(model?: { provider: string; name?: string; label: string }): string {
  if (!model) return 'Model not configured'
  return model.name ? model.name + ' ' + model.label : model.label
}

function compactStatus(lines: string[]): string {
  const text = lines.join(' . ')
  return text.length > 24 ? text.slice(0, 23) + '~' : text
}

function compactFooterModelLabel(model?: { provider: string; name?: string; label: string }): string {
  return compactText(modelLabel(model), 20)
}

function approvalPlaceholder(count: number): string {
  return count === 1 ? 'Review pending approval...' : `Review ${count} pending approvals...`
}

function compactUpdatedAt(value: number | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function compactApprovalInput(approval: StoredApprovalRecord): string {
  const input = approval.request.toolUse.input
  const text = JSON.stringify(input)
  if (!text || text === '{}') return approval.request.toolName
  return text.length > 140 ? text.slice(0, 139) + '~' : text
}

function approvalDetail(approval: StoredApprovalRecord): string {
  const request = approval.request
  const display = toolDisplayFor(request.toolName, request.toolUse.input)
  const parts = [
    request.safety,
    request.sandboxMode,
    request.approvalPolicy,
    display.detail ?? compactApprovalInput(approval),
  ].filter(Boolean)
  return compactText(parts.join(' . '), 220)
}

function collapseOutputLines(content: string, maxLines: number, maxChars: number): { visible: string[]; truncated: boolean; hiddenLineCount: number } {
  const normalized = content.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return { visible: [], truncated: false, hiddenLineCount: 0 }
  const allLines = normalized.split('\n')
  const visible: string[] = []
  let usedChars = 0
  let truncated = false
  for (const line of allLines) {
    if (visible.length >= maxLines || usedChars + line.length > maxChars) {
      truncated = true
      break
    }
    visible.push(line)
    usedChars += line.length + 1
  }
  if (!visible.length && allLines[0]) {
    visible.push(allLines[0].slice(0, Math.max(1, maxChars - 1)) + '~')
    truncated = true
  }
  return {
    visible,
    truncated: truncated || visible.length < allLines.length,
    hiddenLineCount: Math.max(0, allLines.length - visible.length),
  }
}

function toolCodePreview(
  toolName: string | undefined,
  input: Record<string, unknown> | undefined,
  content: string | undefined,
  expanded: boolean,
): { lines: string[]; truncated: boolean; hiddenLineCount: number } | undefined {
  const kind = toolName ? toolDisplayKind(toolName) : 'generic'
  const inputContent = input ? firstString(input, ['content']) : undefined
  const resultContent = content ? contentFieldFromJson(content) : undefined
  const text = kind === 'write' ? inputContent ?? resultContent : kind === 'read' ? resultContent ?? content : undefined
  if (!text) return
  const collapsed = collapseOutputLines(text, expanded ? 80 : 8, expanded ? 8000 : 700)
  return {
    lines: collapsed.visible,
    truncated: collapsed.truncated,
    hiddenLineCount: collapsed.hiddenLineCount,
  }
}

function toolPatchPreview(
  toolName: string | undefined,
  input: Record<string, unknown> | undefined,
  expanded: boolean,
): PandoPatchPreviewData | undefined {
  if (!toolName || !input || toolDisplayKind(toolName) !== 'edit') return
  const oldText = firstString(input, ['oldText', 'search', 'before'])
  const newText = firstString(input, ['newText', 'replace', 'after', 'content'])
  if (oldText === undefined && newText === undefined) return
  const maxLines = expanded ? 60 : 4
  const maxChars = expanded ? 5000 : 350
  const oldPreview = collapseOutputLines(oldText ?? '', maxLines, maxChars)
  const newPreview = collapseOutputLines(newText ?? '', maxLines, maxChars)
  const oldStart = positiveIntegerValue(input.startLine) ?? 1
  const newStart = oldStart
  const rows: PandoPatchPreviewRow[] = [
    ...oldPreview.visible.map((line, index) => ({
      kind: 'remove' as const,
      oldLineNumber: String(oldStart + index),
      text: line,
    })),
    ...newPreview.visible.map((line, index) => ({
      kind: 'add' as const,
      newLineNumber: String(newStart + index),
      text: line,
    })),
  ]
  return {
    path: firstString(input, ['path', 'filePath', 'filename', 'targetPath']),
    hunkHeader: `@@ -${oldStart},${Math.max(1, oldPreview.visible.length)} +${newStart},${Math.max(1, newPreview.visible.length)} @@`,
    rows,
    truncated: oldPreview.truncated || newPreview.truncated,
  }
}

function toolResultSummary(content: string | undefined): string | undefined {
  if (!content) return
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    const parts = [
      numberValue(parsed.replacements) !== undefined ? `${numberValue(parsed.replacements)} replacement(s)` : undefined,
      numberValue(parsed.bytes) !== undefined ? `${numberValue(parsed.bytes)} bytes` : undefined,
      parsed.created === true ? 'created' : undefined,
    ].filter((part): part is string => Boolean(part))
    return parts.join(' . ') || undefined
  } catch {
    return undefined
  }
}

function contentFieldFromJson(content: string): string | undefined {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    return stringValue(parsed.content)
  } catch {
    return undefined
  }
}

function compactText(text: string, limit: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > limit ? normalized.slice(0, limit - 1) + '~' : normalized
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  return value as Record<string, unknown>
}

function titleCase(value: string): string {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function positiveIntegerValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function trimMessage(content: string): string {
  const normalized = content.replace(/\r\n?/g, '\n').trim()
  return normalized.length > 900 ? normalized.slice(0, 899) + '~' : normalized
}

function messageLines(content: string): string[] {
  const lines = trimMessage(content).split('\n')
  return lines.length > 0 ? lines : ['']
}

function lastAssistantMessageContent(messages: readonly PandoTuiMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'assistant') continue
    const content = trimMessage(message.content)
    if (content) return content
  }
}

function lastUserMessageEntry(messages: readonly PandoTuiMessage[]): { message: PandoTuiMessage; index: number } | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user') continue
    if (!message.content.trim()) continue
    return { message, index }
  }
}

async function copyTextToClipboard(text: string): Promise<void> {
  const { default: clipboardy } = await import('clipboardy')
  await clipboardy.write(text)
}

async function readTextFromClipboard(): Promise<string> {
  const { default: clipboardy } = await import('clipboardy')
  return clipboardy.read()
}

function normalizeClipboardText(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim()
}

function composePromptWithClipboard(current: string, clipboard: string): string {
  const base = current.trimEnd()
  if (!base) return clipboard
  return `${base}\n${clipboard}`
}

function composePromptWithBlock(current: string, block: string): string {
  const base = current.trimEnd()
  if (!base) return block
  return `${base}\n\n${block}`
}

function composePromptWithInsertion(current: string, insertion: string): string {
  const base = current.trimEnd()
  if (!base) return insertion
  return `${base} ${insertion}`
}

function formatPromptQuote(message: PandoTuiMessage, index: number): string {
  const content = message.content.trim()
  if (!content) return ''
  const lines = content.split(/\r?\n/g).map(line => `> ${line}`)
  return [`Quoted ${message.role} message #${index + 1}:`, ...lines].join('\n')
}

function formatTranscriptMessages(messages: readonly PandoTuiMessage[]): string {
  const sections = messages
    .map((message, index) => formatTranscriptMessage(message, index))
    .filter(Boolean)
  return sections.length ? '# Pando Session Transcript\n\n' + sections.join('\n\n') : ''
}

function formatTranscriptMessage(message: PandoTuiMessage, index: number): string {
  const content = normalizeTranscriptContent(message.content)
  if (!content) return ''
  return `## ${titleCase(message.role)} ${index + 1}\n\n${content}`
}

function normalizeTranscriptContent(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

function messageBlocksFromMarkdown(content: string): PandoMarkdownBlock[] {
  const blocks: PandoMarkdownBlock[] = []
  let textLines: string[] = []
  let codeLines: string[] | undefined
  let codeLanguage: string | undefined

  const flushText = () => {
    if (!textLines.length) return
    blocks.push({ kind: 'text', lines: textLines })
    textLines = []
  }
  const flushCode = () => {
    if (!codeLines) return
    blocks.push({ kind: 'code', language: codeLanguage, lines: codeLines })
    codeLines = undefined
    codeLanguage = undefined
  }

  for (const line of messageLines(content)) {
    const fence = parseCodeFence(line)
    if (fence !== undefined) {
      if (codeLines) {
        flushCode()
      } else {
        flushText()
        codeLines = []
        codeLanguage = fence
      }
      continue
    }
    if (codeLines) codeLines.push(line)
    else textLines.push(line)
  }
  flushCode()
  flushText()
  return blocks.length ? blocks : [{ kind: 'text', lines: [''] }]
}

function parseCodeFence(line: string): string | undefined {
  const trimmed = line.trim()
  if (!trimmed.startsWith('```')) return undefined
  const language = trimmed.slice(3).trim()
  return language || ''
}

function promptHistoryFromMessages(messages: readonly PandoTuiMessage[]): string[] {
  const history: string[] = []
  for (const message of messages) {
    const text = message.role === 'user' ? message.content.trim() : ''
    if (!text || history.at(-1) === text) continue
    history.push(text)
  }
  return history.slice(-50)
}

function splitMessagesForActivity(messages: readonly PandoTuiMessage[], hasActivity: boolean): { before: PandoTuiMessage[]; after: PandoTuiMessage[] } {
  if (!hasActivity) return { before: [...messages], after: [] }
  const last = messages.at(-1)
  if (last?.role !== 'assistant') return { before: [...messages], after: [] }
  return {
    before: messages.slice(0, -1),
    after: [last],
  }
}

function replaceLastAssistantMessage(messages: readonly PandoTuiMessage[], content: string): PandoTuiMessage[] {
  const next = [...messages]
  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index]?.role === 'assistant') {
      next[index] = { ...next[index], content }
      return next
    }
  }
  return [...next, { role: 'assistant', content }]
}

async function revealAssistantText(text: string, appendChunk: (chunk: string) => void): Promise<void> {
  let emittedChars = 0
  for (const chunk of splitTextForReveal(text)) {
    appendChunk(chunk)
    emittedChars += Array.from(chunk).length
    if (emittedChars <= revealDelayCharLimit) await sleep(revealDelayMs)
  }
}

function splitTextForReveal(text: string): string[] {
  const chars = Array.from(text)
  const chunks: string[] = []
  for (let index = 0; index < chars.length; index += revealCharsPerChunk) {
    chunks.push(chars.slice(index, index + revealCharsPerChunk).join(''))
  }
  return chunks.length ? chunks : ['']
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function scrollToBottom(scroll: ScrollBoxRenderable | undefined): void {
  if (!scroll) return
  scroll.scrollTo(scroll.scrollHeight)
}

type PandoMessageScrollAction = 'page_up' | 'page_down' | 'line_up' | 'line_down' | 'first' | 'last'

function scrollMessageBox(scroll: ScrollBoxRenderable | undefined, action: PandoMessageScrollAction): void {
  if (!scroll) return
  switch (action) {
    case 'page_up':
      scroll.scrollBy(-messageScrollPageRows)
      return
    case 'page_down':
      scroll.scrollBy(messageScrollPageRows)
      return
    case 'line_up':
      scroll.scrollBy(-1)
      return
    case 'line_down':
      scroll.scrollBy(1)
      return
    case 'first':
      scroll.scrollTo(0)
      return
    case 'last':
      scrollToBottom(scroll)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const pandoOpenTuiTestHooks = {
  chunkHasEnter,
  chunkHasSubmitEnter,
  chunkIsLinefeedOnly,
  isEnterKey,
  isPlainEnterEvent,
  trimMessage,
  messageLines,
  lastAssistantMessageContent,
  lastUserMessageEntry,
  normalizeClipboardText,
  composePromptWithClipboard,
  composePromptWithBlock,
  composePromptWithInsertion,
  formatPromptQuote,
  formatTranscriptMessages,
  messageBlocksFromMarkdown,
  splitMessagesForActivity,
  collapseOutputLines,
  expandHintText,
  contentFieldFromJson,
  splitTextForReveal,
  formatAgentEventMessage,
  parseStructuredBlock,
  parseBareSlashCommand,
  promptFileMentionBaseForTrigger,
  deleteDialogFilterBackwardWord,
  messageSearchDialogOptions,
  eventTimelineDialogOptions,
  eventTimelineEntries,
  eventTimelineBlock,
  messageActionDialogOptions,
  recentMessageEntries,
  userMessageDialogOptions,
  recentUserMessageEntries,
  promptHistoryDialogOptions,
  promptStashDialogOptions,
  createPromptStashEntry,
  queuedPromptDialogOptions,
  createQueuedPrompt,
  fileMentionDialogOptions,
  workspaceChangeDialogOptions,
  workspaceDiffLineColor,
  recentFileMentions,
  keysDialogOptions,
  helpDialogOptions,
  statusCardSections,
  footerStatusFields,
  shortFooterValue,
  footerShortcutLabel,
  toastToneLabel,
  scrollToBottom,
  scrollMessageBox,
  activePromptInputForTest: activePandoPromptInputForTest,
  submitActivePromptForTest: submitActivePandoPromptForTest,
  submitActivePromptFromTerminalForTest,
}
