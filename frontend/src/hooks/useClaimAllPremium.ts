import { type Address } from 'viem'
import { commitmentManagerAbi } from '../generated'
import { type UseClaimAllQueueReturn, useTxQueue } from './useClaimAllQueue'

export interface UseClaimAllPremiumParams {
  managerAddress: Address | undefined
  /** Called once per membership when its premium-claim tx confirms. */
  onRowClaimed?: (commitmentId: bigint) => void
}

/**
 * useClaimAllPremium — sequential per-membership `claimMemberPremium` queue,
 * the earn-side twin of `useClaimAllQueue`. Remaining memberships stay
 * claimable for per-membership retry from the mutual page after a halt.
 */
export function useClaimAllPremium({
  managerAddress,
  onRowClaimed,
}: UseClaimAllPremiumParams): UseClaimAllQueueReturn<bigint> {
  return useTxQueue<bigint>({
    send: (commitmentId, write) =>
      managerAddress
        ? write({
            abi: commitmentManagerAbi,
            address: managerAddress,
            functionName: 'claimMemberPremium',
            args: [commitmentId],
          })
        : null,
    commitmentIdOf: (commitmentId) => commitmentId,
    onRowClaimed,
    haltTitle: 'PREMIUM CLAIM HALTED',
    haltBody: (id) => `Premium claim for #${id.toString()} reverted. Remaining memberships still claimable.`,
  })
}
