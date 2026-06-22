/** @jsxImportSource #pando-opentui */
import { createMemo } from 'solid-js'

import type { PandoCommand } from './PandoCommands.js'
import { canRunPandoCommand, visiblePandoCommands } from './PandoCommands.js'
import { PandoDialogSelect, type PandoDialogSelectColors, type PandoDialogSelectOption } from './PandoDialogSelect.js'

export function PandoCommandPalette(props: {
  commands: readonly PandoCommand[]
  colors: PandoDialogSelectColors
  close: () => void
}) {
  const options = createMemo(() => commandOptions(props.commands, props.close))
  return (
    <PandoDialogSelect
      title="Commands"
      placeholder="Search commands..."
      options={options()}
      colors={props.colors}
      close={props.close}
    />
  )
}

function commandOptions(
  commands: readonly PandoCommand[],
  close: () => void,
): Array<PandoDialogSelectOption<string>> {
  const visible = visiblePandoCommands(commands)
  const suggested = visible.filter(command => command.suggested)
  const optionFor = (command: PandoCommand, category: string = command.category, prefix = ''): PandoDialogSelectOption<string> => ({
    title: command.title,
    value: prefix + command.name,
    category,
    description: command.description,
    footer: command.shortcut ?? slashFooter(command),
    disabled: !canRunPandoCommand(command),
    suggested: command.suggested,
    onSelect: () => {
      if (!canRunPandoCommand(command)) return
      close()
      void command.run()
    },
  })

  return [
    ...suggested.map(command => optionFor(command, 'Suggested', 'suggested:')),
    ...visible.map(command => optionFor(command)),
  ]
}

function slashFooter(command: PandoCommand): string | undefined {
  if (!command.slashName) return
  const aliases = command.slashAliases?.length ? ' /' + command.slashAliases.join(' /') : ''
  return '/' + command.slashName + aliases
}
