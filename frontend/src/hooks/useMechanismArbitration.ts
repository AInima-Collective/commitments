import { useMemo } from 'react'
import type { Address } from 'viem'
import { useChainId, useReadContracts } from 'wagmi'

import { findConfiguredArbiterProfile } from '../config/arbiters'
import {
  attestationArbiterAbi,
  manualArbiterAbi,
  optimisticInsuranceArbiterAbi,
  optimisticMutualArbiterAbi,
  twoTierArbiterAbi,
} from '../generated'
import { mechanismAdapter, type MechanismTerm } from '../lib/arbitrationMechanisms'

export interface NormalizedMechanismCase {
  id: bigint
  commitmentId?: bigint
  label: string
  phase: string
  status: 'open' | 'terminal'
  nextDeadline?: bigint
  deadlines: { label: string; at: bigint }[]
  participants: string[]
  availableActions: string[]
  detailPath?: string
  outcome?: string
}

export interface NormalizedMechanismArbitration {
  name: string
  process: string
  noCase: string
  terms: MechanismTerm[]
  case: NormalizedMechanismCase | undefined
  isLoading: boolean
  error: Error | null
}

const CLAIM_STATES = ['None', 'Proposed', 'Resolved', 'Forfeiture', 'Settled', 'Cancelled'] as const
const COURT_STATES = ['None', 'Primary ruling', 'Appealed', 'Human ruling', 'Dismissed', 'Withdrawn', 'Lapsed', 'Executed', 'Stale-cancelled'] as const

export interface OptimisticClaimSnapshot {
  commitmentId: bigint
  winningAmtBps: number
  lastBondAt: bigint
  state: number
  stack: readonly { asserter: Address; amountBps: number; bond: bigint }[]
}

export function normalizeOptimisticClaimCase(input: {
  activeId: bigint
  claim?: OptimisticClaimSnapshot
  timeout?: bigint
  arbiter: Address
}): NormalizedMechanismCase | undefined {
  const { activeId, claim, timeout, arbiter } = input
  if (activeId === 0n || !claim) return undefined
  const phase = CLAIM_STATES[Number(claim.state)] ?? 'Unknown'
  return {
    id: activeId,
    commitmentId: claim.commitmentId,
    label: `Claim #${activeId.toString()}`,
    phase,
    status: ['Settled', 'Cancelled'].includes(phase) ? 'terminal' : 'open',
    nextDeadline: phase === 'Proposed' && timeout !== undefined ? claim.lastBondAt + timeout : undefined,
    deadlines: phase === 'Proposed' && timeout !== undefined
      ? [{ label: 'answer deadline', at: claim.lastBondAt + timeout }]
      : [],
    participants: claim.stack.map((entry) => entry.asserter),
    availableActions:
      phase === 'Proposed'
        ? ['A different asserter may dispute with a qualifying bond', 'Anyone may finalize after the answer deadline']
        : phase === 'Forfeiture'
          ? ['Anyone may execute after the manager execution delay']
          : [],
    detailPath: `/app/claims/${activeId.toString()}?arbiter=${arbiter}`,
    outcome: phase === 'Forfeiture' ? `${claim.winningAmtBps} bps ruling` : undefined,
  }
}

export interface TwoTierCaseSnapshot {
  commitmentId: bigint
  primaryPenaltyBps: number
  finalPenaltyBps: number
  appealDeadline: bigint
  humanDeadline: bigint
  state: number
}

export function normalizeTwoTierCase(input: {
  activeId: bigint
  court?: TwoTierCaseSnapshot
  arbiter: Address
  primary?: Address
  appeal?: Address
  committer?: Address
  counterparty?: Address
}): NormalizedMechanismCase | undefined {
  const { activeId, court, arbiter, primary, appeal, committer, counterparty } = input
  if (activeId === 0n || !court) return undefined
  const phase = COURT_STATES[Number(court.state)] ?? 'Unknown'
  const terminal = ['Dismissed', 'Withdrawn', 'Lapsed', 'Executed', 'Stale-cancelled'].includes(phase)
  const operativePenalty = court.finalPenaltyBps > 0 ? court.finalPenaltyBps : court.primaryPenaltyBps
  const outcome =
    phase === 'Primary ruling'
      ? `${court.primaryPenaltyBps} bps primary ruling`
      : phase === 'Appealed'
        ? `${court.primaryPenaltyBps} bps primary ruling under appeal`
        : phase === 'Human ruling'
          ? `${court.finalPenaltyBps} bps final ruling`
          : phase === 'Dismissed'
            ? 'Penalty dismissed on appeal'
            : phase === 'Withdrawn'
              ? 'Primary ruling withdrawn'
              : phase === 'Lapsed'
                ? 'Appeal lapsed without a final ruling'
                : phase === 'Executed'
                  ? `${operativePenalty} bps ruling executed`
                  : phase === 'Stale-cancelled'
                    ? 'Manager proposal stale-cancelled'
                    : undefined
  return {
    id: activeId,
    commitmentId: court.commitmentId,
    label: `Court case #${activeId.toString()}`,
    phase,
    status: terminal ? 'terminal' : 'open',
    nextDeadline:
      phase === 'Primary ruling' ? court.appealDeadline : phase === 'Appealed' ? court.humanDeadline : undefined,
    deadlines: [
      court.appealDeadline > 0n ? { label: 'appeal deadline', at: court.appealDeadline } : undefined,
      court.humanDeadline > 0n ? { label: 'human-response deadline', at: court.humanDeadline } : undefined,
    ].filter((deadline): deadline is { label: string; at: bigint } => deadline !== undefined),
    participants: [primary, appeal, committer, counterparty].filter(Boolean) as string[],
    availableActions:
      phase === 'Primary ruling'
        ? ['Committer or counterparty may appeal before the appeal deadline', 'Primary controller may withdraw the ruling']
        : phase === 'Appealed'
          ? ['Appeal controller may issue the final ruling before the human-response deadline', 'Anyone may lapse an unanswered appeal after its deadline']
          : phase === 'Human ruling'
            ? ['Anyone may execute after the manager execution delay']
            : [],
    outcome,
    detailPath: `/app/arbitration/two-tier/${activeId.toString()}?arbiter=${arbiter}`,
  }
}

function result<T>(rows: readonly { status: string; result?: unknown; error?: unknown }[] | undefined, index: number): T | undefined {
  return rows?.[index]?.status === 'success' ? rows[index].result as T : undefined
}

function failure(rows: readonly { status: string; error?: unknown }[] | undefined): Error | null {
  const failed = rows?.find((row) => row.status === 'failure')
  if (!failed) return null
  return failed.error instanceof Error ? failed.error : new Error(String(failed.error ?? 'Mechanism read failed'))
}

export function useMechanismArbitration(input: {
  arbiter: Address
  commitmentId?: bigint
  caseId?: bigint
  committer?: Address
  counterparty?: Address
}): NormalizedMechanismArbitration | undefined {
  const { arbiter, commitmentId, caseId, committer, counterparty } = input
  const lookupCommitmentId = commitmentId ?? 0n
  const chainId = useChainId()
  const configured = findConfiguredArbiterProfile(chainId, arbiter)
  const adapter = mechanismAdapter(configured?.mechanismId)
  const kind = adapter?.id
  const manual = { address: arbiter, abi: manualArbiterAbi } as const
  const insurance = { address: arbiter, abi: optimisticInsuranceArbiterAbi } as const
  const twoTier = { address: arbiter, abi: twoTierArbiterAbi } as const
  const mutual = { address: arbiter, abi: optimisticMutualArbiterAbi } as const
  const attestation = { address: arbiter, abi: attestationArbiterAbi } as const

  const activeRead = useReadContracts({
    contracts:
      kind === 'optimistic-insurance'
        ? [{ ...insurance, functionName: 'activeClaimOf' as const, args: [lookupCommitmentId] }]
        : kind === 'two-tier'
          ? [{ ...twoTier, functionName: 'activeCaseOf' as const, args: [lookupCommitmentId] }]
          : kind === 'attestation'
            ? [{ ...attestation, functionName: 'commitmentOrdering' as const, args: [lookupCommitmentId] }]
            : [],
    query: {
      enabled: Boolean(
        commitmentId !== undefined &&
        adapter &&
        ['optimistic-insurance', 'two-tier', 'attestation'].includes(kind!),
      ),
    },
  })
  const activeId = caseId ?? result<bigint>(activeRead.data, 0) ?? 0n

  const detailRead = useReadContracts({
    contracts:
      kind === 'optimistic-insurance' && activeId > 0n
        ? [{ ...insurance, functionName: 'getClaim' as const, args: [activeId] }]
        : kind === 'two-tier' && activeId > 0n
          ? [{ ...twoTier, functionName: 'getCase' as const, args: [activeId] }]
          : [],
    query: { enabled: activeId > 0n },
  })

  const staticRead = useReadContracts({
    contracts:
      kind === 'manual'
        ? [{ ...manual, functionName: 'owner' as const }]
        : kind === 'optimistic-insurance'
          ? [
              { ...insurance, functionName: 'answerTimeout' as const },
              { ...insurance, functionName: 'minBond' as const },
              { ...insurance, functionName: 'bondToken' as const },
              { ...insurance, functionName: 'bondBps' as const },
              { ...insurance, functionName: 'winnerShareBps' as const },
            ]
          : kind === 'two-tier'
            ? [
                { ...twoTier, functionName: 'primaryController' as const },
                { ...twoTier, functionName: 'appealController' as const },
                { ...twoTier, functionName: 'appealWindow' as const },
                { ...twoTier, functionName: 'humanResponseWindow' as const },
                { ...twoTier, functionName: 'executionBuffer' as const },
                { ...twoTier, functionName: 'requiredChallengeWindow' as const },
                { ...twoTier, functionName: 'courtPolicyHash' as const },
              ]
            : kind === 'optimistic-mutual'
              ? [
                  { ...mutual, functionName: 'owner' as const },
                  { ...mutual, functionName: 'minBond' as const },
                  { ...mutual, functionName: 'bondToken' as const },
                  { ...mutual, functionName: 'treasury' as const },
                  { ...mutual, functionName: 'coverPolicy' as const },
                ]
            : kind === 'attestation'
              ? [{ ...attestation, functionName: 'serviceManager' as const }]
              : [],
    query: { enabled: Boolean(adapter && kind !== 'direct') },
  })

  return useMemo(() => {
    if (!adapter) return undefined
    const staticRows = staticRead.data as readonly { status: string; result?: unknown; error?: unknown }[] | undefined
    const detailRows = detailRead.data as readonly { status: string; result?: unknown; error?: unknown }[] | undefined
    const activeRows = activeRead.data as readonly { status: string; result?: unknown; error?: unknown }[] | undefined
    const terms = [...adapter.staticTerms]
    let mechanismCase: NormalizedMechanismCase | undefined

    if (kind === 'manual') {
      const owner = result<Address>(staticRows, 0)
      if (owner) terms.push({ label: 'owner / controller', value: owner })
    } else if (kind === 'optimistic-insurance') {
      const timeout = result<bigint>(staticRows, 0)
      const minBond = result<bigint>(staticRows, 1)
      const bondToken = result<Address>(staticRows, 2)
      const bondBps = result<number>(staticRows, 3)
      const winnerShare = result<number>(staticRows, 4)
      if (timeout !== undefined) terms.push({ label: 'answer window', value: `${timeout.toString()} seconds` })
      if (minBond !== undefined && bondToken) terms.push({ label: 'minimum bond', value: `${minBond.toString()} raw units of ${bondToken}` })
      if (bondBps !== undefined) terms.push({ label: 'value-scaled bond', value: `${bondBps} bps of proposed claim value` })
      if (winnerShare !== undefined) terms.push({ label: 'winner share', value: `${winnerShare} bps of losing bonds` })
      const claim = result<OptimisticClaimSnapshot>(detailRows, 0)
      mechanismCase = normalizeOptimisticClaimCase({ activeId, claim, timeout, arbiter })
    } else if (kind === 'two-tier') {
      const primary = result<Address>(staticRows, 0)
      const appeal = result<Address>(staticRows, 1)
      const appealWindow = result<bigint>(staticRows, 2)
      const responseWindow = result<bigint>(staticRows, 3)
      const buffer = result<bigint>(staticRows, 4)
      const required = result<bigint>(staticRows, 5)
      const policyHash = result<`0x${string}`>(staticRows, 6)
      if (primary) terms.push({ label: 'primary controller', value: primary })
      if (appeal) terms.push({ label: 'appeal controller', value: appeal })
      if (appealWindow !== undefined) terms.push({ label: 'appeal window', value: `${appealWindow.toString()} seconds` })
      if (responseWindow !== undefined) terms.push({ label: 'human-response window', value: `${responseWindow.toString()} seconds` })
      if (buffer !== undefined) terms.push({ label: 'execution buffer', value: `${buffer.toString()} seconds` })
      if (required !== undefined) terms.push({ label: 'required manager execution delay', value: `${required.toString()} seconds` })
      if (policyHash) terms.push({ label: 'court policy hash', value: policyHash })
      const court = result<TwoTierCaseSnapshot>(detailRows, 0)
      mechanismCase = normalizeTwoTierCase({
        activeId, court, arbiter, primary, appeal, committer, counterparty,
      })
    } else if (kind === 'optimistic-mutual') {
      const owner = result<Address>(staticRows, 0)
      const minBond = result<bigint>(staticRows, 1)
      const bondToken = result<Address>(staticRows, 2)
      const treasury = result<Address>(staticRows, 3)
      const coverPolicy = result<Address>(staticRows, 4)
      if (owner) terms.push({ label: 'veto controller', value: owner })
      if (minBond !== undefined && bondToken) terms.push({ label: 'minimum loss bond', value: `${minBond.toString()} raw units of ${bondToken}` })
      if (treasury) terms.push({ label: 'vetoed-bond treasury', value: treasury })
      if (coverPolicy && !/^0x0{40}$/i.test(coverPolicy)) terms.push({ label: 'linked cover policy', value: coverPolicy })
    } else if (kind === 'attestation') {
      const serviceManager = result<Address>(staticRows, 0)
      const ordering = result<bigint>(activeRows, 0)
      if (serviceManager) terms.push({ label: 'operator service manager', value: serviceManager })
      if (ordering !== undefined) terms.push({ label: 'current commitment ordering', value: ordering.toString() })
    }

    return {
      name: adapter.name,
      process: adapter.process,
      noCase: adapter.noCase,
      terms,
      case: mechanismCase,
      isLoading: activeRead.isLoading || detailRead.isLoading || staticRead.isLoading,
      error: failure(activeRows) ?? failure(detailRows) ?? failure(staticRows),
    }
  }, [adapter, kind, staticRead.data, detailRead.data, activeRead.data, staticRead.isLoading, detailRead.isLoading, activeRead.isLoading, activeId, arbiter, committer, counterparty])
}
