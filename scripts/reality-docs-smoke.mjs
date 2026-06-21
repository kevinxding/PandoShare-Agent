#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = process.cwd()
const docsRoot = resolve(root, 'docs/kernel')
const sourceRoots = [
  resolve(root, 'src/core'),
  resolve(root, 'src/server'),
  resolve(root, 'src/main.tsx'),
  resolve(root, 'web/src/App.tsx'),
  resolve(root, 'scripts'),
]

const docs = await readMarkdownDocs(docsRoot)
const sourceText = await readSourceText(sourceRoots)
const readme = await readFile(resolve(root, 'README.md'), 'utf8')
const migrationPlan = docs.get('migration-plan.md') ?? ''
const generatedReport = docs.get('generated-acceptance-report.md') ?? ''

const publicApiNames = [
  'AgentKernel',
  'submitRun',
  'run',
  'submitMessage',
  'DurableRuntime',
  'appendEvent',
  'createCheckpoint',
  'writeRunSnapshot',
  'writeHeartbeat',
  'decideRecovery',
  'auditRun',
  'createMaintenanceReport',
  'LoopRuntime',
  'createLoop',
  'runNext',
  'resumeLoop',
  'status',
  'recoverLoop',
  'GuiRuntime',
  'observe',
  'requestAction',
  'executeApprovedAction',
  'act',
  'verify',
  'recoverGuiAction',
  'readAction',
  'listRecentActions',
  'GatewayDaemon',
  'start',
  'stop',
  'tick',
  'recover',
  'receiveInbound',
  'dispatchNextInbound',
  'sendNextOutbound',
  'listPendingApprovals',
  'enqueueOutbound',
  'ModelRouter',
  'route',
  'explainRoute',
  'selectModel',
  'planFallback',
  'recordRequestStarted',
  'recordResponseCompleted',
  'recordRequestFailed',
  'readUsage',
  'readBudgetStatus',
  'listProviders',
  'listModels',
  'listProfiles',
  'readHealth',
  'ReplayService',
  'buildReport',
  'buildMarkdown',
  'buildJson',
  'exportBundle',
  'detectIncidents',
  'buildGraph',
  'buildOperatorSummary',
]

const capabilityEvidence = [
  ['Web UI', ['web/src/App.tsx', 'serve:smoke']],
  ['Model layer', ['docs/kernel/model-router-v2.md', 'model:router-smoke']],
  ['Harness loop', ['docs/kernel/seven-kernels.md', 'kernel:smoke']],
  ['Context management', ['context-builder:smoke', 'compact:smoke']],
  ['Tools', ['tools:smoke', 'tool-result-storage:smoke']],
  ['GUI automation', ['docs/kernel/gui-runtime-v2.md', 'gui:runtime-smoke']],
  ['Loop Engineering', ['docs/kernel/loop-runtime-v2.md', 'loop:core-smoke']],
  ['Gateway runtime', ['docs/kernel/gateway-daemon-v2.md', 'gateway:core-smoke']],
  ['Stability runner', ['stability:smoke', 'scripts/stability-runner.mjs']],
]

const failures = []
const docsText = Array.from(docs.entries())
  .filter(([name]) => name !== 'generated-acceptance-report.md')
  .map(([, text]) => text)
  .join('\n')

for (const apiName of publicApiNames) {
  if (docsText.includes(apiName) && !sourceText.includes(apiName)) {
    failures.push(`docs mention public API ${apiName}, but source does not contain it`)
  }
}

for (const [claim, evidence] of capabilityEvidence) {
  if (!readme.includes(claim)) continue
  if (!evidence.some(item => readme.includes(item) || docsText.includes(item) || sourceText.includes(item))) {
    failures.push(`README capability lacks doc/script/source evidence: ${claim}`)
  }
}

for (const [name, text] of docs) {
  if (name === 'generated-acceptance-report.md') continue
  const manualPassClaim = /(npm run [^\n]+ passed|smoke[^\n]+ passed|verification[^\n]+ passed|passed[^\n]+smoke)/i.test(text)
  if (manualPassClaim && !text.includes('generated-acceptance-report.md')) {
    failures.push(`${name} contains manual test pass language without referencing generated-acceptance-report.md`)
  }
}

if (/Durable Runtime V2[\s\S]*?Next work:[\s\S]*?cross-process durable seq locking/i.test(migrationPlan)) {
  failures.push('migration-plan.md still lists completed durable seq locking as next work')
}

if (!generatedReport && (docs.get('acceptance-report.md') ?? '').includes('generated-acceptance-report.md') === false) {
  failures.push('acceptance-report.md must reference generated-acceptance-report.md')
}

if (failures.length > 0) {
  console.error('Reality docs smoke failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('reality docs smoke passed')

async function readMarkdownDocs(directory) {
  const result = new Map()
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      result.set(entry.name, await readFile(join(directory, entry.name), 'utf8'))
    }
  }
  return result
}

async function readSourceText(paths) {
  const chunks = []
  for (const item of paths) {
    chunks.push(await readPath(item))
  }
  return chunks.join('\n')
}

async function readPath(path) {
  const stats = await import('node:fs/promises').then(fs => fs.stat(path))
  if (stats.isFile()) return readFile(path, 'utf8')
  const chunks = []
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const child = join(path, entry.name)
    if (entry.isDirectory()) chunks.push(await readPath(child))
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) chunks.push(await readFile(child, 'utf8'))
  }
  return chunks.join('\n')
}
