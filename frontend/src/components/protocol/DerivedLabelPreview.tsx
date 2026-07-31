import { useMemo } from 'react'
import { type Address } from 'viem'
import { useChainId } from 'wagmi'
import { findKnownAddress } from '../../config/contracts'
import { useOperatorNames } from '../../hooks/useOperatorNames'
import { pendingCommitmentLabel } from '../../lib/commitmentLabel'

export interface DerivedLabelPreviewProps {
  /** Counterparty the commitment will be pointed at. */
  counterparty: Address | undefined
  /** Backing token, for denominating the last-resort label. */
  token: Address | undefined
  amount: bigint | undefined
  decimals: number | undefined
  symbol: string | undefined
  className?: string
}

/**
 * What this commitment will be called if the author writes no title.
 *
 * Naming is a nudge, not a gate: an unnamed commitment is completely valid,
 * and most of the ones on chain today were never named by anyone. So rather
 * than nagging, the form shows the actual consequence of leaving the fields
 * blank, and lets the author decide whether the derived label is good enough.
 * Often it is.
 *
 * Runs the same tier logic as every list row, via `pendingCommitmentLabel`.
 */
export function DerivedLabelPreview({
  counterparty,
  token,
  amount,
  decimals,
  symbol,
  className,
}: DerivedLabelPreviewProps) {
  const chainId = useChainId()
  const parties = useMemo(() => [counterparty], [counterparty])
  const names = useOperatorNames(parties)

  const label = pendingCommitmentLabel(
    { counterparty, token, amount },
    {
      operatorName: (a) => names.get(a),
      knownAddress: (a) => findKnownAddress(chainId, a),
      tokenMeta:
        decimals !== undefined && symbol !== undefined ? () => ({ decimals, symbol }) : undefined,
    },
  )

  if (!label) return null

  return (
    <p className={['ds-text-xs', 'ds-subtle', className].filter(Boolean).join(' ')}>
      Without a title, this will be listed as <q>{label}</q>.
    </p>
  )
}
