import { useMemo } from 'react'
import { type Address } from 'viem'
import { indexerGraphqlData } from '../config/indexer'
import { createAddressBatcher, useBatchedByAddress } from './addressBatch'

/**
 * Bulk operator-name resolution. Given a page's address list (typically the
 * union of `arbiter` + `counterparty` + `committer` for the visible commitment
 * set), one GraphQL round trip per tick pulls
 * `operators(where: { address_in: [...] })`; callers feed the names into
 * `<AddressDisplay ens={...}>`. Results live in the query cache for the
 * session; addresses that are not operators cache as "not registered".
 */

interface RawOperatorMetadataRow {
  address: string
  metadataStatus: string | null
  metadataContent: Record<string, unknown> | null
}

const OPERATOR_NAMES_QUERY = /* GraphQL */ `
  query OperatorNames($addresses: [String!]!) {
    operators(where: { address_in: $addresses }, limit: 1000) {
      items {
        address
        metadataStatus
        metadataContent
      }
    }
  }
`

const loadOperatorName = createAddressBatcher<string | null>(async (addresses) => {
  const data = await indexerGraphqlData<{ operators: { items: RawOperatorMetadataRow[] } }>(
    OPERATOR_NAMES_QUERY,
    { addresses },
  )
  const found = new Map<string, string | null>()
  for (const row of data.operators.items) {
    const name = row.metadataStatus === 'ok' ? row.metadataContent?.name : undefined
    found.set(row.address.toLowerCase(), typeof name === 'string' ? name : null)
  }
  return found
})

export interface OperatorNameMap {
  /** Returns the resolved operator name (or undefined if not registered / not loaded). */
  get: (address: string | undefined | null) => string | undefined
  isLoading: boolean
}

/**
 * Resolve an address list to operator names. Pass the same array reference
 * across renders or memoize it.
 */
export function useOperatorNames(addresses: ReadonlyArray<Address | string | undefined>): OperatorNameMap {
  const names = useBatchedByAddress('operator-name', addresses, loadOperatorName)
  return useMemo(
    () => ({ get: (address) => names.get(address) ?? undefined, isLoading: names.isLoading }),
    [names],
  )
}
