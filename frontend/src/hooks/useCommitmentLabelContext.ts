import { useMemo } from 'react'
import { type Address } from 'viem'
import { useChainId } from 'wagmi'
import { findKnownAddress } from '../config/contracts'
import { type CommitmentLabelContext } from '../lib/commitmentLabel'
import { otherParty } from '../lib/commitmentFilters'
import { type UnifiedRow } from './useUnifiedRows'
import { useOperatorNames } from './useOperatorNames'
import { type TokenMeta } from './useTokenMeta'

/** What {@link useTokenMetaMap} returns, narrowed to what a label needs. */
interface TokenMetaResolver {
  metaFor: (token?: Address) => TokenMeta
  /** Absent means "assume resolved" — callers holding a static map have no flag. */
  isLoading?: boolean
}

/**
 * Assemble the resolver bundle `commitmentLabel` needs, once per surface.
 *
 * Every input is already bulk-fetched and cached elsewhere: `useOperatorNames`
 * batches the whole visible party set into one GraphQL round trip and caches
 * process-wide, and token metadata rides the multicall the caller has usually
 * already issued. So building this per page costs an array walk, and the table
 * and the card view can share one context instead of each growing a private
 * copy of the naming rules.
 *
 * The returned object is deliberately NOT memoized across renders. Memoizing
 * it would buy nothing: cell render functions run on every render regardless of
 * whether a column array kept its identity, so the resolvers are re-invoked
 * either way — and a fresh object is the honest signal that the names inside
 * can have changed since last render.
 */
export function useCommitmentLabelContext(
  rows: readonly UnifiedRow[],
  tokenMeta?: TokenMetaResolver,
): CommitmentLabelContext {
  const chainId = useChainId()

  // Only the party a label would actually name — resolving arbiters here would
  // grow the address set for a name no tier reads.
  const partyKey = rows.map((r) => otherParty(r)).join(',')
  const parties = useMemo(
    () => (partyKey.length === 0 ? [] : (partyKey.split(',') as Address[])),
    [partyKey],
  )
  const names = useOperatorNames(parties)

  // `metaFor` returns a placeholder symbol while the multicall is in flight.
  // Withholding the resolver until it resolves means the last-resort label
  // reads "Stake held against 0xab…cd" for a beat instead of flashing an
  // amount denominated in a token called TOKEN.
  const metaFor = tokenMeta && !tokenMeta.isLoading ? tokenMeta.metaFor : undefined

  return {
    operatorName: (address: string) => names.get(address),
    knownAddress: (address: string) => findKnownAddress(chainId, address),
    tokenMeta: metaFor ? (token: Address) => metaFor(token) : undefined,
  }
}
