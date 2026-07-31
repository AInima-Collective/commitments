import { type Address } from 'viem'
import {
  useReadCommitmentManagerUnbondInitiatedAt,
  useReadCommitmentManagerUnbondingPeriod,
} from '../generated'
import { useNowSeconds } from './useNow'

export interface UnbondStatus {
  /** 0n means no unbond pending. */
  unbondInitiatedAt: bigint
  /** Manager-wide unbonding period in seconds. */
  unbondingPeriod: bigint
  /** Computed maturity timestamp (0n when not unbonding). */
  maturesAt: bigint
  isUnbonding: boolean
  isMature: boolean
  isLoading: boolean
  refetch: () => void
}

interface UseUnbondStatusParams {
  managerAddress: Address | undefined
  commitmentId: bigint | undefined
}

/**
 * Reads the per-commitment unbond timestamp + the manager's global unbonding
 * period and returns derived state for the resolve UX. Both reads refetch
 * every 15s so countdowns stay live without manual refresh. v2: the unbonding
 * period lives on the manager (per-commitment unbond), not the vault.
 */
export function useUnbondStatus({
  managerAddress,
  commitmentId,
}: UseUnbondStatusParams): UnbondStatus {
  const enabledManager = !!managerAddress && commitmentId !== undefined

  const {
    data: initiatedAtRaw,
    isLoading: initiatedLoading,
    refetch: refetchInitiated,
  } = useReadCommitmentManagerUnbondInitiatedAt({
    address: managerAddress,
    args: commitmentId !== undefined ? [commitmentId] : undefined,
    query: { enabled: enabledManager, refetchInterval: 15_000 },
  })

  const {
    data: periodRaw,
    isLoading: periodLoading,
    refetch: refetchPeriod,
  } = useReadCommitmentManagerUnbondingPeriod({
    address: managerAddress,
    query: { enabled: !!managerAddress, refetchInterval: 60_000 },
  })

  const unbondInitiatedAt =
    initiatedAtRaw !== undefined ? BigInt(initiatedAtRaw) : 0n
  const unbondingPeriod = periodRaw !== undefined ? BigInt(periodRaw) : 0n
  const isUnbonding = unbondInitiatedAt > 0n
  const maturesAt = isUnbonding ? unbondInitiatedAt + unbondingPeriod : 0n
  const nowSec = useNowSeconds()
  const isMature = isUnbonding && nowSec >= maturesAt

  function refetch() {
    void refetchInitiated()
    void refetchPeriod()
  }

  return {
    unbondInitiatedAt,
    unbondingPeriod,
    maturesAt,
    isUnbonding,
    isMature,
    isLoading: initiatedLoading || periodLoading,
    refetch,
  }
}
