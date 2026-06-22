const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/g,
  /gho_[A-Za-z0-9_]{12,}/g,
  /(api[_-]?key|token|secret|password)(["'\s:=]+)([^"'\s,}]+)/gi,
]

export function redactScheduledValue<T>(value: T): T {
  if (typeof value === 'string') return redactString(value) as T
  if (Array.isArray(value)) return value.map(item => redactScheduledValue(item)) as T
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = sensitiveKey(key) ? '[redacted]' : redactScheduledValue(item)
    }
    return output as T
  }
  return value
}

function redactString(value: string): string {
  let redacted = value
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (_match, prefix, separator) => prefix && separator ? `${prefix}${separator}[redacted]` : '[redacted]')
  }
  return redacted
}

function sensitiveKey(key: string): boolean {
  return /api[_-]?key|token|secret|password|authorization/i.test(key)
}
