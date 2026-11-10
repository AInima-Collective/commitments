import { useEffect, useMemo, useRef, useState } from 'react'
import { erc721Abi, type Address } from 'viem'
import { useChainId, useReadContracts } from 'wagmi'
import { hasIndexer, indexerGraphql } from '../config/indexer'
import { getContractAddresses } from '../config/contracts'

/**
 * ERC-8004 agent identity resolution (issue #33).
 *
 * The identity registry is an ERC-721: `agentId` = tokenId (**ids start at 0
 * — 0 is a valid agentId, never a sentinel**), token owner = the agent's
 * controlling account, tokenURI = the agent's registration JSON. The indexer
 * mirrors it into an `agent` table keyed by `owner`, so one GraphQL
 * round-trip resolves every address on a page to "is this an agent, and what
 * is it called".
 *
 * Follows the `useOperatorNames` bulk-resolution pattern exactly: unknown
 * addresses are queued into a module-level pending set, flushed as ONE
 * batched `agents(where: { owner_in: [...] })` query per microtask, and
 * cached process-lifetime (keys are `${chainId}:${lcAddress}` so a network
 * switch never serves stale identities). Callers pass the page's full
 * address list once — never per row.
 *
 * On-chain fallback: when the indexer is NOT configured at all
 * (`!hasIndexer`) and `VITE_AGENT_IDENTITY_REGISTRY_ADDRESS` is set, we fall
 * back to batched `balanceOf(owner) > 0` reads against the registry. That
 * path only yields the `isAgent` bit (no agentId / name — enumerating
 * tokenIds by owner needs the indexer). When the indexer IS configured but a
 * query fails, failures are cached as "not an agent" to avoid tight-loop
 * retries, matching `useOperatorNames` failure semantics.
 */

export interface AgentIdentity {
  /** True when the address owns at least one agent in the ERC-8004 registry. */
  isAgent: boolean
  /** The agent's tokenId. 0n is a valid id. Undefined on the chain-fallback
   *  path (balanceOf can't enumerate) or when the address is not an agent. */
  agentId?: bigint
  /** Registration-file `name`, when the indexer resolved the metadata. */
  name?: string
  /** The on-chain tokenURI (registration JSON pointer). */
  agentURI?: string
  /** Indexer metadata pipeline status: 'empty' | 'ok' | 'mismatch' | 'unreachable'. */
  metadataStatus?: string
}

type AgentResolution = AgentIdentity | null // null = looked up, not an agent

/** Cache/pending key — namespaces a lowercase address by its chain id. */
function cacheKey(chainId: number, lcAddress: string): string {
  return `${chainId}:${lcAddress}`
}

/** Recover the bare address from a `${chainId}:${address}` key. */
function addressOf(key: string): string {
  return key.slice(key.indexOf(':') + 1)
}

const cache = new Map<string, AgentResolution>()
let inFlight: Promise<void> | null = null
const pending = new Set<string>()

interface RawAgentRow {
  agentId: string
  owner: string
  agentURI: string | null
  metadataStatus: string | null
  metadataContent: Record<string, unknown> | null
}

// Ponder auto-generates the plural query field + `_in` filter from the
// `agent` table the same way it does for `operators(where: { address_in })`.
// verify against indexer schema — the agent table lands in a parallel branch.
const AGENTS_QUERY = /* GraphQL */ `
  query AgentIdentities($owners: [String!]!) {
    agents(where: { owner_in: $owners }, limit: 1000) {
      items {
        agentId
        owner
        agentURI
        metadataStatus
        metadataContent
      }
    }
  }
`

function toIdentity(row: RawAgentRow): AgentIdentity {
  const name =
    row.metadataStatus === 'ok' &&
    row.metadataContent &&
    typeof row.metadataContent === 'object' &&
    typeof (row.metadataContent as { name?: unknown }).name === 'string'
      ? ((row.metadataContent as { name: string }).name)
      : undefined
  return {
    isAgent: true,
    agentId: BigInt(row.agentId),
    name,
    agentURI: row.agentURI ?? undefined,
    metadataStatus: row.metadataStatus ?? undefined,
  }
}

async function flushPending(): Promise<void> {
  if (!hasIndexer || pending.size === 0) return
  const keys = Array.from(pending)
  pending.clear()
  // The GraphQL filter is owner-keyed; chain namespacing lives only in the
  // cache key, so collapse to the distinct bare addresses for the round-trip.
  const owners = Array.from(new Set(keys.map(addressOf)))
  try {
    const res = await indexerGraphql<{ agents: { items: RawAgentRow[] } }>(AGENTS_QUERY, {
      owners,
    })
    if (res.errors && res.errors.length > 0) {
      // Cache lookup-failure as "not an agent" so we don't tight-loop retries.
      for (const k of keys) cache.set(k, null)
      return
    }
    const found = new Map<string, RawAgentRow>()
    for (const item of res.data?.agents.items ?? []) {
      found.set(item.owner.toLowerCase(), item)
    }
    for (const key of keys) {
      const row = found.get(addressOf(key))
      cache.set(key, row ? toIdentity(row) : null)
    }
  } catch {
    for (const k of keys) cache.set(k, null)
  }
}

function scheduleFetch(): Promise<void> {
  if (inFlight) return inFlight
  // Defer one tick so multiple components mounting in the same render flush
  // their address sets together — turns N parallel hooks into one HTTP request.
  inFlight = new Promise<void>((resolve) => {
    queueMicrotask(async () => {
      try {
        await flushPending()
      } finally {
        inFlight = null
        resolve()
      }
    })
  })
  return inFlight
}

export interface AgentIdentityMap {
  /** Resolved identity for an address, or undefined while loading / when no
   *  data source (indexer + registry) is available. `isAgent: false` entries
   *  are definitive "looked up, not an agent" answers. */
  get: (address: string | undefined | null) => AgentIdentity | undefined
  isLoading: boolean
}

/**
 * Resolve an address list to ERC-8004 agent identities. Unknown addresses are
 * queued and fetched in one batched GraphQL call; known addresses return
 * synchronously from the module cache.
 *
 * Pass the **same array reference** across renders or memoize via `useMemo` —
 * like `useOperatorNames`, the hook keys its effect on the joined address
 * list, not deep equality per render.
 */
export function useAgentIdentities(
  addresses: ReadonlyArray<Address | string | undefined>,
): AgentIdentityMap {
  const chainId = useChainId()
  const registry = getContractAddresses(chainId).agentIdentityRegistry
  // Normalise to lowercase + dedupe + drop falsy entries.
  const lc = useMemo(() => {
    const out = new Set<string>()
    for (const a of addresses) {
      if (!a) continue
      out.add(a.toLowerCase())
    }
    return Array.from(out).sort()
  }, [addresses])
  const [, setTick] = useState(0)
  const lastKeyRef = useRef('')

  useEffect(() => {
    if (!hasIndexer || lc.length === 0) return
    // Re-run when the chain changes too — cache keys are chain-namespaced.
    const key = `${chainId}|${lc.join(',')}`
    if (key === lastKeyRef.current) return
    lastKeyRef.current = key
    let added = false
    for (const addr of lc) {
      const ck = cacheKey(chainId, addr)
      if (cache.has(ck)) continue
      pending.add(ck)
      added = true
    }
    if (!added) return
    void scheduleFetch().then(() => {
      // Bump local state to re-render with cache entries the batch just filled.
      setTick((n) => n + 1)
    })
  }, [lc, chainId])

  // ── On-chain fallback ────────────────────────────────────────────────────
  // Only when the indexer is entirely unconfigured: one multicall batch of
  // ERC-721 balanceOf(owner) reads against the registry. Yields `isAgent`
  // only — agentId / name need the indexer's owner→tokenId mirror.
  const fallbackActive = !hasIndexer && Boolean(registry) && lc.length > 0
  const fallbackReads = useReadContracts({
    contracts: fallbackActive
      ? lc.map((a) => ({
          address: registry as Address,
          abi: erc721Abi,
          functionName: 'balanceOf' as const,
          args: [a as Address] as const,
        }))
      : [],
    query: { enabled: fallbackActive },
  })

  const fallbackByAddress = useMemo(() => {
    const m = new Map<string, AgentIdentity>()
    if (!fallbackActive || !fallbackReads.data) return m
    fallbackReads.data.forEach((res, i) => {
      const addr = lc[i]
      if (!addr || res.status !== 'success') return
      m.set(addr, { isAgent: (res.result as bigint) > 0n })
    })
    return m
  }, [fallbackActive, fallbackReads.data, lc])

  const indexerLoading = hasIndexer && lc.some((a) => !cache.has(cacheKey(chainId, a)))
  const isLoading = indexerLoading || (fallbackActive && fallbackReads.isLoading)

  function get(address: string | undefined | null): AgentIdentity | undefined {
    if (!address) return undefined
    const lower = address.toLowerCase()
    const entry = cache.get(cacheKey(chainId, lower))
    if (entry !== undefined) return entry ?? { isAgent: false }
    return fallbackByAddress.get(lower)
  }

  return { get, isLoading }
}

/**
 * Singular convenience — resolve one address. Same batched transport under
 * the hood, so mixing this with the plural hook on a page still yields one
 * indexer round-trip.
 */
export function useAgentIdentity(address: Address | string | undefined): {
  identity: AgentIdentity | undefined
  isLoading: boolean
} {
  const list = useMemo(() => [address], [address])
  const map = useAgentIdentities(list)
  return { identity: map.get(address), isLoading: map.isLoading }
}
