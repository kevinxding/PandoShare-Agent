/** @jsxImportSource #pando-opentui */
import { onCleanup, onMount } from 'solid-js'
import type { TextareaRenderable } from '@opentui/core'

import { pandoPromptTextareaKeyBindings } from './PandoKeymap.js'

export type PandoPromptModel = {
  provider: string
  name?: string
  label: string
}

export type PandoPromptColors = {
  panel: string
  accent: string
  text: string
  muted: string
  dim: string
}

export type PandoPromptRef = {
  focused: boolean
  current: string
  set(value: string): void
  reset(): void
  blur(): void
  focus(): void
  submit(value?: string): Promise<boolean>
  newline(): void
}

type PandoPromptFrameProps = {
  id?: string
  width?: number | string
  placeholder: string
  disabledPlaceholder?: string
  disabled: boolean
  dialogOpen: boolean
  selectedModel?: PandoPromptModel
  colors: PandoPromptColors
  onSubmit: (value: string) => void | Promise<void>
  onChange?: (value: string) => void | Promise<void>
  onCommandTrigger?: () => void
  onFileMentionTrigger?: () => void
  onRef?: (ref: PandoPromptRef | undefined) => void
}

let activePrompt: PandoPromptRef | undefined
let activePromptInput: TextareaRenderable | undefined

export function PandoPromptFrame(props: PandoPromptFrameProps) {
  return (
    <box width={props.width ?? '100%'} flexShrink={0} flexDirection="column">
      <box width="100%" flexDirection="row" border={['left']} borderColor={props.colors.accent}>
        <box flexGrow={1} flexDirection="column" backgroundColor={props.colors.panel} paddingX={2} paddingTop={1}>
          <PandoPromptInput
            id={props.id}
            placeholder={props.placeholder}
            disabledPlaceholder={props.disabledPlaceholder}
            disabled={props.disabled}
            dialogOpen={props.dialogOpen}
            colors={props.colors}
            onSubmit={props.onSubmit}
            onChange={props.onChange}
            onCommandTrigger={props.onCommandTrigger}
            onFileMentionTrigger={props.onFileMentionTrigger}
            onRef={props.onRef}
          />
          <box flexShrink={0} flexDirection="row" paddingTop={1}>
            <text fg={props.colors.accent}>Build</text>
            <text fg={props.colors.muted}> . {modelLabel(props.selectedModel)}</text>
          </box>
        </box>
      </box>
      <box height={1} width="100%" flexDirection="row" border={['left']} borderColor={props.colors.accent}>
        <box flexGrow={1} backgroundColor={props.colors.panel} />
      </box>
    </box>
  )
}

function PandoPromptInput(props: {
  id?: string
  placeholder: string
  disabledPlaceholder?: string
  disabled: boolean
  dialogOpen: boolean
  colors: PandoPromptColors
  onSubmit: (value: string) => void | Promise<void>
  onChange?: (value: string) => void | Promise<void>
  onCommandTrigger?: () => void
  onFileMentionTrigger?: () => void
  onRef?: (ref: PandoPromptRef | undefined) => void
}) {
  let input: TextareaRenderable | undefined
  let current = ''
  let submitting = false

  const syncFromInput = () => {
    if (!input || isDestroyed(input)) return current
    current = readPromptText(input)
    return current
  }

  const emitPromptChange = (value: string) => {
    void props.onChange?.(value)
  }

  const setPromptText = (value: string) => {
    current = value
    emitPromptChange(value)
    if (!input || isDestroyed(input)) return
    const prompt = input as TextareaRenderable & { setText?: (text: string) => void; value?: string }
    if (prompt.setText) prompt.setText(value)
    else prompt.value = value
  }

  const ref: PandoPromptRef = {
    get focused() {
      return Boolean(input && !isDestroyed(input) && input.focused)
    },
    get current() {
      return syncFromInput()
    },
    set(value: string) {
      setPromptText(value)
    },
    reset() {
      setPromptText('')
    },
    blur() {
      if (!input || isDestroyed(input)) return
      input.blur()
    },
    focus() {
      if (!input || isDestroyed(input)) return
      input.focus()
    },
    async submit(value?: string) {
      if (submitting) return false
      submitting = true
      try {
        const text = (value ?? syncFromInput()).trim()
        if (props.disabled || props.dialogOpen || !text) return false
        setPromptText('')
        await props.onSubmit(text)
        return true
      } finally {
        submitting = false
      }
    },
    newline() {
      if (!input || isDestroyed(input)) return
      input.newLine()
      emitPromptChange(syncFromInput())
    },
  }

  onMount(() => {
    ref.focus()
    activePrompt = ref
    props.onRef?.(ref)
  })

  onCleanup(() => {
    if (activePrompt === ref) activePrompt = undefined
    if (activePromptInput === input) activePromptInput = undefined
    props.onRef?.(undefined)
  })

  return (
    <textarea
      id={props.id ?? 'pando-prompt-input'}
      ref={(element: TextareaRenderable) => {
        input = element
        activePromptInput = element
        activePrompt = ref
        props.onRef?.(ref)
      }}
      focused={true}
      minHeight={1}
      maxHeight={6}
      wrapMode="word"
      placeholder={props.disabled ? props.disabledPlaceholder ?? 'Waiting for response...' : props.placeholder}
      backgroundColor={props.colors.panel}
      focusedBackgroundColor={props.colors.panel}
      textColor={props.colors.text}
      focusedTextColor={props.colors.text}
      cursorColor={props.disabled ? props.colors.dim : props.colors.text}
      placeholderColor={props.colors.dim}
      keyBindings={pandoPromptTextareaKeyBindings}
      onContentChange={() => {
        const text = syncFromInput()
        emitPromptChange(text)
        if (props.disabled || props.dialogOpen) return
        if (text.trim() === '/') {
          setPromptText('')
          props.onCommandTrigger?.()
          return
        }
        const mentionBase = promptFileMentionBaseForTrigger(text)
        if (mentionBase !== undefined) {
          setPromptText(mentionBase)
          props.onFileMentionTrigger?.()
        }
      }}
      onSubmit={() => {
        if (props.dialogOpen) return
        setTimeout(() => {
          setTimeout(() => {
            void ref.submit()
          }, 0)
        }, 0)
      }}
    />
  )
}

export function submitActivePandoPrompt(): void {
  void activePrompt?.submit()
}

export function insertNewlineActivePandoPrompt(): void {
  activePrompt?.newline()
}

export function activePandoPromptInputForTest(): TextareaRenderable | undefined {
  return activePromptInput
}

export function submitActivePandoPromptForTest(value?: string): void {
  void activePrompt?.submit(value)
}

export function promptFileMentionBaseForTrigger(text: string): string | undefined {
  if (text === '@') return ''
  if (!text.endsWith(' @')) return undefined
  return text.slice(0, -2).trimEnd()
}

function readPromptText(input: TextareaRenderable): string {
  const prompt = input as TextareaRenderable & { plainText?: unknown; value?: unknown }
  return promptTextFromUnknown(prompt.plainText) || promptTextFromUnknown(prompt.value)
}

function promptTextFromUnknown(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isDestroyed(input: TextareaRenderable): boolean {
  return Boolean((input as TextareaRenderable & { isDestroyed?: boolean }).isDestroyed)
}

function modelLabel(model?: PandoPromptModel): string {
  if (!model) return 'Model not configured'
  return model.name ? model.name + ' ' + model.label : model.label
}
