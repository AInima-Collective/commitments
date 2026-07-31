import { useMemo } from 'react'
import { type Address, erc20Abi } from 'viem'
import { useReadContracts } from 'wagmi'

/** Resolved ERC-20 display metadata for a backing token. */
export interface TokenMeta {
  decimals: number
  symbol: string
}

/**
 * Fallback used while the on-chain read is in flight or for an undefined token.
 * 18 decimals is the ERC-20 default; 'TOKEN' is a neutral placeholder symbol.
 */
const FALLBACK: TokenMeta = { decimals: 18, symbol: 'TOKEN' }

interface UseTokenMetaMapReturn {
  /** Resolve metadata for one token; returns the fallback if unknown/pending. */
  metaFor: (token?: Address) => TokenMeta
  /** Lookup keyed by lowercased address. */
  byAddress: Record<string, TokenMeta>
  isLoading: boolean
}

/**
 * Resolve ERC-20 `decimals` + `symbol` for a set of token addresses in a single
 * batched multicall.
 *
 * v2 commitments are custodied per-(token, user): every commitment and
 * agreement carries its OWN backing token (a raw ERC-20 or an ERC-4626 vault
 * share). Amounts must therefore be denominated in the commitment's own token —
 * never the vault share. Rendering a 6-decimal USDC amount with the vault's
 * 15-decimal share precision underflows to a displayed `0`; this hook is the
 * fix. Reach for it anywhere a commitment/proposal amount is shown.
 *
 * Pass the full list of row tokens; duplicates are de-duped and the read is
 * keyed by a stable join so it doesn't refire on every render.
 */
export function useTokenMetaMap(tokens: ReadonlyArray<Address | undefined>): UseTokenMetaMapReturn {
  // Stable dependency key — `tokens` is a fresh array each render, but the set
  // of addresses rarely changes, so derive the memo key from the sorted lowers.
  const key = tokens
    .filter((t): t is Address => !!t)
    .map((t) => t.toLowerCase())
    .sort()
    .join(',')

  const unique = useMemo<Address[]>(() => {
    const seen = new Set<string>()
    const out: Address[] = []
    for (const t of tokens) {
      if (!t) continue
      const k = t.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(t)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the stable projection of `tokens`
  }, [key])

  const { data, isLoading } = useReadContracts({
    contracts: unique.flatMap((token) => [
      { abi: erc20Abi, address: token, functionName: 'decimals' as const },
      { abi: erc20Abi, address: token, functionName: 'symbol' as const },
    ]),
    query: { enabled: unique.length > 0 },
  })

  const byAddress = useMemo<Record<string, TokenMeta>>(() => {
    const map: Record<string, TokenMeta> = {}
    unique.forEach((token, i) => {
      const decimals = (data?.[i * 2]?.result as number | undefined) ?? FALLBACK.decimals
      const symbol = (data?.[i * 2 + 1]?.result as string | undefined) ?? FALLBACK.symbol
      map[token.toLowerCase()] = { decimals, symbol }
    })
    return map
  }, [unique, data])

  const metaFor = useMemo(
    () =>
      (token?: Address): TokenMeta =>
        token ? (byAddress[token.toLowerCase()] ?? FALLBACK) : FALLBACK,
    [byAddress],
  )

  return { metaFor, byAddress, isLoading }
}

/** Single-token convenience wrapper around {@link useTokenMetaMap}. */
export function useTokenMeta(token?: Address): TokenMeta & { isLoading: boolean } {
  const { metaFor, isLoading } = useTokenMetaMap([token])
  return { ...metaFor(token), isLoading }
}
