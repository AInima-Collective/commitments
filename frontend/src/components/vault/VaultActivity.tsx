import { useMemo } from 'react'
import { useChainId } from 'wagmi'
import { type VaultActivityEntry } from '../../hooks/useVaultActivity'
import { DataTable, EmptyState, TokenAmount, type DataTableColumn } from '../ui'
import { getBlockExplorer } from '../../lib/blockExplorer'
import { truncateAddress } from '../../lib/format'

interface VaultActivityProps {
  entries: VaultActivityEntry[] | undefined
  isLoading: boolean
  assetDecimals: number | undefined
  assetSymbol: string | undefined
}

const KIND_LABEL: Record<VaultActivityEntry['kind'], string> = {
  deposit: 'deposit',
  'withdraw-queued': 'withdrawal queued',
  'withdraw-claimed': 'withdrawal claimed',
}

const KIND_BADGE: Record<VaultActivityEntry['kind'], string> = {
  deposit: 'ds-badge ds-badge--success',
  'withdraw-queued': 'ds-badge ds-badge--warn',
  'withdraw-claimed': 'ds-badge ds-badge--muted',
}

function formatTimestamp(ts: bigint | undefined): string {
  if (ts === undefined) return '—'
  const date = new Date(Number(ts) * 1000)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}


export function VaultActivity({
  entries,
  isLoading,
  assetDecimals,
  assetSymbol,
}: VaultActivityProps) {
  const chainId = useChainId()
  const explorer = getBlockExplorer(chainId)
  const decimals = assetDecimals ?? 6
  const symbol = assetSymbol ?? 'USDC'

  const columns = useMemo<DataTableColumn<VaultActivityEntry>[]>(
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
        id: 'amount',
        header: 'Amount',
        align: 'right',
        render: (e) => (
          <TokenAmount amount={e.assets} decimals={decimals} symbol={symbol} size="inline" />
        ),
      },
      {
        id: 'tx',
        header: 'Tx',
        width: '128px',
        render: (e) =>
          explorer ? (
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
          ),
      },
    ],
    [decimals, symbol, explorer],
  )

  return (
    <DataTable<VaultActivityEntry>
      aria-label="Vault activity"
      columns={columns}
      rows={entries ?? []}
      isLoading={isLoading && (!entries || entries.length === 0)}
      loadingRows={3}
      getRowKey={(e) => `${e.txHash}-${e.kind}`}
      emptyState={
        <EmptyState
          title="No activity yet"
          description="Your deposits and withdrawals will appear here."
        />
      }
    />
  )
}
