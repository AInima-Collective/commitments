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
  const key = address ? `${collection}:${address.toLowerCase()}` : undefined
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
    fetchOne(collection, address!).then((result) => {
      if (reqId !== requestIdRef.current) return
      cache.set(key, { result, fetchedAt: Date.now() })
      setState(result)
    })
  }, [collection, address, key, tick])

  const refetch = useCallback(() => {
    if (key) cache.delete(key)
    setTick((t) => t + 1)
  }, [key])

  return { ...state, refetch }
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
