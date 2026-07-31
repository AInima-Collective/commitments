import { useId, useMemo, type ChangeEvent, type ReactNode } from 'react'
import { Input } from './Input'
import { Select, type SelectOption } from './Select'

export type FilterBarSize = 'sm' | 'md'

export type FilterBarProps = {
  /** Optional label rendered before the slots. */
  label?: ReactNode
  /** Filter slot children. Use FilterBar.Select / .Multi / .Search / .Range. */
  children?: ReactNode
  /** Active filter count override. When omitted, the bar derives a count
   * from any child whose `value` is truthy / non-empty. Pass explicitly
   * when the page already tracks the count. */
  activeCount?: number
  /** Called when the user clicks the "clear all" button. The bar renders
   * the button only when this is provided AND `activeCount > 0`. */
  onClearAll?: () => void
  /** Visual scale. Default `'md'`. */
  size?: FilterBarSize
  /** Extra class names appended to the root. */
  className?: string
}

type SlotChild = {
  props?: { value?: unknown }
}

function isFilled(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

/**
 * Slot-based filter strip above a list. Holds zero-or-more filter children
 * (FilterBar.Select / .Multi / .Search / .Range). Surfaces an active-filter
 * count and a "clear all" affordance. Pages own filter state and pass it
 * down — slots are controlled-only by design (rule 5 escape hatch
 * documented in components/ui/CONTRIBUTING.md §5).
 */
function FilterBarRoot({
  label,
  children,
  activeCount,
  onClearAll,
  size = 'md',
  className,
}: FilterBarProps) {
  const derivedCount = useMemo(() => {
    if (activeCount !== undefined) return activeCount
    let count = 0
    if (Array.isArray(children)) {
      for (const c of children) {
        if (c && typeof c === 'object' && 'props' in c) {
          if (isFilled((c as SlotChild).props?.value)) count += 1
        }
      }
    } else if (children && typeof children === 'object' && 'props' in children) {
      if (isFilled((children as SlotChild).props?.value)) count = 1
    }
    return count
  }, [activeCount, children])

  const cls = ['ds-filter-bar', className].filter(Boolean).join(' ')

  return (
    <div className={cls} data-size={size} role="group" aria-label="Filters">
      {label !== undefined && <span className="ds-filter-bar-label">{label}</span>}
      <div className="ds-filter-bar-slots">{children}</div>
      {derivedCount > 0 && (
        <span className="ds-filter-bar-count" aria-live="polite">
          {derivedCount} active
        </span>
      )}
      {onClearAll && derivedCount > 0 && (
        <button
          type="button"
          className="ds-filter-bar-clear"
          onClick={onClearAll}
        >
          clear
        </button>
      )}
    </div>
  )
}

type SlotShellProps = {
  id: string
  label: ReactNode
  children: ReactNode
  className?: string
}

function SlotShell({ id, label, children, className }: SlotShellProps) {
  const cls = ['ds-filter-slot', className].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      <label htmlFor={id} className="ds-filter-slot-label">
        {label}
      </label>
      {children}
    </div>
  )
}

export type FilterSelectProps = {
  id?: string
  label: ReactNode
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
}

function FilterSelect({ id, label, value, onChange, options, placeholder, className }: FilterSelectProps) {
  const reactId = useId()
  const fieldId = id ?? reactId
  return (
    <SlotShell id={fieldId} label={label} className={className}>
      <Select
        id={fieldId}
        size="sm"
        value={value}
        placeholder={placeholder}
        options={options}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      />
    </SlotShell>
  )
}

export type FilterSearchProps = {
  id?: string
  label: ReactNode
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

function FilterSearch({ id, label, value, onChange, placeholder, className }: FilterSearchProps) {
  const reactId = useId()
  const fieldId = id ?? reactId
  return (
    <SlotShell id={fieldId} label={label} className={className}>
      <Input
        id={fieldId}
        size="sm"
        value={value}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    </SlotShell>
  )
}

export type FilterMultiOption = { value: string; label: string }

export type FilterMultiProps = {
  id?: string
  label: ReactNode
  value: string[]
  onChange: (value: string[]) => void
  options: FilterMultiOption[]
  className?: string
}

function FilterMulti({ id, label, value, onChange, options, className }: FilterMultiProps) {
  const reactId = useId()
  const fieldId = id ?? reactId
  const cls = ['ds-filter-slot', className].filter(Boolean).join(' ')

  function toggle(optionValue: string, checked: boolean) {
    if (checked) onChange([...value, optionValue])
    else onChange(value.filter((v) => v !== optionValue))
  }

  const summary =
    value.length === 0
      ? 'all'
      : value.length === 1
      ? options.find((o) => o.value === value[0])?.label ?? value[0]
      : `${value.length} selected`

  return (
    <div className={cls}>
      <span className="ds-filter-slot-label" id={`${fieldId}-label`}>{label}</span>
      <details className="ds-filter-multi">
        <summary className="ds-filter-multi-trigger" aria-labelledby={`${fieldId}-label`}>
          <span className="ds-filter-multi-summary">{summary}</span>
          <span className="ds-filter-multi-caret" aria-hidden>▾</span>
        </summary>
        <div className="ds-filter-multi-popover" role="group" aria-labelledby={`${fieldId}-label`}>
          {options.map((opt) => (
            <label key={opt.value} className="ds-filter-multi-option">
              <input
                type="checkbox"
                checked={value.includes(opt.value)}
                onChange={(e) => toggle(opt.value, e.target.checked)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  )
}

export type FilterRangeProps = {
  id?: string
  label: ReactNode
  /** Minimum and maximum values as strings (so empty = unset). */
  value: { min: string; max: string }
  onChange: (value: { min: string; max: string }) => void
  placeholder?: { min?: string; max?: string }
  className?: string
}

function FilterRange({ id, label, value, onChange, placeholder, className }: FilterRangeProps) {
  const reactId = useId()
  const fieldId = id ?? reactId
  const cls = ['ds-filter-slot', className].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      <span className="ds-filter-slot-label" id={`${fieldId}-label`}>{label}</span>
      <div className="ds-filter-range">
        <Input
          id={`${fieldId}-min`}
          size="sm"
          aria-label={`${typeof label === 'string' ? label : 'range'} minimum`}
          value={value.min}
          placeholder={placeholder?.min ?? 'min'}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, min: e.target.value })}
        />
        <span aria-hidden>–</span>
        <Input
          id={`${fieldId}-max`}
          size="sm"
          aria-label={`${typeof label === 'string' ? label : 'range'} maximum`}
          value={value.max}
          placeholder={placeholder?.max ?? 'max'}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, max: e.target.value })}
        />
      </div>
    </div>
  )
}

type FilterBarComponent = typeof FilterBarRoot & {
  Select: typeof FilterSelect
  Multi: typeof FilterMulti
  Search: typeof FilterSearch
  Range: typeof FilterRange
}

const FilterBarWithSlots = FilterBarRoot as FilterBarComponent
FilterBarWithSlots.Select = FilterSelect
FilterBarWithSlots.Multi = FilterMulti
FilterBarWithSlots.Search = FilterSearch
FilterBarWithSlots.Range = FilterRange

export const FilterBar = FilterBarWithSlots
