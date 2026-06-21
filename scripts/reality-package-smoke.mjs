#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const scripts = packageJson.scripts ?? {}

const requiredScripts = [
  'kernel:smoke',
  'durable:smoke',
  'durable:hardening-smoke',
  'loop:core-smoke',
  'loop:projection-smoke',
  'loop:recovery-smoke',
  'gui:runtime-smoke',
  'gui:approval-smoke',
  'gui:recovery-smoke',
  'gateway:core-smoke',
  'gateway:command-smoke',
  'gateway:delivery-smoke',
  'gateway:approval-smoke',
  'gateway:recovery-smoke',
  'model:router-smoke',
  'model:capability-smoke',
  'model:fallback-smoke',
  'model:budget-smoke',
  'model:profile-smoke',
  'replay:run-smoke',
  'replay:loop-smoke',
  'replay:cross-core-smoke',
  'replay:incident-smoke',
  'replay:export-smoke',
  'replay:api-smoke',
  'replay:cli-smoke',
  'reality:api-contract',
  'reality:package',
  'reality:docs',
  'reality:dist',
  'reality:clean-clone',
  'acceptance:generate',
  'acceptance:full',
]

const failures = []

for (const name of requiredScripts) {
  if (typeof scripts[name] !== 'string' || !scripts[name].trim()) {
    failures.push(`package.json is missing script: ${name}`)
  }
}

for (const [name, command] of Object.entries(scripts)) {
  for (const scriptPath of referencedScriptFiles(command)) {
    try {
      await access(resolve(root, scriptPath))
    } catch {
      failures.push(`${name} points to missing file: ${scriptPath}`)
    }
  }
  if (name.endsWith(':smoke') && !command.includes('npm run build')) {
    const distBackedFiles = await distBackedScriptFiles(command)
    if (distBackedFiles.length > 0) {
      failures.push(`${name} must build before dist-backed smoke scripts: ${distBackedFiles.join(', ')}`)
    }
  }
}

if (failures.length > 0) {
  console.error('Reality package smoke failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('reality package smoke passed')

function referencedScriptFiles(command) {
  const files = new Set()
  const pattern = /(?:node|tsx|bun)\s+(scripts\/[A-Za-z0-9_.-]+\.mjs)/g
  let match
  while ((match = pattern.exec(command))) files.add(match[1])
  return files
}

async function distBackedScriptFiles(command) {
  const files = []
  for (const scriptPath of referencedScriptFiles(command)) {
    try {
      const text = await readFile(resolve(root, scriptPath), 'utf8')
      if (text.includes('../dist/') || text.includes('\"../dist/') || text.includes("'../dist/")) {
        files.push(scriptPath)
      }
    } catch {
      continue
    }
  }
  return files
}
