import { useState } from 'react'

interface AddressDisplayProps {
  address: `0x${string}`
  /** Optional ENS name to render in place of the truncated hex. */
  ens?: string
  /** Block-explorer URL — when set, renders a separate ↗ link beside the copy button. */
  explorerUrl?: string
  /** Force the truncated short form regardless of viewport. Use in tables and
   *  other tight horizontal contexts where the responsive media-query default
   *  would still leak the full hex on desktop. */
  compact?: boolean
}

function truncate(a: string, lead = 6, tail = 4): string {
  // Defensive: a missing address (e.g. a not-yet-migrated indexer field) must
  // degrade to a placeholder rather than throw `undefined.length` and take the
  // whole page down. Callers should still pass a real address.
  if (!a) return '\u2014'
  if (a.length <= lead + tail + 1) return a
  return `${a.slice(0, lead)}\u2026${a.slice(-tail)}`
}

export function AddressDisplay({ address, ens, explorerUrl, compact = false }: AddressDisplayProps) {
  const [copied, setCopied] = useState(false)
  const display = ens ?? address ?? '\u2014'
  const short = ens ?? truncate(address)

  const onCopy = async () => {
    try {
      await navigator.clipboard?.writeText(address)
    } catch {
      /* ignore */
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <span className="ds-addr" data-compact={compact || undefined}>
      <button
        type="button"
        className="ds-addr-button"
        data-copied={copied || undefined}
        onClick={onCopy}
        title={copied ? 'Copied' : `Copy ${address}`}
        aria-label={copied ? `Copied ${address}` : `Copy ${address}`}
      >
        {!compact && (
          <span className="ds-addr-text ds-addr-text--full" aria-hidden>{display}</span>
        )}
        <span
          className={compact ? 'ds-addr-text' : 'ds-addr-text ds-addr-text--short'}
          aria-hidden
        >
          {short}
        </span>
        <span className="ds-addr-feedback-icon" aria-hidden>{copied ? '✓' : '⎘'}</span>
        <span className="ds-addr-feedback" aria-live="polite">copied</span>
      </button>
      {explorerUrl && (
        <a
          className="ds-addr-link"
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="View on block explorer"
          title="View on block explorer"
        >
          <span aria-hidden>↗</span>
        </a>
      )}
    </span>
  )
}
