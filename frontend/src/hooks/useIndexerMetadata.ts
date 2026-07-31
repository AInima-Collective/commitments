import { useCallback, useEffect, useRef, useState } from 'react'
import { type Address } from 'viem'
import { hasIndexer, indexerGraphql } from '../config/indexer'

export type MetadataStatus = 'empty' | 'ok' | 'mismatch' | 'unreachable'

export interface MetadataResult {
  status: MetadataStatus
  content: Record<string, unknown> | null
  uri: string | null
  hash: `0x${string}` | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

interface CachedMetadata {
  result: Omit<MetadataResult, 'refetch'>
  fetchedAt: number
}

const cache = new Map<string, CachedMetadata>()

function emptyResult(): Omit<MetadataResult, 'refetch'> {
  return {
    status: 'empty',
    content: null,
    uri: null,
    hash: null,
    isLoading: false,
    error: null,
  }
}

interface RawMetadataRow {
  metadataURI: string | null
  metadataHash: string | null
  metadataStatus: MetadataStatus | null
  metadataContent: Record<string, unknown> | null
}

function fromRow(row: RawMetadataRow | null | undefined): Omit<MetadataResult, 'refetch'> {
  if (!row) return emptyResult()
  return {
    status: (row.metadataStatus as MetadataStatus | null) ?? 'empty',
    content: row.metadataContent ?? null,
    uri: row.metadataURI && row.metadataURI.length > 0 ? row.metadataURI : null,
    hash:
      row.metadataHash && row.metadataHash !== '0x0000000000000000000000000000000000000000000000000000000000000000'
        ? (row.metadataHash as `0x${string}`)
        : null,
    isLoading: false,
    error: null,
  }
}

type MetadataCollection = 'commitment' | 'agreementProposal' | 'operator' | 'vault' | 'service'

const ADDRESS_KEYED: ReadonlySet<MetadataCollection> = new Set(['operator', 'vault', 'service'])

async function fetchOne(
  collection: MetadataCollection,
  idOrAddress: string,
  manager?: string,
): Promise<Omit<MetadataResult, 'refetch'>> {
  // Ponder auto-exposes one GraphQL field per onchainTable. Query shape:
  //   - commitment — composite PK (manager, id); fetched via the plural
  //     `commitments(where: …)` filter so callers without the manager in hand
  //     (single-manager deployments) still resolve
  //   - agreementProposal(id: BigInt!) — primary key `id` is t.bigint()
  //   - operator/vault/service(address: String!) — primary key is `address` (t.hex())
  const isAddressKeyed = ADDRESS_KEYED.has(collection)

  // The service table omits metadataHash (the stake registry stores no
  // contentHash on chain). Build the selection set per collection so the
  // GraphQL request only references fields that exist.
  const fields = collection === 'service'
    ? 'metadataURI metadataStatus metadataContent'
    : 'metadataURI metadataHash metadataStatus metadataContent'

  let query: string
  let variables: Record<string, unknown>
  if (collection === 'commitment') {
    query = manager
      ? `query M($v: BigInt, $m: String) {
          rows: commitments(where: { id: $v, manager: $m }, limit: 1) { items { ${fields} } }
        }`
      : `query M($v: BigInt) {
          rows: commitments(where: { id: $v }, limit: 1) { items { ${fields} } }
        }`
    variables = manager ? { v: idOrAddress, m: manager } : { v: idOrAddress }
  } else {
    const argName = isAddressKeyed ? 'address' : 'id'
    const argType = isAddressKeyed ? 'String!' : 'BigInt!'
    query = `query M($v: ${argType}) {
      row: ${collection}(${argName}: $v) {
        ${fields}
      }
    }`
    variables = { v: idOrAddress }
  }
  try {
    const res = await indexerGraphql<{
      row?: RawMetadataRow | null
      rows?: { items: RawMetadataRow[] }
    }>(query, variables)
    if (res.errors && res.errors.length > 0) {
      return { ...emptyResult(), error: res.errors[0].message }
    }
    const row = collection === 'commitment' ? res.data?.rows?.items[0] : res.data?.row
    return fromRow(row)
  } catch (e) {
    return { ...emptyResult(), error: (e as Error).message }
  }
}

function useMetadata(
  collection: MetadataCollection,
  idOrAddress: string | undefined,
  manager?: string,
): MetadataResult {
  const key = idOrAddress
    ? `${collection}:${manager ? `${manager.toLowerCase()}:` : ''}${idOrAddress.toLowerCase()}`
    : undefined
  const [tick, setTick] = useState(0)
  const [state, setState] = useState<Omit<MetadataResult, 'refetch'>>(() => {
    if (!key || !hasIndexer) return emptyResult()
    const cached = cache.get(key)
    return cached ? cached.result : { ...emptyResult(), isLoading: true }
  })
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!key || !hasIndexer) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external subscription reset on key change; see frontend/docs/eslint-disable-rationale.md §Pattern-3
      setState(emptyResult())
      return
    }
    const cached = cache.get(key)
    if (cached && tick === 0) {
      setState(cached.result)
      return
    }
    const reqId = ++requestIdRef.current
    setState((s) => ({ ...s, isLoading: true }))
    fetchOne(collection, idOrAddress!, manager).then((result) => {
      if (reqId !== requestIdRef.current) return
      cache.set(key, { result, fetchedAt: Date.now() })
      setState(result)
    })
  }, [collection, idOrAddress, key, tick, manager])

  const refetch = useCallback(() => {
    if (key) cache.delete(key)
    setTick((t) => t + 1)
  }, [key])

  return { ...state, refetch }
}

/**
 * Commitment metadata by id. The commitment table is keyed by the composite
 * (manager, id) — pass `manager` when the caller has it (indexer rows carry
 * it) so multi-manager deployments resolve unambiguously; without it the
 * first match wins (fine on single-manager chains).
 */
export function useCommitmentMetadata(id: bigint | undefined, manager?: Address): MetadataResult {
  return useMetadata('commitment', id === undefined ? undefined : id.toString(), manager)
}

export function useAgreementMetadata(proposalId: bigint | undefined): MetadataResult {
  return useMetadata('agreementProposal', proposalId === undefined ? undefined : proposalId.toString())
}

export function useOperatorMetadata(address: Address | undefined): MetadataResult {
  return useMetadata('operator', address === undefined ? undefined : address.toLowerCase())
}

export function useVaultMetadata(address: Address | undefined): MetadataResult {
  return useMetadata('vault', address === undefined ? undefined : address.toLowerCase())
}

export function useServiceMetadata(address: Address | undefined): MetadataResult {
  return useMetadata('service', address === undefined ? undefined : address.toLowerCase())
}

// Test-only helper: clear cache (used by unit tests and when switching wallets).
export function __resetMetadataCacheForTests(): void {
  cache.clear()
}
