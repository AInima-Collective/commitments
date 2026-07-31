import { useCallback, useEffect, useState } from 'react'
import { type Address } from 'viem'
import { hasIndexer, indexerFetch } from '../config/indexer'
import { asMetadataObject } from '../lib/commitmentMetadata'
import { type CommitmentStatus } from '../utils/commitments'

/**
 * Wire-shape of each row returned by GET /commitments/urgent. BigInts are
 * serialized as strings; numerics stay as numbers; null is a valid value
 * for nullable columns.
 */
interface UrgentRowWire {
  id: string
  /** v2: renamed from `depositor`. The party that committed the backing. */
  committer: string
  arbiter: string
  counterparty: string
  /** v2: backing token + pricing adapter carried on every commitment. */
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
  createdBlock: string
  /** Unix seconds the commitment was created. Nullable on older indexer rows
   *  that predate the column — callers fall back gracefully (no 1970 dates). */
  createdAt: string | null
  updatedBlock: string
  metadataURI: string | null
  metadataHash: string | null
  metadataStatus: 'empty' | 'ok' | 'mismatch' | 'unreachable' | null
  /** Parsed JSON the indexer already fetched and hash-verified. `/urgent` does a
   *  bare `.select()`, so this rides along on the list response at no extra
   *  cost — the detail page must not re-fetch it over GraphQL. */
  metadataContent?: Record<string, unknown> | null
  /** Raw bytes, populated only when the fetch succeeded but JSON.parse didn't. */
  metadataContentRaw?: string | null
  /** v2.5 Part B opt-in flag — true once anyone has called contributeEncumbered. */
  acceptsContributions?: boolean
  /** Multi-vault: vault address denormalized at handler time. May be null on
   *  pre-existing rows from older indexer schemas. */
  vault?: string | null
  /** Multi-manager: address of the CommitmentManager that emitted CommitmentCreated.
   *  May be null on pre-existing rows. */
  manager?: string | null
}

interface GraphEdgeWire {
  id: string
  /** Source CommitmentManager. Namespaces the per-manager `id`. Null on
   *  pre-multi-manager indexer payloads. */
  manager: string | null
  from: string
  to: string
  amount: string
  status: string
  agreementId: string | null
  agreementSide: 'A' | 'B' | null
  agreementStatus: string | null
}

interface GraphPayloadWire {
  edges: GraphEdgeWire[]
}

/** Direction of a commitment from the viewer's vantage point. */
export type CommitmentDirection = 'one-way' | 'paired'

/** Role of the viewer for a commitment row. */
export type CommitmentRole = 'committer' | 'counterparty'

/**
 * Unified row shape consumed by the new commitments DataTable. Sums
 * indexer commitment data, viewer-relative role, and agreement linkage
 * into a single immutable record.
 */
export interface UnifiedCommitmentRow {
  id: bigint
  committer: Address
  arbiter: Address
  counterparty: Address
  /** Backing token + pricing adapter (v2 — every commitment carries them). */
  token: Address
  adapter: Address
  amount: bigint
  maxPenaltyBps: number
  status: CommitmentStatus
  forfeitPenaltyBps: number | undefined
  forfeitChallengeEnd: bigint | undefined
  forfeitSharesExecuted: bigint | undefined
  forfeitCounterparty: Address | undefined
  /** Unix timestamp (seconds) of the requestUnbond() call. Undefined when no
   *  unbond is pending — see `status === 'UNBONDING'` for the visual cue. */
  unbondInitiatedAt: bigint | undefined
  /** Unix timestamp (seconds) at which finalizeUnbond() becomes callable. */
  unbondMaturesAt: bigint | undefined
  createdBlock: bigint
  /** Unix seconds the commitment was created. Undefined on older indexer rows
   *  (drives the activity-feed date; undefined sorts last, never renders 1970). */
  createdAt: bigint | undefined
  metadataURI: string | undefined
  metadataHash: string | undefined
  metadataStatus: 'empty' | 'ok' | 'mismatch' | 'unreachable' | undefined
  /** Parsed `commitment.v1` (or unknown-schema) JSON, as resolved and
   *  hash-checked by the indexer. Present on every list row — read it through
   *  `lib/commitmentMetadata` rather than reaching into the object directly,
   *  because what may be *displayed* depends on `metadataStatus`. */
  metadataContent: Record<string, unknown> | undefined
  /** Fetched bytes that failed JSON.parse. Only the provenance surface shows it. */
  metadataContentRaw: string | undefined
  /** v2.5 Part B opt-in flag. True after anyone has invoked contributeEncumbered
   *  (the depositor's first self-contribution auto-enables third-party calls). */
  acceptsContributions: boolean
  /** Vault address backing this commitment. Drives the vault chip on list rows
   *  for multi-vault deployments. Undefined on pre-existing indexer rows. */
  vault: Address | undefined
  /** CommitmentManager that created this row. Undefined on pre-existing rows. */
  manager: Address | undefined
  /** Viewer-relative role. Always exactly one of depositor/counterparty. */
  role: CommitmentRole
  /** `'one-way'` for solo commitments, `'paired'` when part of an agreement. */
  direction: CommitmentDirection
  /** Set when `direction === 'paired'`. */
  agreementId: bigint | undefined
  /** Side of the agreement this commitment occupies (A or B). */
  agreementSide: 'A' | 'B' | undefined
  /** Lifecycle of the agreement (active / forfeited / released / partialForfeitA / partialForfeitB). */
  agreementStatus: string | undefined
}

interface UseIndexedCommitmentsParams {
  /** Address whose commitments to display (depositor OR counterparty matches). */
  viewAddress: Address | undefined
  /** Cap to the indexer endpoint default (100 / max 500). */
  limit?: number
}

interface UseIndexedCommitmentsReturn {
  rows: UnifiedCommitmentRow[]
  isLoading: boolean
  error: Error | null
  indexerOnline: boolean
  refetch: () => void
}

const REFETCH_INTERVAL_MS = 15_000

const STATUS_WIRE_TO_DOMAIN: Record<UrgentRowWire['status'], CommitmentStatus> = {
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

/**
 * useIndexedCommitments — single source of truth for the unified commitments
 * table. Fetches `/commitments/urgent?address=...` for rich row data
 * (yield, forfeit, metadata, status) and `/graph/agreements?address=...`
 * for agreement linkage in parallel; merges them into UnifiedCommitmentRow[].
 *
 * The endpoint is the canonical urgency-sorted list (forfeitPending → active →
 * terminal, then forfeitChallengeEnd ASC, then id DESC), so callers receive
 * rows already in the order the table should display by default.
 *
 * Polls at 15s mirroring the rest of the dapp's read cadence. When the
 * indexer is offline (`hasIndexer === false`), `indexerOnline` is `false`
 * and `rows` is empty — the page should render a clear fallback state.
 */
export function useIndexedCommitments({
  viewAddress,
  limit = 500,
}: UseIndexedCommitmentsParams): UseIndexedCommitmentsReturn {
  const [rows, setRows] = useState<UnifiedCommitmentRow[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(hasIndexer && !!viewAddress)
  const [error, setError] = useState<Error | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!hasIndexer || !viewAddress) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard branch resets external-subscription state when prerequisites unmet; see frontend/docs/eslint-disable-rationale.md §Pattern-3
      setRows([])
      setIsLoading(false)
      return
    }
    let cancelled = false
    setIsLoading(true)
    const lower = viewAddress.toLowerCase() as `0x${string}`
    Promise.all([
      indexerFetch(`/commitments/urgent?address=${lower}&limit=${limit}`).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`urgent HTTP ${r.status}`)),
      ),
      indexerFetch(`/graph/agreements?address=${lower}`).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`graph HTTP ${r.status}`)),
      ),
    ])
      .then(([urgentPayload, graphPayload]: [{ rows?: UrgentRowWire[] }, GraphPayloadWire]) => {
        if (cancelled) return
        const edges = graphPayload.edges ?? []
        // Commitment ids repeat across managers (each numbers from 0), so the
        // agreement lookup must key by (manager, id) — otherwise a
        // WETH-manager commitment can inherit a USDC-manager commitment's
        // agreement. Falls back to the bare id when manager is absent
        // (pre-multi-manager indexer rows).
        const commitmentKey = (manager: string | null | undefined, id: string) =>
          manager ? `${manager.toLowerCase()}-${id}` : id
        const entByCommitment = new Map<string, GraphEdgeWire>()
        for (const e of edges) {
          if (e.agreementId) entByCommitment.set(commitmentKey(e.manager, e.id), e)
        }
        const wireRows = urgentPayload.rows ?? []
        const mapped: UnifiedCommitmentRow[] = []
        for (const w of wireRows) {
          const role: CommitmentRole =
            w.committer.toLowerCase() === lower ? 'committer' : 'counterparty'
          const ent = entByCommitment.get(commitmentKey(w.manager, w.id))
          const direction: CommitmentDirection = ent ? 'paired' : 'one-way'
          mapped.push({
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
            createdBlock: BigInt(w.createdBlock),
            createdAt: toBigInt(w.createdAt),
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
            agreementId: ent?.agreementId ? BigInt(ent.agreementId) : undefined,
            agreementSide: ent?.agreementSide ?? undefined,
            agreementStatus: ent?.agreementStatus ?? undefined,
          })
        }
        setRows(mapped)
        setError(null)
        setIsLoading(false)
      })
      .catch((e: Error) => {
        if (cancelled) return
        setError(e)
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [viewAddress, limit, tick])

  useEffect(() => {
    if (!viewAddress) return
    const handle = setInterval(() => setTick((t) => t + 1), REFETCH_INTERVAL_MS)
    return () => clearInterval(handle)
  }, [viewAddress])

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  return { rows, isLoading, error, indexerOnline: hasIndexer, refetch }
}
