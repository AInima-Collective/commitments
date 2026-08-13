import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'

import { hasIndexer, indexerFetch } from '../config/indexer'

export type LedgerEventKind = 'forfeit' | 'settlement' | 'contribution' | 'donation'
export type ForfeitEventKind = 'initiated' | 'executed' | 'cancelled' | 'cancelledStale'

interface LedgerEventWire {
  kind: LedgerEventKind
  timestamp: string
  blockNumber: string
  txHash: string
  payload: Record<string, string | number | boolean | null>
}

interface LedgerWire {
  vault: string
  events: LedgerEventWire[]
  counts: {
    forfeit: number
    settlement: number
    contribution: number
    donation: number
  }
}

export interface ForfeitEvent {
  kind: 'forfeit'
  timestamp: bigint
  blockNumber: bigint
  txHash: `0x${string}`
  commitmentId: bigint
  /** Lifecycle transition this row captures. */
  forfeitKind: ForfeitEventKind
  committer: Address
  arbiter: Address
  counterparty: Address
  /** Set on `initiated`/`executed`/`cancelled` (snapshot from the commitment row). */
  penaltyBps: number | null
  /** Configured challenge window in seconds — `initiated` only. */
  challengeWindow: bigint | null
  /** block.timestamp + challengeWindow — set on `initiated`. */
  challengeEnd: bigint | null
  /** Shares actually forfeited — `executed` only. */
  sharesToForfeit: bigint | null
}

export interface SettlementEvent {
  kind: 'settlement'
  timestamp: bigint
  blockNumber: bigint
  txHash: `0x${string}`
  agreementId: bigint
  fromProposer: boolean
  shares: bigint
  evidenceHash: `0x${string}`
}

export interface ContributionEvent {
  kind: 'contribution'
  timestamp: bigint
  blockNumber: bigint
  txHash: `0x${string}`
  commitmentId: bigint
  contributor: Address
  receiver: Address
  shares: bigint
}

export interface DonationEvent {
  kind: 'donation'
  timestamp: bigint
  blockNumber: bigint
  txHash: `0x${string}`
  vault: Address
  donor: Address
  assets: bigint
}

export type LedgerEvent = ForfeitEvent | SettlementEvent | ContributionEvent | DonationEvent

export interface ForfeitLedger {
  vault: Address
  events: LedgerEvent[]
  counts: {
    forfeit: number
    settlement: number
    contribution: number
    donation: number
  }
}

interface UseForfeitLedgerParams {
  vaultAddress: Address | undefined
  limit?: number
}

function parseEvent(e: LedgerEventWire): LedgerEvent | null {
  const blockNumber = BigInt(e.blockNumber)
  const timestamp = BigInt(e.timestamp)
  const txHash = e.txHash as `0x${string}`
  const p = e.payload
  if (e.kind === 'forfeit') {
    return {
      kind: 'forfeit',
      timestamp,
      blockNumber,
      txHash,
      commitmentId: BigInt(p.commitmentId as string),
      forfeitKind: (p.forfeitKind as ForfeitEventKind) ?? 'initiated',
      committer: p.committer as Address,
      arbiter: p.arbiter as Address,
      counterparty: p.counterparty as Address,
      penaltyBps: typeof p.penaltyBps === 'number' ? p.penaltyBps : null,
      challengeWindow:
        p.challengeWindow == null ? null : BigInt(p.challengeWindow as string),
      challengeEnd: p.challengeEnd == null ? null : BigInt(p.challengeEnd as string),
      sharesToForfeit:
        p.sharesToForfeit == null ? null : BigInt(p.sharesToForfeit as string),
    }
  }
  if (e.kind === 'settlement') {
    return {
      kind: 'settlement',
      timestamp,
      blockNumber,
      txHash,
      agreementId: BigInt(p.agreementId as string),
      fromProposer: Boolean(p.fromProposer),
      shares: BigInt(p.shares as string),
      evidenceHash: p.evidenceHash as `0x${string}`,
    }
  }
  if (e.kind === 'contribution') {
    return {
      kind: 'contribution',
      timestamp,
      blockNumber,
      txHash,
      commitmentId: BigInt(p.commitmentId as string),
      contributor: p.contributor as Address,
      receiver: p.receiver as Address,
      shares: BigInt(p.shares as string),
    }
  }
  if (e.kind === 'donation') {
    return {
      kind: 'donation',
      timestamp,
      blockNumber,
      txHash,
      vault: p.vault as Address,
      donor: p.donor as Address,
      assets: BigInt(p.assets as string),
    }
  }
  return null
}

/**
 * Unified ledger of vault-relevant events: forfeit lifecycle transitions
 * (initiated/executed/cancelled/cancelledStale), bilateral settlements,
 * encumbrance contributions, and vault donations. Polls every 30s.
 *
 * All four kinds are vault-filtered through the denormalized `vault` column
 * on each event table — see `commitments/indexer/src/api/vaults.ts` for the
 * endpoint contract.
 */
export function useForfeitLedger({ vaultAddress, limit = 100 }: UseForfeitLedgerParams): {
  data: ForfeitLedger | undefined
  isLoading: boolean
  error: unknown
} {
  const enabled = hasIndexer && Boolean(vaultAddress)
  const query = useQuery<ForfeitLedger>({
    enabled,
    queryKey: ['forfeit-ledger', vaultAddress, limit],
    queryFn: async () => {
      if (!vaultAddress) throw new Error('vaultAddress required')
      const res = await indexerFetch(
        `/vaults/${vaultAddress.toLowerCase()}/forfeit-ledger?limit=${limit}`,
      )
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`)
      const wire = (await res.json()) as LedgerWire
      const events: LedgerEvent[] = []
      for (const e of wire.events) {
        const parsed = parseEvent(e)
        if (parsed) events.push(parsed)
      }
      return {
        vault: wire.vault as Address,
        events,
        counts: wire.counts,
      }
    },
    refetchInterval: 30_000,
  })
  return { data: query.data, isLoading: query.isLoading, error: query.error }
}
