import { createInterface } from 'node:readline/promises'
import type { PandoTuiAdapter, PandoTuiIo, PandoTuiSnapshot } from './PandoTuiTypes.js'

export type PandoTuiShellOptions = {
  adapter: PandoTuiAdapter
  io: PandoTuiIo
  smoke?: boolean
}

export async function runPandoTuiShell(options: PandoTuiShellOptions): Promise<void> {
  const { adapter, io } = options
  const snapshot = await adapter.snapshot()
  renderSnapshot(io, snapshot)
  if (options.smoke) return
  if (!io.input) throw new Error('Pando TUI requires an interactive stdin stream')

  const readline = createInterface({ input: io.input, output: io.output })
  let activeThreadId = snapshot.activeThreadId
  try {
    while (true) {
      const prompt = (await readline.question('pando tui> ')).trim()
      if (!prompt) continue
      if (prompt === '/exit' || prompt === '/quit') break
      if (prompt === '/help') {
        renderHelp(io)
        continue
      }
      if (prompt === '/threads') {
        renderSnapshot(io, await adapter.snapshot())
        continue
      }
      if (prompt.startsWith('/thread ')) {
        const threadId = prompt.slice('/thread '.length).trim()
        const result = await adapter.resumeThread(threadId)
        activeThreadId = result.metadata.threadId
        io.output.write('Resumed thread: ' + activeThreadId + '\n')
        continue
      }
      if (prompt === '/new') {
        const thread = await adapter.createThread('Pando TUI chat')
        activeThreadId = thread.threadId
        io.output.write('Created thread: ' + activeThreadId + '\n')
        continue
      }
      if (prompt === '/models') {
        const models = await adapter.listModels()
        io.output.write(models.map(model => (model.selected ? '* ' : '  ') + model.provider + (model.name ? ' / ' + model.name : '') + ' [' + model.status + ']').join('\n') + '\n')
        continue
      }
      if (prompt.startsWith('/model ')) {
        const [provider, ...modelParts] = prompt.slice('/model '.length).trim().split(/\s+/)
        if (!provider) {
          io.output.write('Usage: /model <provider> [model]\n')
          continue
        }
        await adapter.selectModel(provider, modelParts.join(' ') || undefined)
        io.output.write('Selected model provider: ' + provider + '\n')
        continue
      }
      const result = await adapter.sendMessage(activeThreadId, prompt)
      activeThreadId = result.threadId ?? activeThreadId
      io.output.write('\nassistant> ' + result.finalText + '\n\n')
    }
  } finally {
    readline.close()
    adapter.close()
  }
}

export function renderSnapshot(io: PandoTuiIo, snapshot: PandoTuiSnapshot): void {
  const width = 92
  const line = '-'.repeat(width)
  const threads = snapshot.threads.slice(0, 8)
  const messages = snapshot.messages.slice(-8)
  io.output.write('\n+' + line + '+\n')
  io.output.write('| Pando TUI Shell v1 - OpenCode-style adapter surface'.padEnd(width + 1) + '|\n')
  io.output.write('+' + line + '+\n')
  io.output.write('| Threads'.padEnd(32) + '| Conversation'.padEnd(60) + '|\n')
  io.output.write('+' + '-'.repeat(31) + '+' + '-'.repeat(60) + '+\n')
  const rows = Math.max(threads.length, messages.length, 5)
  for (let index = 0; index < rows; index += 1) {
    const thread = threads[index]
    const message = messages[index]
    const left = thread ? short((thread.metadata.threadId === snapshot.activeThreadId ? '* ' : '  ') + thread.metadata.title, 29) : ''
    const right = message ? short(message.role + ': ' + message.content.replace(/\s+/g, ' '), 58) : ''
    io.output.write('| ' + left.padEnd(29) + '| ' + right.padEnd(58) + '|\n')
  }
  io.output.write('+' + line + '+\n')
  io.output.write('| ' + short(snapshot.statusLines.join(' | '), width - 2).padEnd(width - 2) + ' |\n')
  io.output.write('| Commands: /help /new /threads /thread <id> /models /model <provider> [model] /exit'.padEnd(width + 1) + '|\n')
  io.output.write('+' + line + '+\n\n')
}

function renderHelp(io: PandoTuiIo): void {
  io.output.write(['', 'Pando TUI commands:', '  /new                  Create a new thread', '  /threads              Refresh thread list', '  /thread <id>          Resume a thread', '  /models               Show model providers', '  /model <id> [name]    Select provider/model for new turns', '  /exit                 Quit TUI', ''].join('\n'))
}

function short(value: string, limit: number): string {
  return value.length <= limit ? value : value.slice(0, Math.max(0, limit - 1)) + '~'
}
