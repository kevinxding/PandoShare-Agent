export class FileLock {
  private readonly tails = new Map<string, Promise<unknown>>()

  async withLock<T>(key: string, run: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve()
    let release: () => void = () => undefined
    const tail = new Promise<void>(resolve => {
      release = resolve
    })
    this.tails.set(key, previous.then(() => tail, () => tail))
    await previous.catch(() => undefined)
    try {
      return await run()
    } finally {
      release()
      if (this.tails.get(key) === tail) this.tails.delete(key)
    }
  }
}
