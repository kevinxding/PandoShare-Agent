import { readFile, stat } from 'node:fs/promises'

import type { LoopVerifierSpec, VerificationResult } from './LoopTypes.js'

export class LoopVerifier {
  async verify(spec: LoopVerifierSpec): Promise<VerificationResult> {
    switch (spec.type) {
      case 'command':
        return {
          ok: Boolean(spec.command.trim()),
          verifierType: 'command',
          message: 'Command verifier is registered for execution by the legacy loop adapter.',
        }
      case 'file':
        return this.verifyFile(spec)
      case 'custom':
        return {
          ok: true,
          verifierType: 'custom',
          message: `Custom verifier accepted: ${spec.name}`,
        }
    }
  }

  private async verifyFile(spec: Extract<LoopVerifierSpec, { type: 'file' }>): Promise<VerificationResult> {
    const exists = await pathExists(spec.path)
    const shouldExist = spec.exists ?? true
    if (exists !== shouldExist) {
      return {
        ok: false,
        verifierType: 'file',
        message: shouldExist ? `Expected file to exist: ${spec.path}` : `Expected file to be absent: ${spec.path}`,
      }
    }
    if (!exists || spec.contains === undefined) {
      return {
        ok: true,
        verifierType: 'file',
        message: `File verifier passed: ${spec.path}`,
      }
    }
    const content = await readFile(spec.path, 'utf8')
    return {
      ok: content.includes(spec.contains),
      verifierType: 'file',
      message: content.includes(spec.contains)
        ? `File contains expected text: ${spec.path}`
        : `File missing expected text: ${spec.path}`,
    }
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
