import { useCallback, useState, type ReactNode } from 'react'

export type ViewToggleSize = 'sm' | 'md'

export type ViewToggleOption = {
  id: string
  label: ReactNode
  /** Optional leading glyph or icon. */
  icon?: ReactNode
  /** Disable this option. */
  disabled?: boolean
}

export type ViewToggleProps = {
  /** Controlled selected option id. Pair with `onChange`. */
  value?: string
  /** Initial selected option id in uncontrolled mode. Falls back to `options[0].id`. */
  defaultValue?: string
  /** Notified when the selection changes. Required when `value` is provided. */
  onChange?: (value: string) => void
  /** The set of view options. Order is preserved. */
  options: ViewToggleOption[]
  /** Size of the control. Default `'md'`. */
  size?: ViewToggleSize
  /** Required label for assistive tech — names the *thing* being toggled (e.g. "list view"). */
  'aria-label': string
  /** Extra class names appended to the root. */
  className?: string
}

/**
 * Segmented control for switching between equivalent views of the same data
 * (table ↔ graph). Visually distinct from `Tabs` — `Tabs` switches *content*,
 * `ViewToggle` switches *representation*.
 *
 * Controlled: pass `value` + `onChange`. Uncontrolled: pass `defaultValue`
 * (or omit and the first option wins).
 */
export function ViewToggle({
  value: controlledValue,
  defaultValue,
  onChange,
  options,
  size = 'md',
  'aria-label': ariaLabel,
  className,
}: ViewToggleProps) {
  const fallback = defaultValue ?? options[0]?.id ?? ''
  const [uncontrolled, setUncontrolled] = useState(fallback)
  const isControlled = controlledValue !== undefined
  const current = isControlled ? controlledValue : uncontrolled

  const select = useCallback(
    (next: string) => {
      if (next === current) return
      if (!isControlled) setUncontrolled(next)
      onChange?.(next)
    },
    [current, isControlled, onChange],
  )

  const cls = ['ds-view-toggle', className].filter(Boolean).join(' ')

  return (
    <div role="radiogroup" aria-label={ariaLabel} data-size={size} className={cls}>
      {options.map((opt) => {
        const selected = opt.id === current
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={opt.disabled}
            disabled={opt.disabled}
            data-selected={selected ? 'true' : 'false'}
            className="ds-view-toggle-option"
            onClick={() => select(opt.id)}
          >
            {opt.icon !== undefined && <span className="ds-view-toggle-icon" aria-hidden>{opt.icon}</span>}
            <span className="ds-view-toggle-label">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
