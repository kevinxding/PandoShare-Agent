#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)

if (shouldRelaunchWithBun(argv)) {
  const result = runWithBun([fileURLToPath(import.meta.url), ...argv])
  if (result.error) {
    console.error('Pando OpenTUI requires Bun on this runtime. Install Bun or use: pando tui --plain')
    console.error(result.error.message)
    process.exit(1)
  }
  if (typeof result.status === 'number') process.exit(result.status)
  process.exit(result.signal ? 1 : 0)
}

await import('../dist/src/entrypoints/cli.js')

function runWithBun(args) {
  let lastResult
  for (const command of bunCandidates()) {
    const result = spawnSync(command, ['--conditions', 'browser', ...args], {
      stdio: 'inherit',
      env: { ...process.env, PANDO_TUI_BUN_RELAUNCH: '1', PANDO_TUI_SOLID_BROWSER: '1' },
      windowsHide: true,
      shell: process.platform === 'win32',
    })
    if (!result.error || result.error.code !== 'ENOENT') return result
    lastResult = result
  }
  return lastResult ?? { error: new Error('bun executable not found') }
}

function bunCandidates() {
  const candidates = process.platform === 'win32' ? ['bun.cmd', 'bun.exe', 'bun'] : ['bun']
  if (process.platform === 'win32' && process.env.APPDATA) {
    candidates.unshift(join(process.env.APPDATA, 'npm', 'bun.cmd'))
  }
  return [...new Set(candidates)].filter(command => !command.includes('\\') || existsSync(command))
}

function shouldRelaunchWithBun(args) {
  if (process.env.PANDO_TUI_SOLID_BROWSER === '1') return false
  if (args.includes('--help') || args.includes('-h') || args.includes('--version') || args.includes('-v') || args.includes('-V')) return false
  if (args.includes('--plain')) return false
  const first = args[0]
  if (first === 'tui') return true
  if (first && ['exec', 'repl', 'doctor', 'mcp', 'gui', 'gateway', 'goal', 'thread', 'loop', 'serve', 'replay'].includes(first)) return false
  return hasNoPromptArg(args)
}

function hasNoPromptArg(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) return false
    if (arg === '--config' || arg === '--provider' || arg === '--model' || arg === '--thread' || arg === '--goal') index += 1
  }
  return true
}
