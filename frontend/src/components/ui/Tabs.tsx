import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

/**
 * <Tabs> — WAI-ARIA tab pattern primitive.
 *
 * Composition (Radix-shaped):
 *   <Tabs value onValueChange>           // or defaultValue (uncontrolled)
 *     <Tabs.List aria-label="Vault views">
 *       <Tabs.Trigger value="overview">overview</Tabs.Trigger>
 *       <Tabs.Trigger value="commitments" count={n}>commitments</Tabs.Trigger>
 *     </Tabs.List>
 *     <Tabs.Panel value="overview">...</Tabs.Panel>
 *     <Tabs.Panel value="commitments">...</Tabs.Panel>
 *   </Tabs>
 *
 * Keyboard pattern (per https://www.w3.org/WAI/ARIA/apg/patterns/tabs/):
 *   - ArrowLeft / ArrowRight cycle through triggers
 *   - Home / End jump to first / last
 *   - Enter / Space activate (also automatic on arrow if activation is manual:
 *     here we use automatic activation — cycling moves both focus and selection)
 *   - Roving tabindex: only the active trigger has tabIndex=0
 *
 * Visual chrome reuses the existing .ds-tabs / .ds-tab / .ds-tab-count CSS
 * tokens unchanged — this component is a behavior + a11y wrapper, not a new
 * design language.
 */

interface TabsContextValue {
  value: string
  setValue: (next: string) => void
  registerTrigger: (value: string, ref: HTMLButtonElement | null) => void
  focusByOffset: (current: string, direction: 1 | -1 | 'home' | 'end') => void
  baseId: string
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext(component: string): TabsContextValue {
  const ctx = useContext(TabsContext)
  if (!ctx) {
    throw new Error(`${component} must be rendered inside <Tabs>`)
  }
  return ctx
}

export interface TabsProps {
  /** Controlled active tab value. Pair with `onValueChange`. */
  value?: string
  /** Notified when the active tab changes. */
  onValueChange?: (value: string) => void
  /** Initial value in uncontrolled mode. */
  defaultValue?: string
  children: ReactNode
  className?: string
}

export function Tabs({
  value: controlledValue,
  onValueChange,
  defaultValue,
  children,
  className,
}: TabsProps) {
  const [uncontrolled, setUncontrolled] = useState<string | undefined>(defaultValue)
  const isControlled = controlledValue !== undefined
  const value = isControlled ? controlledValue : uncontrolled
  const baseId = useId()
  const triggers = useRef(new Map<string, HTMLButtonElement>())
  const order = useRef<string[]>([])

  const setValue = useCallback(
    (next: string) => {
      if (!isControlled) setUncontrolled(next)
      onValueChange?.(next)
    },
    [isControlled, onValueChange],
  )

  const registerTrigger = useCallback((triggerValue: string, ref: HTMLButtonElement | null) => {
    if (ref) {
      triggers.current.set(triggerValue, ref)
      if (!order.current.includes(triggerValue)) order.current.push(triggerValue)
    } else {
      triggers.current.delete(triggerValue)
      order.current = order.current.filter((v) => v !== triggerValue)
    }
  }, [])

  const focusByOffset = useCallback(
    (current: string, direction: 1 | -1 | 'home' | 'end') => {
      const list = order.current
      if (list.length === 0) return
      let nextIndex: number
      if (direction === 'home') nextIndex = 0
      else if (direction === 'end') nextIndex = list.length - 1
      else {
        const idx = list.indexOf(current)
        if (idx === -1) return
        nextIndex = (idx + direction + list.length) % list.length
      }
      const nextValue = list[nextIndex]
      if (!nextValue) return
      const node = triggers.current.get(nextValue)
      node?.focus()
      setValue(nextValue)
    },
    [setValue],
  )

  const ctx = useMemo<TabsContextValue>(
    () => ({
      value: value ?? '',
      setValue,
      registerTrigger,
      focusByOffset,
      baseId,
    }),
    [value, setValue, registerTrigger, focusByOffset, baseId],
  )

  const cls = ['ds-tabs-root', className].filter(Boolean).join(' ')
  return (
    <TabsContext.Provider value={ctx}>
      <div className={cls}>{children}</div>
    </TabsContext.Provider>
  )
}

export interface TabsListProps {
  children: ReactNode
  /** Accessible label for the tablist. */
  'aria-label'?: string
  className?: string
}

function TabsList({ children, className, 'aria-label': ariaLabel }: TabsListProps) {
  const cls = ['ds-tabs', className].filter(Boolean).join(' ')
  return (
    <div className={cls} role="tablist" aria-label={ariaLabel}>
      {children}
    </div>
  )
}

export interface TabsTriggerProps {
  value: string
  children: ReactNode
  /** Optional badge count rendered to the right of the label. */
  count?: number
  className?: string
}

function TabsTrigger({ value, children, count, className }: TabsTriggerProps) {
  const ctx = useTabsContext('Tabs.Trigger')
  const isSelected = ctx.value === value
  const cls = ['ds-tab', className].filter(Boolean).join(' ')

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault()
        ctx.focusByOffset(value, 1)
        break
      case 'ArrowLeft':
        event.preventDefault()
        ctx.focusByOffset(value, -1)
        break
      case 'Home':
        event.preventDefault()
        ctx.focusByOffset(value, 'home')
        break
      case 'End':
        event.preventDefault()
        ctx.focusByOffset(value, 'end')
        break
    }
  }

  return (
    <button
      type="button"
      role="tab"
      id={`${ctx.baseId}-trigger-${value}`}
      aria-controls={`${ctx.baseId}-panel-${value}`}
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
      ref={(node) => ctx.registerTrigger(value, node)}
      className={cls}
      onClick={() => ctx.setValue(value)}
      onKeyDown={handleKeyDown}
    >
      {children}
      {count !== undefined && count > 0 && <span className="ds-tab-count">{count}</span>}
    </button>
  )
}

export interface TabsPanelProps {
  value: string
  children: ReactNode
  /**
   * Accessible label override. When provided, the panel is named from this
   * string and the default `aria-labelledby` link to the trigger is dropped —
   * useful when the panel content opens with its own heading (so screen
   * readers don't announce the trigger name + the heading name back-to-back).
   * When omitted, the panel inherits its name from the matching trigger.
   */
  'aria-label'?: string
  className?: string
}

function TabsPanel({ value, children, className, 'aria-label': ariaLabel }: TabsPanelProps) {
  const ctx = useTabsContext('Tabs.Panel')
  if (ctx.value !== value) return null
  // Choose ONE labeling source to avoid double-announcement on screen
  // readers. When the caller passes aria-label they're saying "the panel
  // body provides its own heading"; honor that and skip the labelledby
  // back-link to the trigger.
  const labelProps = ariaLabel
    ? { 'aria-label': ariaLabel }
    : { 'aria-labelledby': `${ctx.baseId}-trigger-${value}` }
  const cls = className
  return (
    <section
      role="tabpanel"
      id={`${ctx.baseId}-panel-${value}`}
      {...labelProps}
      tabIndex={0}
      className={cls}
    >
      {children}
    </section>
  )
}

Tabs.List = TabsList
Tabs.Trigger = TabsTrigger
Tabs.Panel = TabsPanel
