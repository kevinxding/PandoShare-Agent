import { createComponent, createElement, insert, spread } from '@opentui/solid'
import type { JSX as SolidJSX } from 'solid-js'

export namespace JSX {
  export type Element = SolidJSX.Element
  export interface IntrinsicElements {
    [elementName: string]: Record<string, unknown> | unknown
  }
  export interface ElementChildrenAttribute {
    children: unknown
  }
}

export function jsx(type: unknown, props: Record<string, unknown> | null): SolidJSX.Element {
  const normalizedProps = props ?? {}
  if (type === Fragment) return normalizedProps.children as SolidJSX.Element
  if (typeof type === 'function') return createComponent(type as never, normalizedProps as never) as unknown as SolidJSX.Element
  const element = createElement(String(type))
  const { children, ...rest } = normalizedProps
  const normalizedChildren = normalizeChildren(children)
  spread(element, rest, false)
  if (normalizedChildren !== undefined) insert(element, () => normalizedChildren)
  return element as unknown as SolidJSX.Element
}

export const jsxs = jsx

export function Fragment(props: { children?: unknown }): SolidJSX.Element {
  return normalizeChildren(props.children) as SolidJSX.Element
}

function normalizeChildren(children: unknown): unknown {
  if (Array.isArray(children)) {
    const filtered = children.map(normalizeChildren).filter(child => child !== undefined)
    return filtered.length ? filtered : undefined
  }
  if (typeof children === 'string' && children.trim() === '') return undefined
  return children
}
