/** @jsxImportSource #pando-opentui */
import type { InputRenderable, ScrollBoxRenderable } from '@opentui/core'
import { useKeyboard, useTerminalDimensions } from '@opentui/solid'
import fuzzysort from 'fuzzysort'
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'

import { isPandoKey, pandoKeyLabel, pandoPrimaryKeyLabel } from './PandoKeymap.js'

export type PandoDialogSelectColors = {
  panel: string
  panel2: string
  border: string
  accent: string
  text: string
  muted: string
  dim: string
}

export type PandoDialogSelectOption<T = string> = {
  title: string
  value: T
  category?: string
  description?: string
  footer?: string
  disabled?: boolean
  suggested?: boolean
  onSelect?: (option: PandoDialogSelectOption<T>) => void | Promise<void>
}

export type PandoDialogSelectRef<T = string> = {
  filter: string
  selected: PandoDialogSelectOption<T> | undefined
  filtered: PandoDialogSelectOption<T>[]
  moveTo(value: T): void
}

export function PandoDialogSelect<T = string>(props: {
  title: string
  placeholder?: string
  options: readonly PandoDialogSelectOption<T>[]
  colors: PandoDialogSelectColors
  current?: T
  close: () => void
  ref?: (ref: PandoDialogSelectRef<T>) => void
  onSelect?: (option: PandoDialogSelectOption<T>) => void | Promise<void>
}) {
  const [filter, setFilter] = createSignal('')
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const dimensions = useTerminalDimensions()
  let input: InputRenderable | undefined
  let scroll: ScrollBoxRenderable | undefined
  let scrollTimer: ReturnType<typeof setTimeout> | undefined

  const filtered = createMemo(() => filterOptions(props.options, filter()))
  const grouped = createMemo(() => groupOptions(filtered(), filter()))
  const selected = createMemo(() => filtered()[selectedIndex()])
  const maxHeight = createMemo(() => Math.max(6, Math.min(18, Math.floor(dimensions().height * 0.52))))

  const ref: PandoDialogSelectRef<T> = {
    get filter() {
      return filter()
    },
    get selected() {
      return selected()
    },
    get filtered() {
      return filtered()
    },
    moveTo(value: T) {
      const index = filtered().findIndex(option => option.value === value)
      if (index >= 0) moveTo(index, true)
    },
  }

  props.ref?.(ref)

  onMount(() => {
    setTimeout(() => {
      if (!input || isDestroyed(input)) return
      input.focus()
    }, 1)
  })

  onCleanup(() => {
    if (scrollTimer) clearTimeout(scrollTimer)
    props.ref?.(undefined as unknown as PandoDialogSelectRef<T>)
  })

  createEffect(() => {
    filter()
    moveTo(0, true)
  })

  useKeyboard(event => {
    if (isPandoKey(event, 'dialog.close')) {
      event.preventDefault()
      props.close()
      return
    }
    if (isPandoKey(event, 'dialog.input.clear')) {
      event.preventDefault()
      setDialogFilter('')
      return
    }
    if (isPandoKey(event, 'dialog.input.delete_word_backward')) {
      event.preventDefault()
      setDialogFilter(deleteDialogFilterBackwardWord(filter()))
      return
    }
    if (isPandoKey(event, 'dialog.select.prev')) {
      event.preventDefault()
      move(-1)
      return
    }
    if (isPandoKey(event, 'dialog.select.next')) {
      event.preventDefault()
      move(1)
      return
    }
    if (isPandoKey(event, 'dialog.select.page_up')) {
      event.preventDefault()
      move(-8)
      return
    }
    if (isPandoKey(event, 'dialog.select.page_down')) {
      event.preventDefault()
      move(8)
      return
    }
    if (isPandoKey(event, 'dialog.select.home')) {
      event.preventDefault()
      moveTo(0, true)
      return
    }
    if (isPandoKey(event, 'dialog.select.end')) {
      event.preventDefault()
      moveTo(filtered().length - 1, true)
      return
    }
    if (isPandoKey(event, 'dialog.select.submit')) {
      event.preventDefault()
      submit()
    }
  })

  function move(delta: number) {
    const total = filtered().length
    if (total === 0) return
    let next = selectedIndex() + delta
    if (next < 0) next = total - 1
    if (next >= total) next = 0
    moveTo(next, false)
  }

  function moveTo(index: number, resetScroll: boolean) {
    const total = filtered().length
    const bounded = total === 0 ? 0 : Math.max(0, Math.min(index, total - 1))
    setSelectedIndex(bounded)
    if (!scroll) return
    if (scrollTimer) clearTimeout(scrollTimer)
    scrollTimer = setTimeout(() => {
      if (!scroll || isDestroyed(scroll)) return
      if (resetScroll) {
        scroll.scrollTo(0)
        return
      }
      scroll.scrollTo(Math.max(0, bounded - 3))
    }, 0)
  }

  function submit() {
    const option = selected()
    if (!option || option.disabled) return
    props.close()
    void option.onSelect?.(option)
    void props.onSelect?.(option)
  }

  function setDialogFilter(value: string) {
    setFilter(value)
    if (!input || isDestroyed(input)) return
    input.value = value
    input.focus()
  }

  return (
    <>
      <box flexDirection="row" justifyContent="space-between" paddingBottom={1}>
        <text fg={props.colors.text}>{props.title}</text>
        <text fg={props.colors.muted} onMouseUp={props.close}>{pandoKeyLabel('dialog.close')} close</text>
      </box>
      <box backgroundColor={props.colors.panel} border={['left']} borderColor={props.colors.accent} paddingX={2} paddingY={1}>
        <input
          ref={(element: InputRenderable) => { input = element }}
          placeholder={props.placeholder ?? 'Search'}
          backgroundColor={props.colors.panel}
          focusedBackgroundColor={props.colors.panel}
          textColor={props.colors.text}
          focusedTextColor={props.colors.text}
          placeholderColor={props.colors.dim}
          cursorColor={props.colors.text}
          onInput={(value: string) => setFilter(value)}
        />
      </box>
      <box height={1} />
      <Show when={filtered().length > 0} fallback={<text fg={props.colors.muted}>No results found.</text>}>
        <scrollbox
          ref={(element: ScrollBoxRenderable) => { scroll = element }}
          maxHeight={maxHeight()}
          stickyScroll={false}
          verticalScrollbarOptions={{
            visible: true,
            trackOptions: {
              backgroundColor: props.colors.panel2,
              foregroundColor: props.colors.border,
            },
          }}
        >
          <For each={grouped()}>
            {group => (
              <>
                <Show when={group.category}>
                  <text fg={props.colors.accent}>{group.category}</text>
                </Show>
                <For each={group.options}>
                  {option => (
                    <SelectOptionRow
                      option={option}
                      active={selected() === option}
                      current={isCurrentOption(option, props.current)}
                      colors={props.colors}
                      onSelect={() => {
                        if (option.disabled) return
                        props.close()
                        void option.onSelect?.(option)
                        void props.onSelect?.(option)
                      }}
                    />
                  )}
                </For>
              </>
            )}
          </For>
        </scrollbox>
      </Show>
      <box height={1} />
      <box flexDirection="row" justifyContent="space-between">
        <text fg={props.colors.muted}>{pandoPrimaryKeyLabel('dialog.select.prev')}/{pandoPrimaryKeyLabel('dialog.select.next')} move  {pandoPrimaryKeyLabel('dialog.select.submit')} select  {pandoPrimaryKeyLabel('dialog.input.clear')} clear  {pandoPrimaryKeyLabel('dialog.input.delete_word_backward')} word</text>
        <text fg={props.colors.muted}>{filtered().length} item(s)</text>
      </box>
    </>
  )
}

function SelectOptionRow<T>(props: {
  option: PandoDialogSelectOption<T>
  active: boolean
  current: boolean
  colors: PandoDialogSelectColors
  onSelect: () => void
}) {
  const textColor = () => {
    if (props.option.disabled) return props.colors.dim
    return props.active ? props.colors.panel2 : props.colors.text
  }
  const detailColor = () => {
    if (props.option.disabled) return props.colors.dim
    return props.active ? props.colors.panel2 : props.colors.muted
  }
  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      backgroundColor={props.active ? props.colors.accent : undefined}
      paddingX={1}
      onMouseUp={props.onSelect}
    >
      <box flexDirection="row" gap={1} flexGrow={1}>
        <text fg={props.current ? props.colors.accent : detailColor()}>{props.current ? '*' : ' '}</text>
        <box flexDirection="column" flexGrow={1}>
          <text fg={textColor()}>{props.option.title}</text>
          <Show when={props.option.description}>
            <text fg={detailColor()}>{props.option.description}</text>
          </Show>
        </box>
      </box>
      <text fg={detailColor()}>{props.option.footer ?? ''}</text>
    </box>
  )
}

function isCurrentOption<T>(option: PandoDialogSelectOption<T>, current: T | undefined): boolean {
  return current !== undefined && Object.is(option.value, current)
}

function filterOptions<T>(
  options: readonly PandoDialogSelectOption<T>[],
  query: string,
): PandoDialogSelectOption<T>[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...options]
  return fuzzysort.go(needle, options, {
    keys: ['title', 'category', 'description', 'footer'],
  }).map(result => result.obj)
}

function groupOptions<T>(
  options: readonly PandoDialogSelectOption<T>[],
  query: string,
): Array<{ category: string; options: PandoDialogSelectOption<T>[] }> {
  if (query.trim()) return [{ category: '', options: [...options] }]
  const groups = new Map<string, PandoDialogSelectOption<T>[]>()
  for (const option of options) {
    const category = option.category ?? ''
    const group = groups.get(category) ?? []
    group.push(option)
    groups.set(category, group)
  }
  return Array.from(groups, ([category, group]) => ({ category, options: group }))
}

export function deleteDialogFilterBackwardWord(text: string): string {
  return text.replace(/\s+$/g, '').replace(/\S+$/g, '')
}

function isDestroyed(value: { isDestroyed?: boolean }): boolean {
  return Boolean(value.isDestroyed)
}
