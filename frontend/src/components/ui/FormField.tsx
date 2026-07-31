import { useId, type ReactNode } from 'react'

export type FormFieldTone = 'neutral' | 'danger'

export interface FormFieldProps {
  /** Visible label (rendered uppercase via `.ds-label`). */
  label: ReactNode
  /** Form control(s). Receives `id` (when not already set) so the label
   *  associates correctly. */
  children: ReactNode
  /** Helper text rendered beneath the control in muted style. */
  helper?: ReactNode
  /** Inline error rendered beneath the control with `role="alert"`. Wins
   *  over `helper` when both are provided. */
  error?: ReactNode
  /** Optional id forwarded to the label's `htmlFor`. Generated when omitted. */
  htmlFor?: string
  /** Marks this field as required. Adds a `*` to the label. */
  required?: boolean
  /** Optional className appended to the field root. */
  className?: string
}

/**
 * Canonical form-field shell — uppercase tracked label, control slot,
 * helper / error caption. Composes from `.ds-field` / `.ds-label` /
 * `.ds-field-helper` / `.ds-field-error` (declared in tokens.css).
 *
 * Usage:
 *   <FormField label="Title" htmlFor="title-input" helper="Shown on /governance">
 *     <Input id="title-input" value={…} onChange={…} />
 *   </FormField>
 *
 * Errors take precedence over helper text. The control inside this field
 * remains responsible for its own `aria-invalid` state — `<Input tone="danger">`
 * already wires that through.
 */
export function FormField({
  label,
  children,
  helper,
  error,
  htmlFor,
  required,
  className,
}: FormFieldProps) {
  const generatedId = useId()
  const id = htmlFor ?? generatedId
  const cls = ['ds-field', className].filter(Boolean).join(' ')
  const hasError = error !== undefined && error !== null && error !== false
  return (
    <div className={cls}>
      <label className="ds-label" htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {hasError && (
        <span role="alert" className="ds-field-error">
          {error}
        </span>
      )}
      {!hasError && helper !== undefined && helper !== null && (
        <span className="ds-field-helper">{helper}</span>
      )}
    </div>
  )
}
