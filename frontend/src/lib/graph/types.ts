import type { Hex } from 'viem'

export type GraphNode = {
  id: Hex
  // Aggregate stats (used for node sizing)
  commitmentsOut: number
  commitmentsIn: number
  convictionOut: bigint
  convictionIn: bigint
  activeCount: number
  forfeitedCount: number
  releasedCount: number
}

export type CommitmentLifecycle =
  | 'active'
  | 'forfeitPending'
  | 'forfeited'
  | 'released'
  | 'expired'

export type GraphEdge = {
  id: string // per-manager commitmentId as string — NOT unique across managers
  /** Source CommitmentManager. Namespaces `id` (each manager numbers its
   *  commitments from 0). Present on Agreements-graph edges; undefined on
   *  synthetic mesh/operator edges and pre-multi-manager indexer payloads. */
  manager?: Hex
  from: Hex // depositor
  to: Hex // counterparty
  amount: bigint
  maxPenaltyBps: number
  conviction: bigint // amount * maxPenaltyBps / 10000
  status: CommitmentLifecycle
  forfeitPenaltyBps: number | null
  forfeitChallengeEnd: bigint | null
  // Agreement linkage (null for solo commitments)
  agreementId: string | null
  agreementSide: 'A' | 'B' | null
  agreementStatus: string | null
}

export type MeshGraphNode = {
  id: Hex
  type: 'fan_in' | 'fan_out' | 'token_weighting' | 'address'
  impl: Hex | null
}

export type MeshGraphEdge = {
  from: Hex
  to: Hex
  denom: Hex
  amount: bigint // net positive = current stake flowing from → to
}

export type AgreementsGraphPayload = {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export type MeshGraphPayload = {
  nodes: MeshGraphNode[]
  edges: MeshGraphEdge[]
}

/**
 * Operators-power graph: a star showing the operator service in the center and
 * each registered operator as a spoke, with edge thickness proportional to
 * voting power. Used by the Operators tab on the Mesh page.
 */
export type OperatorsGraphServiceNode = {
  kind: 'service'
  id: Hex
  totalPower: bigint
  operatorCount: number
}

export type OperatorsGraphOperatorNode = {
  kind: 'operator'
  id: Hex
  registeredInService: boolean
  votingPower: bigint
  shareBps: number
  status: 'ACTIVE' | 'INACTIVE' | 'BELOW_MIN_STAKE'
}

export type OperatorsGraphNode = OperatorsGraphServiceNode | OperatorsGraphOperatorNode

export type OperatorsGraphEdge = {
  from: Hex // operator
  to: Hex // service
  votingPower: bigint
  shareBps: number
}

export type OperatorsGraphPayload = {
  service: { address: Hex; totalPower: bigint }
  operators: Array<{
    address: Hex
    registeredInService: boolean
    votingPower: bigint
    status: 'ACTIVE' | 'INACTIVE' | 'BELOW_MIN_STAKE'
  }>
}

/**
 * Mesh-topology graph: contract-only DAG showing how the mesh is wired
 * together at config-time, regardless of whether stake has actually flowed.
 * Powers the Mesh Explorer's primary view ("how is this service secured?").
 *
 * Edges describe wiring relationships:
 *   - fan_in_provider:  a registered provider feeds a FanIn (denom + maxPenaltyBps + unbonding)
 *   - fan_out_outflow:  a FanOut is wired to a consumer (portion + maxPenaltyBps)
 *   - service_binding:  a TokenWeighting is the IVotingPowerSource of a service
 *
 * Operators / EOAs are NOT part of this graph — those live on the Operators tab.
 */
export type MeshTopologyNodeType =
  | 'fan_in'
  | 'fan_out'
  | 'token_weighting'
  | 'service'
  | 'vault'

export type MeshTopologyNode = {
  id: Hex
  type: MeshTopologyNodeType
  impl: Hex | null
  /** Per-denom weight rows (TokenWeighting only). */
  weights?: Array<{ denom: Hex; weightBps: bigint }>
  /** Asset symbol (vault nodes only). */
  symbol?: string | null
}

export type MeshTopologyEdgeKind =
  | 'fan_in_provider'
  | 'fan_out_outflow'
  | 'service_binding'
  | 'vault_source'

export type MeshTopologyEdge = {
  from: Hex
  to: Hex
  kind: MeshTopologyEdgeKind
  /** Short human-readable label rendered alongside the edge. */
  label: string
  /** Structured payload (used by the inspector / tooltips). */
  meta: Record<string, string | number>
}

export type MeshTopologyPayload = {
  nodes: MeshTopologyNode[]
  edges: MeshTopologyEdge[]
}

// ─── Sankey (flow view) ──────────────────────────────────────────────────────
//
// Commitments are aggregated into *links*, never one node per commitment.
// Default staging is Token (asset) → Arbiter → Counterparty; each stage index
// places the node in a vertical column left→right.

export type SankeyNodeKind =
  | 'token'
  | 'committer'
  | 'counterparty'
  | 'arbiter'
  | 'status'
  // Allocation-mode middle column: the free/encumbered split of manager-held
  // capital. Two kinds rather than one so the two halves can read differently —
  // idle capital and at-risk capital are the whole point of that view.
  | 'free'
  | 'encumbered'
  // Allocation-mode terminal column when the caller supplies commitment labels:
  // one node PER commitment, named from its metadata, clickable through to the
  // commitment page. Distinct from 'counterparty', which aggregates.
  | 'commitment'

export type SankeyNode = {
  id: string
  label: string
  kind: SankeyNodeKind
  /** Column index, left→right (0-based). */
  stage: number
  /** Kind-specific payload for rich rendering. Optional on every kind. */
  meta?: {
    /** Lowercased token address — set on 'token' / 'free' / 'encumbered'. */
    token?: string
    /** Display symbol for that token — drives the icon on the backing column. */
    symbol?: string
    /** Commitment id — set on 'commitment', drives click-through. */
    commitmentId?: string
  }
}

/** Per-token contribution to a link — keeps full-precision raw amounts for tooltips. */
export type SankeyLinkToken = {
  token: Hex
  symbol: string
  decimals: number
  /** Raw token-denominated weight (committed amount, or conviction). */
  raw: bigint
  count: number
}

export type SankeyLink = {
  source: string
  target: string
  /** Layout weight — USD-normalized (6dp) so widths compare across tokens. */
  value: number
  /** Number of commitments aggregated into this link. */
  count: number
  /** Per-token breakdown for the tooltip (full precision). */
  tokens: SankeyLinkToken[]
}

export type SankeyPayload = {
  nodes: SankeyNode[]
  links: SankeyLink[]
  /** Token symbols that had no USD price — caller can surface a notice. */
  missingPriceSymbols: string[]
}

/** A node positioned by the layout pass. */
export type LaidOutSankeyNode = SankeyNode & {
  x: number
  y0: number
  y1: number
  /** Aggregate value driving the node height. */
  value: number
}

/** A link positioned by the layout pass — `path` is a ready-to-render SVG `d`. */
export type LaidOutSankeyLink = SankeyLink & {
  width: number
  path: string
  sourceKind: SankeyNodeKind
  /** Kind of the node this ribbon lands on. In allocation mode the renderer
   *  colours by the target, because that is what says whether the capital is
   *  working or idle — the source is the same token either way. */
  targetKind: SankeyNodeKind
}

export type SankeyLayout = {
  nodes: LaidOutSankeyNode[]
  links: LaidOutSankeyLink[]
  width: number
  height: number
}

export type HoverState = {
  kind: 'none' | 'node' | 'edge'
  id: string | null
  // Derived highlight sets — pre-computed on hover so renderer stays fast.
  highlightedNodes: Set<string>
  highlightedEdges: Set<string>
}

export const EMPTY_HOVER: HoverState = {
  kind: 'none',
  id: null,
  highlightedNodes: new Set(),
  highlightedEdges: new Set(),
}
