import { useMemo } from 'react'
import { erc721Abi, type Address } from 'viem'
import { useChainId, useReadContracts } from 'wagmi'
import { hasIndexer, indexerGraphqlData } from '../config/indexer'
import { getContractAddresses } from '../config/contracts'
import { createAddressBatcher, useBatchedByAddress } from './addressBatch'

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
 * Shares `useOperatorNames`' batcher (`hooks/addressBatch.ts`): addresses
 * asked for in the same tick go out as ONE
 * `agents(where: { owner_in: [...] })` query, and answers live in the query
 * cache for the session, keyed by chain. Callers pass the page's full
 * address list once, never per row.
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

const NOT_AN_AGENT: AgentIdentity = { isAgent: false }

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

const loadAgentIdentity = createAddressBatcher<AgentIdentity>(async (owners) => {
  const data = await indexerGraphqlData<{ agents: { items: RawAgentRow[] } }>(AGENTS_QUERY, { owners })
  const found = new Map<string, AgentIdentity>()
  for (const row of data.agents.items) found.set(row.owner.toLowerCase(), toIdentity(row))
  return found
})

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
 * synchronously from the query cache.
 *
 * Pass the **same array reference** across renders or memoize via `useMemo`.
 * The return keeps its identity until an answer arrives.
 */
export function useAgentIdentities(
  addresses: ReadonlyArray<Address | string | undefined>,
): AgentIdentityMap {
  const chainId = useChainId()
  const registry = getContractAddresses(chainId).agentIdentityRegistry
  const indexed = useBatchedByAddress('agent-identity', addresses, loadAgentIdentity)
  const lc = indexed.lc

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

  const isLoading = indexed.isLoading || (fallbackActive && fallbackReads.isLoading)

  return useMemo(
    () => ({
      get: (address) => {
        if (!address) return undefined
        const entry = indexed.get(address)
        if (entry !== undefined) return entry ?? NOT_AN_AGENT
        return fallbackByAddress.get(address.toLowerCase())
      },
      isLoading,
    }),
    [indexed, fallbackByAddress, isLoading],
  )
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
