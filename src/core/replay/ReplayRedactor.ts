import type { ReplayRedactionMode, ReplayRedactionSummary } from './ReplayTypes.js'

const SECRET_KEY_PATTERN = /api[_-]?key|authorization|bearer|cookie|webhook|token|secret|password|pairing/i
const SECRET_VALUE_PATTERN = /(sk-[A-Za-z0-9_-]{16,}|gho_[A-Za-z0-9_]{16,}|Bearer\s+[A-Za-z0-9._-]{12,}|https:\/\/[^\s/]+\/[^\s]*(webhook|hook|bot)[^\s]*)/i
const ENV_SECRET_NAMES = new Set(['OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'MINIMAX_API_KEY', 'MINIMAX_CN_API_KEY'])

export class ReplayRedactor {
  redact<T>(value: T, mode: ReplayRedactionMode = 'strict'): { value: T; summary: ReplayRedactionSummary } {
    const paths: string[] = []
    const suspectedSecretPaths: string[] = []
    const redacted = redactValue(value, '$', mode, paths, suspectedSecretPaths)
    return {
      value: redacted as T,
      summary: {
        mode,
        redactedFieldCount: paths.length,
        paths,
        suspectedSecretPaths,
      },
    }
  }
}

function redactValue(value: unknown, path: string, mode: ReplayRedactionMode, paths: string[], suspected: string[]): unknown {
  if (typeof value === 'string') {
    if (ENV_SECRET_NAMES.has(value)) return value
    if (SECRET_VALUE_PATTERN.test(value)) {
      suspected.push(path)
      paths.push(path)
      return '[REDACTED]'
    }
    return value
  }
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item, index) => redactValue(item, `${path}[${index}]`, mode, paths, suspected))
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`
    if (SECRET_KEY_PATTERN.test(key)) {
      paths.push(childPath)
      suspected.push(childPath)
      out[key] = safeSecretPlaceholder(key, item, mode)
      continue
    }
    out[key] = redactValue(item, childPath, mode, paths, suspected)
  }
  return out
}

function safeSecretPlaceholder(key: string, value: unknown, mode: ReplayRedactionMode): string | string[] {
  if (mode === 'debug_safe' && /env/i.test(key) && typeof value === 'string') return value
  if (/env/i.test(key) && Array.isArray(value)) return value.filter(item => typeof item === 'string') as string[]
  if (/env/i.test(key) && typeof value === 'string') return value
  return '[REDACTED]'
}