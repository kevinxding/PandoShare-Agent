import { createPandoTuiAdapter } from './PandoTuiAdapter.js'
import { runPandoTuiShell } from './PandoTuiShell.js'
import type { PandoTuiOptions } from './PandoTuiTypes.js'

export async function runPandoTui(options: PandoTuiOptions): Promise<void> {
  const adapter = createPandoTuiAdapter({
    cwd: options.cwd,
    configPath: options.configPath,
    provider: options.provider,
    model: options.model,
    threadId: options.threadId,
    resumeLast: options.resumeLast,
    newThread: options.newThread,
    goalId: options.goalId,
    io: options.io,
    fake: options.smoke,
  })
  if (options.plain) {
    await runPandoTuiShell({ adapter, io: options.io, smoke: options.smoke })
    return
  }
  const { runPandoOpenTuiRenderer } = await import('./opentui/PandoOpenTuiRenderer.js')
  await runPandoOpenTuiRenderer({
    adapter,
    io: options.io,
    smoke: options.smoke,
    startInSession: Boolean(options.threadId || options.resumeLast),
  })
}
