import { type Address } from 'viem'
import { commitmentManagerAbi } from '../generated'
import { useApproveThenWrite } from './useApproveThenWrite'

export type FundStrategyStep = 'idle' | 'approving' | 'approved' | 'funding' | 'complete' | 'error'

export interface FundStrategyFlow {
  step: FundStrategyStep
  /** Current allowance the user has granted the manager to pull `token`. */
  currentAllowance: bigint | undefined
  /** ERC-20 approve(manager, amount) on the fee token. */
  approve: (amount: bigint) => void
  /** manager.fundStrategy(strategy, token, amount) — credits the strategy escrow. */
  fund: (amount: bigint) => void
  reset: () => void
  error: Error | null
}

interface UseFundStrategyParams {
  managerAddress: Address | undefined
  strategy: Address | undefined
  /** The fee token (the commitment's backing token). */
  token: Address | undefined
  userAddress: Address | undefined
  onSuccess?: () => void
}

/**
 * Drives the FlatFeeAtCreate pre-funding step: a commitment that binds
 * FlatFeeAtCreate reverts at creation unless the strategy escrow already holds
 * the fee. This funds it via approve(manager) → manager.fundStrategy(strategy,
 * token, fee). The manager is the spender (it pulls the fee on fundStrategy).
 */
export function useFundStrategy({
  managerAddress,
  strategy,
  token,
  userAddress,
  onSuccess,
}: UseFundStrategyParams): FundStrategyFlow {
  const flow = useApproveThenWrite({
    token,
    spender: managerAddress,
    owner: userAddress,
    onSuccess: () => onSuccess?.(),
  })

  function fund(amount: bigint) {
    if (!managerAddress || !strategy || !token) return
    flow.write({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'fundStrategy',
      args: [strategy, token, amount],
    })
  }

  return {
    step: flow.step === 'writing' ? 'funding' : flow.step,
    currentAllowance: flow.allowance,
    approve: flow.approve,
    fund,
    reset: flow.reset,
    error: flow.error,
  }
}
