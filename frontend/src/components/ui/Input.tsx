import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'

export type InputSize = 'sm' | 'md' | 'lg'
export type InputTone = 'neutral' | 'danger'

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  /** Compact / default / spacious sizing, applied via `data-size`. */
  size?: InputSize
  /** Semantic tone — `'danger'` flips `aria-invalid` to `'true'`. */
  tone?: InputTone
  /** Optional leading affix (e.g. currency glyph). */
  prefix?: ReactNode
  /** Optional trailing affix (e.g. unit symbol). */
  suffix?: ReactNode
  /**
   * Inline error message. When set, renders a `role="alert"` span beneath
   * the input, generates an id for it, sets `aria-describedby` on the input,
   * and forces `aria-invalid="true"`. Use this in place of an external Notice
   * to get screen-reader linkage automatically.
   */
  error?: ReactNode
}

/**
 * Native `<input>` wrapped with `.ds-input` styling. Composes via the
 * {@link InputSize} + {@link InputTone} vocabulary documented in
 * components/ui/CONTRIBUTING.md §2 (size/tone). Optional prefix/suffix
 * slots wrap the input in a `.ds-input-group` flex container; when both
 * affixes are absent and no `error` is provided the bare input is returned.
 *
 * Supports controlled (`value` + `onChange`) and uncontrolled
 * (`defaultValue`) usage per CONTRIBUTING.md §5. Forwards refs so form
 * libraries (react-hook-form, etc.) can attach.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', tone = 'neutral', prefix, suffix, className, error, ...rest },
  ref,
) {
  const errorId = useId()
  const hasError = error !== undefined && error !== null && error !== false
  const effectiveTone: InputTone = hasError ? 'danger' : tone
  const ariaInvalid = effectiveTone === 'danger' ? true : rest['aria-invalid']
  const ariaDescribedBy = hasError
    ? [rest['aria-describedby'], errorId].filter(Boolean).join(' ')
    : rest['aria-describedby']
  const inputCls = ['ds-input', className].filter(Boolean).join(' ')
  const inputEl = (
    <input
      ref={ref}
      {...rest}
      className={inputCls}
      data-size={size}
      data-tone={effectiveTone}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
    />
  )
  const errorEl = hasError ? (
    <span id={errorId} role="alert" className="ds-input-error">
      {error}
    </span>
  ) : null

  if (prefix === undefined && suffix === undefined && !hasError) return inputEl
  if (prefix === undefined && suffix === undefined && hasError) {
    return (
      <span className="ds-input-stack">
        {inputEl}
        {errorEl}
      </span>
    )
  }
  return (
    <span className="ds-input-stack">
      <span className="ds-input-group">
        {prefix !== undefined && (
          <span className="ds-input-affix ds-input-affix--leading">{prefix}</span>
        )}
        {inputEl}
        {suffix !== undefined && <span className="ds-input-affix">{suffix}</span>}
      </span>
      {errorEl}
    </span>
  )
})
