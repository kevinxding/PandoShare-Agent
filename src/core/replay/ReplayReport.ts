import type { ReplayTimelineItem } from './EventReplay.js'

export class ReplayReport {
  toMarkdown(input: { title?: string; timeline: readonly ReplayTimelineItem[] }): string {
    const lines = [
      `# ${input.title ?? 'Pando Run Replay'}`,
      '',
      `Total events: ${input.timeline.length}`,
      '',
      '## Timeline',
      '',
    ]
    for (const item of input.timeline) {
      lines.push(`- ${item.seq}. ${item.category}/${item.eventType} (${new Date(item.createdAtMs).toISOString()})`)
      if (item.warning) lines.push(`  warning: ${item.warning}`)
    }
    return `${lines.join('\n')}\n`
  }
}
