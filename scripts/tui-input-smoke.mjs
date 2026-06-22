#!/usr/bin/env node
import { testRender } from '@opentui/solid'
import { jsx } from '../dist/src/tui/opentui/pando-jsx/jsx-runtime.js'
import { PandoTuiApp, pandoOpenTuiTestHooks } from '../dist/src/tui/opentui/PandoOpenTuiRenderer.js'

const snapshot = {
  title: 'Pando TUI input smoke',
  activeThreadId: undefined,
  threads: [],
  messages: [],
  models: [{ provider: 'minimax-cn', name: 'MiniMax-M3', label: 'MiniMax', selected: true, status: 'selected' }],
  approvals: [],
  mission: {},
  statusLines: ['GUI: baseline'],
}

let sendStarted = false
let resolveSend
const sendPromise = new Promise(resolve => { resolveSend = resolve })
const promptStash = []
let promptDraft = undefined
const adapter = {
  async snapshot() {
    return snapshot
  },
  async createThread(title) {
    return { threadId: 'thread_tui_input', sessionId: 'tui-input-smoke', title: title ?? 'TUI input smoke', cwd: process.cwd(), createdAtMs: Date.now(), updatedAtMs: Date.now(), model: {}, permissions: {} }
  },
  async resumeThread(threadId) {
    return { metadata: { threadId, sessionId: 'tui-input-smoke', title: 'TUI input smoke', cwd: process.cwd(), createdAtMs: Date.now(), updatedAtMs: Date.now(), model: {}, permissions: {} }, messages: snapshot.messages }
  },
  async sendMessage(_threadId, text, options) {
    sendStarted = true
    assert(text === 'hi', 'sendMessage should receive submitted input, got ' + JSON.stringify(text))
    await options?.onEvent?.({
      id: 'event-model-start',
      type: 'model_request_started',
      sessionId: 'tui-input-smoke',
      createdAtMs: Date.now(),
      provider: 'fake',
      model: 'fake-model',
      round: 1,
      toolCount: 4,
    })
    await options?.onEvent?.({
      id: 'event-tool-start',
      type: 'tool_call_started',
      sessionId: 'tui-input-smoke',
      createdAtMs: Date.now(),
      toolUseId: 'tool-1',
      toolName: 'shell',
      safety: 'read_only',
      input: { command: 'echo hi' },
    })
    const result = await sendPromise
    await options?.onEvent?.({
      id: 'event-tool-complete',
      type: 'tool_call_completed',
      sessionId: 'tui-input-smoke',
      createdAtMs: Date.now(),
      toolUseId: 'tool-1',
      toolName: 'shell',
      ok: true,
      contentPreview: 'fake tool completed',
      durationMs: 12,
    })
    await options?.onEvent?.({
      id: 'event-tool-fail-start',
      type: 'tool_call_started',
      sessionId: 'tui-input-smoke',
      createdAtMs: Date.now(),
      toolUseId: 'tool-2',
      toolName: 'shell',
      safety: 'workspace_write',
      input: { command: 'bad command' },
    })
    await options?.onEvent?.({
      id: 'event-tool-fail-complete',
      type: 'tool_call_completed',
      sessionId: 'tui-input-smoke',
      createdAtMs: Date.now(),
      toolUseId: 'tool-2',
      toolName: 'shell',
      ok: false,
      contentPreview: 'line1\nline2\nline3\nline4\nline5\nline6',
      durationMs: 34,
    })
    await options?.onEvent?.({
      id: 'event-file-write-start',
      type: 'tool_call_started',
      sessionId: 'tui-input-smoke',
      createdAtMs: Date.now(),
      toolUseId: 'tool-3',
      toolName: 'file_write',
      safety: 'workspace_write',
      input: { path: 'src/demo.ts', content: 'export const ok = true\nconsole.log(ok)\n' },
    })
    await options?.onEvent?.({
      id: 'event-file-write-complete',
      type: 'tool_call_completed',
      sessionId: 'tui-input-smoke',
      createdAtMs: Date.now(),
      toolUseId: 'tool-3',
      toolName: 'file_write',
      ok: true,
      contentPreview: '{"path":"src/demo.ts","bytes":39}',
      durationMs: 9,
    })
    await options?.onEvent?.({
      id: 'event-patch-start',
      type: 'tool_call_started',
      sessionId: 'tui-input-smoke',
      createdAtMs: Date.now(),
      toolUseId: 'tool-4',
      toolName: 'apply_patch',
      safety: 'workspace_write',
      input: { path: 'src/demo.ts', oldText: 'export const ok = true', newText: 'export const ok = false' },
    })
    await options?.onEvent?.({
      id: 'event-patch-complete',
      type: 'tool_call_completed',
      sessionId: 'tui-input-smoke',
      createdAtMs: Date.now(),
      toolUseId: 'tool-4',
      toolName: 'apply_patch',
      ok: true,
      contentPreview: '{"path":"src/demo.ts","replacements":1,"bytes":40,"created":false}',
      durationMs: 7,
    })
    const firstDelta = 'assistant line one\n'
    const secondDelta = 'assistant line two\n\nassistant line four'
    await options?.onDelta?.(firstDelta)
    await options?.onDelta?.(secondDelta)
    snapshot.activeThreadId = result.threadId
    snapshot.messages = [
      { role: 'user', content: text },
      { role: 'assistant', content: result.finalText },
    ]
    return result
  },
  async streamEvents() { return [] },
  async listModels() { return snapshot.models },
  async selectModel() {},
  async listWorkspaceFiles() {
    return [
      { path: 'src/main.ts', kind: 'file', mtimeMs: 20 },
      { path: 'README.md', kind: 'file', mtimeMs: 10 },
    ]
  },
  async listWorkspaceChanges() { return [] },
  async readWorkspaceChangeDiff(path) { return { path, status: ' M', kind: 'diff', text: 'diff --git a/' + path + ' b/' + path, truncated: false } },
  async listPromptStash() { return promptStash },
  async pushPromptStash(text) {
    const entry = { id: 'stash_' + (promptStash.length + 1), text, createdAtMs: Date.now() }
    promptStash.push(entry)
    return entry
  },
  async popPromptStash() { return promptStash.pop() },
  async removePromptStash(id) {
    const index = promptStash.findIndex(entry => entry.id === id)
    if (index >= 0) promptStash.splice(index, 1)
  },
  async readPromptDraft() { return promptDraft },
  async writePromptDraft(text) { promptDraft = { text, updatedAtMs: Date.now() } },
  async clearPromptDraft() { promptDraft = undefined },
  async listApprovals() { return [] },
  async answerApproval() { return undefined },
  async getMissionOverview() { return {} },
  close() {},
}

const setup = await testRender(() => jsx(PandoTuiApp, {
  adapter,
  initialSnapshot: snapshot,
  startInSession: false,
  onExit: () => undefined,
}), { width: 118, height: 34, autoFocus: true })

try {
  assert(pandoOpenTuiTestHooks.isEnterKey('return'), 'return should be treated as enter')
  assert(pandoOpenTuiTestHooks.isEnterKey('linefeed'), 'linefeed should be treated as enter')
  assert(pandoOpenTuiTestHooks.isEnterKey('kpenter'), 'kpenter should be treated as enter')
  assert(pandoOpenTuiTestHooks.isPlainEnterEvent({ name: 'return' }), 'plain return should submit')
  assert(!pandoOpenTuiTestHooks.isPlainEnterEvent({ name: 'return', shift: true }), 'shift return should not submit')
  assert(!pandoOpenTuiTestHooks.isPlainEnterEvent({ name: 'return', ctrl: true }), 'ctrl return should not submit')
  assert(pandoOpenTuiTestHooks.chunkHasEnter('\r\n'), 'CRLF string should trigger terminal enter fallback')
  assert(pandoOpenTuiTestHooks.chunkHasEnter(Buffer.from('\r\n')), 'CRLF bytes should trigger terminal enter fallback')
  assert(!pandoOpenTuiTestHooks.chunkHasEnter('\n'), 'LF-only should be reserved for newline fallback')
  assert(pandoOpenTuiTestHooks.chunkIsLinefeedOnly('\n'), 'LF-only string should be detected as newline fallback')

  await setup.flush()
  const promptInput = pandoOpenTuiTestHooks.activePromptInputForTest()
  assert(promptInput, 'prompt input should be registered as the active prompt')
  promptInput.focus()
  setPromptText(promptInput, 'hi')
  pandoOpenTuiTestHooks.submitActivePromptFromTerminalForTest()
  await setup.waitForFrame(frame => frame.includes('hi') && frame.includes('Pando is thinking'), { maxPasses: 30 })
  await setup.waitForFrame(frame => frame.includes('Activity') && frame.includes('Shell') && frame.includes('echo hi'), { maxPasses: 30 })
  await setup.waitForFrame(frame => frame.includes('Model') && frame.includes('fake/fake-model'), { maxPasses: 30 })
  const scrollBox = setup.renderer.root.findDescendantById('pando-message-scroll')
  assert(scrollBox, 'session messages should render inside a scrollbox')
  assert(typeof scrollBox.scrollTo === 'function', 'message scrollbox should support scrollTo for bottom-follow')
  assert(sendStarted, 'sendMessage should start immediately after Enter')

  const assistantText = `assistant line one\nassistant line two\n\nassistant line four`
  resolveSend({ threadId: 'thread_tui_input', finalText: assistantText, events: [] })
  await setup.waitForFrame(frame => frame.includes('done') && frame.includes('12ms'), { maxPasses: 30 })
  await setup.waitForFrame(frame => frame.includes('Shell failed') && frame.includes('line1'), { maxPasses: 30 })
  await setup.waitForFrame(frame => frame.includes('Write') && frame.includes('src/demo.ts') && frame.includes('export const ok = true'), { maxPasses: 30 })
  await setup.waitForFrame(frame => frame.includes('Edit') && frame.includes('Patch') && frame.includes('@@ -1,1 +1,1 @@'), { maxPasses: 30 })
  await setup.waitForFrame(frame => frame.includes('1 replacement(s)') && frame.includes('40 bytes'), { maxPasses: 30 })
  await setup.waitForFrame(frame => frame.includes('-') && frame.includes('export const ok = true') && frame.includes('+') && frame.includes('export const ok = false'), { maxPasses: 30 })
  await setup.waitForFrame(frame => frame.includes('assistant line one') && frame.includes('assistant line two'), { maxPasses: 30 })
  const assistantFrame = setup.captureCharFrame()
  assert(!assistantFrame.includes('assistant line one assistant line two'), 'assistant newlines should not be collapsed in rendered frame')
  assert(pandoOpenTuiTestHooks.trimMessage('a\r\nb') === 'a\nb', 'assistant message formatting should preserve normalized newlines')
  assert(pandoOpenTuiTestHooks.splitTextForReveal('abcdefghijkl').join('') === 'abcdefghijkl', 'stream reveal chunking should preserve text')
  assert(pandoOpenTuiTestHooks.collapseOutputLines('1\n2\n3', 2, 50).truncated, 'output collapse should truncate over-limit line counts')
  assert(pandoOpenTuiTestHooks.expandHintText(1, false).includes('Click to expand'), 'collapsed output should advertise expansion')
  assert(pandoOpenTuiTestHooks.expandHintText(0, true).includes('Click to collapse'), 'expanded output should advertise collapse')
  assert(pandoOpenTuiTestHooks.contentFieldFromJson('{"content":"hello"}') === 'hello', 'content JSON extraction should work for file_read output')
  assert(pandoOpenTuiTestHooks.parseBareSlashCommand('/status') === 'status', 'bare slash command should parse')
  assert(!pandoOpenTuiTestHooks.parseBareSlashCommand('//tmp/file'), 'double slash path should not parse as command')
  assert(!pandoOpenTuiTestHooks.parseBareSlashCommand('/status please'), 'slash command with args should not be swallowed')
  const markdownBlocks = pandoOpenTuiTestHooks.messageBlocksFromMarkdown('before\n```ts\nconst ok = true\n```\nafter')
  assert(markdownBlocks.length === 3, 'assistant markdown should split text/code/text blocks')
  assert(markdownBlocks[1].kind === 'code' && markdownBlocks[1].language === 'ts', 'assistant code fence should preserve language')
  const statusSections = pandoOpenTuiTestHooks.statusCardSections({
    ok: true,
    requestId: 'req_1',
    data: {
      gui: { status: 'ready', backend: 'uia' },
      gateway: { status: 'degraded', warning: 'heartbeat stale' },
    },
  }, ['GUI: ready', 'Gateway: degraded'])
  assert(statusSections.some(section => section.title === 'Summary'), 'status card should include summary section')
  assert(statusSections.some(section => section.title === 'Mission'), 'status card should include mission section')
  assert(statusSections.some(section => section.title === 'Gui'), 'status card should include GUI section')
  assert(statusSections.some(section => section.title === 'Gateway' && section.tone === 'warning'), 'status card should classify degraded gateway as warning')
  const footerFields = pandoOpenTuiTestHooks.footerStatusFields(['GUI: ready', 'Gateway: degraded', 'Model: selected'])
  assert(footerFields.length === 3, 'footer status should preserve compact status badges')
  assert(footerFields[0].label === 'GUI' && footerFields[0].tone === 'success', 'footer GUI badge should classify ready as success')
  assert(footerFields[1].label === 'Gateway' && footerFields[1].tone === 'warning', 'footer Gateway badge should classify degraded as warning')
  assert(pandoOpenTuiTestHooks.shortFooterValue('baseline') === 'base', 'footer should shorten baseline status')
  assert(pandoOpenTuiTestHooks.footerShortcutLabel('keys.show') === 'c+a+k', 'footer should compact long shortcut labels')
  assert(pandoOpenTuiTestHooks.toastToneLabel('success') === 'ok', 'toast success tone should use compact ok label')
  assert(pandoOpenTuiTestHooks.toastToneLabel('danger') === 'err', 'toast danger tone should use compact error label')
  const scrollCalls = []
  const fakeScroll = {
    scrollHeight: 99,
    scrollBy(value) { scrollCalls.push(['by', value]) },
    scrollTo(value) { scrollCalls.push(['to', value]) },
  }
  pandoOpenTuiTestHooks.scrollMessageBox(fakeScroll, 'page_up')
  pandoOpenTuiTestHooks.scrollMessageBox(fakeScroll, 'page_down')
  pandoOpenTuiTestHooks.scrollMessageBox(fakeScroll, 'first')
  pandoOpenTuiTestHooks.scrollMessageBox(fakeScroll, 'last')
  assert(JSON.stringify(scrollCalls) === JSON.stringify([['by', -12], ['by', 12], ['to', 0], ['to', 99]]), 'message scroll shortcuts should map to expected scrollbox actions')
  let selectedMessage = undefined
  const searchOptions = pandoOpenTuiTestHooks.messageSearchDialogOptions([
    { role: 'user', content: 'hello world' },
    { role: 'assistant', content: '```ts\nconst ok = true\n```' },
  ], (message, index) => { selectedMessage = { message, index } })
  assert(searchOptions.length === 2, 'message search should create one option per message')
  assert(searchOptions[0].category === 'User' && searchOptions[1].category === 'Assistant', 'message search should group by role')
  assert(searchOptions[0].footer === 'copy #1', 'message search should advertise copy action')
  searchOptions[1].onSelect()
  assert(selectedMessage.index === 1 && selectedMessage.message.role === 'assistant', 'message search selection should return the selected message and index')
  assert(pandoOpenTuiTestHooks.messageSearchDialogOptions([], () => undefined)[0].disabled, 'empty message search should show disabled empty state')
  const actionCalls = []
  const messageActionOptions = pandoOpenTuiTestHooks.messageActionDialogOptions([
    { role: 'user', content: 'first prompt' },
    { role: 'assistant', content: 'answer text' },
  ], {
    copyMessage: (_message, index) => actionCalls.push(['copy', index]),
    replacePromptWithMessage: (_message, index) => actionCalls.push(['prompt', index]),
    quoteMessageIntoPrompt: (_message, index) => actionCalls.push(['quote', index]),
  })
  assert(messageActionOptions[0].category === '#2 Assistant', 'message actions should show newest messages first')
  assert(messageActionOptions.some(option => option.footer === 'copy'), 'message actions should include copy')
  assert(messageActionOptions.some(option => option.footer === 'prompt'), 'message actions should include use-as-prompt')
  assert(messageActionOptions.some(option => option.footer === 'quote'), 'message actions should include quote')
  messageActionOptions.find(option => option.value === 'prompt:1').onSelect()
  messageActionOptions.find(option => option.value === 'quote:0').onSelect()
  assert(JSON.stringify(actionCalls) === JSON.stringify([['prompt', 1], ['quote', 0]]), 'message action selections should invoke the matching action')
  assert(pandoOpenTuiTestHooks.messageActionDialogOptions([], {}).at(0).disabled, 'empty message actions should show disabled empty state')
  let selectedUserMessage = undefined
  const userMessageOptions = pandoOpenTuiTestHooks.userMessageDialogOptions([
    { role: 'user', content: 'first prompt' },
    { role: 'assistant', content: 'answer text' },
    { role: 'user', content: 'second prompt\nline two' },
  ], (message, index) => { selectedUserMessage = { message, index } })
  assert(userMessageOptions[0].footer === 'latest', 'user message picker should show latest user message first')
  assert(userMessageOptions[0].title.includes('second prompt'), 'user message picker should show user message text')
  userMessageOptions[0].onSelect()
  assert(selectedUserMessage.index === 2 && selectedUserMessage.message.content.includes('second prompt'), 'user message picker should return original message and index')
  assert(pandoOpenTuiTestHooks.userMessageDialogOptions([{ role: 'assistant', content: 'answer' }], () => undefined)[0].disabled, 'empty user message picker should show disabled empty state')
  let selectedPrompt = ''
  const promptHistoryOptions = pandoOpenTuiTestHooks.promptHistoryDialogOptions(['first prompt', 'second prompt'], value => { selectedPrompt = value })
  assert(promptHistoryOptions[0].title.includes('second prompt'), 'prompt history should show newest prompt first')
  promptHistoryOptions[0].onSelect()
  assert(selectedPrompt === 'second prompt', 'prompt history selection should return selected prompt text')
  assert(pandoOpenTuiTestHooks.promptHistoryDialogOptions([], () => undefined)[0].disabled, 'empty prompt history should show disabled empty state')
  let selectedStash = undefined
  const olderStash = { id: 'stash_old', text: 'older stash', createdAtMs: 10 }
  const latestStash = { id: 'stash_new', text: 'latest stash\nline two', createdAtMs: 20 }
  const stashOptions = pandoOpenTuiTestHooks.promptStashDialogOptions([olderStash, latestStash], entry => { selectedStash = entry })
  assert(stashOptions[0].title.includes('latest stash'), 'prompt stash should show latest entry first')
  assert(stashOptions[0].footer === 'latest', 'prompt stash should mark latest entry')
  stashOptions[0].onSelect()
  assert(selectedStash.id === 'stash_new', 'prompt stash selection should return selected entry')
  assert(pandoOpenTuiTestHooks.promptStashDialogOptions([], () => undefined)[0].disabled, 'empty prompt stash should show disabled empty state')
  assert(pandoOpenTuiTestHooks.createPromptStashEntry('draft').text === 'draft', 'prompt stash entry should preserve text')
  const queuedPrompt = pandoOpenTuiTestHooks.createQueuedPrompt('queued draft')
  const queueActions = []
  const queueOptions = pandoOpenTuiTestHooks.queuedPromptDialogOptions(
    [queuedPrompt],
    id => queueActions.push(['promote', id]),
    id => queueActions.push(['remove', id]),
    () => queueActions.push(['clear']),
  )
  assert(queueOptions[0].footer === 'clear', 'queued prompts should expose a clear action')
  assert(queueOptions.some(option => option.footer === 'next'), 'queued prompts should expose the next prompt action')
  assert(queueOptions.some(option => option.footer === 'remove'), 'queued prompts should expose remove actions')
  queueOptions.find(option => option.footer === 'next').onSelect()
  queueOptions.find(option => option.footer === 'remove').onSelect()
  queueOptions[0].onSelect()
  assert(JSON.stringify(queueActions) === JSON.stringify([['promote', queuedPrompt.id], ['remove', queuedPrompt.id], ['clear']]), 'queued prompt actions should call the matching handlers')
  assert(pandoOpenTuiTestHooks.queuedPromptDialogOptions([], () => undefined, () => undefined, () => undefined)[0].disabled, 'empty queue should show disabled empty state')
  const helpOptions = pandoOpenTuiTestHooks.helpDialogOptions([
    { name: 'pando.status', title: 'Open status panel', category: 'Pando', description: 'Inspect status.', slashName: 'status', slashAliases: ['health'], run: () => undefined },
    { name: 'keys.show', title: 'Show keyboard shortcuts', category: 'System', description: 'Inspect keys.', slashName: 'keys', slashAliases: ['shortcuts'], run: () => undefined },
  ], () => undefined)
  assert(helpOptions.some(option => option.category === 'Overview'), 'help should include overview option')
  assert(helpOptions.some(option => option.category === 'Slash commands' && option.footer.includes('/status')), 'help should include slash command entries')
  assert(helpOptions.some(option => option.category === 'Slash commands' && option.footer.includes('/keys')), 'help should include keys slash command')
  let selectedEvent
  const eventOptions = pandoOpenTuiTestHooks.eventTimelineDialogOptions([
    { id: 'event-run', type: 'run_started', sessionId: 'session', createdAtMs: 10, threadId: 'thread', runId: 'run', cwd: process.cwd(), promptPreview: 'hello' },
    { id: 'event-delta', type: 'agent_message_delta', sessionId: 'session', createdAtMs: 20, delta: 'h' },
    { id: 'event-tool', type: 'tool_result', sessionId: 'session', createdAtMs: 30, toolUseId: 'tool-1', toolName: 'shell', ok: true, contentPreview: 'done' },
  ], (event, index) => { selectedEvent = { event, index } })
  assert(eventOptions.length === 2, 'event timeline should hide assistant delta events')
  assert(eventOptions[0].value === 'event-tool', 'event timeline should show latest displayable event first')
  assert(eventOptions[0].category === 'Tools', 'event timeline should group tool events')
  eventOptions[0].onSelect()
  assert(selectedEvent.event.id === 'event-tool' && selectedEvent.index === 2, 'event timeline selection should return original event and index')
  assert(pandoOpenTuiTestHooks.eventTimelineDialogOptions([], () => undefined)[0].disabled, 'empty event timeline should show disabled empty state')
  const keyOptions = pandoOpenTuiTestHooks.keysDialogOptions()
  assert(keyOptions.some(option => option.value === 'key:keys.show' && option.footer.includes('ctrl+alt+k')), 'keys panel should include which-key style shortcut entry')
  assert(keyOptions.some(option => option.category === 'Messages'), 'keys panel should group message scroll shortcuts')
  assert(keyOptions.some(option => option.category === 'Dialog'), 'keys panel should group dialog shortcuts')
  assert(pandoOpenTuiTestHooks.lastAssistantMessageContent([
    { role: 'assistant', content: 'first' },
    { role: 'user', content: 'ask again' },
    { role: 'assistant', content: 'second' },
  ]) === 'second', 'copy command should target latest assistant message')
  const lastUser = pandoOpenTuiTestHooks.lastUserMessageEntry([
    { role: 'user', content: 'first ask' },
    { role: 'assistant', content: 'answer' },
    { role: 'user', content: '  ' },
    { role: 'user', content: 'second ask' },
  ])
  assert(lastUser.index === 3 && lastUser.message.content === 'second ask', 'edit previous command should target latest non-empty user message')
  assert(pandoOpenTuiTestHooks.lastUserMessageEntry([{ role: 'assistant', content: 'answer' }]) === undefined, 'edit previous command should return undefined when no user message exists')
  assert(pandoOpenTuiTestHooks.normalizeClipboardText('a\r\nb\n') === 'a\nb', 'clipboard text should normalize CRLF and trim edges')
  assert(pandoOpenTuiTestHooks.composePromptWithClipboard('', 'clip') === 'clip', 'clipboard paste should fill empty prompt')
  assert(pandoOpenTuiTestHooks.composePromptWithClipboard('existing', 'clip') === 'existing\nclip', 'clipboard paste should append with newline when prompt is nonempty')
  assert(pandoOpenTuiTestHooks.composePromptWithBlock('existing', 'block') === 'existing\n\nblock', 'block insertion should separate quoted content from existing prompt')
  assert(pandoOpenTuiTestHooks.formatPromptQuote({ role: 'assistant', content: 'a\nb' }, 2) === 'Quoted assistant message #3:\n> a\n> b', 'message quote formatting should preserve lines')
  const transcript = pandoOpenTuiTestHooks.formatTranscriptMessages([
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'line one\r\nline two' },
    { role: 'event', content: '  ' },
  ])
  assert(transcript.includes('# Pando Session Transcript'), 'transcript formatter should include a title')
  assert(transcript.includes('## User 1') && transcript.includes('hello'), 'transcript formatter should include user messages')
  assert(transcript.includes('## Assistant 2') && transcript.includes('line one\nline two'), 'transcript formatter should normalize and preserve message newlines')
  assert(!transcript.includes('## Event 3'), 'transcript formatter should skip empty messages')
  assert(pandoOpenTuiTestHooks.formatTranscriptMessages([]) === '', 'empty transcript should format as empty string')
  assert(pandoOpenTuiTestHooks.composePromptWithInsertion('', '@src/main.ts') === '@src/main.ts', 'file mention should fill empty prompt')
  assert(pandoOpenTuiTestHooks.composePromptWithInsertion('inspect', '@src/main.ts') === 'inspect @src/main.ts', 'file mention should append with a space')
  assert(pandoOpenTuiTestHooks.promptFileMentionBaseForTrigger('@') === '', 'single @ should trigger file mention from empty prompt')
  assert(pandoOpenTuiTestHooks.promptFileMentionBaseForTrigger('inspect @') === 'inspect', 'space-prefixed @ should trigger file mention after existing text')
  assert(pandoOpenTuiTestHooks.promptFileMentionBaseForTrigger('name@example.com') === undefined, 'email-like text should not trigger file mention')
  assert(pandoOpenTuiTestHooks.deleteDialogFilterBackwardWord('src main') === 'src ', 'dialog filter ctrl+w should remove the last word')
  assert(pandoOpenTuiTestHooks.deleteDialogFilterBackwardWord('src main   ') === 'src ', 'dialog filter ctrl+w should trim trailing spaces before deleting')
  assert(pandoOpenTuiTestHooks.deleteDialogFilterBackwardWord('single') === '', 'dialog filter ctrl+w should clear a single word')
  let selectedFile = ''
  const fileOptions = pandoOpenTuiTestHooks.fileMentionDialogOptions([
    { path: 'src/main.ts', kind: 'file', mtimeMs: 20 },
    { path: 'README.md', kind: 'file', mtimeMs: 10 },
  ], value => { selectedFile = value })
  const recentFiles = pandoOpenTuiTestHooks.recentFileMentions([
    { path: 'README.md', kind: 'file', mtimeMs: 10 },
    { path: 'src/main.ts', kind: 'file', mtimeMs: 20 },
  ], 1)
  assert(recentFiles[0].path === 'src/main.ts', 'recent file mentions should sort newest files first')
  assert(fileOptions[0].category === 'Recent files' && fileOptions[0].footer === 'recent', 'file mention options should show recent files first')
  assert(fileOptions.some(option => option.category === 'src'), 'file mention options should keep directory grouping')
  assert(fileOptions.some(option => option.category === 'Workspace root'), 'file mention options should keep root grouping')
  fileOptions[0].onSelect()
  assert(selectedFile === 'src/main.ts', 'file mention option should select file path')
  let selectedChange = ''
  const changeOptions = pandoOpenTuiTestHooks.workspaceChangeDialogOptions([
    { path: 'src/main.ts', status: ' M', staged: '', unstaged: 'M' },
    { path: 'src/new.ts', status: '??', staged: '?', unstaged: '?' },
  ], change => { selectedChange = change.path })
  assert(changeOptions[0].category === 'Modified', 'workspace changes should classify unstaged modifications')
  assert(changeOptions[1].category === 'Untracked', 'workspace changes should classify untracked files')
  changeOptions[0].onSelect()
  assert(selectedChange === 'src/main.ts', 'workspace change option should select changed file path')
  assert(pandoOpenTuiTestHooks.workspaceChangeDialogOptions([], () => undefined)[0].disabled, 'empty workspace changes should show disabled clean state')
  assert(pandoOpenTuiTestHooks.workspaceDiffLineColor('+added').includes('60'), 'workspace diff should color additions as success')
  assert(pandoOpenTuiTestHooks.workspaceDiffLineColor('-removed').includes('ff'), 'workspace diff should color removals as danger')
  assert(pandoOpenTuiTestHooks.splitMessagesForActivity([{ role: 'user', content: 'u' }, { role: 'assistant', content: 'a' }], true).after.length === 1, 'activity should render before the trailing assistant message')

  console.log('tui input smoke passed')
} finally {
  setup.renderer.destroy()
}

function readPromptText(input) {
  return input.plainText ?? input.value ?? ''
}

function setPromptText(input, text) {
  if (typeof input.setText === 'function') input.setText(text)
  else input.value = text
}

function assert(value, message) {
  if (!value) throw new Error(message)
}
