import type { ReactNode } from 'react'
import { Button, Card, Notice } from '../ui'
import { truncateAddress } from '../../lib/format'
import type { AdminActionState } from './useAdminAction'

export interface AdminActionPanelProps {
  /** Heading shown at the top of the panel. */
  title: string
  /** Optional one-line context shown beneath the title. */
  description?: ReactNode
  /** Form fields and other inline content — rendered above the action row. */
  children?: ReactNode
  /** Label for the submit button. */
  submitLabel: string
  /** Action invoked when the submit button is clicked. Throws bubble up to state. */
  onSubmit: () => void | Promise<void>
  /** Disable the submit button (e.g. when required inputs are blank). */
  disabled?: boolean
  /** Lifecycle state from {@link useAdminAction}. */
  state: AdminActionState
  /** Optional auxiliary content shown to the right of the submit button. */
  actions?: ReactNode
}


/**
 * Visual container for one admin write action. Owns nothing — all state is
 * passed in. Pairs with {@link useAdminAction} which owns the finite state.
 */
export function AdminActionPanel({
  title,
  description,
  children,
  submitLabel,
  onSubmit,
  disabled,
  state,
  actions,
}: AdminActionPanelProps) {
  const isPending = state.status === 'pending'
  const tone = state.status === 'error' ? 'danger' : state.status === 'success' ? 'success' : 'neutral'

  return (
    <Card
      as="section"
      tone={tone}
      className="ds-stack ds-stack-3"
      data-admin-panel
    >
      <header className="ds-stack ds-stack-1">
        <h3 className="ds-text-lg">{title}</h3>
        {description && <p className="ds-text-sm ds-muted">{description}</p>}
      </header>

      {children && <div className="ds-stack ds-stack-2">{children}</div>}

      <div className="ds-row ds-row-2" style={{ alignItems: 'center', gap: 'var(--space-2)' }}>
        <Button
          variant="primary"
          disabled={disabled || isPending}
          onClick={() => {
            void onSubmit()
          }}
        >
          {isPending ? 'sending…' : submitLabel}
        </Button>
        {actions}
        {state.status === 'pending' && state.hash && (
          <span className="ds-text-xs ds-subtle ds-mono-num">
            tx {truncateAddress(state.hash, 10, 6)} pending
          </span>
        )}
      </div>

      {state.status === 'success' && state.hash && (
        <Notice tone="success" size="sm" title="Confirmed">
          <span className="ds-mono-num">{truncateAddress(state.hash, 10, 6)}</span>
          {state.receipt && (
            <>
              {' · block '}
              <span className="ds-mono-num">{state.receipt.blockNumber.toString()}</span>
              {' · gas '}
              <span className="ds-mono-num">{state.receipt.gasUsed.toString()}</span>
            </>
          )}
        </Notice>
      )}
      {state.status === 'error' && (
        <Notice tone="danger" size="sm" title="Failed">
          {state.error?.message ?? 'Unknown error'}
        </Notice>
      )}
    </Card>
  )
}
