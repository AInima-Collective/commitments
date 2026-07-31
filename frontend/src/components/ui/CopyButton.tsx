import { useState } from 'react'

export interface CopyButtonProps {
  value: string
  label?: string
  inline?: boolean
  className?: string
}

export function CopyButton({ value, label, inline, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard?.writeText(value)
    } catch {
      /* ignore */
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }
  const cls = ['ds-copy-btn', inline ? 'ds-copy-btn--inline' : '', className].filter(Boolean).join(' ')
  return (
    <button
      type="button"
      className={cls}
      data-copied={copied || undefined}
      onClick={onCopy}
      aria-label={copied ? 'Copied' : label ?? 'Copy'}
      title={copied ? 'Copied' : label ?? 'Copy'}
    >
      <span aria-hidden>{copied ? '✓' : '⎘'}</span>
      {inline && <span>{copied ? 'copied' : label ?? 'copy'}</span>}
    </button>
  )
}
