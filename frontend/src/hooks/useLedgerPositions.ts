import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'

import { hasIndexer, indexerJson } from '../config/indexer'
import { POLL } from './polling'

/** One per-token ledger position as reported by the indexer `/account/:address`
 *  endpoint. `encumbered` is authoritative from indexed events; `free` is read
 *  live on the frontend via `manager.freeBalance` (see indexer account.ts). */
export interface IndexedLedgerPosition {
  token: Address
  encumbered: bigint
}

interface AccountResponse {
  ledgerPositions?: Array<{ token: string; encumbered: string }>
}

interface UseLedgerPositionsParams {
  address: Address | undefined
}

interface UseLedgerPositionsReturn {
  positions: IndexedLedgerPosition[]
  isLoading: boolean
  /** True when the indexer is unreachable — callers fall back to configured backing options. */
  indexerOffline: boolean
  /** Re-query the indexer dossier — call after an in-place deposit/backing tx confirms. */
  refetch: () => void
}

/**
 * useLedgerPositions — discovers the set of backing tokens a user holds an
 * encumbered position in, via the indexer's `/account/:address` dossier. Used
 * to surface positions in tokens that aren't in the static `getBackingOptions`
 * config (forward-compat for arbitrary ERC-20/4626 backing). Degrades to an
 * empty list when the indexer is offline; callers union this with the
 * configured backing options so the dashboard never blanks out.
 */
export function useLedgerPositions({ address }: UseLedgerPositionsParams): UseLedgerPositionsReturn {
  const enabled = hasIndexer && !!address

  const query = useQuery<IndexedLedgerPosition[]>({
    enabled,
    queryKey: ['ledger-positions', address?.toLowerCase()],
    queryFn: async () => {
      const json = await indexerJson<AccountResponse>(`/account/${address}`)
      return (json.ledgerPositions ?? []).map((p) => ({
        token: p.token as Address,
        encumbered: BigInt(p.encumbered),
      }))
    },
    refetchInterval: POLL.slow,
    staleTime: 30_000,
  })

  return {
    positions: query.data ?? [],
    isLoading: query.isLoading,
    indexerOffline: !hasIndexer,
    refetch: () => {
      void query.refetch()
    },
  }
}
