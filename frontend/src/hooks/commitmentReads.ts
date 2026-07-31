import { type Address, type ReadContractReturnType } from 'viem'
import { commitmentManagerAbi } from '../generated'
import { type CommitmentWithStatus, deriveStatus } from '../utils/commitments'

/**
 * Shared read/decode helpers for commitment enrichment.
 *
 * Several hooks (`useCommitments`, `useArbiterCommitments`,
 * `useFullCommitment`) enrich a bare commitment id into
 * a `CommitmentWithStatus` by reading the same four contract calls and applying
 * the same forfeit-proposal/unbond/status derivation. That mapper used to be
 * copy-pasted verbatim across each hook (with `as any` casts that discarded the
 * ABI-derived types); it now lives here once, fully typed from the generated
 * ABI, so the derivation cannot drift between surfaces.
 */

/** ABI-derived shape of `getCommitment`'s returned struct. */
export type CommitmentStruct = ReadContractReturnType<
  typeof commitmentManagerAbi,
  'getCommitment'
>
/** ABI-derived shape of `getForfeitProposal`'s returned struct. */
export type ForfeitProposalStruct = ReadContractReturnType<
  typeof commitmentManagerAbi,
  'getForfeitProposal'
>

/** Number of contract reads enqueued per commitment id by {@link commitmentReadContracts}. */
export const COMMITMENT_STRIDE = 4

/**
 * Build the four multicall reads that enrich a single commitment id:
 * `[getCommitment, getForfeitProposal, unbondInitiatedAt, strategiesOf]`.
 * Spread one block per id into a `useReadContracts({ contracts })` call.
 */
export function commitmentReadContracts(manager: Address, id: bigint) {
  return [
    {
      abi: commitmentManagerAbi,
      address: manager,
      functionName: 'getCommitment' as const,
      args: [id] as const,
    },
    {
      abi: commitmentManagerAbi,
      address: manager,
      functionName: 'getForfeitProposal' as const,
      args: [id] as const,
    },
    {
      abi: commitmentManagerAbi,
      address: manager,
      functionName: 'unbondInitiatedAt' as const,
      args: [id] as const,
    },
    {
      abi: commitmentManagerAbi,
      address: manager,
      functionName: 'strategiesOf' as const,
      args: [id] as const,
    },
  ]
}

/** Narrow forfeit-proposal view consumed by status derivation. */
interface ForfeitProposalView {
  initiatedAt: bigint
  executed: boolean
  cancelled: boolean
}

function toForfeitProposal(sp: ForfeitProposalStruct | undefined): ForfeitProposalView | undefined {
  return sp && sp.initiatedAt !== undefined
    ? { initiatedAt: sp.initiatedAt, executed: sp.executed, cancelled: sp.cancelled }
    : undefined
}

/** Optional indexed-row overrides applied when the caller already has them. */
export interface CommitmentHints {
  committer?: Address
  arbiter?: Address
  counterparty?: Address
  amount?: bigint
}

/**
 * Assemble a `CommitmentWithStatus` from the four decoded reads. Pure — the
 * single home for status precedence and `forfeitChallengeEnd` derivation.
 */
export function buildCommitmentWithStatus(args: {
  id: bigint
  commitment: CommitmentStruct
  forfeit: ForfeitProposalStruct | undefined
  unbondInitiatedAt: bigint | undefined
  strategies: Address[] | undefined
  hints?: CommitmentHints
}): CommitmentWithStatus {
  const { id, commitment: c, unbondInitiatedAt, strategies, hints } = args
  const forfeitProposal = toForfeitProposal(args.forfeit)

  const status = deriveStatus(
    {
      released: c.released,
      forfeited: c.forfeited,
      expiresAt: c.expiresAt,
      unbondInitiatedAt,
    },
    forfeitProposal,
  )

  // Derive forfeitChallengeEnd so the canonical urgency sort can rank multiple
  // FORFEIT_PENDING rows by deadline.
  const forfeitChallengeEnd =
    forfeitProposal &&
    forfeitProposal.initiatedAt > 0n &&
    !forfeitProposal.executed &&
    !forfeitProposal.cancelled
      ? forfeitProposal.initiatedAt + c.challengeWindow
      : undefined

  return {
    id,
    committer: hints?.committer ?? c.committer,
    arbiter: hints?.arbiter ?? c.arbiter,
    counterparty: hints?.counterparty ?? c.counterparty,
    token: c.token,
    adapter: c.adapter,
    amount: hints?.amount ?? c.amount,
    maxPenaltyBps: Number(c.maxPenaltyBps),
    challengeWindow: c.challengeWindow,
    createdAt: c.createdAt,
    expiresAt: c.expiresAt,
    released: c.released,
    forfeited: c.forfeited,
    unbondInitiatedAt,
    strategies,
    status,
    forfeitChallengeEnd,
  }
}

/** Element shape produced by `useReadContracts` (structurally). */
interface ReadResult {
  status: 'success' | 'failure'
  result?: unknown
}

/**
 * Decode one stride-4 window of `useReadContracts` results (starting at
 * `offset`) into a `CommitmentWithStatus`. Returns `null` when the
 * `getCommitment` read failed or returned an empty struct.
 */
export function mapCommitmentWindow(
  id: bigint,
  results: readonly (ReadResult | undefined)[],
  offset: number,
  hints?: CommitmentHints,
): CommitmentWithStatus | null {
  const commitmentResult = results[offset]
  const forfeitResult = results[offset + 1]
  const unbondResult = results[offset + 2]
  const strategiesResult = results[offset + 3]

  if (commitmentResult?.status !== 'success' || !commitmentResult.result) return null

  return buildCommitmentWithStatus({
    id,
    commitment: commitmentResult.result as CommitmentStruct,
    forfeit:
      forfeitResult?.status === 'success'
        ? (forfeitResult.result as ForfeitProposalStruct)
        : undefined,
    unbondInitiatedAt:
      unbondResult?.status === 'success' ? (unbondResult.result as bigint) : undefined,
    strategies:
      strategiesResult?.status === 'success'
        ? (strategiesResult.result as readonly Address[]).slice()
        : undefined,
    hints,
  })
}
