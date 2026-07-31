import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Address } from 'viem'

import { Notice, TimeSeriesChart, type TimeSeriesPoint } from '../ui'
import { bigintToUsd } from '../../lib/format'
import { useBalanceHistory, type BalancePoint } from '../../hooks/useBalanceHistory'
import { useTokenMetaMap } from '../../hooks/useTokenMeta'
import { useVaultPeriodicHistory } from '../../hooks/useVaultPeriodicHistory'
import {
  useReadCommitmentsVaultAsset,
  useReadCommitmentsVaultConvertToAssets,
} from '../../generated'
import { useDisplayNow } from '../../hooks/useDisplayNow'
import type { PriceEntry } from '../../hooks/useAssetPrices'
import type { BackingOption } from '../../config/contracts'

// How far back to pull. The balance log goes back to the manager's first block;
// the vault snapshot endpoint caps at 90 days, so share prices older than that
// fall back to the earliest snapshot we have (see `sharePriceAt`). The chart's
// own range chips filter this window client-side, so widening it costs one
// request, not one per range change.
const HISTORY_DAYS = 365
const SHARE_PRICE_DAYS = 90

/** 1e18-scaled share price, matching `VaultPeriodicSnapshotRow.sharePrice`. */
const SHARE_PRICE_SCALE = 10n ** 18n

export interface PortfolioChartProps {
  /** Whose history to chart. */
  address: Address | undefined
  /**
   * Live per-token ledger, keyed by lowercased token address. This is the
   * ANCHOR: the folded series is shifted so its final point equals these
   * values, which is what keeps the chart's right edge equal to the number in
   * the hero above it. See `useBalanceHistory` for why the fold alone can drift.
   */
  ledgerByToken: Map<string, { free: bigint; encumbered: bigint }>
  /** Backing tokens in play — `isVaultShare` selects the valuation path. */
  candidates: BackingOption[]
  /** Current USD price by symbol, from the dashboard's shared price fetch. */
  getPrice: (symbol: string | undefined) => PriceEntry | undefined
}

/** Asset-side pricing metadata for one ERC-4626 backing token. */
interface VaultValuation {
  assetSymbol: string | undefined
  assetDecimals: number | undefined
  /** Snapshot share prices, ASCENDING by timestamp. */
  sharePrices: Array<{ t: number; sharePrice: bigint }>
}

/**
 * PortfolioChart — free and encumbered balance stacked into total portfolio
 * value over time.
 *
 * ── How the value is computed, and what that does and doesn't show ──────────
 *
 * There is no historical price feed (the indexer's `/prices` is a live
 * CoinGecko cache with a static offline fallback), so a USD series has to be
 * constructed. This one is:
 *
 *     value(t) = Σ_erc20  qty(t)    × price_now(token)
 *              + Σ_vault  shares(t) × sharePrice(t) × price_now(asset)
 *
 * Quantities are historical; token prices are current; ERC-4626 share prices
 * are historical. So the curve shows what you did (deposits, commitments,
 * forfeits) and what your backing earned (yield accrual is real, read from the
 * vault snapshot series) — but NOT market moves. A WETH rally does not appear.
 * That is deliberate: it makes the chart a picture of protocol activity rather
 * than of the crypto market, and it needs no infrastructure that doesn't exist.
 *
 * Two alternatives were considered and set aside, both worth revisiting:
 *   - Snapshot spot prices into an offchain table alongside the existing 5-min
 *     vault snapshot job. Gives genuinely correct USD, but only from the day it
 *     ships forward, and it can never fill in the past.
 *   - Plot token-denominated series with no USD at all. Exactly true, but
 *     there's no single headline number to anchor the dashboard on.
 * A future version could offer these as chart modes rather than replacing this
 * one — the valuation is isolated to `usdAt` below for exactly that reason.
 *
 * ── Anchoring ───────────────────────────────────────────────────────────────
 *
 * The folded free series can drift low (see `useBalanceHistory` caveat 1), and
 * a very active account can have its oldest history truncated server-side. Both
 * errors are a CONSTANT offset on the whole series, so each token's points are
 * shifted by `live - latest` before valuation. The last point therefore always
 * equals the live balance exactly.
 */
export function PortfolioChart({ address, ledgerByToken, candidates, getPrice }: PortfolioChartProps) {
  const { data, isLoading, error } = useBalanceHistory({ address, days: HISTORY_DAYS })

  const historyTokens = useMemo(() => data?.tokens.map((t) => t.token) ?? [], [data])
  const { metaFor } = useTokenMetaMap(historyTokens)

  // Vault-share valuation is resolved by child probes (one hook set per vault
  // can't be called in a loop). Same report-up shape the dashboard already uses
  // for per-asset snapshots.
  const [vaultValuations, setVaultValuations] = useState<Record<string, VaultValuation>>({})
  const reportVault = useCallback((token: string, v: VaultValuation) => {
    const key = token.toLowerCase()
    setVaultValuations((prev) => {
      const existing = prev[key]
      if (
        existing &&
        existing.assetSymbol === v.assetSymbol &&
        existing.assetDecimals === v.assetDecimals &&
        existing.sharePrices.length === v.sharePrices.length &&
        existing.sharePrices.at(-1)?.sharePrice === v.sharePrices.at(-1)?.sharePrice
      ) {
        return prev
      }
      return { ...prev, [key]: v }
    })
  }, [])

  const vaultShareTokens = useMemo(
    () =>
      candidates
        .filter((c) => c.isVaultShare)
        .filter((c) => historyTokens.some((t) => t.toLowerCase() === c.token.toLowerCase()))
        .map((c) => c.token),
    [candidates, historyTokens],
  )

  // Chain time, not wall time. Balance-history timestamps are block timestamps,
  // and on anvil the admin time controls warp the chain away from the local
  // clock — a wall-clock "now" would plant the trailing point in the wrong place.
  const nowSec = useDisplayNow()

  const { free, encumbered, unpricedSymbols } = useMemo(
    () => buildSeries({ data, ledgerByToken, metaFor, vaultValuations, getPrice, candidates, nowSec }),
    [data, ledgerByToken, metaFor, vaultValuations, getPrice, candidates, nowSec],
  )

  const probes = vaultShareTokens.map((t) => (
    <VaultValuationProbe key={t} vaultAddress={t} onReport={reportVault} />
  ))

  if (error) {
    return (
      <>
        {probes}
        <Notice tone="warn" size="sm" title="History unavailable">
          Balance history is temporarily unavailable — please retry shortly.
        </Notice>
      </>
    )
  }

  if (!isLoading && free.length < 2) {
    return (
      <>
        {probes}
        <Notice tone="info" size="sm" title="Not enough history yet">
          Your portfolio chart appears once this address has more than one ledger
          movement — a deposit, a commitment, or a settlement.
        </Notice>
      </>
    )
  }

  return (
    <div className="ds-stack ds-stack-3">
      {probes}
      {unpricedSymbols.length > 0 && (
        <Notice tone="warn" size="sm">
          No USD price for {unpricedSymbols.join(', ')} — those holdings are left out
          of the total.
        </Notice>
      )}
      <TimeSeriesChart
        ariaLabel="Portfolio value over time, split into free and encumbered balance"
        series={[
          { label: 'free', data: free, tone: 'success' },
          { label: 'encumbered', data: encumbered, tone: 'warn' },
        ]}
        stacked
        tUnit="s"
        size="lg"
        formatValue={formatUsdAxis}
        defaultRange="1M"
        ranges={['1W', '1M', 'ALL']}
      />
      <p className="ds-text-xs ds-subtle" style={{ margin: 0 }}>
        Balances are historical and vault share prices are historical, so yield
        shows up as real growth. Token prices are today's, so market moves do not.
      </p>
      {data?.truncated && (
        <Notice tone="info" size="sm">
          This address has more ledger activity than one page of history — the
          earliest movements are summarised into the opening balance.
        </Notice>
      )}
    </div>
  )
}

// ─── Valuation ─────────────────────────────────────────────────────────────

interface BuildSeriesArgs {
  data: ReturnType<typeof useBalanceHistory>['data']
  ledgerByToken: Map<string, { free: bigint; encumbered: bigint }>
  metaFor: (token?: Address) => { decimals: number; symbol: string }
  vaultValuations: Record<string, VaultValuation>
  getPrice: (symbol: string | undefined) => PriceEntry | undefined
  candidates: BackingOption[]
  /** Chain-time "now", in unix seconds. */
  nowSec: number
}

/**
 * Fold every token's step series into two merged USD series.
 *
 * Balances are step functions — a value holds until the next movement — so the
 * merged timeline is the union of all tokens' timestamps, and each token
 * contributes its most recent value at-or-before each instant.
 */
function buildSeries({
  data,
  ledgerByToken,
  metaFor,
  vaultValuations,
  getPrice,
  candidates,
  nowSec,
}: BuildSeriesArgs): { free: TimeSeriesPoint[]; encumbered: TimeSeriesPoint[]; unpricedSymbols: string[] } {
  if (!data || data.tokens.length === 0) return { free: [], encumbered: [], unpricedSymbols: [] }

  const isVaultShare = new Set(
    candidates.filter((c) => c.isVaultShare).map((c) => c.token.toLowerCase()),
  )
  const unpriced = new Set<string>()

  // Per-token: anchored points + the valuation closure for that token.
  const tracks = data.tokens.map((t) => {
    const key = t.token.toLowerCase()
    const live = ledgerByToken.get(key)
    // Shift so the fold's endpoint matches the live read. Absent live data
    // (token not in the dashboard's candidate set) means no shift rather than a
    // guess.
    const freeShift = live ? live.free - t.latest.free : 0n
    const encShift = live ? live.encumbered - t.latest.encumbered : 0n

    const meta = metaFor(t.token)
    const vaultVal = isVaultShare.has(key) ? vaultValuations[key] : undefined
    const priceSymbol = vaultVal ? vaultVal.assetSymbol : meta.symbol
    const price = getPrice(priceSymbol)?.usd ?? null
    if (price === null && priceSymbol) unpriced.add(priceSymbol)

    return {
      points: t.points,
      // Trailing "now" point so the chart runs to the present rather than
      // stopping at the last on-chain movement.
      liveFree: live ? live.free : t.latest.free + freeShift,
      liveEncumbered: live ? live.encumbered : t.latest.encumbered + encShift,
      freeShift,
      encShift,
      /**
       * Raw token units at time `t` → USD float, or `null` when this token
       * cannot be valued.
       *
       * Null rather than 0 on purpose. Every one of these branches used to
       * return 0, which silently dropped a holding from the total and produced
       * a chart that disagreed with the hero figure above it with no
       * indication anything was missing — a wrong number is worse than an
       * absent one. The caller collects the unvalued symbols and says so.
       */
      usdAt: (raw: bigint, at: number): number | null => {
        if (raw === 0n) return 0
        if (vaultVal) {
          const { assetDecimals, sharePrices } = vaultVal
          if (assetDecimals === undefined || sharePrices.length === 0) return null
          // shares × (assets per share) → underlying, in ASSET decimals. The
          // vault's 9-decimal offset means share decimals != asset decimals, so
          // this conversion — not a raw decimals swap — is what makes the two
          // sides comparable.
          const underlying = (raw * sharePriceAt(sharePrices, at)) / SHARE_PRICE_SCALE
          const usd = bigintToUsd(underlying, assetDecimals, price)
          return usd === null ? null : Number(usd) / 1e6
        }
        const usd = bigintToUsd(raw, meta.decimals, price)
        return usd === null ? null : Number(usd) / 1e6
      },
      /** Display name for this token in the "couldn't value these" notice. */
      label: priceSymbol ?? meta.symbol,
      cursor: 0,
      currentFree: 0n,
      currentEncumbered: 0n,
    }
  })

  const timeline = [...new Set(tracks.flatMap((tr) => tr.points.map((p) => p.t)))].sort((a, b) => a - b)
  if (timeline.length === 0) return { free: [], encumbered: [], unpricedSymbols: [...unpriced] }

  const free: TimeSeriesPoint[] = []
  const encumbered: TimeSeriesPoint[] = []

  // Tokens that returned null from `usdAt` at any instant. A token that cannot
  // be valued is excluded from the whole series, not just the instants where
  // the read had not landed — otherwise the line would step as metadata arrives.
  const unvalued = new Set<string>()

  /** Sum one side across tokens, recording any that decline to be valued. */
  const sumSide = (pick: (tr: (typeof tracks)[number]) => bigint, at: number): number => {
    let total = 0
    for (const tr of tracks) {
      // A shift can push a balance below zero when the fold is missing credits
      // (see the anchoring note). Clamp: a negative band would render as a
      // downward spike that never existed.
      const raw = pick(tr)
      const usd = tr.usdAt(raw > 0n ? raw : 0n, at)
      if (usd === null) {
        if (raw > 0n) unvalued.add(tr.label)
        continue
      }
      total += usd
    }
    return total
  }

  for (const at of timeline) {
    for (const tr of tracks) {
      // Advance this token's cursor to the last point at-or-before `at`.
      while (tr.cursor < tr.points.length && tr.points[tr.cursor].t <= at) {
        const p: BalancePoint = tr.points[tr.cursor]
        tr.currentFree = p.free + tr.freeShift
        tr.currentEncumbered = p.encumbered + tr.encShift
        tr.cursor += 1
      }
    }
    free.push({ t: at, v: sumSide((tr) => tr.currentFree, at) })
    encumbered.push({ t: at, v: sumSide((tr) => tr.currentEncumbered, at) })
  }

  // Close on the live values so the right edge matches the hero exactly.
  if (timeline[timeline.length - 1] < nowSec) {
    free.push({ t: nowSec, v: sumSide((tr) => tr.liveFree, nowSec) })
    encumbered.push({ t: nowSec, v: sumSide((tr) => tr.liveEncumbered, nowSec) })
  }

  // `unpriced` is the subset with a known asset but no USD quote; `unvalued`
  // also covers metadata that never resolved. Report the union once.
  for (const s of unpriced) unvalued.add(s)
  return { free, encumbered, unpricedSymbols: [...unvalued].sort() }
}

/**
 * Share price in effect at `at`. Rows are ascending; anything before the first
 * snapshot uses that first snapshot, which slightly understates yield for
 * points older than the 90-day snapshot window.
 */
function sharePriceAt(rows: Array<{ t: number; sharePrice: bigint }>, at: number): bigint {
  let result = rows[0].sharePrice
  for (const r of rows) {
    if (r.t > at) break
    result = r.sharePrice
  }
  return result
}

function formatUsdAxis(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(2)}`
}

// ─── Vault probe ───────────────────────────────────────────────────────────

/**
 * Resolves one ERC-4626 backing token's asset pricing metadata and share-price
 * history, then reports it up. Renders nothing.
 *
 * A component rather than a loop because both hooks are per-vault, and the
 * number of vaults is data-driven. Same pattern as the dashboard's `AssetRow`
 * snapshot reporting.
 */
function VaultValuationProbe({
  vaultAddress,
  onReport,
}: {
  vaultAddress: Address
  onReport: (token: string, v: VaultValuation) => void
}) {
  // Read the asset side here rather than through `useVaultPosition`: that hook
  // gates EVERY read on `!!viewAddress` (it exists to describe one account's
  // position), so calling it with `viewAddress: undefined` disables all of them
  // and returns `assetDecimals: undefined`. It appeared to work only when the
  // assets table had already populated the same react-query cache key — which
  // made this a race, and the vault that lost it was silently valued at zero.
  const { data: assetAddress } = useReadCommitmentsVaultAsset({ address: vaultAddress })
  // `byAddress`, not `metaFor` — the latter substitutes an 18-decimal 'TOKEN'
  // placeholder for a token it hasn't resolved yet, and valuing 6-decimal USDC
  // at 18 decimals is far worse than declining to value it. An absent entry has
  // to stay absent so `usdAt` can report the token as unvalued.
  const { byAddress } = useTokenMetaMap([assetAddress as Address | undefined])
  const assetMeta = assetAddress ? byAddress[(assetAddress as string).toLowerCase()] : undefined
  const { data } = useVaultPeriodicHistory({ vaultAddress, days: SHARE_PRICE_DAYS })
  // Live share price, as the fallback when no snapshot history exists — a
  // freshly-started indexer has written at most one snapshot, and a failed
  // snapshot job would otherwise value every vault share at zero and understate
  // the whole portfolio without saying so. convertToAssets(1e18) is the same
  // quantity the snapshot stores, read straight from the vault.
  const { data: liveSharePrice } = useReadCommitmentsVaultConvertToAssets({
    address: vaultAddress,
    args: [SHARE_PRICE_SCALE],
  })

  const valuation = useMemo<VaultValuation>(() => {
    // Hook returns newest-first; the lookup walks forwards.
    const snapshots = [...(data?.rows ?? [])]
      .reverse()
      .map((r) => ({ t: r.timestamp, sharePrice: r.sharePrice }))
    return {
      assetSymbol: assetMeta?.symbol,
      assetDecimals: assetMeta?.decimals,
      // `t: 0` so the flat fallback applies to every point in the timeline.
      sharePrices:
        snapshots.length > 0
          ? snapshots
          : liveSharePrice !== undefined
            ? [{ t: 0, sharePrice: liveSharePrice as bigint }]
            : [],
    }
  }, [assetMeta?.symbol, assetMeta?.decimals, data, liveSharePrice])

  // Reporting to a parent must not happen during render — same effect-based
  // hand-off `AssetRow` uses for its per-asset snapshots. The parent's setter
  // no-ops on an unchanged value, so this can fire on identity change alone.
  useEffect(() => {
    onReport(vaultAddress, valuation)
  }, [vaultAddress, valuation, onReport])

  return null
}
