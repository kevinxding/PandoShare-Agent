import { appendFile, mkdir, readFile, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

export type CorruptJsonlRecord = {
  lineNumber: number
  linePreview: string
  message: string
}

export type JsonlReadResult<T> = {
  records: T[]
  corruptRecords: CorruptJsonlRecord[]
}

export class JsonlStore<TRecord = unknown> {
  constructor(readonly path: string) {}

  async append(record: TRecord): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    await appendFile(this.path, `${JSON.stringify(record)}\n`, 'utf8')
  }

  async read(): Promise<JsonlReadResult<TRecord>> {
    if (!(await exists(this.path))) return { records: [], corruptRecords: [] }
    const text = await readFile(this.path, 'utf8')
    const records: TRecord[] = []
    const corruptRecords: CorruptJsonlRecord[] = []
    const lines = text.split(/\r?\n/)
    lines.forEach((line, index) => {
      if (!line.trim()) return
      try {
        records.push(JSON.parse(line) as TRecord)
      } catch (error) {
        corruptRecords.push({
          lineNumber: index + 1,
          linePreview: line.slice(0, 500),
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })
    return { records, corruptRecords }
  }

  async readRecords(): Promise<TRecord[]> {
    return (await this.read()).records
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
