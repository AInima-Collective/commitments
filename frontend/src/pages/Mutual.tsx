import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { type Address, parseUnits } from 'viem'
import { useChainId, useReadContract, useReadContracts } from 'wagmi'

import {
  Button,
  Card,
  EmptyState,
  ErrorBlock,
  Input,
  Modal,
  Notice,
  Skeleton,
  StatBlock,
  Tabs,
  TokenAmount,
  useToasts,
} from '../components/ui'
import {
  Countdown,
  OperatorIdentity,
  PageHeader,
  PendingLossNotice,
  MutualStatusBadge,
  type MutualLifecycle,
} from '../components/protocol'
import { ResolveActionRow } from '../components/commitment/actions/ResolveActionRow'
import { BuyCoverPanel } from '../components/mutual/BuyCoverPanel'
import { CoverageBrief } from '../components/mutual/CoverageBrief'
import { CoverPolicies } from '../components/mutual/CoverPolicies'
import { JoinConsentGate } from '../components/mutual/JoinConsentGate'
import { MutualActionCard } from '../components/mutual/MutualActionCard'
import { MutualMarketStats } from '../components/mutual/MutualMarketStats'
import { PayoutPanel } from '../components/mutual/PayoutPanel'
import { SettlementProgress } from '../components/mutual/SettlementProgress'
import { YourPositionSummary } from '../components/mutual/YourPositionSummary'
import { MutualRoster, type RosterMember } from '../components/mutual/MutualRoster'
import {
  commitmentManagerAbi,
  useWriteCommitmentManagerClaimMemberPremium,
  useWriteCommitmentManagerJoinMutual,
  useWriteCommitmentManagerSettleMembers,
} from '../generated'
import { getContractAddresses, getVaultDescriptor } from '../config/contracts'
import { buildCommitmentWithStatus, type CommitmentStruct } from '../hooks/commitmentReads'
import { type CommitmentWithStatus } from '../utils/commitments'
import { legibleWriteError } from '../utils/contractErrors'
import {
  deriveViewerRole,
  getAvailableActions,
  type ResolveActionKind,
} from '../utils/resolveActions'
import { useClaimPayout } from '../hooks/useClaimPayout'
import { useMutual } from '../hooks/useMutual'
import { useMutualPremium } from '../hooks/useMutualPremium'
import { useMutualRoster } from '../hooks/useMutualRoster'
import { useMutualCover } from '../hooks/useMutualCover'
import { useLedgerBalance } from '../hooks/useLedgerBalance'
import { useMutualListings } from '../hooks/useMutualListings'
import { useMutuals } from '../hooks/useMutuals'
import { useTokenMetaMap } from '../hooks/useTokenMeta'
import { useNowSeconds } from '../hooks/useNow'
import { useTxReceipt } from '../hooks/useTxReceipt'
import { useViewAddress } from '../hooks/useViewAddress'
import { formatDuration, formatTokenAmount, truncateAddress } from '../lib/format'
import { parsePerilURI, perilLabel } from '../lib/peril'

/** Which action modal is open, if any. */
type ActionModal = 'underwrite' | 'buy-cover' | 'manage' | null

/**
 * The member-lifecycle action kinds the manage modal surfaces. Enable/disable
 * logic and reasons come from `getAvailableActions` — the same source of truth
 * as the resolve modal — filtered to the mutual lifecycle; the rest of a
 * commitment's resolution surface lives on its detail page.
 */
const MUTUAL_ACTION_KINDS = new Set<ResolveActionKind>([
  'settle-mutual-loss',
  'request-mutual-exit',
  'release-mutual-member',
])

const EMPTY_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const

/** Max live `pendingMemberLoss` reads verifying the roster's owed list. */
const LIVE_OWED_READ_CAP = 40

// Each member commitment id fans out to this many parallel manager reads, in a
// fixed order (membership, pendingLoss, commitment, pendingPremium). The decode
// below indexes `membershipData` as `i * MEMBER_READS_PER_ID + <slot>` — keep
// the slot order here in lockstep with `membershipContracts`.
const MEMBER_READS_PER_ID = 4
const SLOT_MEMBERSHIP = 0
const SLOT_PENDING_LOSS = 1
const SLOT_COMMITMENT = 2
const SLOT_PENDING_PREMIUM = 3

/** The viewer's own membership in this mutual, enriched for exit + gauge state. */
interface MyMember {
  commitmentId: bigint
  committer: Address
  creditedValue: bigint
  settledUnits: bigint
  owedUnits: bigint
  /** Member's Λ snapshot (1e18-scaled). */
  lossSnapshot: bigint
  /** 0n unless exit requested (deallocation window running). */
  unbondRequestedAt: bigint
  /** Live commitment `amount` — the residual encumbrance (`amount_join − settledUnits`). */
  liveAmount: bigint
  /** Live claimable §G premium for this member (`pendingMemberPremium`). */
  claimablePremium: bigint
  /** Enriched commitment for `getAvailableActions` / `ResolveActionRow`. */
  commitment: CommitmentWithStatus
}

/**
 * /mutuals/:mutualId — the Mutual surface, redesigned from first principles
 * around the two-sided market it actually is.
 *
 * The page reads top-to-bottom as a risk product should: what it covers (risk +
 * trigger + claims path) → market & risk at a glance (one consolidated block, no
 * figure shown twice) → your own position (when connected) → the two equal-weight
 * actions, Underwrite and Buy cover. Each action opens a focused modal with its
 * full flow (the app-wide house style for transactional flows — see /design's
 * Overlays guidance); position management (claim premium / settle loss share /
 * exit) lives in its own modal, driven by the same action cards as the resolve
 * modal. Roster, cover policies, premium-stream internals, and contract
 * addresses are tucked into tabs so the overview stays scannable.
 */
export default function Mutual() {
  const { mutualId: mutualIdParam } = useParams<{ mutualId: string }>()
  const chainId = useChainId()
  const navigate = useNavigate()
  const viewAddress = useViewAddress()
  const { push } = useToasts()
  // Deep-link support: the marketplace cards link here with `?action=underwrite`
  // or `?action=buy-cover` to preopen the matching modal. The param is synced
  // both ways — opening writes it (links stay shareable), closing clears it (a
  // refresh after closing must not resurrect the modal). `manage` never enters
  // the URL: it needs a connected position, so a deep link can't honor it.
  // `?action=buy-cover` is ignored on conduit-covered mutuals: the indexed row
  // that flags them loads async, so the guard is at render time (the buy-cover
  // modal simply never mounts there) rather than in this initializer.
  const [searchParams, setSearchParams] = useSearchParams()
  const actionParam = searchParams.get('action')
  const initialModal: ActionModal =
    actionParam === 'underwrite' || actionParam === 'buy-cover' ? actionParam : null
  const [modal, setModal] = useState<ActionModal>(initialModal)
  const [consented, setConsented] = useState(false)
  const [amountText, setAmountText] = useState('')

  function openModal(next: Exclude<ActionModal, null>) {
    setModal(next)
    if (next !== 'manage') {
      // `replace` so toggling modals doesn't grow the history stack.
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          p.set('action', next)
          return p
        },
        { replace: true },
      )
    }
  }
  function closeModal() {
    setModal(null)
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.delete('action')
        return p
      },
      { replace: true },
    )
  }

  const {
    commitmentManager: managerAddress,
    erc20Adapter,
    linkedMutualPolicy,
    premiumScheduler,
  } = getContractAddresses(chainId)

  const mutualId = useMemo(() => {
    if (mutualIdParam === undefined) return undefined
    try {
      return BigInt(mutualIdParam)
    } catch {
      return undefined
    }
  }, [mutualIdParam])

  const { listings } = useMutualListings()
  const listing = useMemo(
    () => listings.find((s) => s.mutualId === mutualId),
    [listings, mutualId],
  )

  // Conduit-covered detection — the same `/mutuals` query useMutualListings
  // already wraps (react-query dedupes by key, so this is free). A non-null
  // `coveredVault` means this pool ambient-covers a vault: the keyless
  // VaultCoverConduit pays the premium stream from the vault's own yield and
  // ALL deposits are covered, so there is no individual buy-cover flow here.
  const indexedMutuals = useMutuals()
  const indexedRow = mutualId !== undefined ? indexedMutuals.byId.get(mutualId) : undefined
  const coveredVault = indexedRow?.coveredVault ?? undefined
  const conduitCovered = coveredVault !== undefined
  const coveredVaultName =
    coveredVault !== undefined
      ? (getVaultDescriptor(chainId, coveredVault)?.name ?? `vault ${truncateAddress(coveredVault)}`)
      : undefined

  const {
    mutual,
    proposal,
    hasPendingLoss,
    liveCapacity,
    liveCapacityAvailable,
    notFound,
    isLoading: mutualLoading,
    isError: mutualIsError,
    error: mutualError,
    refetch: refetchMutual,
  } = useMutual({ managerAddress, mutualId })

  // Live §G premium-stream state — the underwriters' yield surface.
  const premium = useMutualPremium({ managerAddress, mutualId })

  const numeraire = mutual?.numeraire ?? listing?.numeraire
  const { metaFor } = useTokenMetaMap([numeraire])
  const meta = metaFor(numeraire)

  const nowSec = useNowSeconds()

  // Viewer's free numeraire balance in the manager ledger — bounds the join.
  const ledger = useLedgerBalance({ managerAddress, token: numeraire, user: viewAddress })

  // Mutual-wide roster (every member) from the indexer.
  const roster = useMutualRoster(mutualId)

  // Per-policyholder cover bindings (who bought cover) from the indexer.
  const cover = useMutualCover(mutualId)

  // Post-loss payout state: is the mutual's beneficiary a ClaimRouter, is the
  // viewer its claimant, and how much settled recovery sits uncollected.
  const payout = useClaimPayout({
    managerAddress,
    beneficiary: mutual?.beneficiary,
    token: numeraire,
    viewer: viewAddress,
  })

  // Viewer's own positions: enumerate the connected wallet's commitments, batch
  // read membership + live owed loss share, keep only this mutual's members. This
  // is the fresh/authoritative source for the viewer's exit actions; the
  // mutual-wide roster above drives settlement progress.
  const { data: userCommitmentIds } = useReadContract({
    abi: commitmentManagerAbi,
    address: managerAddress,
    functionName: 'getUserCommitmentIds',
    args: viewAddress ? [viewAddress] : undefined,
    query: { enabled: Boolean(managerAddress && viewAddress), refetchInterval: 30_000 },
  })
  const myIds = useMemo(
    () => (userCommitmentIds as readonly bigint[] | undefined) ?? [],
    [userCommitmentIds],
  )

  // Plain const — the React Compiler memoizes it; a manual useMemo here can no
  // longer be statically preserved given the surrounding effects.
  const membershipContracts = myIds.flatMap((id) => [
    // SLOT_MEMBERSHIP
    { abi: commitmentManagerAbi, address: managerAddress, functionName: 'getMembership' as const, args: [id] as const },
    // SLOT_PENDING_LOSS
    { abi: commitmentManagerAbi, address: managerAddress, functionName: 'pendingMemberLoss' as const, args: [id] as const },
    // SLOT_COMMITMENT
    { abi: commitmentManagerAbi, address: managerAddress, functionName: 'getCommitment' as const, args: [id] as const },
    // SLOT_PENDING_PREMIUM
    { abi: commitmentManagerAbi, address: managerAddress, functionName: 'pendingMemberPremium' as const, args: [id] as const },
  ])
  const { data: membershipData, refetch: refetchMemberships } = useReadContracts({
    contracts: membershipContracts,
    query: { enabled: Boolean(managerAddress) && myIds.length > 0, refetchInterval: 20_000 },
  })

  const myMembers = useMemo<MyMember[]>(() => {
    if (mutualId === undefined || !viewAddress) return []
    const rows: MyMember[] = []
    myIds.forEach((id, i) => {
      const base = i * MEMBER_READS_PER_ID
      const m = membershipData?.[base + SLOT_MEMBERSHIP]?.result as
        | {
            mutualId: bigint
            forfeitableUnits: bigint
            settledUnits: bigint
            creditedValue: bigint
            lossSnapshot: bigint
            unbondRequestedAt: bigint
          }
        | undefined
      const owed = (membershipData?.[base + SLOT_PENDING_LOSS]?.result as bigint | undefined) ?? 0n
      const struct = membershipData?.[base + SLOT_COMMITMENT]?.result as CommitmentStruct | undefined
      const claimablePremium =
        (membershipData?.[base + SLOT_PENDING_PREMIUM]?.result as bigint | undefined) ?? 0n
      // The membership and commitment reads come from the same multicall, so
      // requiring both keeps the row's derived commitment coherent.
      if (m && m.mutualId === mutualId && struct) {
        rows.push({
          commitmentId: id,
          committer: viewAddress,
          creditedValue: m.creditedValue,
          settledUnits: m.settledUnits,
          owedUnits: owed,
          lossSnapshot: m.lossSnapshot,
          unbondRequestedAt: m.unbondRequestedAt,
          liveAmount: struct.amount,
          claimablePremium,
          // Members can't have a normal unbond or forfeit in flight (the
          // contract routes exits through the mutual lifecycle), so the
          // enrichment skips those reads.
          commitment: buildCommitmentWithStatus({
            id,
            commitment: struct,
            forfeit: undefined,
            unbondInitiatedAt: undefined,
            strategies: undefined,
          }),
        })
      }
    })
    return rows
  }, [myIds, membershipData, mutualId, viewAddress])

  // The viewer's active cover as a policyholder (from the indexed bindings),
  // aggregated to a single notional + nearest expiry for the position panel.
  const myCover = useMemo(() => {
    if (!viewAddress) return undefined
    const mine = cover.bindings.filter(
      (b) => b.active && b.policyholder.toLowerCase() === viewAddress.toLowerCase(),
    )
    if (mine.length === 0) return undefined
    const notional = mine.reduce((a, b) => a + b.notional, 0n)
    const expiry = mine.reduce((min, b) => (b.expiry < min ? b.expiry : min), mine[0].expiry)
    return { notional, expiry }
  }, [cover.bindings, viewAddress])

  // Mutual-wide roster rows for the table + settlement aggregates. Prefer the
  // indexer's full roster; fall back to the viewer's own positions (clearly a
  // partial view) when the indexer isn't available.
  const mutualWide = roster.members.length > 0
  const rosterMembers = useMemo<RosterMember[]>(() => {
    if (mutualWide) {
      return roster.members.map((m) => ({
        commitmentId: m.commitmentId,
        committer: m.committer,
        creditedValue: m.creditedValue,
        settledUnits: m.settledUnits,
        owedUnits: m.owedUnits,
      }))
    }
    return myMembers.map((m) => ({
      commitmentId: m.commitmentId,
      committer: m.committer,
      creditedValue: m.creditedValue,
      settledUnits: m.settledUnits,
      owedUnits: m.owedUnits,
    }))
  }, [mutualWide, roster.members, myMembers])

  // Live-chain verification of the roster's owed list. The indexer roster lags
  // the chain by the indexing delay, so right after an in-app settle/collect
  // it still reports owed shares — which would keep the payout panel (and its
  // guidance copy) alive after the claim is fully paid. Reading
  // `pendingMemberLoss` for just the roster's unsettled ids makes the panel's
  // gate and the crank's id list chain-fresh. Capped: beyond the cap we trust
  // the roster (conservative — a stale "owed" row keeps the panel up, never
  // hides real work).
  const rosterUnsettled = useMemo(
    () => rosterMembers.filter((m) => m.owedUnits > 0n),
    [rosterMembers],
  )
  const liveOwedContracts = rosterUnsettled.slice(0, LIVE_OWED_READ_CAP).map((m) => ({
    abi: commitmentManagerAbi,
    address: managerAddress,
    functionName: 'pendingMemberLoss' as const,
    args: [m.commitmentId] as const,
  }))
  const { data: liveOwedData, refetch: refetchLiveOwed } = useReadContracts({
    contracts: liveOwedContracts,
    query: {
      enabled: Boolean(managerAddress) && rosterUnsettled.length > 0,
      refetchInterval: 15_000,
    },
  })
  const { unsettledIds, owedOutstanding } = useMemo(() => {
    const ids: bigint[] = []
    let total = 0n
    rosterUnsettled.forEach((m, i) => {
      const live =
        i < LIVE_OWED_READ_CAP ? (liveOwedData?.[i]?.result as bigint | undefined) : undefined
      // Fall back to the roster figure while the live read is in flight.
      const owed = live ?? m.owedUnits
      if (owed > 0n) {
        ids.push(m.commitmentId)
        total += owed
      }
    })
    return { unsettledIds: ids, owedOutstanding: total }
  }, [rosterUnsettled, liveOwedData])

  // Writes -------------------------------------------------------------------
  // The per-member exit lifecycle (settle loss → request exit → release) is
  // NOT wired here: it runs through ResolveActionRow/useWriteAction in the
  // manage modal, sharing the resolve modal's copy, toasts, and error decode.
  const join = useWriteCommitmentManagerJoinMutual()
  const settle = useWriteCommitmentManagerSettleMembers()
  const claimPremium = useWriteCommitmentManagerClaimMemberPremium()

  // Receipt watchers: toast + refetch + reset on confirmation, via the shared
  // useTxReceipt helper (one source of truth for the receipt→toast→reset cycle).
  const joinReceipt = useTxReceipt({
    hash: join.data,
    successTitle: 'UNDERWRITE CONFIRMED',
    reset: join.reset,
    onSuccess: () => {
      setAmountText('')
      setConsented(false)
      closeModal()
      refetchMutual()
      roster.refetch()
      void refetchMemberships()
      void ledger.refetch()
    },
  })
  const settleReceipt = useTxReceipt({
    hash: settle.data,
    successTitle: 'SETTLE CONFIRMED',
    reset: settle.reset,
    onSuccess: () => {
      refetchMutual()
      roster.refetch()
      void refetchMemberships()
    },
  })
  const claimPremiumReceipt = useTxReceipt({
    hash: claimPremium.data,
    successTitle: 'PREMIUM CLAIMED',
    successBody: 'Premium credited to your free balance.',
    reset: claimPremium.reset,
    onSuccess: () => {
      void refetchMemberships()
      void ledger.refetch()
      premium.refetch()
    },
  })

  if (mutualIdParam === undefined) return <Navigate to="/app/marketplace" replace />
  if (mutualId === undefined) {
    return (
      <div className="ds-page">
        <BackLink />
        <PageHeader eyebrow="mutual" title="Invalid mutual id" />
        <Notice tone="warn" title="Bad mutual id">
          <code>{mutualIdParam}</code> is not a valid mutual id.
        </Notice>
      </div>
    )
  }

  // The amount the viewer intends to post (homogeneous: amount == creditedValue).
  const amount = (() => {
    if (!amountText) return undefined
    try {
      const v = parseUnits(amountText, meta.decimals)
      return v > 0n ? v : undefined
    } catch {
      return undefined
    }
  })()
  const free = ledger.free
  const overBalance = amount !== undefined && free !== undefined && amount > free
  const amountValid = amount !== undefined && !overBalance

  const loaded = mutual !== undefined && !notFound && !mutualIsError

  // Derived lifecycle status for the badge. Members still settling owed
  // their loss share after an executed loss stay `active` (the pool keeps covering) —
  // `someOwed` drives a footnote instead of a distinct badge.
  const someOwed = rosterMembers.some((m) => m.owedUnits > 0n)
  const status: MutualLifecycle = mutual?.terminal
    ? 'terminated'
    : hasPendingLoss
      ? 'loss-pending'
      : mutual?.active
        ? 'active'
        : 'pending'

  function onClaimPremium(commitmentId: bigint) {
    if (!managerAddress) return
    claimPremium.writeContract(
      { address: managerAddress, args: [commitmentId] },
      {
        onSuccess: () => push({ tone: 'info', title: 'CLAIM SUBMITTED', body: 'Awaiting confirmation…' }),
        onError: (e) => push({ tone: 'danger', title: 'CLAIM FAILED', body: legibleWriteError(e) }),
      },
    )
  }
  const claimPending = claimPremium.isPending || claimPremiumReceipt.isLoading

  // Shared refresh for the manage modal's member-lifecycle action cards.
  function onMemberActed() {
    refetchMutual()
    roster.refetch()
    void refetchMemberships()
    void ledger.refetch()
  }

  function onJoin() {
    if (!managerAddress || !numeraire || !erc20Adapter || !mutual || !viewAddress) return
    if (amount === undefined || !amountValid) return
    join.writeContract(
      {
        address: managerAddress,
        args: [
          mutualId!,
          {
            arbiter: mutual.arbiter,
            counterparty: mutual.beneficiary,
            token: numeraire,
            adapter: erc20Adapter,
            amount,
            maxPenaltyBps: 10_000,
            challengeWindow: mutual.challengeWindow,
            expiresAt: listing?.termEnd ?? 0n,
            strategies: [],
            metadataURI: '',
            metadataHash: EMPTY_HASH,
          },
        ],
      },
      {
        onSuccess: () => push({ tone: 'info', title: 'UNDERWRITE SUBMITTED', body: 'Awaiting confirmation…' }),
        onError: (e) => push({ tone: 'danger', title: 'UNDERWRITE FAILED', body: legibleWriteError(e) }),
      },
    )
  }

  const challengeElapsed = proposal ? Number(nowSec - proposal.initiatedAt) : 0
  const challengeTotal = mutual ? Number(mutual.challengeWindow) : 0
  const declared = proposal?.lossNumeraire ?? 0n

  // Mutual-wide settlement aggregates. "Settled" means a member that HAD
  // exposure and now owes nothing; members that never had exposure (owed 0 and
  // settled 0 — joined at the live Λ) are excluded from the denominator.
  const exposed = rosterMembers.filter((m) => m.owedUnits > 0n || m.settledUnits > 0n)
  const settledCount = exposed.filter((m) => m.owedUnits === 0n).length
  const collected = rosterMembers.reduce((a, m) => a + m.settledUnits, 0n)


  // Viewer's loss snapshot for the gauge tick (non-retroactive gap).
  const mySnapshot = myMembers.length > 0 ? myMembers[0].lossSnapshot : undefined

  const target = listing?.targetCapacity ?? 0n
  const subscribed = mutual?.totalShares ?? listing?.filled ?? 0n

  // Viewer position aggregates for the summary band + manage modal.
  const peril = parsePerilURI(listing?.perilURI)
  const memberCount = roster.members.length || myMembers.length
  const postedTotal = myMembers.reduce((a, m) => a + m.liveAmount, 0n)
  const claimablePremiumTotal = myMembers.reduce((a, m) => a + m.claimablePremium, 0n)
  const owedTotal = myMembers.reduce((a, m) => a + m.owedUnits, 0n)
  const claimMembers = myMembers.filter((m) => m.claimablePremium > 0n)
  const hasPosition = myMembers.length > 0 || myCover !== undefined
  // Active-policy count for the Cover tab badge.
  const activeCoverCount = cover.bindings.filter((b) => b.active).length

  // Both acquisition actions freeze together on a terminal mutual or a loss
  // under challenge; the disabled reason is shared.
  const actionsFrozen = Boolean(mutual?.terminal || hasPendingLoss)
  const frozenReason = mutual?.terminal
    ? 'Mutual terminated'
    : hasPendingLoss
      ? 'Paused — loss under challenge'
      : undefined

  return (
    <div className="ds-page">
      <BackLink />
      <PageHeader
        eyebrow={`mutual · #${mutualId.toString()}`}
        title={listing?.perilURI ? perilLabel(listing.perilURI) : `Mutual #${mutualId.toString()}`}
        lead={`Pooled shared-loss cover · backed by ${meta.symbol}`}
        actions={loaded ? <MutualStatusBadge status={status} /> : undefined}
      />

      {mutualIsError ? (
        <ErrorBlock
          title="Could not load this mutual"
          message="The mutual header read failed. Check your network connection and the contract address, then retry."
          detail={mutualError?.message}
          actions={
            <Button size="sm" variant="ghost" onClick={() => refetchMutual()}>
              Retry
            </Button>
          }
        />
      ) : mutualLoading || mutual === undefined ? (
        <div className="ds-stack ds-stack-3" aria-busy="true" aria-label="Loading mutual">
          <Skeleton shape="block" style={{ height: 120 }} />
          <div className="ds-stat-grid">
            <Skeleton shape="block" style={{ height: 64 }} />
            <Skeleton shape="block" style={{ height: 64 }} />
            <Skeleton shape="block" style={{ height: 64 }} />
            <Skeleton shape="block" style={{ height: 64 }} />
          </div>
          <Skeleton shape="block" style={{ height: 96 }} />
        </div>
      ) : notFound ? (
        <Notice tone="warn" title="Mutual not found">
          No mutual exists for <code>#{mutualId.toString()}</code>. It may not be deployed on
          this network, or the id is wrong.
        </Notice>
      ) : (
        <>
          {/* Urgent state — consolidated, page-level. A pending loss is the most
              time-critical thing here, so its countdown lives up top, not hidden
              in a tab. */}
          {mutual.terminal && (
            <Notice tone="warn" size="sm" title="Mutual terminated">
              This mutual has reached a terminal state. No new losses, commitments, or cover can be
              created.
            </Notice>
          )}

          {hasPendingLoss && proposal && (
            <Notice tone="danger" size="sm" title="Loss under challenge — capacity frozen">
              <div className="ds-stack ds-stack-2">
                <span>
                  A loss of{' '}
                  <TokenAmount amount={proposal.lossNumeraire} decimals={meta.decimals} symbol={meta.symbol} size="inline" />{' '}
                  was proposed by <OperatorIdentity address={proposal.proposer} size="sm" hideAddress />. New
                  commitments and cover are paused until it executes or is cancelled.
                </span>
                <Countdown
                  label="challenge window"
                  elapsed={challengeElapsed}
                  total={challengeTotal}
                  tone={challengeElapsed >= challengeTotal ? 'success' : 'warn'}
                />
              </div>
            </Notice>
          )}

          {/* Shared post-loss fact — one line for every persona. The
              persona-specific tails live where each persona already looks:
              underwriters' owed amount in "Your position" / the manage modal,
              the policyholder's payout in "Your payout", and the new-joiner
              non-retroactivity reassurance on the Underwrite card + consent
              gate. */}
          {!hasPendingLoss && !mutual.terminal && someOwed && (
            <Notice tone="info" size="sm" title="A loss executed — members are settling">
              Members are settling their loss shares to the beneficiary. Coverage stays active
              while they do.
            </Notice>
          )}

          {/* 1. What this covers — the trust anchor, above price + capacity. */}
          <CoverageBrief
            description={peril.description}
            trigger={peril.trigger}
            arbiter={mutual.arbiter}
            challengeWindow={mutual.challengeWindow}
            symbol={meta.symbol}
          />

          {/* 2. Market & risk at a glance — one consolidated block. */}
          <MutualMarketStats
            premiumAprBps={premium.premiumAprBps}
            isStreaming={premium.isStreaming}
            liveCapacity={liveCapacity}
            liveCapacityAvailable={liveCapacityAvailable}
            subscribed={subscribed}
            target={target}
            memberCount={memberCount}
            cumulativeLoss={mutual.cumulativeLoss}
            memberSnapshot={mySnapshot}
            decimals={meta.decimals}
            symbol={meta.symbol}
          />

          {/* 3. Your position — only once you actually have one. */}
          {viewAddress && hasPosition && (
            <YourPositionSummary
              underwriting={myMembers.length > 0}
              posted={postedTotal}
              claimablePremium={claimablePremiumTotal}
              owed={owedTotal}
              coverHeld={myCover}
              now={Number(nowSec)}
              decimals={meta.decimals}
              symbol={meta.symbol}
              onManage={() => openModal('manage')}
            />
          )}

          {/* 3b. Your payout — the policyholder's post-loss answer. Shown to
              cover holders and to the router's claimant whenever a loss is in
              flight or recovered funds sit uncollected. */}
          {viewAddress &&
            numeraire &&
            managerAddress &&
            (myCover !== undefined || payout.isClaimant) &&
            (hasPendingLoss || owedOutstanding > 0n || payout.collectable > 0n) && (
              <PayoutPanel
                routerAddress={mutual.beneficiary}
                managerAddress={managerAddress}
                payout={payout}
                token={numeraire}
                decimals={meta.decimals}
                symbol={meta.symbol}
                viewAddress={viewAddress}
                lossPending={hasPendingLoss}
                unsettledIds={unsettledIds}
                owedOutstanding={owedOutstanding}
                onCollected={() => {
                  refetchMutual()
                  roster.refetch()
                  void refetchMemberships()
                  void refetchLiveOwed()
                }}
              />
            )}

          {/* 4. The two equal-weight actions. */}
          <section className="ds-stack ds-stack-2" aria-label="Take action">
            <h3 className="ds-section-eyebrow">Take action</h3>
            <div className="ds-grid-2">
              <MutualActionCard
                title="Underwrite this risk"
                lead={`Commit ${meta.symbol} to back the risk and earn its premium stream.`}
                note={
                  <>
                    Risk: if the trigger fires, your stake is marked down pro-rata to your share of
                    the loss — up to the full amount you post, never more.
                    {mutual.cumulativeLoss > 0n && (
                      <>
                        {' '}
                        You join at the pool&rsquo;s current loss level — past losses are never
                        charged to new members.
                      </>
                    )}
                  </>
                }
                ctaLabel="Underwrite →"
                onCta={() => openModal('underwrite')}
                disabled={!viewAddress || actionsFrozen}
                disabledReason={!viewAddress ? 'Connect a wallet to underwrite' : frozenReason}
              />
              {conduitCovered && coveredVault ? (
                /* Conduit mutual: cover is ambient — nothing to buy individually,
                   so the buy-cover CTA becomes a link to the covered vault. */
                <MutualActionCard
                  title="Cover held by the vault — automatically"
                  lead={`All deposits into ${coveredVaultName} are covered by this pool — there is nothing to buy individually.`}
                  note={
                    <>
                      Premium is paid from the vault&rsquo;s own yield through a keyless conduit, so
                      every depositor is covered from the moment they deposit.
                    </>
                  }
                  ctaLabel="View the covered vault →"
                  onCta={() => navigate(`/app/vaults/${coveredVault}`)}
                />
              ) : (
                <MutualActionCard
                  title="Buy cover"
                  lead="Pay a premium to protect a position; it pays out if the trigger fires."
                  note={
                    <>
                      Premium is quoted on your cover amount and term, paid up-front from your{' '}
                      {meta.symbol} balance.
                    </>
                  }
                  ctaLabel="Buy cover →"
                  onCta={() => openModal('buy-cover')}
                  disabled={!viewAddress || actionsFrozen}
                  disabledReason={!viewAddress ? 'Connect a wallet to buy cover' : frozenReason}
                />
              )}
            </div>
          </section>

          {/* 5. Loss settlement — page-level whenever a loss is live or unsettled. */}
          {(hasPendingLoss || someOwed) && (
            <section className="ds-stack ds-stack-2" aria-label="Loss settlement">
              <h3 className="ds-section-eyebrow">Loss settlement</h3>
              {!mutualWide && !roster.unavailable && (
                <Notice tone="info" size="sm" title="Mutual-wide roster unavailable">
                  The indexer roster hasn&rsquo;t loaded — settlement progress reflects only your own
                  positions, not the whole mutual.
                </Notice>
              )}
              <SettlementProgress
                settledCount={settledCount}
                totalCount={exposed.length}
                collected={collected}
                declared={declared}
                decimals={meta.decimals}
                symbol={meta.symbol}
              />
            </section>
          )}

          {/* 6. Details — participants + mechanics + contract, in one tabbed
              panel so the reference content reads as a single region rather
              than a stack of disclosures the page trails off into. */}
          <section className="ds-stack ds-stack-2" aria-label="Details">
            <h3 className="ds-section-eyebrow">Details</h3>
            <Tabs defaultValue="underwriters">
              <Tabs.List aria-label="Mutual details">
                <Tabs.Trigger value="underwriters" count={rosterMembers.length}>
                  Underwriters
                </Tabs.Trigger>
                <Tabs.Trigger value="cover" count={activeCoverCount}>
                  Policyholders
                </Tabs.Trigger>
                <Tabs.Trigger value="mechanics">Mechanics</Tabs.Trigger>
                <Tabs.Trigger value="contract">Contract</Tabs.Trigger>
              </Tabs.List>

              <Tabs.Panel value="underwriters" aria-label="Underwriters">
                <Card>
                  <MutualRoster
                    members={rosterMembers}
                    decimals={meta.decimals}
                    symbol={meta.symbol}
                    viewAddress={viewAddress}
                  />
                </Card>
              </Tabs.Panel>

              <Tabs.Panel value="cover" aria-label="Cover policies">
                <Card>
                  <CoverPolicies
                    bindings={cover.bindings}
                    decimals={meta.decimals}
                    symbol={meta.symbol}
                    isLoading={cover.isLoading}
                    isError={cover.isError}
                    unavailable={cover.unavailable}
                  />
                </Card>
              </Tabs.Panel>

              <Tabs.Panel value="mechanics" aria-label="Mechanics">
                <Card className="ds-stack ds-stack-3">
                  {premium.stream ? (
                    <div className="ds-stack ds-stack-2">
                      <h4 className="ds-section-eyebrow">Premium stream</h4>
                      <div className="ds-stat-grid">
                        <StatBlock
                          label="premium pool"
                          value={
                            <span title={formatTokenAmount(premium.stream.premiumPool, meta.decimals).full}>
                              <TokenAmount amount={premium.stream.premiumPool} decimals={meta.decimals} symbol={meta.symbol} compact />
                            </span>
                          }
                          meta="unstreamed reserve"
                        />
                        <StatBlock
                          label="earned to date"
                          value={
                            <span title={formatTokenAmount(premium.stream.bankedTotal, meta.decimals).full}>
                              <TokenAmount amount={premium.stream.bankedTotal} decimals={meta.decimals} symbol={meta.symbol} compact />
                            </span>
                          }
                          meta="lifetime premium to members"
                        />
                        <StatBlock
                          label="stream ends"
                          value={premium.isStreaming ? formatDuration(premium.secondsRemaining) : 'idle'}
                          meta={premium.isStreaming ? 'until reserve tops up' : 'awaiting cover demand'}
                        />
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      title="NO PREMIUM STREAM YET"
                      description="No cover has been bought, so there's no premium streaming to underwriters. Buy cover to start a stream."
                    />
                  )}
                </Card>
              </Tabs.Panel>

              <Tabs.Panel value="contract" aria-label="Contract & parties">
                <Card>
                  <div className="ds-stat-grid">
                    <StatBlock label="arbiter" value={<OperatorIdentity address={mutual.arbiter} size="md" />} />
                    <StatBlock label="beneficiary" value={<OperatorIdentity address={mutual.beneficiary} size="md" />} />
                    <StatBlock
                      label="numeraire"
                      value={<OperatorIdentity address={numeraire ?? mutual.numeraire} name={meta.symbol} size="md" />}
                    />
                  </div>
                </Card>
              </Tabs.Panel>
            </Tabs>
          </section>

          {/* ── Action modals ─────────────────────────────────────────────── */}

          {/* Underwrite */}
          <Modal
            open={modal === 'underwrite'}
            onClose={closeModal}
            title="Underwrite this risk"
            description={`Commit ${meta.symbol} to back this mutual and earn premium.`}
            size="lg"
          >
            {!viewAddress ? (
              <Notice tone="info" size="sm" title="Connect a wallet">
                Connect a wallet to underwrite this mutual.
              </Notice>
            ) : (
              <div className="ds-stack ds-stack-3">
                <div className="ds-stack ds-stack-2">
                  <label className="ds-label" htmlFor="join-amount">
                    Amount to post ({meta.symbol})
                  </label>
                  <Input
                    id="join-amount"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={amountText}
                    onChange={(e) => setAmountText(e.target.value)}
                    suffix={meta.symbol}
                    tone={overBalance ? 'danger' : 'neutral'}
                    error={overBalance ? 'Exceeds your free ledger balance.' : undefined}
                  />
                  <div className="ds-row ds-row-2 ds-text-xs ds-subtle">
                    <span>
                      free in ledger:{' '}
                      <TokenAmount amount={free ?? 0n} decimals={meta.decimals} symbol={meta.symbol} size="inline" />
                    </span>
                    {free !== undefined && free > 0n && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAmountText(formatTokenAmount(free, meta.decimals).full)}
                      >
                        max
                      </Button>
                    )}
                  </div>
                </div>

                {free !== undefined && (free === 0n || overBalance) && (
                  <Notice
                    tone="warn"
                    size="sm"
                    title={
                      free === 0n
                        ? 'Nothing free in your ledger to commit'
                        : `Not enough free ${meta.symbol}`
                    }
                  >
                    Underwriting draws from your free balance in the manager ledger.{' '}
                    <Link to="/app">Deposit backing from the dashboard</Link>, then come back to
                    underwrite.
                  </Notice>
                )}

                <JoinConsentGate
                  creditedValue={amount ?? 0n}
                  decimals={meta.decimals}
                  symbol={meta.symbol}
                  deallocationWindow={mutual.deallocationWindow}
                  challengeWindow={mutual.challengeWindow}
                  frozen={hasPendingLoss}
                  consented={consented}
                  onConsentChange={setConsented}
                  actions={
                    <Button
                      onClick={onJoin}
                      disabled={
                        !consented ||
                        !amountValid ||
                        join.isPending ||
                        joinReceipt.isLoading ||
                        mutual.terminal ||
                        hasPendingLoss
                      }
                    >
                      {join.isPending || joinReceipt.isLoading
                        ? 'Underwriting…'
                        : hasPendingLoss
                          ? 'Underwriting paused (loss pending)'
                          : 'Underwrite'}
                    </Button>
                  }
                />
                <Notice tone="info" size="sm" title="What you're committing">
                  You&rsquo;re committing {meta.symbol} as an underwriter: it backs this mutual&rsquo;s
                  shared losses and earns premium for as long as it stays committed. The amount must
                  already be free in your manager ledger. If the risk triggers and a loss executes,
                  your commitment absorbs a pro-rata share of it.
                </Notice>
              </div>
            )}
          </Modal>

          {/* Buy cover — never mounts on a conduit-covered mutual (cover is
              ambient; there is no individual flow), which also neutralizes a
              stale `?action=buy-cover` deep link. */}
          {!conduitCovered && (
            <Modal
              open={modal === 'buy-cover'}
              onClose={closeModal}
              title="Buy cover"
              description="Protect a position against this risk by paying a premium up-front."
              size="md"
            >
              <BuyCoverPanel
                mutualId={mutualId}
                numeraire={numeraire}
                decimals={meta.decimals}
                symbol={meta.symbol}
                policyAddress={linkedMutualPolicy}
                schedulerAddress={premiumScheduler}
                userAddress={viewAddress}
                frozen={mutual.terminal || hasPendingLoss}
                onBound={() => {
                  premium.refetch()
                  refetchMutual()
                  cover.refetch()
                }}
              />
            </Modal>
          )}

          {/* Manage position — claim premium, settle loss share, exit/release.
              The per-member lifecycle renders the same action cards as the
              resolve modal (getAvailableActions → ResolveActionRow), so copy,
              gating reasons, toasts, and error decoding cannot drift between
              the two surfaces. */}
          <Modal
            open={modal === 'manage'}
            onClose={closeModal}
            title="Manage your position"
            description="Claim earned premium, settle your loss share, or exit your commitments."
            size="lg"
          >
            {myMembers.length === 0 || !managerAddress ? (
              <EmptyState
                title="NO UNDERWRITING POSITION"
                description={
                  myCover
                    ? "You hold cover from this mutual but don't underwrite it — there's nothing to manage here."
                    : 'You have no membership in this mutual yet.'
                }
              />
            ) : (
              <div className="ds-stack ds-stack-4">
                {/* Claim premium */}
                {claimMembers.length > 0 && (
                  <div className="ds-stack ds-stack-2">
                    <h4 className="ds-section-eyebrow">Claim premium</h4>
                    <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap' }}>
                      {claimMembers.map((m) => (
                        <Button
                          key={m.commitmentId.toString()}
                          size="sm"
                          onClick={() => onClaimPremium(m.commitmentId)}
                          disabled={claimPending}
                        >
                          {claimPending
                            ? 'Claiming…'
                            : claimMembers.length > 1
                              ? `Claim · #${m.commitmentId.toString()}`
                              : 'Claim premium'}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Batch settle — one tx across all the viewer's members. Only
                    worth surfacing with 2+ members; the single-member case is
                    covered by the per-member settle card below. */}
                {owedTotal > 0n && myMembers.length > 1 && (
                  <div className="ds-stack ds-stack-2">
                    <h4 className="ds-section-eyebrow">Settle loss share</h4>
                    <span className="ds-text-xs ds-subtle">
                      One transaction settles the accrued loss share across all your member
                      commitments.
                    </span>
                    <Button
                      onClick={() => {
                        if (!managerAddress) return
                        settle.writeContract(
                          { address: managerAddress, args: [myMembers.map((m) => m.commitmentId)] },
                          {
                            onSuccess: () => push({ tone: 'info', title: 'SETTLE SUBMITTED', body: 'Awaiting confirmation…' }),
                            onError: (e) => push({ tone: 'danger', title: 'SETTLE FAILED', body: legibleWriteError(e) }),
                          },
                        )
                      }}
                      disabled={settle.isPending || settleReceipt.isLoading}
                    >
                      {settle.isPending || settleReceipt.isLoading ? 'Settling…' : 'Settle all my members'}
                    </Button>
                  </div>
                )}

                {/* Exit / release lifecycle, per member. */}
                <div className="ds-stack ds-stack-3">
                  <h4 className="ds-section-eyebrow">Exit</h4>
                  {myMembers.map((m) => {
                    // Release is open only while deallocationWindow <= elapsed < 2 * deallocationWindow
                    // from the request; after that the request has lapsed and must be made again.
                    const requested = m.unbondRequestedAt > 0n
                    const windowOpensAt = m.unbondRequestedAt + mutual.deallocationWindow
                    const windowClosesAt = windowOpensAt + mutual.deallocationWindow
                    const lapsed = requested && nowSec >= windowClosesAt
                    const exitRequested = requested && !lapsed
                    const slashableWindow = Number(mutual.deallocationWindow)
                    const slashableElapsed = exitRequested ? Number(nowSec - m.unbondRequestedAt) : 0
                    const windowElapsed = exitRequested && nowSec >= windowOpensAt
                    // Contract gate (INV-G5): release requires the member be settled
                    // to the live Λ. If Λ moved since the member last settled, the
                    // accrued slice must be settled first.
                    const needsSettle = m.lossSnapshot !== mutual.cumulativeLoss
                    // What release returns to your free balance: the live residual
                    // (`amount_join − settledUnits`) less the loss share you must
                    // still settle before release (`owedUnits`). When nothing is
                    // owed this is just the residual. Clamp ≥ 0 against read skew.
                    const expectedReturn =
                      m.liveAmount > m.owedUnits ? m.liveAmount - m.owedUnits : 0n
                    const memberActions = getAvailableActions({
                      commitment: m.commitment,
                      // Members can't have a forfeit/unbond in flight (exits run
                      // through the mutual lifecycle) — pass empty contexts.
                      forfeit: { state: 'NONE', initiatedAt: 0n, deadline: 0n },
                      unbond: { unbondInitiatedAt: 0n, unbondingPeriod: 0n },
                      pendingYield: 0n,
                      viewerRole: deriveViewerRole(m.commitment, viewAddress),
                      isConnected: Boolean(viewAddress),
                      nowSec,
                      mutual: {
                        isMember: true,
                        lossPending: hasPendingLoss,
                        unsettled: needsSettle,
                        owedUnits: m.owedUnits,
                        // A lapsed request reads as no request: offer the request again, not release.
                        exitRequestedAt: exitRequested ? m.unbondRequestedAt : 0n,
                        deallocationWindow: mutual.deallocationWindow,
                      },
                    }).filter((a) => MUTUAL_ACTION_KINDS.has(a.kind))
                    return (
                      <div key={m.commitmentId.toString()} className="ds-stack ds-stack-2">
                        <div className="ds-row ds-row-2" style={{ justifyContent: 'space-between' }}>
                          <span className="ds-text-sm" style={{ fontWeight: 600 }}>
                            Commitment #{m.commitmentId.toString()}
                          </span>
                          <Link
                            className="ds-text-xs"
                            to={`/app/commitments/${m.commitmentId.toString()}`}
                          >
                            full detail →
                          </Link>
                        </div>

                        <PendingLossNotice
                          owedUnits={m.owedUnits}
                          decimals={meta.decimals}
                          symbol={meta.symbol}
                          exitRequested={exitRequested}
                          slashableElapsed={slashableElapsed}
                          slashableWindow={slashableWindow}
                        />

                        {exitRequested && (
                          <span className="ds-text-xs ds-subtle">
                            {windowElapsed
                              ? `Exit window open — closes in ${formatDuration(Number(windowClosesAt - nowSec))}.`
                              : `Exit window opens in ${formatDuration(Number(windowOpensAt - nowSec))} and stays open ${formatDuration(slashableWindow)}.`}
                          </span>
                        )}
                        {lapsed && (
                          <Notice tone="warn" size="sm" title="Exit request lapsed">
                            The exit window closed {formatDuration(Number(nowSec - windowClosesAt))} ago without a
                            release. Request exit again to open a new window.
                          </Notice>
                        )}

                        {/* Window elapsed and releasable — preview what comes back. */}
                        {exitRequested && windowElapsed && !hasPendingLoss && (
                          <StatBlock
                            label="expected return on exit"
                            tone="accent"
                            value={
                              <TokenAmount amount={expectedReturn} decimals={meta.decimals} symbol={meta.symbol} />
                            }
                            meta={
                              needsSettle
                                ? 'estimate — after settling your accrued loss share; a new loss declared before you release would reduce it'
                                : 'residual collateral returned to your free balance'
                            }
                          />
                        )}

                        {memberActions.map((action) => (
                          <ResolveActionRow
                            key={action.kind}
                            action={action}
                            commitment={m.commitment}
                            managerAddress={managerAddress}
                            decimals={meta.decimals}
                            symbol={meta.symbol}
                            owedLossUnits={m.owedUnits}
                            onActed={onMemberActed}
                          />
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </Modal>
        </>
      )}
    </div>
  )
}

function BackLink() {
  return (
    <div className="ds-text-xs ds-subtle">
      <Link to="/app/marketplace">← back to marketplace</Link>
    </div>
  )
}
