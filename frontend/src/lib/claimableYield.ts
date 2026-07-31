import { type Address, type Hex } from 'viem'

import { bigintToUsd } from './format'

/**
 * Per-row entry consumed by the dashboard ClaimableYieldPanel.
 *
 * v2: yield is paid per-(commitment, strategy) by distribution strategies —
 * there is no per-commitment accumulator column anymore. Each entry is one
 * (commitment, strategy) pair whose live claimable `amount` came from
 * `manager.pending(commitmentId, strategy, claimData)`. Formatting is a CALLER
 * concern (decimals live on the share token).
 *
 * `committer` is the commitment's committer (display only). `vault` is the
 * issuing vault when the backing token is a vault share (the indexer
 * denormalizes it). `claimData` is the bytes passed to `claim` — empty for the
 * counterparty path.
 */
export interface ClaimableYieldEntry {
  commitmentId: bigint
  committer: Address
  amount: bigint
  /** The commitment's backing token — `amount` is denominated in THIS token's
   *  units (raw ERC-20 or vault share), so the panel resolves decimals/symbol
   *  from it rather than assuming the vault share. */
  token: Address
  vault: Address | undefined
  strategy: Address
  claimData: Hex
}

/** Stable key for a (commitment, strategy) row — used for React keys + the
 *  dashboard's optimistic-removal set. */
export function claimableEntryKey(entry: {
  commitmentId: bigint
  strategy: Address
}): string {
  return `${entry.commitmentId.toString()}-${entry.strategy.toLowerCase()}`
}

/**
 * One strategy binding row from `GET /account/:address/claimable-yield`. The
 * endpoint returns active commitments where the address is the counterparty,
 * each carrying the parent commitment (so we can show the committer/vault and
 * make the live `pending` read).
 */
export interface ClaimableBindingRow {
  commitmentId: string | bigint
  strategy: string
  committer: string
  token: string
  vault?: string | null
}

const EMPTY_CLAIM_DATA = '0x' as Hex

/**
 * Pure helper: zip indexer binding rows with their live `pending` amounts into
 * ClaimableYieldEntry[], dropping zero/negative rows. Addresses are lowercased
 * to match indexer storage convention. `pendings[i]` aligns with `rows[i]`.
 */
export function buildClaimableEntries(
  rows: ClaimableBindingRow[],
  pendings: Array<bigint | undefined>,
): ClaimableYieldEntry[] {
  const out: ClaimableYieldEntry[] = []
  rows.forEach((r, i) => {
    const amount = pendings[i] ?? 0n
    if (amount <= 0n) return
    const id = typeof r.commitmentId === 'bigint' ? r.commitmentId : BigInt(r.commitmentId)
    out.push({
      commitmentId: id,
      committer: r.committer.toLowerCase() as Address,
      amount,
      token: r.token.toLowerCase() as Address,
      vault: r.vault ? (r.vault.toLowerCase() as Address) : undefined,
      strategy: r.strategy.toLowerCase() as Address,
      claimData: EMPTY_CLAIM_DATA,
    })
  })
  return out
}

/**
 * How to value one backing token in USD.
 *
 * v2 commitments are backed by heterogeneous tokens, so USD — not raw token
 * units — is the only correct common denominator across rows. Each token gets
 * one of two valuation shapes:
 *   - `direct`: a raw ERC-20 priced by its own decimals + symbol (USDC, WETH…).
 *   - `share`: an ERC-4626 vault share, which must be converted to its
 *     underlying asset BEFORE pricing (the share symbol — cvUSDC — has no feed;
 *     the asset symbol does). The conversion is linear:
 *       assets = amount × oneShareAssets / 10^shareDecimals
 *     where `oneShareAssets = convertToAssets(10^shareDecimals)`.
 *
 * `priceUsd` is `null`/`undefined` when the price source has no entry for the
 * relevant symbol — {@link usdForAmount} then returns null so the caller
 * degrades to token-only display rather than a misleading figure.
 */
export type TokenValuation =
  | { kind: 'direct'; decimals: number; priceUsd: number | null | undefined }
  | {
      kind: 'share'
      shareDecimals: number
      /** convertToAssets(10^shareDecimals) — underlying assets per one whole share. */
      oneShareAssets: bigint
      assetDecimals: number
      priceUsd: number | null | undefined
    }

/**
 * USD value (6-decimal bigint, USDC-shape) of `amount` units of a backing
 * token, or `null` when the price is unavailable. Vault shares convert to
 * underlying first so the price applies to the asset, never the share.
 */
export function usdForAmount(
  amount: bigint,
  valuation: TokenValuation | undefined,
): bigint | null {
  if (!valuation) return null
  if (valuation.kind === 'direct') {
    return bigintToUsd(amount, valuation.decimals, valuation.priceUsd)
  }
  const assets = (amount * valuation.oneShareAssets) / 10n ** BigInt(valuation.shareDecimals)
  return bigintToUsd(assets, valuation.assetDecimals, valuation.priceUsd)
}

/**
 * Sum per-row USD values into one headline total. Returns `null` if ANY input
 * is null: a partial total reads as complete and is misleading, so the whole
 * headline degrades to "price unavailable" instead. Callers still render each
 * priced row's USD individually.
 */
export function sumUsd(values: Array<bigint | null>): bigint | null {
  let total = 0n
  for (const v of values) {
    if (v === null) return null
    total += v
  }
  return total
}
