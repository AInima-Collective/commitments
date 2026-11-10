import { useMemo, type ReactNode } from 'react'
import { useChainId } from 'wagmi'

import {
  AddressDisplay,
  DataTable,
  EmptyState,
  Notice,
  TokenAmount,
  type DataTableColumn,
} from '../ui'
import { getBlockExplorer } from '../../lib/blockExplorer'
import { formatTimestamp, truncateAddress } from '../../lib/format'
import type { LedgerEvent, LedgerEventKind, ForfeitLedger } from '../../hooks/useForfeitLedger'

interface ForfeitLedgerTabProps {
  ledger: ForfeitLedger | undefined
  isLoading: boolean
  error: unknown
  /** Vault asset decimals (for donation amounts). */
  assetDecimals: number | undefined
  /** Vault asset symbol (for donation amounts). */
  assetSymbol: string | undefined
  /** Vault share decimals (for forfeit / settlement / contribution share counts). */
  shareDecimals: number | undefined
}

const KIND_LABEL: Record<LedgerEventKind, string> = {
  forfeit: 'forfeit',
  settlement: 'settlement',
  contribution: 'contribution',
  donation: 'donation',
}

const KIND_BADGE: Record<LedgerEventKind, string> = {
  forfeit: 'ds-badge ds-badge--error',
  settlement: 'ds-badge ds-badge--accent',
  contribution: 'ds-badge ds-badge--success',
  donation: 'ds-badge ds-badge--muted',
}

interface RowDetail {
  context: ReactNode
  amount: ReactNode
}

const FORFEIT_KIND_LABEL: Record<string, string> = {
  initiated: 'proposed',
  executed: 'executed',
  cancelled: 'cancelled',
  cancelledStale: 'force-cancelled',
}

function eventDetail(
  e: LedgerEvent,
  shareDecimals: number,
  assetDecimals: number | undefined,
  assetSymbol: string | undefined,
): RowDetail {
  if (e.kind === 'forfeit') {
    const penalty =
      e.penaltyBps !== null ? `${(e.penaltyBps / 100).toFixed(2)}%` : '—'
    const transition = FORFEIT_KIND_LABEL[e.forfeitKind] ?? e.forfeitKind
    return {
      context: (
        <span className="ds-row" style={{ gap: 'var(--space-1)', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="ds-subtle">commitment</span>
          <span className="ds-mono-num">#{e.commitmentId.toString()}</span>
          <span className="ds-subtle">committer</span>
          <AddressDisplay address={e.committer} compact />
          <span className="ds-subtle">{transition} · {penalty}</span>
        </span>
      ),
      amount:
        e.sharesToForfeit !== null && e.sharesToForfeit > 0n ? (
          <TokenAmount
            amount={e.sharesToForfeit}
            decimals={shareDecimals}
            symbol="shares"
            size="inline"
          />
        ) : (
          <span className="ds-subtle">—</span>
        ),
    }
  }
  if (e.kind === 'settlement') {
    return {
      context: (
        <span className="ds-row" style={{ gap: 'var(--space-1)', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="ds-subtle">agreement</span>
          <span className="ds-mono-num">#{e.agreementId.toString()}</span>
          <span className="ds-subtle">{e.fromProposer ? 'P → A' : 'A → P'}</span>
        </span>
      ),
      amount: (
        <TokenAmount amount={e.shares} decimals={shareDecimals} symbol="shares" size="inline" />
      ),
    }
  }
  if (e.kind === 'contribution') {
    return {
      context: (
        <span className="ds-row" style={{ gap: 'var(--space-1)', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="ds-subtle">commitment</span>
          <span className="ds-mono-num">#{e.commitmentId.toString()}</span>
          <span className="ds-subtle">from</span>
          <AddressDisplay address={e.contributor} compact />
        </span>
      ),
      amount: (
        <TokenAmount amount={e.shares} decimals={shareDecimals} symbol="shares" size="inline" />
      ),
    }
  }
  // donation
  return {
    context: (
      <span className="ds-row" style={{ gap: 'var(--space-1)', flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="ds-subtle">donor</span>
        <AddressDisplay address={e.donor} compact />
      </span>
    ),
    amount:
      assetDecimals === undefined ? (
        <span className="ds-subtle">—</span>
      ) : (
        <TokenAmount amount={e.assets} decimals={assetDecimals} symbol={assetSymbol} size="inline" />
      ),
  }
}

function eventKey(e: LedgerEvent): string {
  if (e.kind === 'forfeit')
    return `forfeit-${e.txHash}-${e.commitmentId.toString()}-${e.forfeitKind}`
  if (e.kind === 'settlement') return `settle-${e.txHash}-${e.agreementId.toString()}`
  if (e.kind === 'contribution') return `contrib-${e.txHash}-${e.commitmentId.toString()}`
  return `donate-${e.txHash}-${e.donor}`
}

export function ForfeitLedgerTab({
  ledger,
  isLoading,
  error,
  assetDecimals,
  assetSymbol,
  shareDecimals,
}: ForfeitLedgerTabProps) {
  const chainId = useChainId()
  const explorer = getBlockExplorer(chainId)
  const sDecimals = shareDecimals ?? 18

  const counts = ledger?.counts
  const summary = counts ? (
    <div className="ds-row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
      {counts.forfeit > 0 && (
        <span className="ds-text-xs">
          <span className="ds-subtle">forfeites </span>
          <span className="ds-mono-num">{counts.forfeit}</span>
        </span>
      )}
      <span className="ds-text-xs">
        <span className="ds-subtle">settlements </span>
        <span className="ds-mono-num">{counts.settlement}</span>
      </span>
      <span className="ds-text-xs">
        <span className="ds-subtle">contributions </span>
        <span className="ds-mono-num">{counts.contribution}</span>
      </span>
      <span className="ds-text-xs">
        <span className="ds-subtle">donations </span>
        <span className="ds-mono-num">{counts.donation}</span>
      </span>
    </div>
  ) : null

  const columns = useMemo<DataTableColumn<LedgerEvent>[]>(
    () => [
      {
        id: 'when',
        header: 'When',
        width: '140px',
        render: (e) => <span className="ds-text-xs ds-subtle">{formatTimestamp(e.timestamp)}</span>,
      },
      {
        id: 'kind',
        header: 'Type',
        render: (e) => <span className={KIND_BADGE[e.kind]}>{KIND_LABEL[e.kind]}</span>,
      },
      {
        id: 'context',
        header: 'Context',
        render: (e) => (
          <span className="ds-text-xs">{eventDetail(e, sDecimals, assetDecimals, assetSymbol).context}</span>
        ),
      },
      {
        id: 'amount',
        header: 'Amount',
        align: 'right',
        render: (e) => eventDetail(e, sDecimals, assetDecimals, assetSymbol).amount,
      },
      {
        id: 'tx',
        header: 'Tx',
        width: '128px',
        render: (e) => {
          if (!e.txHash) {
            return <span className="ds-subtle ds-text-xs">block #{e.blockNumber.toString()}</span>
          }
          return explorer ? (
            <a
              href={`${explorer}/tx/${e.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ds-mono-num ds-text-xs"
              style={{ color: 'var(--accent)' }}
              onClick={(ev) => ev.stopPropagation()}
            >
              {truncateAddress(e.txHash)} ↗
            </a>
          ) : (
            <span className="ds-mono-num ds-text-xs ds-muted">{truncateAddress(e.txHash)}</span>
          )
        },
      },
    ],
    [sDecimals, assetDecimals, assetSymbol, explorer],
  )

  if (error) {
    return (
      <Notice tone="warn" title="Ledger unavailable">
        Ledger events are temporarily unavailable — please retry shortly.
      </Notice>
    )
  }

  return (
    <div className="ds-stack ds-stack-3">
      {summary}
      <DataTable<LedgerEvent>
        aria-label="Forfeit ledger"
        columns={columns}
        rows={ledger?.events ?? []}
        isLoading={isLoading && !ledger}
        loadingRows={3}
        getRowKey={eventKey}
        emptyState={
          <EmptyState
            title="NO LEDGER EVENTS"
            description="Forfeites, settlements, contributions, and donations will appear here as they happen."
          />
        }
      />
    </div>
  )
}
