import type { BackendAction } from '../backend/index.js'
import type { MissionControlAction } from './MissionControlTypes.js'

const ACTION_MAP: Record<MissionControlAction, BackendAction> = {
  'agent.stop': 'agent.interrupt',
  'loop.runNext': 'loop.runNext',
  'loop.recover': 'loop.recover',
  'gateway.tick': 'gateway.tick',
  'gateway.retryOutbound': 'gateway.tick',
  'gui.releaseInput': 'gui.requestAction',
  'gui.approve': 'gui.approve',
  'gui.reject': 'gui.reject',
  'model.route': 'model.route',
  'replay.export': 'replay.export',
  'scheduled.create': 'scheduled.create',
  'scheduled.update': 'scheduled.update',
  'scheduled.delete': 'scheduled.delete',
  'scheduled.pause': 'scheduled.pause',
  'scheduled.resume': 'scheduled.resume',
  'scheduled.list': 'scheduled.list',
  'scheduled.get': 'scheduled.get',
  'scheduled.runs': 'scheduled.runs',
  'scheduled.tick': 'scheduled.tick',
  'scheduled.runNow': 'scheduled.runNow',
  'scheduled.health': 'scheduled.health',
  'system.health': 'system.health',
}

export function toBackendAction(action: string): BackendAction {
  if (!isMissionControlAction(action)) throw new Error('Unsupported Mission Control action: ' + action)
  return ACTION_MAP[action]
}

export function isMissionControlAction(action: string): action is MissionControlAction {
  return Object.prototype.hasOwnProperty.call(ACTION_MAP, action)
}

export function listMissionControlActions(): MissionControlAction[] {
  return Object.keys(ACTION_MAP) as MissionControlAction[]
}
