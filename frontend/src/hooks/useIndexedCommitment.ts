import { useEffect, useRef, useState } from 'react'
import { type Address } from 'viem'
import { hasIndexer, indexerFetch } from '../config/indexer'
import { asMetadataObject } from '../lib/commitmentMetadata'
import { type CommitmentStatus } from '../utils/commitments'
import { type CommitmentRole, type UnifiedCommitmentRow } from './useIndexedCommitments'

interface SingleRowWire {
  id: string
  committer: string
  arbiter: string
  counterparty: string
  token: string
  adapter: string
  amount: string
  maxPenaltyBps: number
  status: 'active' | 'unbonding' | 'forfeitPending' | 'forfeited' | 'released' | 'expired'
  forfeitPenaltyBps: number | null
  forfeitChallengeEnd: string | null
  forfeitSharesExecuted: string | null
  forfeitCounterparty: string | null
  unbondInitiatedAt: string | null
  unbondMaturesAt: string | null
  createdAt: string | null
  createdBlock: string
  updatedBlock: string
  metadataURI: string | null
  metadataHash: string | null
  metadataStatus: 'empty' | 'ok' | 'mismatch' | 'unreachable' | null
  /** Already fetched and hash-verified by the indexer, and already on this
   *  response — `GET /commitments/:id` selects the whole row. Reading it here
   *  is what lets the detail page make ONE metadata round trip instead of two. */
  metadataContent?: Record<string, unknown> | null
  metadataContentRaw?: string | null
  acceptsContributions?: boolean
  vault?: string | null
  manager?: string | null
}

interface SingleResponse {
  row: SingleRowWire
  agreement: {
    id: string
    commitmentIdA: string
    commitmentIdB: string
    status: string
    side: 'A' | 'B'
  } | null
}

const STATUS_WIRE_TO_DOMAIN: Record<SingleRowWire['status'], CommitmentStatus> = {
  active: 'ACTIVE',
  unbonding: 'UNBONDING',
  forfeitPending: 'FORFEIT_PENDING',
  forfeited: 'FORFEITED',
  released: 'RELEASED',
  expired: 'EXPIRED',
}

function toBigInt(v: string | null | undefined): bigint | undefined {
  if (v === null || v === undefined || v === '') return undefined
  try {
    return BigInt(v)
  } catch {
    return undefined
  }
}

export interface UseIndexedCommitmentReturn {
  row: UnifiedCommitmentRow | null
  isLoading: boolean
  /** True when the indexer responded but no commitment exists with that id. */
  notFound: boolean
  error: Error | null
  indexerOnline: boolean
  refetch: () => void
  /**
   * Refetch now and keep polling (~1s apart) until the indexer row's
   * `updatedBlock` reaches `minBlock` — i.e. until Ponder has processed the
   * block a just-confirmed tx landed in. Without this, a single refetch fired
   * at receipt time races the indexer and fetches the pre-tx row (the page
   * then looks frozen until the 15s background poll). Falls back to a plain
   * refetch when `minBlock` is undefined; gives up after ~12 attempts for
   * actions that don't touch the commitment row (e.g. yield claims).
   */
  refetchUntilBlock: (minBlock?: bigint) => void
}

/**
 * Single-commitment indexer fetch for the per-commitment detail page.
 *
 * Viewer-relative `role` is computed against `viewAddress` when provided so
 * the detail page can mirror the table's role/direction language for the
 * connected wallet. Without `viewAddress` (anonymous deep-link visit) the
 * row falls back to `role: 'depositor'`, `direction: 'one-way'` plus the
 * agreement linkage from the indexer payload — the page still renders
 * everything except the viewer-scoped UI affordances.
 */
export function useIndexedCommitment(
  id: bigint | undefined,
  viewAddress: Address | undefined,
): UseIndexedCommitmentReturn {
  const [row, setRow] = useState<UnifiedCommitmentRow | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(hasIndexer && id !== undefined)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [tick, setTick] = useState(0)
  // Active catch-up target set by refetchUntilBlock. Lives in a ref so the
  // fetch effect can consume/decrement it without re-running.
  const catchUp = useRef<{ minBlock: bigint; attemptsLeft: number } | null>(null)

  useEffect(() => {
    if (!hasIndexer || id === undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard branch resets external-subscription state when prerequisites unmet; see frontend/docs/eslint-disable-rationale.md §Pattern-3
      setRow(null)
      setIsLoading(false)
      setNotFound(false)
      setError(null)
      return
    }
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    setIsLoading(true)
    setNotFound(false)
    setError(null)

    indexerFetch(`/commitments/${id.toString()}`)
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelled) {
            setRow(null)
            setNotFound(true)
            setIsLoading(false)
          }
          return null
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as SingleResponse
      })
      .then((payload) => {
        if (cancelled || !payload) return
        const w = payload.row
        const lower = viewAddress?.toLowerCase()
        const role: CommitmentRole =
          lower && w.counterparty.toLowerCase() === lower ? 'counterparty' : 'committer'
        const direction: 'one-way' | 'paired' = payload.agreement ? 'paired' : 'one-way'
        const mapped: UnifiedCommitmentRow = {
          id: BigInt(w.id),
          committer: w.committer as Address,
          arbiter: w.arbiter as Address,
          counterparty: w.counterparty as Address,
          token: w.token as Address,
          adapter: w.adapter as Address,
          amount: BigInt(w.amount),
          maxPenaltyBps: w.maxPenaltyBps,
          status: STATUS_WIRE_TO_DOMAIN[w.status],
          forfeitPenaltyBps: w.forfeitPenaltyBps ?? undefined,
          forfeitChallengeEnd: toBigInt(w.forfeitChallengeEnd),
          forfeitSharesExecuted: toBigInt(w.forfeitSharesExecuted),
          forfeitCounterparty: (w.forfeitCounterparty ?? undefined) as Address | undefined,
          unbondInitiatedAt: toBigInt(w.unbondInitiatedAt),
          unbondMaturesAt: toBigInt(w.unbondMaturesAt),
          createdAt: toBigInt(w.createdAt),
          createdBlock: BigInt(w.createdBlock),
          metadataURI: w.metadataURI ?? undefined,
          metadataHash: w.metadataHash ?? undefined,
          metadataStatus: w.metadataStatus ?? undefined,
          metadataContent: asMetadataObject(w.metadataContent),
          metadataContentRaw: w.metadataContentRaw ?? undefined,
          acceptsContributions: w.acceptsContributions ?? false,
          vault: (w.vault ?? undefined) as Address | undefined,
          manager: (w.manager ?? undefined) as Address | undefined,
          role,
          direction,
          agreementId: payload.agreement ? BigInt(payload.agreement.id) : undefined,
          agreementSide: payload.agreement?.side ?? undefined,
          agreementStatus: payload.agreement?.status ?? undefined,
        }
        setRow(mapped)
        setIsLoading(false)
        // Indexer still behind a just-confirmed tx? Poll again shortly.
        const pending = catchUp.current
        if (pending && BigInt(w.updatedBlock) < pending.minBlock && pending.attemptsLeft > 0) {
          pending.attemptsLeft -= 1
          retryTimer = setTimeout(() => setTick((t) => t + 1), 1_000)
        } else {
          catchUp.current = null
        }
      })
      .catch((e: Error) => {
        if (cancelled) return
        setError(e)
        setIsLoading(false)
      })
    return () => {
      cancelled = true
      if (retryTimer !== undefined) clearTimeout(retryTimer)
    }
  }, [id, viewAddress, tick])

  useEffect(() => {
    if (id === undefined) return
    const handle = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(handle)
  }, [id])

  const refetch = () => setTick((t) => t + 1)

  const refetchUntilBlock = (minBlock?: bigint) => {
    if (minBlock !== undefined) catchUp.current = { minBlock, attemptsLeft: 12 }
    setTick((t) => t + 1)
  }

  return { row, isLoading, notFound, error, indexerOnline: hasIndexer, refetch, refetchUntilBlock }
}
