import { useQuery } from '@tanstack/react-query'
import { type Address, zeroHash } from 'viem'
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
      row.metadataHash && row.metadataHash !== zeroHash
        ? (row.metadataHash as `0x${string}`)
        : null,
    isLoading: false,
    error: null,
  }
}

type MetadataCollection = 'operator' | 'vault' | 'service'

async function fetchOne(
  collection: MetadataCollection,
  address: string,
): Promise<Omit<MetadataResult, 'refetch'>> {
  // Ponder auto-exposes one GraphQL field per onchainTable; operator, vault
  // and service are keyed by `address` (t.hex()).
  //
  // The service table omits metadataHash (the stake registry stores no
  // contentHash on chain). Build the selection set per collection so the
  // GraphQL request only references fields that exist.
  const fields = collection === 'service'
    ? 'metadataURI metadataStatus metadataContent'
    : 'metadataURI metadataHash metadataStatus metadataContent'

  const query = `query M($v: String!) {
    row: ${collection}(address: $v) {
      ${fields}
    }
  }`
  try {
    const res = await indexerGraphql<{ row?: RawMetadataRow | null }>(query, { v: address })
    if (res.errors && res.errors.length > 0) {
      return { ...emptyResult(), error: res.errors[0].message }
    }
    return fromRow(res.data?.row)
  } catch (e) {
    return { ...emptyResult(), error: (e as Error).message }
  }
}

function useMetadata(
  collection: MetadataCollection,
  address: string | undefined,
): MetadataResult {
  // Metadata changes only by a deliberate on-chain update, so a fetched value
  // is kept for the session; `refetch` is the explicit refresh.
  const query = useQuery({
    enabled: hasIndexer && !!address,
    queryKey: ['indexer-metadata', collection, address],
    queryFn: () => fetchOne(collection, address!),
    staleTime: Infinity,
  })
  const result = query.data ?? emptyResult()
  return {
    ...result,
    isLoading: query.isFetching,
    refetch: () => void query.refetch(),
  }
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
