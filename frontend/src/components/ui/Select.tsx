import { forwardRef, type SelectHTMLAttributes, type ReactNode } from 'react'

export type SelectSize = 'sm' | 'md' | 'lg'
export type SelectTone = 'neutral' | 'danger'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Compact / default / spacious sizing, applied via `data-size`. */
  size?: SelectSize
  /** Semantic tone — `'danger'` flips `aria-invalid` to `'true'`. */
  tone?: SelectTone
  /** Optional convenience: renders <option> children from the array. */
  options?: SelectOption[]
  /** Optional placeholder option (rendered as a disabled, empty-value option). */
  placeholder?: string
  /** Children override `options` if both are provided. */
  children?: ReactNode
}

/**
 * Native `<select>` wrapped with `.ds-select` styling. Supports the same
 * size / tone vocabulary as `<Input>`. The chevron is drawn via CSS to keep
 * a single source of truth for theming.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    size = 'md',
    tone = 'neutral',
    options,
    placeholder,
    className,
    children,
    ...rest
  },
  ref,
) {
  const ariaInvalid = tone === 'danger' ? true : rest['aria-invalid']
  const cls = ['ds-select', className].filter(Boolean).join(' ')

  return (
    <span className="ds-select-wrap" data-size={size}>
      <select
        ref={ref}
        className={cls}
        data-size={size}
        data-tone={tone}
        aria-invalid={ariaInvalid}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children ??
          options?.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
      </select>
      <span className="ds-select-chevron" aria-hidden>
        ▾
      </span>
    </span>
  )
})
