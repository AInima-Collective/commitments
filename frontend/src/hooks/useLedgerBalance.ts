import { type Address } from 'viem'
import { useReadContracts } from 'wagmi'
import { commitmentManagerAbi } from '../generated'

export interface LedgerBalance {
  /** Free balance in the manager ledger — withdrawable + available to back new
   *  commitments. `manager.freeBalance(token, user)`. */
  free: bigint | undefined
  /** Encumbered balance locked by active commitments. `manager.encumberedBalance(token, user)`. */
  encumbered: bigint | undefined
  /** free + encumbered (the user's total custodied balance for this token). */
  total: bigint | undefined
  isLoading: boolean
  refetch: () => void
}

interface UseLedgerBalanceParams {
  managerAddress: Address | undefined
  /** Backing token to read — any ERC-20 or ERC-4626 vault share. */
  token: Address | undefined
  user: Address | undefined
}

/**
 * Reads a user's per-(token) free/encumbered split from the CommitmentManager
 * ledger. This is the v2 home of the "free vs encumbered" concept — backing is
 * custodied by the manager keyed by (token, user), not by the vault. Works for
 * raw ERC-20 backing and for vault shares alike (the token is just an address).
 */
export function useLedgerBalance({
  managerAddress,
  token,
  user,
}: UseLedgerBalanceParams): LedgerBalance {
  const enabled = !!managerAddress && !!token && !!user
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      {
        abi: commitmentManagerAbi,
        address: managerAddress,
        functionName: 'freeBalance',
        args: token && user ? [token, user] : undefined,
      },
      {
        abi: commitmentManagerAbi,
        address: managerAddress,
        functionName: 'encumberedBalance',
        args: token && user ? [token, user] : undefined,
      },
    ],
    query: { enabled, refetchInterval: 15_000 },
  })

  const free = data?.[0]?.result as bigint | undefined
  const encumbered = data?.[1]?.result as bigint | undefined
  const total =
    free !== undefined && encumbered !== undefined ? free + encumbered : undefined

  return {
    free,
    encumbered,
    total,
    isLoading,
    refetch: () => {
      void refetch()
    },
  }
}
