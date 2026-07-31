import { useMemo, type ReactNode } from 'react'
import { MediaRow, Skeleton, TokenAmount } from '../ui'
import {
  AmountCell,
  CopyableAddress,
  NameCell,
  RowResolveAction,
  StatusCell,
  type CommitmentsResolveContext,
  type TokenMetaResolver,
} from './commitmentCells'
import { useCommitmentLabelContext } from '../../hooks/useCommitmentLabelContext'
import { type ClaimableYieldEntry } from '../../lib/claimableYield'
import { type UnifiedRow } from '../../hooks/useUnifiedRows'
import { otherParty } from '../../lib/commitmentFilters'
import { claimableFor, rowTone, sumClaimableById } from '../../lib/commitmentRow'
import { commitmentLabel } from '../../lib/commitmentLabel'
import { metadataDescription, metadataTrust } from '../../lib/commitmentMetadata'

export interface CommitmentCardsProps {
  /** Already-filtered, already-sorted rows. */
  rows: UnifiedRow[]
  onOpenRow: (row: UnifiedRow) => void
  tokenMeta: TokenMetaResolver
  showYield?: boolean
  claimableEntries?: ClaimableYieldEntry[]
  resolveContext?: CommitmentsResolveContext
  onSelectTag?: (tag: string) => void
  activeTags?: readonly string[]
  isLoading?: boolean
  emptyState?: ReactNode
  'aria-label'?: string
}

/**
 * The card layout for the commitments list.
 *
 * Same rows, same rules, different weighting. A table answers comparison
 * questions ("which of these is largest, which expires first") by putting
 * values in aligned columns; cards answer identification questions ("what is
 * this one about") by giving the name room and letting a description sit
 * underneath it. Both are real ways people use this page, so the page carries
 * both and lets the reader pick.
 *
 * Nothing extra is fetched. The description was already on the list response.
 *
 * ── Accessibility ───────────────────────────────────────────────────────────
 *
 * Each card is a `MediaRow` rendered as an `li` inside a `ul`, with its
 * primary action as a stretched overlay rather than a `<button>` wrapping the
 * card. Cards carry their own controls (a copy button on the counterparty, a
 * Resolve button, clickable tags), and a button containing buttons is invalid
 * HTML that browsers silently restructure and keyboards cannot navigate. That
 * is the exact problem the overlay pattern was built for, so it is reused here
 * rather than re-solved.
 */
export function CommitmentCards({
  rows,
  onOpenRow,
  tokenMeta,
  showYield = false,
  claimableEntries,
  resolveContext,
  onSelectTag,
  activeTags,
  isLoading,
  emptyState,
  'aria-label': ariaLabel = 'commitments',
}: CommitmentCardsProps) {
  const labelContext = useCommitmentLabelContext(rows, tokenMeta)

  const claimableById = useMemo(() => sumClaimableById(claimableEntries), [claimableEntries])

  if (isLoading && rows.length === 0) {
    return (
      <ul className="ds-card-list" aria-label={ariaLabel} aria-busy>
        {[0, 1, 2].map((i) => (
          <li key={i} className="ds-card-list-skeleton">
            <Skeleton width="60%" />
            <Skeleton width="90%" />
          </li>
        ))}
      </ul>
    )
  }

  if (rows.length === 0) return <>{emptyState ?? null}</>

  return (
    <ul className="ds-card-list" aria-label={ariaLabel}>
      {rows.map((row) => {
        const label = commitmentLabel(row, labelContext)
        // A description is prose the reader will act on, so it is gated on the
        // same trust rule as the name: `commitmentLabel` refuses to promote a
        // tampered title, and this refuses to show its body text.
        const trust = metadataTrust(row)
        const blurb =
          trust === 'attested' || trust === 'unattested' ? metadataDescription(row) : undefined
        const claimable = showYield ? claimableFor(row, claimableById) : undefined
        const { decimals, symbol } = tokenMeta.metaFor(row.token)

        return (
          <MediaRow
            as="li"
            key={`${row.kind === 'proposal' ? 'p' : 'c'}-${row.id.toString()}`}
            tone={rowTone(row)}
            action={{ label: `Open ${label.full}`, onClick: () => onOpenRow(row) }}
            title={
              <NameCell
                row={row}
                ctx={labelContext}
                size="lg"
                maxTags={6}
                onSelectTag={onSelectTag}
                activeTags={activeTags}
              />
            }
            meta={
              <span className="ds-card-meta">
                {/* Clamped to two lines, so the full text lives on `title`. */}
                {blurb && (
                  <span className="ds-card-blurb" title={blurb}>
                    {blurb}
                  </span>
                )}
                <span className="ds-card-parties">
                  <span className="ds-subtle">{row.role} vs</span>
                  <CopyableAddress address={otherParty(row)} />
                  <span aria-hidden className="ds-subtle">
                    {row.direction === 'paired' ? '↔' : '→'}
                  </span>
                </span>
              </span>
            }
            trailing={
              <span className="ds-card-trailing">
                <StatusCell row={row} />
                <span className="ds-card-amount">
                  <AmountCell row={row} tokenMeta={tokenMeta} />
                  {claimable !== undefined && (
                    <span data-tone="success" className="ds-text-xs">
                      +
                      <TokenAmount
                        amount={claimable}
                        decimals={decimals}
                        symbol={symbol}
                        size="inline"
                      />
                    </span>
                  )}
                </span>
                {resolveContext && row.kind === 'commitment' && (
                  <RowResolveAction row={row} ctx={resolveContext} />
                )}
              </span>
            }
          />
        )
      })}
    </ul>
  )
}
