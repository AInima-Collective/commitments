import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { zeroAddress, type Address } from 'viem'

import { CommitmentsSankey } from '../graph/CommitmentsSankey'
import { commitmentDetailPath } from '../../lib/arbitrationRoutes'
import { bigintToUsd } from '../../lib/format'
import { commitmentLabel } from '../../lib/commitmentLabel'
import type { PriceEntry } from '../../hooks/useAssetPrices'
import type { ProtocolCommitmentRow } from '../../hooks/useProtocolEntityList'
import { useCommitmentLabelContext } from '../../hooks/useCommitmentLabelContext'
import { useTokenMetaMap } from '../../hooks/useTokenMeta'
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
  const navigate = useNavigate()

  const mineRows = useMemo(() => {
    if (!viewAddress) return []
    const mine = viewAddress.toLowerCase()
    return rows.filter((r) => r.committer.toLowerCase() === mine)
  }, [rows, viewAddress])

  // Name each commitment the same way every list row does — verified metadata
  // title first, then the structural tier, then the id. The diagram's terminal
  // nodes deep-link to the commitment page, so the name and the destination
  // stay one thing.
  const tokenMeta = useTokenMetaMap(useMemo(() => mineRows.map((r) => r.token), [mineRows]))
  const labelCtx = useCommitmentLabelContext(mineRows, tokenMeta)
  // The label context is a deliberately fresh object every render (its names
  // resolve asynchronously), so the resolver can't be memoized on inputs.
  // Run the labels eagerly — an array walk — and key the resolver's identity
  // on their TEXT: it changes exactly when a rendered name would, which is
  // also exactly when the Sankey payload downstream must rebuild.
  const labelTexts = mineRows.map((r) => commitmentLabel(r, labelCtx).text)
  const labelsKey = mineRows.map((r, i) => `${r.id.toString()}:${labelTexts[i]}`).join('\0')
  const labelFor = useMemo(() => {
    const byId = new Map(mineRows.map((r, i) => [r.id.toString(), labelTexts[i]]))
    return (row: ProtocolCommitmentRow): string =>
      byId.get(row.id.toString()) ?? `#${row.id.toString()}`
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labelsKey is the content fingerprint of mineRows+labelTexts
  }, [labelsKey])
  const openCommitment = useCallback(
    (id: bigint) => navigate(commitmentDetailPath(id)),
    [navigate],
  )

  // Brand marks resolve off the UNDERLYING asset (`USDC`), not the share
  // symbol (`cvUSDC`) — the same rule the assets table applies to its icons.
  const iconSymbolFor = useCallback(
    (token: string) => assetInfoByToken.get(token)?.priceSymbol,
    [assetInfoByToken],
  )

  const committed = useMemo<ProtocolCommitmentRow[]>(() => {
    return mineRows
      .map((r) => ({
        id: r.id,
        manager: r.manager ?? zeroAddress,
        committer: r.committer,
        arbiter: r.arbiter,
        counterparty: r.counterparty,
        token: r.token,
        amount: r.amount,
        maxPenaltyBps: r.maxPenaltyBps,
        status: r.status === 'PENDING' ? 'ACTIVE' : r.status,
        forfeitChallengeEnd: r.forfeitChallengeEnd ?? null,
        // None of these is read by buildSankey — they exist on
        // ProtocolCommitmentRow for the Explorer.
        unbondMaturesAt: null,
        createdBlock: 0n,
        createdAt: null,
      }))
  }, [mineRows])

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
      commitmentLabelFor={labelFor}
      onOpenCommitment={openCommitment}
      iconSymbolFor={iconSymbolFor}
    />
  )
}
