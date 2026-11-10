import { type Address } from 'viem'
import { type CommitmentWithStatus, type ForfeitProposalState } from './commitments'

/**
 * Forfeit window TTL constant — mirrors `FORFEIT_PROPOSAL_TTL` in
 * `CommitmentManager.sol`. After the pause-adjusted effective execution time
 * plus 14 days, anyone can call `cancelStaleForfeitProposal`. Encoded here so the helper is
 * pure (no chain reads). If the contract constant changes, update both places.
 */
export const FORFEIT_PROPOSAL_TTL_SECONDS = 14n * 86_400n

export type ViewerRole = 'committer' | 'counterparty' | 'arbiter' | 'spectator'

export type ResolveActionKind =
  | 'release'
  | 'expire'
  | 'request-unbond'
  | 'finalize-unbond'
  | 'cancel-unbond'
  | 'initiate-forfeit'
  | 'execute-forfeit'
  | 'cancel-forfeit'
  | 'cancel-stale-forfeit'
  | 'claim-yield'
  | 'reclaim-yield'
  | 'distribute-yield'
  | 'settle-mutual-loss'
  | 'request-mutual-exit'
  | 'release-mutual-member'

export interface ResolveAction {
  kind: ResolveActionKind
  /** Whether the action button should be enabled. */
  enabled: boolean
  /** When `enabled === false`, why — surfaces as a tooltip + helper line. */
  reason?: string
  /** Higher score = more visually prominent (used to sort sections). */
  primary: number
}

export interface UnbondState {
  /** 0n means no unbond pending. */
  unbondInitiatedAt: bigint
  /** Vault's global unbonding period in seconds. */
  unbondingPeriod: bigint
}

export interface ForfeitContext {
  state: ForfeitProposalState
  initiatedAt: bigint
  /** Pause-adjusted effective execution time. */
  deadline: bigint
  /** Canonical live-manager readiness flags. Optional for legacy callers. */
  executionAvailable?: boolean
  staleCancellationAvailable?: boolean
  staleCancelAt?: bigint
}

export interface AvailableActionsInput {
  commitment: CommitmentWithStatus
  forfeit: ForfeitContext
  unbond: UnbondState
  /** Pending yield in shares. 0n means nothing to claim. */
  pendingYield: bigint
  viewerRole: ViewerRole
  /** Whether the viewer has connected a wallet (writes need a signer). */
  isConnected: boolean
  /** Unix seconds. Pass-in so tests are deterministic. */
  nowSec: bigint
  /**
   * Mutual-membership context. When the commitment is member capital the
   * normal unbond is blocked on-chain (`CommitmentInMutual`) and the member
   * lifecycle (settle loss → request exit → release after the deallocation
   * window) replaces it. Optional so callers without a membership read behave
   * as before.
   */
  mutual?: MutualResolveContext
}

export interface MutualResolveContext {
  /** True when the commitment is member capital in a mutual. */
  isMember: boolean
  /** True while a two-phase loss declaration is open — freezes exit/release. */
  lossPending: boolean
  /** True when the member's loss snapshot lags the mutual's Λ — settle first. */
  unsettled: boolean
  /** Raw token units owed to the beneficiary if settled now. */
  owedUnits: bigint
  /** When exit was requested (deallocation window start). 0n == not requested. */
  exitRequestedAt: bigint
  /** The mutual's deallocation window in seconds. */
  deallocationWindow: bigint
}

/**
 * Compute viewer role from a connected address vs. the commitment parties.
 * `arbiter` wins over `committer` / `counterparty` if the addresses collide
 * (rare, but the protocol allows self-arbitration in DELEGATE mode).
 */
export function deriveViewerRole(
  commitment: Pick<CommitmentWithStatus, 'committer' | 'counterparty' | 'arbiter'>,
  viewer: Address | undefined,
): ViewerRole {
  if (!viewer) return 'spectator'
  const v = viewer.toLowerCase()
  if (commitment.arbiter.toLowerCase() === v) return 'arbiter'
  if (commitment.committer.toLowerCase() === v) return 'committer'
  if (commitment.counterparty.toLowerCase() === v) return 'counterparty'
  return 'spectator'
}

/** True if a forfeit proposal is *currently* blocking other actions. */
function forfeitBlocksMutations(forfeit: ForfeitContext): boolean {
  return ['PENDING', 'EXECUTABLE', 'PAUSED', 'STALE', 'INCONSISTENT', 'UNAVAILABLE'].includes(
    forfeit.state,
  )
}

function staleAt(forfeit: ForfeitContext): bigint {
  return forfeit.staleCancelAt ?? forfeit.deadline + FORFEIT_PROPOSAL_TTL_SECONDS
}

function formatRemaining(seconds: bigint): string {
  if (seconds <= 0n) return 'now'
  const s = Number(seconds)
  if (s < 3600) return `${Math.ceil(s / 60)}m`
  if (s < 86_400) return `${Math.ceil(s / 3600)}h`
  return `${Math.ceil(s / 86_400)}d`
}

/**
 * Returns the ordered list of resolution actions available to the viewer for
 * this commitment in its current state. Disabled actions are still returned
 * (with a `reason`) so the modal can render them as informative dimmed cards
 * rather than hiding them — surfacing *why* an action isn't available is the
 * whole point of this UX.
 */
export function getAvailableActions(input: AvailableActionsInput): ResolveAction[] {
  const { commitment, forfeit, unbond, pendingYield, viewerRole, isConnected, nowSec, mutual } = input
  const inMutual = mutual?.isMember ?? false
  const actions: ResolveAction[] = []

  const isClosed = commitment.status === 'RELEASED' || commitment.status === 'FORFEITED'
  const isUnbonding = unbond.unbondInitiatedAt > 0n
  const maturesAt = isUnbonding ? unbond.unbondInitiatedAt + unbond.unbondingPeriod : 0n
  const isUnbondMature = isUnbonding && nowSec >= maturesAt
  const blockedByForfeit = forfeitBlocksMutations(forfeit)
  const forfeitIsStale =
    forfeit.staleCancellationAvailable ??
    ((forfeit.state === 'EXECUTABLE' || forfeit.state === 'STALE') && nowSec >= staleAt(forfeit))
  const forfeitCanExecute =
    forfeit.executionAvailable ??
    (forfeit.state === 'EXECUTABLE' || forfeit.state === 'STALE')
  const writeGate = isConnected
    ? undefined
    : 'Connect a wallet to act'

  // Release — arbiter, ACTIVE, no active forfeit
  if (viewerRole === 'arbiter' && commitment.status === 'ACTIVE') {
    actions.push({
      kind: 'release',
      enabled: !blockedByForfeit && isConnected,
      reason: blockedByForfeit
        ? 'Cancel the active forfeit proposal first'
        : writeGate,
      primary: 90,
    })
  }

  // Expire — committer, ACTIVE + past expiresAt, no active forfeit
  if (viewerRole === 'committer' && commitment.status === 'ACTIVE') {
    const hasExpiry = commitment.expiresAt > 0n
    const isExpired = hasExpiry && nowSec >= commitment.expiresAt
    if (hasExpiry) {
      const reason = !isExpired
        ? `Available in ${formatRemaining(commitment.expiresAt - nowSec)}`
        : blockedByForfeit
        ? 'Wait for the active forfeit proposal to resolve'
        : writeGate
      actions.push({
        kind: 'expire',
        enabled: isExpired && !blockedByForfeit && isConnected,
        reason,
        primary: 80,
      })
    }
  }

  // Unbond — committer's self-service exit. Requestable only while ACTIVE
  // (deriveStatus flips to UNBONDING once requested). Mutual member capital
  // can't use this path at all — the contract reverts `CommitmentInMutual` —
  // so for members the mutual lifecycle below replaces this action entirely.
  if (viewerRole === 'committer' && commitment.status === 'ACTIVE' && !inMutual) {
    if (!isUnbonding) {
      actions.push({
        kind: 'request-unbond',
        enabled: !blockedByForfeit && isConnected,
        reason: blockedByForfeit
          ? 'Wait for the active forfeit proposal to resolve'
          : writeGate,
        primary: 70,
      })
    }
  }

  // Mutual member lifecycle: settle loss → request exit → release after the
  // deallocation window. Settle and release are permissionless (any connected
  // wallet can pay the gas); requesting the exit is committer-only on-chain.
  if (inMutual && mutual && !isClosed) {
    const exitRequested = mutual.exitRequestedAt > 0n
    const exitMaturesAt = exitRequested
      ? mutual.exitRequestedAt + mutual.deallocationWindow
      : 0n
    const exitMature = exitRequested && nowSec >= exitMaturesAt

    // Outstanding loss share — must settle before release (and the member's
    // displayed stake overstates its worth until it runs).
    if (mutual.unsettled) {
      actions.push({
        kind: 'settle-mutual-loss',
        enabled: isConnected,
        reason: writeGate,
        primary: 88,
      })
    }

    if (!exitRequested) {
      if (viewerRole === 'committer') {
        actions.push({
          kind: 'request-mutual-exit',
          enabled: !mutual.lossPending && isConnected,
          reason: mutual.lossPending
            ? 'A pending loss declaration freezes exits until it resolves'
            : writeGate,
          primary: 70,
        })
      }
    } else {
      const reason = !exitMature
        ? `Deallocation window elapses in ${formatRemaining(exitMaturesAt - nowSec)}`
        : mutual.lossPending
        ? 'A pending loss declaration freezes releases until it resolves'
        : mutual.unsettled
        ? 'Settle the outstanding loss share first'
        : writeGate
      actions.push({
        kind: 'release-mutual-member',
        enabled: exitMature && !mutual.lossPending && !mutual.unsettled && isConnected,
        reason,
        primary: 95,
      })
    }
  }

  // Once requested, the commitment's status is UNBONDING (a live forfeit can
  // momentarily flip it to FORFEIT_PENDING — guarded by blockedByForfeit below).
  if (isUnbonding && (commitment.status === 'UNBONDING' || commitment.status === 'FORFEIT_PENDING')) {
    // Finalize is permissionless; the committer will usually do it but anyone
    // who pays gas can clear the unbond.
    if (viewerRole !== 'spectator' || isConnected) {
      const reason = !isUnbondMature
        ? `Matures in ${formatRemaining(maturesAt - nowSec)}`
        : blockedByForfeit
        ? 'Active forfeit blocks finalization'
        : writeGate
      actions.push({
        kind: 'finalize-unbond',
        enabled: isUnbondMature && !blockedByForfeit && isConnected,
        reason,
        primary: 95,
      })
    }
    // Cancel — committer can always cancel their own unbond
    if (viewerRole === 'committer') {
      actions.push({
        kind: 'cancel-unbond',
        enabled: isConnected,
        reason: writeGate,
        primary: 30,
      })
    }
  }

  // Forfeit — arbiter
  if (viewerRole === 'arbiter' && commitment.status === 'ACTIVE' && forfeit.state === 'NONE') {
    actions.push({
      kind: 'initiate-forfeit',
      enabled: isConnected,
      reason: writeGate,
      primary: 50,
    })
  }

  // Execute forfeit — anyone, post-window
  if (forfeitBlocksMutations(forfeit)) {
    const reason = forfeitCanExecute
      ? writeGate
      : forfeit.state === 'PAUSED'
        ? 'Execution is paused by the manager'
        : forfeit.state === 'INCONSISTENT' || forfeit.state === 'UNAVAILABLE'
          ? 'Pause-adjusted execution timing is unavailable'
          : `Forfeit execution delay ends in ${formatRemaining(forfeit.deadline - nowSec)}`
    actions.push({
      kind: 'execute-forfeit',
      enabled: forfeitCanExecute && isConnected,
      reason,
      primary: 85,
    })
  }

  // Cancel forfeit — arbiter, while pending or executable
  if (
    viewerRole === 'arbiter' &&
    forfeitBlocksMutations(forfeit)
  ) {
    actions.push({
      kind: 'cancel-forfeit',
      enabled: isConnected,
      reason: writeGate,
      primary: 40,
    })
  }

  // Cancel stale forfeit — anyone, after TTL
  if (forfeitBlocksMutations(forfeit)) {
    const remaining = staleAt(forfeit) - nowSec
    actions.push({
      kind: 'cancel-stale-forfeit',
      enabled: forfeitIsStale && isConnected,
      reason: !forfeitIsStale
        ? `Stale-cancel available in ${formatRemaining(remaining)}`
        : writeGate,
      primary: 20,
    })
  }

  // Claim yield — counterparty (or keeper, but keeper UI is out of scope here)
  if (viewerRole === 'counterparty' && pendingYield > 0n) {
    actions.push({
      kind: 'claim-yield',
      enabled: isConnected,
      reason: writeGate,
      primary: 60,
    })
  }

  // Distribute yield — permissionless trigger to push accrued strategy payouts.
  // v2: gated on the commitment having ≥1 bound distribution strategy (yield is
  // paid by strategies now, not a per-commitment yieldShareBps accumulator).
  if (
    commitment.status === 'ACTIVE' &&
    (commitment.strategies?.length ?? 0) > 0 &&
    (viewerRole === 'committer' || viewerRole === 'counterparty')
  ) {
    actions.push({
      kind: 'distribute-yield',
      enabled: isConnected,
      reason: writeGate,
      primary: 25,
    })
  }

  // Reclaim abandoned yield — committer, 90 days after close
  // (IndexAppreciationYield's RECLAIM_WINDOW, via `claim(id, strategy,
  // abi.encode(true))`). We can't read
  // closedAt without a contract getter, so we expose the action whenever the
  // commitment is closed and let the contract revert if too early. The reason
  // string warns the user.
  if (viewerRole === 'committer' && isClosed) {
    actions.push({
      kind: 'reclaim-yield',
      enabled: isConnected,
      reason: isConnected
        ? 'Only succeeds 90 days after the commitment closed'
        : writeGate,
      primary: 15,
    })
  }

  // Sort: most prominent first.
  return actions.sort((a, b) => b.primary - a.primary)
}
