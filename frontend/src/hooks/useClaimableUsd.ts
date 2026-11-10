import { useMemo } from 'react'
import { type Address, erc20Abi } from 'viem'
import { useReadContracts } from 'wagmi'

import { commitmentsVaultAbi } from '../generated'
import { type TokenValuation, usdForAmount } from '../lib/claimableYield'
import { useAssetPrices } from './useAssetPrices'
import { useTokenMetaMap } from './useTokenMeta'
import { POLL } from './polling'

/** What a token is valued in. `vault` is set when the token is that vault's share. */
export interface ValuedToken {
  token: Address
  vault: Address | undefined
}

/** An amount restated in the asset its USD price is quoted for. */
export interface AssetAmount {
  amount: bigint
  decimals: number
  symbol: string
}

interface UseClaimableUsdReturn {
  /** Token-aware USD valuation: prices `amount` of `token` in USD (6-decimal
   *  bigint), or `null` when no price is available. Raw ERC-20s price by their
   *  own symbol; vault shares convert to underlying first. */
  usdFor: (token: Address, amount: bigint) => bigint | null
  /** `amount` of `token` in the priced asset: itself for a raw ERC-20, the
   *  underlying for a vault share. Undefined until the share rate is read. */
  inAsset: (token: Address, amount: bigint) => AssetAmount | undefined
  /** True while token metadata / share-rate reads are in flight. */
  isLoading: boolean
}

/**
 * useClaimableUsd — per-token USD valuation for a set of backing tokens.
 *
 * v2 positions can be backed by heterogeneous tokens, so a single
 * `shareToUsd` (canonical-vault-only) is wrong the moment two backing tokens
 * appear. This hook resolves, per distinct entry token:
 *   - raw ERC-20s → priced directly by their own decimals + symbol;
 *   - ERC-4626 vault shares (tokens that carry a `vault`) → converted to the
 *     underlying asset via a single `convertToAssets`/`asset` read, then the
 *     underlying asset's symbol is priced.
 *
 * The hook owns its own price fetch (over exactly the symbols it needs) so it
 * stays correct regardless of what other symbols the page happens to request.
 * Returns `usdFor(token, amount)`; unavailable prices yield `null` so callers
 * degrade to token-only display.
 */
export function useClaimableUsd(entries: readonly ValuedToken[]): UseClaimableUsdReturn {
  // Decimals/symbol for every entry token (raw ERC-20 or vault share). For a
  // vault share this `decimals` IS the share precision used by convertToAssets.
  const tokenMeta = useTokenMetaMap(useMemo(() => entries.map((e) => e.token), [entries]))

  // Distinct vault-share tokens: entries that carry a `vault`. In ERC-4626 the
  // share token IS the vault contract, so we read convertToAssets/asset on the
  // token address itself.
  const vaultTokens = useMemo(() => {
    const seen = new Set<string>()
    const out: Address[] = []
    for (const e of entries) {
      if (!e.vault) continue
      const k = e.token.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(e.token)
    }
    return out
  }, [entries])

  // Stage 1: per vault share, read assets-per-share (convertToAssets of one
  // whole share) and the underlying asset address.
  const { data: vaultData } = useReadContracts({
    contracts: vaultTokens.flatMap((token) => {
      const shareDecimals = tokenMeta.metaFor(token).decimals
      return [
        {
          abi: commitmentsVaultAbi,
          address: token,
          functionName: 'convertToAssets' as const,
          args: [10n ** BigInt(shareDecimals)] as const,
        },
        { abi: commitmentsVaultAbi, address: token, functionName: 'asset' as const },
      ]
    }),
    // Gate on resolved token metadata: `convertToAssets(10^shareDecimals)` and
    // the valuation's `shareDecimals` must use the same (final) precision, never
    // the transient 18-decimal fallback, or the two would briefly disagree.
    query: {
      enabled: vaultTokens.length > 0 && !tokenMeta.isLoading,
      refetchInterval: POLL.slow,
    },
  })

  const assetAddresses = useMemo(
    () =>
      vaultTokens.map((_, i) => (vaultData?.[i * 2 + 1]?.result as Address | undefined)),
    [vaultTokens, vaultData],
  )

  // Stage 2: underlying asset decimals + symbol (needed to interpret
  // convertToAssets output and to look up a USD price).
  const { data: assetData } = useReadContracts({
    contracts: assetAddresses
      .filter((a): a is Address => !!a)
      .flatMap((asset) => [
        { abi: erc20Abi, address: asset, functionName: 'decimals' as const },
        { abi: erc20Abi, address: asset, functionName: 'symbol' as const },
      ]),
    query: { enabled: assetAddresses.some(Boolean) },
  })

  // Symbols we need priced: every raw token's own symbol + every vault's
  // underlying asset symbol.
  const priceSymbols = useMemo(() => {
    const symbols = new Set<string>()
    for (const e of entries) {
      if (!e.vault) symbols.add(tokenMeta.metaFor(e.token).symbol)
    }
    const present = assetAddresses.filter((a): a is Address => !!a)
    present.forEach((_, i) => {
      const symbol = assetData?.[i * 2 + 1]?.result as string | undefined
      if (symbol) symbols.add(symbol)
    })
    return [...symbols]
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tokenMeta.metaFor is stable per byAddress
  }, [entries, tokenMeta.byAddress, assetAddresses, assetData])

  const { getPrice } = useAssetPrices({ symbols: priceSymbols })

  // Build a valuation per distinct token, keyed by lowercased address.
  const valuations = useMemo(() => {
    const map = new Map<string, { valuation: TokenValuation; symbol: string }>()

    // Vault shares: convertToAssets rate + underlying asset meta.
    const present = assetAddresses.filter((a): a is Address => !!a)
    const assetMetaByAddr = new Map<string, { decimals: number; symbol: string }>()
    present.forEach((asset, i) => {
      const decimals = assetData?.[i * 2]?.result as number | undefined
      const symbol = assetData?.[i * 2 + 1]?.result as string | undefined
      if (decimals !== undefined && symbol !== undefined) {
        assetMetaByAddr.set(asset.toLowerCase(), { decimals, symbol })
      }
    })

    vaultTokens.forEach((token, i) => {
      const oneShareAssets = vaultData?.[i * 2]?.result as bigint | undefined
      const asset = assetAddresses[i]
      if (oneShareAssets === undefined || !asset) return
      const assetMeta = assetMetaByAddr.get(asset.toLowerCase())
      if (!assetMeta) return
      map.set(token.toLowerCase(), {
        symbol: assetMeta.symbol,
        valuation: {
          kind: 'share',
          shareDecimals: tokenMeta.metaFor(token).decimals,
          oneShareAssets,
          assetDecimals: assetMeta.decimals,
          priceUsd: getPrice(assetMeta.symbol)?.usd ?? null,
        },
      })
    })

    // Raw ERC-20s: price directly by the token's own symbol/decimals.
    for (const e of entries) {
      if (e.vault) continue
      const key = e.token.toLowerCase()
      if (map.has(key)) continue
      const meta = tokenMeta.metaFor(e.token)
      map.set(key, {
        symbol: meta.symbol,
        valuation: { kind: 'direct', decimals: meta.decimals, priceUsd: getPrice(meta.symbol)?.usd ?? null },
      })
    }

    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tokenMeta.metaFor is stable per byAddress; getPrice per prices
  }, [entries, vaultTokens, vaultData, assetAddresses, assetData, tokenMeta.byAddress, getPrice])

  return useMemo(() => {
    const usdFor = (token: Address, amount: bigint): bigint | null =>
      usdForAmount(amount, valuations.get(token.toLowerCase())?.valuation)
    const inAsset = (token: Address, amount: bigint): AssetAmount | undefined => {
      const entry = valuations.get(token.toLowerCase())
      if (!entry) return undefined
      const v = entry.valuation
      return v.kind === 'direct'
        ? { amount, decimals: v.decimals, symbol: entry.symbol }
        : {
            amount: (amount * v.oneShareAssets) / 10n ** BigInt(v.shareDecimals),
            decimals: v.assetDecimals,
            symbol: entry.symbol,
          }
    }
    return { usdFor, inAsset, isLoading: tokenMeta.isLoading }
  }, [valuations, tokenMeta.isLoading])
}
