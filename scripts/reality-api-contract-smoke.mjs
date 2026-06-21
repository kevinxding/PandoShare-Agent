#!/usr/bin/env node

const core = await import('../dist/src/core/index.js')

const contracts = [
  {
    exportName: 'AgentKernel',
    methods: ['submitRun', 'run', 'submitMessage'],
  },
  {
    exportName: 'DurableRuntime',
    methods: [
      'appendEvent',
      'createCheckpoint',
      'writeRunSnapshot',
      'writeHeartbeat',
      'decideRecovery',
      'auditRun',
      'createMaintenanceReport',
    ],
  },
  {
    exportName: 'LoopRuntime',
    methods: ['createLoop', 'runNext', 'resumeLoop', 'status', 'recoverLoop'],
  },
  {
    exportName: 'GuiRuntime',
    methods: [
      'observe',
      'requestAction',
      'executeApprovedAction',
      'act',
      'verify',
      'recoverGuiAction',
      'readAction',
      'listRecentActions',
    ],
  },
  {
    exportName: 'GatewayDaemon',
    methods: [
      'start',
      'stop',
      'status',
      'tick',
      'recover',
      'receiveInbound',
      'dispatchNextInbound',
      'sendNextOutbound',
      'listPendingApprovals',
      'enqueueOutbound',
    ],
  },
  {
    exportName: 'ModelRouter',
    methods: [
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
    ],
  },
  {
    exportName: 'ReplayService',
    methods: [
      'buildReport',
      'buildMarkdown',
      'buildJson',
      'exportBundle',
      'detectIncidents',
      'buildGraph',
      'buildOperatorSummary',
    ],
  },
]

const failures = []

for (const contract of contracts) {
  const exported = core[contract.exportName]
  if (typeof exported !== 'function') {
    failures.push(`${contract.exportName} is not exported from src/core/index.ts`)
    continue
  }
  for (const method of contract.methods) {
    if (typeof exported.prototype?.[method] !== 'function') {
      failures.push(`${contract.exportName}.${method} is missing`)
    }
  }
}

if (failures.length > 0) {
  console.error('Reality API contract smoke failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('reality api contract smoke passed')
