import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { type Address } from 'viem'
import { useChainId } from 'wagmi'
import {
  AddressDisplay,
  DataTable,
  Disclosure,
  EmptyState,
  Notice,
  TokenAmount,
  TokenIcon,
  UsdAmount,
  type DataTableColumn,
} from '../ui'
import type { ClaimableYieldEntry } from '../../hooks/useClaimableYield'
import { useTokenMetaMap } from '../../hooks/useTokenMeta'
import { claimableEntryKey, sumUsd } from '../../lib/claimableYield'
import { getVaultDescriptor } from '../../config/contracts'
import { ClaimYieldButton } from './ClaimYieldButton'

interface ClaimableYieldPanelProps {
  /** Already filtered for `claimedIds` — the panel renders exactly what's passed. */
  entries: ClaimableYieldEntry[]
  managerAddress: Address | undefined
  connectedAddress: Address | undefined
  viewAddress: Address | undefined
  isConnected: boolean
  isLoading: boolean
  error: Error | null
  indexerOnline: boolean
  refetch: () => void
  /** Called when a per-row claim tx confirms — drives optimistic removal and toasts. */
  onClaimed: (commitmentId: bigint) => void
  /** Token-aware USD valuation. Prices `amount` units of `token` in USD,
   *  returning `null` when no price is available. Each row may carry a
   *  different backing token, so USD — not a single share rate — is the only
   *  correct common denominator for the headline total. */
  usdFor: (token: Address, amount: bigint) => bigint | null
}

/**
 * ClaimableYieldPanel — Disclosure-wrapped DataTable of yield the connected
 * counterparty can pull from active commitments.
 *
 * The panel is purely presentational: data + optimistic state both live in
 * the Dashboard. This keeps "Claim all" (driven by `useClaimAllQueue` in the
 * Dashboard) and per-row CLAIM (driven by ClaimYieldButton) consistent — both
 * write to the same optimistic-removal set.
 */
export function ClaimableYieldPanel({
  entries,
  managerAddress,
  connectedAddress,
  viewAddress,
  isConnected,
  isLoading,
  error,
  indexerOnline,
  refetch,
  onClaimed,
  usdFor,
}: ClaimableYieldPanelProps) {
  const chainId = useChainId()

  // v2: each entry's `amount` is denominated in its commitment's own backing
  // token. Resolve per-token decimals/symbol; the USD column stays the common
  // denominator for cross-token totals.
  const tokenMeta = useTokenMetaMap(entries.map((e) => e.token))
  const distinctTokens = useMemo(
    () => new Set(entries.map((e) => e.token.toLowerCase())),
    [entries],
  )
  // A raw token total only makes sense when every row shares one token (summing
  // across different decimals would be meaningless); USD remains the headline.
  const singleToken = distinctTokens.size === 1 ? entries[0]?.token : undefined
  const singleTokenMeta = tokenMeta.metaFor(singleToken)

  const totalShares = useMemo(
    () => entries.reduce((acc, e) => acc + e.amount, 0n),
    [entries],
  )
  // USD is the only correct common denominator across heterogeneous tokens:
  // sum each row's own USD value, never a raw cross-decimal share sum. Degrades
  // to null (price unavailable) if any row can't be priced.
  const totalUsd = useMemo(
    () => sumUsd(entries.map((e) => usdFor(e.token, e.amount))),
    [entries, usdFor],
  )

  const columns: DataTableColumn<ClaimableYieldEntry>[] = useMemo(
    () => [
      {
        id: 'vault',
        header: 'vault',
        width: '120px',
        render: (row) => {
          const descriptor = getVaultDescriptor(chainId, row.vault)
          if (!descriptor) return <span className="ds-subtle">—</span>
          return (
            <span className="ds-row ds-row-1" style={{ alignItems: 'center' }}>
              <TokenIcon symbol={descriptor.assetSymbol} size="sm" />
              <span className="ds-text-sm">{descriptor.assetSymbol}</span>
            </span>
          )
        },
      },
      {
        id: 'committer',
        header: 'committer',
        render: (row) => <AddressDisplay address={row.committer} compact />,
      },
      {
        id: 'commitment',
        header: 'commitment',
        render: (row) => (
          <Link
            to={`/app/commitments/${row.commitmentId.toString()}`}
            className="ds-mono-num"
            style={{ color: 'var(--text-muted)' }}
            onClick={(e) => e.stopPropagation()}
          >
            #{row.commitmentId.toString()}
          </Link>
        ),
        width: '108px',
      },
      {
        id: 'claimable',
        header: 'claimable',
        align: 'right',
        sortable: true,
        render: (row) => {
          const usd = usdFor(row.token, row.amount)
          const { decimals, symbol } = tokenMeta.metaFor(row.token)
          return (
            <div className="ds-stack ds-stack-1" style={{ alignItems: 'flex-end' }}>
              <UsdAmount amount={usd} size="default" />
              <span className="ds-text-xs ds-subtle">
                <TokenAmount
                  amount={row.amount}
                  decimals={decimals}
                  symbol={symbol}
                  size="inline"
                />
              </span>
            </div>
          )
        },
      },
      {
        id: 'action',
        header: '',
        align: 'right',
        width: '120px',
        render: (row) => (
          <ClaimYieldButton
            commitmentId={row.commitmentId}
            managerAddress={managerAddress}
            isConnected={isConnected}
            connectedAddress={connectedAddress}
            viewAddress={viewAddress}
            pendingAmount={row.amount}
            usdAmount={usdFor(row.token, row.amount)}
            depositorAddress={row.committer}
            decimals={tokenMeta.metaFor(row.token).decimals}
            symbol={tokenMeta.metaFor(row.token).symbol}
            strategy={row.strategy}
            claimData={row.claimData}
            onClaimed={onClaimed}
          />
        ),
      },
    ],
    [
      chainId,
      tokenMeta,
      managerAddress,
      isConnected,
      connectedAddress,
      viewAddress,
      usdFor,
      onClaimed,
    ],
  )

  if (error) {
    return (
      <section className="ds-section">
        <h2 className="ds-section-title">Claimable yield</h2>
        <Notice
          tone="danger"
          size="sm"
          title="FAILED TO LOAD"
          actions={
            <button type="button" className="ds-btn ds-btn--sm" onClick={refetch}>
              RETRY
            </button>
          }
        >
          {error.message ?? 'Check your connection and try again.'}
        </Notice>
      </section>
    )
  }

  const summary =
    entries.length === 0 ? (
      <span>
        Claimable yield <span className="ds-subtle">· nothing to claim</span>
      </span>
    ) : (
      <span>
        Claimable yield{' '}
        <span className="ds-subtle">
          · {entries.length} row{entries.length === 1 ? '' : 's'} ·{' '}
        </span>
        <UsdAmount amount={totalUsd} size="inline" compact />
        {singleToken && (
          <span className="ds-subtle">
            {' / '}
            <TokenAmount
              amount={totalShares}
              decimals={singleTokenMeta.decimals}
              symbol={singleTokenMeta.symbol}
              size="inline"
              compact
            />
          </span>
        )}
      </span>
    )

  return (
    <section className="ds-section">
      <Disclosure label={summary} defaultOpen={entries.length > 0}>
        <div className="ds-stack ds-stack-3">
          {!indexerOnline && (
            <Notice tone="warn" size="sm">
              Indexer offline — using on-chain fallback.
            </Notice>
          )}
          <DataTable
            aria-label="Claimable yield"
            columns={columns}
            rows={entries}
            getRowKey={(row) => claimableEntryKey(row)}
            isLoading={isLoading && entries.length === 0}
            loadingRows={3}
            defaultSort={{ columnId: 'claimable', direction: 'desc' }}
            emptyState={
              <EmptyState
                title="NOTHING TO CLAIM"
                description="When commitments name you as counterparty and accrue yield, claimable amounts appear here."
              />
            }
          />
        </div>
      </Disclosure>
    </section>
  )
}
