import { pandoKeyLabel } from './PandoKeymap.js'

export type PandoCommandCategory = 'Session' | 'Agent' | 'System' | 'Pando'

export type PandoCommand = {
  name: string
  title: string
  category: PandoCommandCategory
  description?: string
  shortcut?: string
  slashName?: string
  slashAliases?: string[]
  suggested?: boolean
  hidden?: boolean
  enabled?: boolean
  run: () => void | Promise<void>
}

export type PandoCommandContext = {
  mode: 'home' | 'session'
  hasThreads: boolean
  hasApprovals: boolean
  hasMessages: boolean
  hasAssistantMessages: boolean
  hasUserMessages: boolean
  hasPromptHistory: boolean
  hasPromptStash: boolean
  hasQueuedPrompts: boolean
  hasEvents: boolean
  showRuntimeDetails: boolean
  actions: {
    showCommands: () => void
    showThreads: () => void
    showModels: () => void
    showApprovals: () => void
    showHelp: () => void
    showKeys: () => void
    showStatus: () => void
    showEvents: () => void
    showChanges: () => void | Promise<void>
    showSearch: () => void
    showMessageActions: () => void
    showUserMessages: () => void
    showPromptHistory: () => void
    showPromptStash: () => void
    showQueue: () => void
    showFiles: () => void | Promise<void>
    copyLastAssistant: () => void | Promise<void>
    copyTranscript: () => void | Promise<void>
    restoreLastUserMessage: () => void
    pasteClipboard: () => void | Promise<void>
    stashPrompt: () => void
    popPromptStash: () => void
    toggleRuntimeDetails: () => void
    newThread: () => void | Promise<void>
    exit: () => void
  }
}

export const PANDO_COMMAND_PALETTE = 'command.palette.show'

export function createPandoCommands(context: PandoCommandContext): PandoCommand[] {
  return [
    {
      name: PANDO_COMMAND_PALETTE,
      title: 'Show command palette',
      category: 'System',
      shortcut: pandoKeyLabel('command.palette.show'),
      hidden: true,
      run: context.actions.showCommands,
    },
    {
      name: 'thread.new',
      title: 'New thread',
      category: 'Session',
      description: 'Start a fresh Pando conversation.',
      slashName: 'new',
      slashAliases: ['clear'],
      suggested: context.mode === 'session',
      run: context.actions.newThread,
    },
    {
      name: 'thread.list',
      title: 'Switch thread',
      category: 'Session',
      description: 'Resume a recent local thread.',
      shortcut: pandoKeyLabel('thread.list'),
      slashName: 'threads',
      slashAliases: ['resume', 'continue'],
      suggested: context.hasThreads,
      run: context.actions.showThreads,
    },
    {
      name: 'model.list',
      title: 'Switch model',
      category: 'Agent',
      description: 'Choose the active provider and model.',
      shortcut: pandoKeyLabel('model.list'),
      slashName: 'models',
      suggested: true,
      run: context.actions.showModels,
    },
    {
      name: 'approval.list',
      title: 'Review approvals',
      category: 'Agent',
      description: 'Inspect pending permission requests.',
      slashName: 'approvals',
      suggested: context.hasApprovals,
      run: context.actions.showApprovals,
    },
    {
      name: 'thread.search',
      title: 'Search current thread',
      category: 'Session',
      description: 'Search messages in the active Pando conversation.',
      slashName: 'search',
      slashAliases: ['find', 'history'],
      suggested: context.mode === 'session' && context.hasMessages,
      enabled: context.hasMessages,
      run: context.actions.showSearch,
    },
    {
      name: 'thread.message_actions',
      title: 'Open message actions',
      category: 'Session',
      description: 'Copy, reuse, or quote messages from the active thread.',
      slashName: 'message-actions',
      slashAliases: ['messages', 'msg-actions', 'actions'],
      suggested: context.mode === 'session' && context.hasMessages,
      enabled: context.hasMessages,
      run: context.actions.showMessageActions,
    },
    {
      name: 'thread.edit_user_message',
      title: 'Edit a previous user message',
      category: 'Session',
      description: 'Pick a previous user message and load it into the prompt box.',
      slashName: 'edit-user',
      slashAliases: ['backtrack', 'previous-messages', 'user-messages'],
      suggested: context.mode === 'session' && context.hasUserMessages,
      enabled: context.hasUserMessages,
      run: context.actions.showUserMessages,
    },
    {
      name: 'thread.restore_last_user_message',
      title: 'Edit previous user message',
      category: 'Session',
      description: 'Load the latest user message into the prompt box for editing.',
      slashName: 'edit-last',
      slashAliases: ['edit-previous', 'last-user', 'previous-user'],
      suggested: context.mode === 'session' && context.hasUserMessages,
      enabled: context.hasUserMessages,
      run: context.actions.restoreLastUserMessage,
    },
    {
      name: 'thread.copy_last_assistant',
      title: 'Copy last assistant message',
      category: 'Session',
      description: 'Copy the latest assistant response to the system clipboard.',
      slashName: 'copy',
      slashAliases: ['copy-last', 'copy-answer'],
      suggested: context.mode === 'session' && context.hasAssistantMessages,
      enabled: context.hasAssistantMessages,
      run: context.actions.copyLastAssistant,
    },
    {
      name: 'thread.copy_transcript',
      title: 'Copy session transcript',
      category: 'Session',
      description: 'Copy the current conversation transcript as Markdown.',
      slashName: 'copy-transcript',
      slashAliases: ['transcript', 'copy-all'],
      suggested: context.mode === 'session' && context.hasMessages,
      enabled: context.hasMessages,
      run: context.actions.copyTranscript,
    },
    {
      name: 'input.paste_clipboard',
      title: 'Paste clipboard into prompt',
      category: 'Session',
      description: 'Read text from the system clipboard and insert it into the prompt box.',
      slashName: 'paste',
      slashAliases: ['clipboard', 'clip'],
      suggested: context.mode === 'session',
      run: context.actions.pasteClipboard,
    },
    {
      name: 'input.insert_file_mention',
      title: 'Insert file mention',
      category: 'Session',
      description: 'Search workspace files and insert an @path reference into the prompt.',
      slashName: 'files',
      slashAliases: ['file', 'mention'],
      suggested: context.mode === 'session',
      run: context.actions.showFiles,
    },
    {
      name: 'input.queued_prompts',
      title: 'Manage queued prompts',
      category: 'Session',
      description: 'Inspect prompts that will run after the current response finishes.',
      slashName: 'queue',
      slashAliases: ['queued', 'queued-prompts'],
      suggested: context.hasQueuedPrompts,
      run: context.actions.showQueue,
    },
    {
      name: 'input.prompt_history',
      title: 'Search prompt history',
      category: 'Session',
      description: 'Find and reuse a previous prompt in the input box.',
      shortcut: pandoKeyLabel('input.history.prev'),
      slashName: 'prompt-history',
      slashAliases: ['prompts', 'input-history'],
      suggested: context.hasPromptHistory,
      enabled: context.hasPromptHistory,
      run: context.actions.showPromptHistory,
    },
    {
      name: 'input.prompt_stash',
      title: 'Stash prompt',
      category: 'Session',
      description: 'Save the current prompt draft and clear the input box.',
      slashName: 'stash',
      slashAliases: ['stash-prompt'],
      suggested: context.mode === 'session',
      run: context.actions.stashPrompt,
    },
    {
      name: 'input.prompt_stash_pop',
      title: 'Pop stashed prompt',
      category: 'Session',
      description: 'Restore the latest stashed prompt into the input box.',
      slashName: 'stash-pop',
      slashAliases: ['pop-stash', 'unstash'],
      suggested: context.hasPromptStash,
      enabled: context.hasPromptStash,
      run: context.actions.popPromptStash,
    },
    {
      name: 'input.prompt_stash_list',
      title: 'List stashed prompts',
      category: 'Session',
      description: 'Search and restore a stashed prompt.',
      slashName: 'stash-list',
      slashAliases: ['stashes'],
      suggested: context.hasPromptStash,
      enabled: context.hasPromptStash,
      run: context.actions.showPromptStash,
    },
    {
      name: 'help.show',
      title: 'Show help',
      category: 'System',
      description: 'View the available Pando TUI shortcuts.',
      slashName: 'help',
      run: context.actions.showHelp,
    },
    {
      name: 'keys.show',
      title: 'Show keyboard shortcuts',
      category: 'System',
      description: 'Open the Pando TUI shortcut reference.',
      shortcut: pandoKeyLabel('keys.show'),
      slashName: 'keys',
      slashAliases: ['shortcuts', 'keymap'],
      run: context.actions.showKeys,
    },
    {
      name: 'pando.status',
      title: 'Open status panel',
      category: 'Pando',
      description: 'Inspect Mission Control, GUI, gateway, model, loop, and cost status.',
      slashName: 'status',
      slashAliases: ['mission', 'health'],
      run: context.actions.showStatus,
    },
    {
      name: 'pando.events',
      title: 'Open event timeline',
      category: 'Pando',
      description: 'Search model, tool, approval, compact, MCP, and GUI events for this thread.',
      slashName: 'events',
      slashAliases: ['timeline', 'logs'],
      suggested: context.mode === 'session' && context.hasEvents,
      enabled: context.hasEvents,
      run: context.actions.showEvents,
    },
    {
      name: 'workspace.changes',
      title: 'Show workspace changes',
      category: 'Session',
      description: 'Inspect changed files and insert a changed file mention into the prompt.',
      slashName: 'changes',
      slashAliases: ['diff', 'git', 'workspace'],
      suggested: context.mode === 'session',
      run: context.actions.showChanges,
    },
    {
      name: 'pando.toggle.runtime_details',
      title: context.showRuntimeDetails ? 'Hide runtime details' : 'Show runtime details',
      category: 'Pando',
      description: 'Toggle detailed tool, model, GUI, and event output in the session stream.',
      slashName: 'details',
      slashAliases: ['tool-details', 'runtime-details'],
      suggested: context.mode === 'session',
      run: context.actions.toggleRuntimeDetails,
    },
    {
      name: 'app.exit',
      title: 'Quit Pando',
      category: 'System',
      description: 'Close the TUI and return to the shell.',
      shortcut: pandoKeyLabel('app.exit'),
      run: context.actions.exit,
    },
  ]
}

export function visiblePandoCommands(commands: readonly PandoCommand[]): PandoCommand[] {
  return commands.filter(command => command.hidden !== true)
}

export function canRunPandoCommand(command: PandoCommand): boolean {
  return command.enabled !== false
}
