import type { ReactNode } from 'react'

export interface PartyRowProps {
  label: string
  children: ReactNode
}

/**
 * Two-cell row used inside `.ds-party-list` grids — label on the left, value on
 * the right. Rendered as a Fragment so the parent grid lays out columns directly.
 */
export function PartyRow({ label, children }: PartyRowProps) {
  return (
    <>
      <span className="ds-party-list-label">{label}</span>
      <span className="ds-party-list-value">{children}</span>
    </>
  )
}
