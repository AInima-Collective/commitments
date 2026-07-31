import { useCallback, useMemo } from 'react'
import type { Address } from 'viem'

import { CommitmentsSankey } from '../graph/CommitmentsSankey'
import { bigintToUsd } from '../../lib/format'
import type { PriceEntry } from '../../hooks/useAssetPrices'
import type { ProtocolCommitmentRow } from '../../hooks/useProtocolEntityList'
import type { UnifiedCommitmentRowEntry } from '../../hooks/useUnifiedRows'

/** Per-token pricing facts for the exact valuation. See `AssetSnapshot`. */
export interface SankeyAssetInfo {
  /** Symbol the price feed knows — the UNDERLYING asset for a vault share. */
  priceSymbol: string
  /** Decimals `pricedAmount` is denominated in. */
  priceDecimals: number
  /**
   * Total holding expressed in `priceSymbol`'s units, alongside the raw ledger
   * total it corresponds to. The ratio between them converts any raw amount of
   * this token into priced units — which for a vault share is the share price,
   * without this component having to read it a third time.
   */
  pricedTotal: bigint
  rawTotal: bigint
}

export interface PortfolioSankeyProps {
  /** The viewer's commitments, from the dashboard's unified row set. */
  rows: UnifiedCommitmentRowEntry[]
  /** Live per-token ledger, keyed by lowercased token address. */
  ledgerByToken: Map<string, { free: bigint; encumbered: bigint }>
  /** Pricing facts per lowercased token address. */
  assetInfoByToken: Map<string, SankeyAssetInfo>
  /** Current USD price by symbol, from the dashboard's shared price fetch. */
  getPrice: (symbol: string | undefined) => PriceEntry | undefined
  /** The address being viewed — decides which side of a commitment is "mine". */
  viewAddress: Address | undefined
  isLoading?: boolean
  error?: unknown
}

/**
 * PortfolioSankey — where this account's manager-held capital actually sits.
 *
 * Backing token → free | encumbered → who it's promised to. The free stub in
 * the middle column is what separates this from the protocol-wide diagram on
 * /app/explorer: because idle capital is drawn too, the first column's widths
 * sum to everything the manager holds for this account, so "how much of my
 * capital is doing nothing" is answerable by looking rather than by arithmetic.
 *
 * Only commitments the viewer COMMITTED are drawn. A commitment where they are
 * the counterparty encumbers someone else's balance — including it would draw
 * capital this account doesn't hold, and the column widths would stop summing
 * to the account's own position.
 */
export function PortfolioSankey({
  rows,
  ledgerByToken,
  assetInfoByToken,
  getPrice,
  viewAddress,
  isLoading,
  error,
}: PortfolioSankeyProps) {
  const committed = useMemo<ProtocolCommitmentRow[]>(() => {
    if (!viewAddress) return []
    const mine = viewAddress.toLowerCase()
    return rows
      .filter((r) => r.committer.toLowerCase() === mine)
      .map((r) => ({
        id: r.id,
        committer: r.committer,
        arbiter: r.arbiter,
        counterparty: r.counterparty,
        token: r.token,
        amount: r.amount,
        maxPenaltyBps: r.maxPenaltyBps,
        status: r.status === 'PENDING' ? 'ACTIVE' : r.status,
        forfeitChallengeEnd: r.forfeitChallengeEnd ?? null,
        // Neither field is read by buildSankey — they exist on
        // ProtocolCommitmentRow for the Explorer's urgency sort.
        unbondMaturesAt: null,
        createdBlock: 0n,
      }))
  }, [rows, viewAddress])

  const freeByToken = useMemo(() => {
    const m = new Map<string, bigint>()
    for (const [token, ledger] of ledgerByToken) {
      if (ledger.free > 0n) m.set(token, ledger.free)
    }
    return m
  }, [ledgerByToken])

  /**
   * USD for a raw ledger amount, going through the underlying asset.
   *
   * Without this the diagram priced a vault share by its own symbol — the feed
   * knows `USDC`, not `cvUSDC` — so every vault-backed ribbon fell back to raw
   * token units and the whole thing had to carry a notice saying its widths
   * weren't comparable. The dashboard has already computed the priced total per
   * asset for the hero, and `convertToAssets` is linear, so scaling by
   * `pricedTotal / rawTotal` converts any amount of that token exactly, with no
   * extra chain read.
   */
  const exactValue = useCallback(
    (token: Address, raw: bigint): number | null => {
      const info = assetInfoByToken.get(token.toLowerCase())
      if (!info || info.rawTotal === 0n) return null
      const price = getPrice(info.priceSymbol)?.usd
      if (price === undefined) return null
      const priced = (raw * info.pricedTotal) / info.rawTotal
      const usd = bigintToUsd(priced, info.priceDecimals, price)
      return usd === null ? null : Number(usd) / 1e6
    },
    [assetInfoByToken, getPrice],
  )

  return (
    <CommitmentsSankey
      mode="allocation"
      commitments={committed}
      freeByToken={freeByToken}
      exactValue={exactValue}
      hideWeightToggle
      isLoading={isLoading}
      error={error}
      emptyLabel="Nothing in the manager yet — deposit backing to see where it sits."
    />
  )
}
