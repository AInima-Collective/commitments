import { type Address } from 'viem'
import { commitmentsVaultAbi } from '../generated'
import { useApproveThenWrite } from './useApproveThenWrite'

export type DepositStep = 'idle' | 'approving' | 'approved' | 'depositing' | 'complete' | 'error'

export interface DepositFlow {
  step: DepositStep
  tokenBalance: bigint | undefined
  currentAllowance: bigint | undefined
  approve: (amount: bigint) => void
  deposit: (amount: bigint) => void
  reset: () => void
  error: Error | null
}

interface UseDepositFlowParams {
  vaultAddress: Address | undefined
  assetAddress: Address | undefined
  userAddress: Address | undefined
  onSuccess?: () => void
}

/** Approve the vault's asset to the vault, then `vault.deposit(amount, user)`. */
export function useDepositFlow({
  vaultAddress,
  assetAddress,
  userAddress,
  onSuccess,
}: UseDepositFlowParams): DepositFlow {
  const flow = useApproveThenWrite({
    token: assetAddress,
    spender: vaultAddress,
    owner: userAddress,
    onSuccess: () => onSuccess?.(),
  })

  function deposit(amount: bigint) {
    if (!vaultAddress || !userAddress) return
    flow.write({
      abi: commitmentsVaultAbi,
      address: vaultAddress,
      functionName: 'deposit',
      args: [amount, userAddress],
    })
  }

  return {
    step: flow.step === 'writing' ? 'depositing' : flow.step,
    tokenBalance: flow.balance,
    currentAllowance: flow.allowance,
    approve: flow.approve,
    deposit,
    reset: flow.reset,
    error: flow.error,
  }
}
