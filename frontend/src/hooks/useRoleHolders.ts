import { useQuery } from '@tanstack/react-query'
import { type Address, type Hex, parseAbiItem } from 'viem'
import { usePublicClient } from 'wagmi'

const ROLE_GRANTED_EVENT = parseAbiItem(
  'event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)',
)
const ROLE_REVOKED_EVENT = parseAbiItem(
  'event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)',
)

interface UseRoleHoldersParams {
  contract: Address | undefined
  role: Hex | undefined
  /** Block window to scan back from head. Default 250k ≈ 35 days at 12s/block. */
  fromBlockOffset?: bigint
}

export interface RoleHoldersResult {
  holders: Address[]
  isLoading: boolean
  /** True when the chain is anvil — the scan ran from genesis and the answer is exhaustive. */
  isExhaustive: boolean
}

/**
 * Live role-holder set for an OpenZeppelin AccessControl contract — RoleGranted
 * minus RoleRevoked, deduped, only addresses that net to grant > revoke.
 *
 * On anvil the scan starts at block 0 (deployment is recent, RPC is local). On
 * any other chain the scan is bounded by `fromBlockOffset` so we don't pin a
 * public RPC; the caller surfaces the bounded-window caveat to the user.
 */
export function useRoleHolders({
  contract,
  role,
  fromBlockOffset = 250_000n,
}: UseRoleHoldersParams): RoleHoldersResult {
  const client = usePublicClient()
  const chainId = client?.chain?.id
  const enabled = !!client && !!contract && !!role

  const query = useQuery<{ holders: Address[]; isExhaustive: boolean }>({
    queryKey: ['role-holders', chainId, contract, role, String(fromBlockOffset)],
    enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!client || !contract || !role) return { holders: [], isExhaustive: false }
      const head = await client.getBlockNumber()
      // Anvil deployments are minutes old; scanning from 0n is the only way to
      // catch the deploy-time grant. On any other chain we bound the scan.
      const isAnvil = chainId === 31337
      const fromBlock = isAnvil
        ? 0n
        : head > fromBlockOffset
          ? head - fromBlockOffset
          : 0n

      const [granted, revoked] = await Promise.all([
        client.getLogs({
          address: contract,
          event: ROLE_GRANTED_EVENT,
          args: { role },
          fromBlock,
          toBlock: head,
        }),
        client.getLogs({
          address: contract,
          event: ROLE_REVOKED_EVENT,
          args: { role },
          fromBlock,
          toBlock: head,
        }),
      ])

      const counts = new Map<Address, number>()
      for (const log of granted) {
        const acc = log.args.account
        if (!acc) continue
        counts.set(acc, (counts.get(acc) ?? 0) + 1)
      }
      for (const log of revoked) {
        const acc = log.args.account
        if (!acc) continue
        counts.set(acc, (counts.get(acc) ?? 0) - 1)
      }
      const holders = Array.from(counts.entries())
        .filter(([, c]) => c > 0)
        .map(([a]) => a)

      return { holders, isExhaustive: isAnvil }
    },
  })

  return {
    holders: query.data?.holders ?? [],
    isLoading: query.isLoading,
    isExhaustive: query.data?.isExhaustive ?? false,
  }
}
