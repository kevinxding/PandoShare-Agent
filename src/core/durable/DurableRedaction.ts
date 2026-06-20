const SECRET_KEY_PATTERN = /(api[_-]?key|token|password|secret|cookie|authorization)/i

export function redactDurablePayload<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value, redactSecrets)) as T
}

function redactSecrets(key: string, value: unknown): unknown {
  if (SECRET_KEY_PATTERN.test(key)) return '<redacted>'
  if (typeof value === 'string' && looksLikeSecret(value)) return '<redacted>'
  return value
}

function looksLikeSecret(value: string): boolean {
  return /sk-[A-Za-z0-9_-]{16,}/.test(value) || /Bearer\s+[A-Za-z0-9._-]{16,}/i.test(value)
}
