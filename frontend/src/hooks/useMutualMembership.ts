import { type Address } from 'viem'
import {
  useReadCommitmentManagerGetMembership,
  useReadCommitmentManagerGetMutual,
  useReadCommitmentManagerGetMutualLossProposal,
  useReadCommitmentManagerPendingMemberLoss,
} from '../generated'
import { POLL } from './polling'

export interface MutualMembership {
  /** Mutual the commitment belongs to. `undefined` while loading, `0n` == not a member. */
  mutualId: bigint | undefined
  /** True once the read confirms the commitment is mutual member capital. */
  isMember: boolean
  isLoading: boolean
  /** When the member requested exit (starts the deallocation window). 0n == not requested. */
  exitRequestedAt: bigint
  /** The mutual's deallocation window in seconds (0n until loaded). */
  deallocationWindow: bigint
  /** True while a two-phase loss declaration is open on the mutual — exit and
   *  release are frozen until it executes or cancels. */
  lossPending: boolean
  /** True when the member's loss snapshot lags the mutual's cumulative loss —
   *  a settle must run (even if `owedUnits` rounds to 0) before release. */
  unsettled: boolean
  /** Raw commitment-token units owed to the beneficiary if settled now. */
  owedUnits: bigint
  refetch: () => void
}

interface UseMutualMembershipParams {
  managerAddress: Address | undefined
  commitmentId: bigint | undefined
}

/**
 * Full mutual-membership state for one commitment, driving the resolve flow's
 * member lifecycle (settle loss → request exit → release after the window).
 *
 * Mutual member capital can't use the normal unbond path (`requestUnbond`
 * reverts `CommitmentInMutual`); instead the committer starts a deallocation
 * window with `requestMutualExit` — capital stays slashable (and keeps earning
 * premium) until it elapses — and anyone releases the settled member after.
 * All reads refetch every 15s so windows/owed amounts stay live in the modal.
 */
export function useMutualMembership({
  managerAddress,
  commitmentId,
}: UseMutualMembershipParams): MutualMembership {
  const enabled = !!managerAddress && commitmentId !== undefined

  const {
    data: membership,
    isLoading: membershipLoading,
    refetch: refetchMembership,
  } = useReadCommitmentManagerGetMembership({
    address: managerAddress,
    args: commitmentId !== undefined ? [commitmentId] : undefined,
    query: { enabled, refetchInterval: POLL.fast },
  })

  // mutualId 0 is the "not a member" sentinel (mutual ids are 1-based).
  const mutualId = membership !== undefined ? BigInt(membership.mutualId) : undefined
  const isMember = mutualId !== undefined && mutualId !== 0n

  const { data: mutual, refetch: refetchMutual } = useReadCommitmentManagerGetMutual({
    address: managerAddress,
    args: mutualId !== undefined ? [mutualId] : undefined,
    query: { enabled: isMember, refetchInterval: POLL.fast },
  })

  const { data: lossProposal, refetch: refetchLoss } =
    useReadCommitmentManagerGetMutualLossProposal({
      address: managerAddress,
      args: mutualId !== undefined ? [mutualId] : undefined,
      query: { enabled: isMember, refetchInterval: POLL.fast },
    })

  const { data: owedRaw, refetch: refetchOwed } = useReadCommitmentManagerPendingMemberLoss({
    address: managerAddress,
    args: commitmentId !== undefined ? [commitmentId] : undefined,
    query: { enabled: isMember, refetchInterval: POLL.fast },
  })

  const lossPending =
    lossProposal !== undefined &&
    lossProposal.initiatedAt !== 0n &&
    !lossProposal.executed &&
    !lossProposal.cancelled

  // Release requires lossSnapshot == cumulativeLoss exactly — `owedUnits` can
  // round down to 0 while a settle is still required, so compare the snapshots.
  const unsettled =
    isMember && mutual !== undefined && membership !== undefined
      ? BigInt(membership.lossSnapshot) !== BigInt(mutual.cumulativeLoss)
      : false

  function refetch() {
    void refetchMembership()
    if (isMember) {
      void refetchMutual()
      void refetchLoss()
      void refetchOwed()
    }
  }

  return {
    mutualId,
    isMember,
    isLoading: membershipLoading,
    exitRequestedAt: membership !== undefined ? BigInt(membership.unbondRequestedAt) : 0n,
    deallocationWindow: mutual !== undefined ? BigInt(mutual.deallocationWindow) : 0n,
    lossPending,
    unsettled,
    owedUnits: owedRaw !== undefined ? BigInt(owedRaw) : 0n,
    refetch,
  }
}
