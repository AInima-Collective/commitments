import { useState, type ReactNode } from 'react'
import { CopyButton } from './CopyButton'

export interface ErrorBlockMeta {
  label: string
  value: string
}

export interface ErrorBlockProps {
  title?: string
  message?: ReactNode
  detail?: string
  meta?: ErrorBlockMeta[]
  actions?: ReactNode
}

export function ErrorBlock({
  title = 'Something went wrong',
  message,
  detail,
  meta,
  actions,
}: ErrorBlockProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="ds-error-block" role="alert">
      <div className="ds-error-block-header">
        <div className="ds-error-block-title">
          <span className="ds-glyph ds-glyph--error" aria-hidden>!</span>
          <span>{title}</span>
        </div>
        <div className="ds-error-block-actions">
          {detail && <CopyButton value={detail} label="Copy error" />}
          {actions}
        </div>
      </div>
      {message && <div className="ds-error-block-message">{message}</div>}
      {meta && meta.length > 0 && (
        <div className="ds-error-block-meta">
          {meta.map((m) => (
            <span key={m.label}>
              <span className="ds-subtle">{m.label}:</span> <code>{m.value}</code>
            </span>
          ))}
        </div>
      )}
      {detail && (
        <div className="ds-disclosure" data-open={open ? 'true' : 'false'}>
          <button
            type="button"
            className="ds-disclosure-trigger"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="ds-disclosure-trigger-caret" aria-hidden />
            {open ? 'Hide' : 'Show'} details
          </button>
          {open && <pre className="ds-error-block-detail">{detail}</pre>}
        </div>
      )}
    </div>
  )
}
