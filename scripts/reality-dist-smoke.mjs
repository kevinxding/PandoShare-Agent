#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const distCore = resolve(root, 'dist/src/core/index.js')
const srcCore = resolve(root, 'src/core/index.ts')

try {
  await access(distCore)
} catch {
  console.error('Reality dist smoke failed:')
  console.error('- dist/src/core/index.js does not exist. Run npm run build first.')
  process.exit(1)
}

const srcExports = exportSpecifiers(await readFile(srcCore, 'utf8'))
const distExports = exportSpecifiers(await readFile(distCore, 'utf8'))
const failures = []

for (const specifier of srcExports) {
  if (!distExports.has(specifier)) {
    failures.push(`dist/src/core/index.js is missing export: ${specifier}`)
  }
}

for (const specifier of distExports) {
  if (!srcExports.has(specifier)) {
    failures.push(`dist/src/core/index.js has stale export not in source: ${specifier}`)
  }
}

const core = await import('../dist/src/core/index.js')
for (const exportName of ['AgentKernel', 'DurableRuntime', 'LoopRuntime', 'GuiRuntime', 'GatewayDaemon', 'ModelRouter', 'ReplayService']) {
  if (typeof core[exportName] !== 'function') {
    failures.push(`dist core is missing public export: ${exportName}`)
  }
}

if (failures.length > 0) {
  console.error('Reality dist smoke failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('reality dist smoke passed')

function exportSpecifiers(text) {
  const result = new Set()
  const pattern = /export \* from ['"](.+?)['"]/g
  let match
  while ((match = pattern.exec(text))) result.add(match[1])
  return result
}
