import type { Task } from './LoopTypes.js'

export class TaskQueue {
  private readonly tasks: Task[] = []

  enqueue(task: Task): void {
    this.tasks.push({ ...task, status: 'queued' })
  }

  next(): Task | undefined {
    const index = this.tasks.findIndex(task => task.status === 'queued')
    if (index === -1) return undefined
    const task = { ...this.tasks[index]!, status: 'running' as const }
    this.tasks[index] = task
    return task
  }

  update(task: Task): void {
    const index = this.tasks.findIndex(item => item.taskId === task.taskId)
    if (index === -1) this.tasks.push(task)
    else this.tasks[index] = task
  }

  list(): readonly Task[] {
    return [...this.tasks]
  }
}
