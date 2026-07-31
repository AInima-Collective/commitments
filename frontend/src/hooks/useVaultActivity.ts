import { useQuery } from '@tanstack/react-query'
import { type Address, parseAbiItem } from 'viem'
import { usePublicClient } from 'wagmi'

export type VaultActivityKind = 'deposit' | 'withdraw-queued' | 'withdraw-claimed'

export interface VaultActivityEntry {
  kind: VaultActivityKind
  blockNumber: bigint
  txHash: `0x${string}`
  /** Asset amount (USDC, 6 decimals) */
  assets: bigint
  /** Share amount (vault shares); claim events do not carry shares so it is undefined for that kind. */
  shares?: bigint
  /** Best-effort timestamp from the block; resolved lazily, may be undefined initially. */
  timestamp?: bigint
}

interface UseVaultActivityParams {
  vaultAddress: Address | undefined
  userAddress: Address | undefined
  /** Number of recent blocks to scan. Default 100k — covers ~14 days on a 12s chain. */
  fromBlockOffset?: bigint
}

const DEPOSIT_EVENT = parseAbiItem(
  'event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)',
)
const WITHDRAWAL_QUEUED_EVENT = parseAbiItem(
  'event WithdrawalQueued(address indexed user, uint256 indexed requestId, uint256 shares, uint256 assets, uint256 maturesAt)',
)
const WITHDRAWAL_CLAIMED_EVENT = parseAbiItem(
  'event WithdrawalClaimed(address indexed user, uint256 indexed requestId, uint256 assets)',
)

/**
 * Fetches the user's deposit + withdrawal history directly from the chain via
 * `eth_getLogs`. No indexer dependency — works on anvil and mainnet alike.
 *
 * Returns events sorted newest-first. The block scan window is bounded by
 * `fromBlockOffset` (default 100k blocks ≈ 14 days @ 12s/block) so we don't
 * wedge a public RPC. Block timestamps are resolved on demand by `getBlock`
 * lookups for unique block numbers.
 */
export function useVaultActivity({
  vaultAddress,
  userAddress,
  fromBlockOffset = 100_000n,
}: UseVaultActivityParams) {
  const client = usePublicClient()

  const enabled = !!client && !!vaultAddress && !!userAddress

  return useQuery<VaultActivityEntry[]>({
    queryKey: [
      'vault-activity',
      vaultAddress,
      userAddress,
      String(fromBlockOffset),
    ],
    enabled,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!client || !vaultAddress || !userAddress) return []

      const head = await client.getBlockNumber()
      const fromBlock =
        head > fromBlockOffset ? head - fromBlockOffset : 0n

      const [depositLogs, queuedLogs, claimedLogs] = await Promise.all([
        client.getLogs({
          address: vaultAddress,
          event: DEPOSIT_EVENT,
          args: { owner: userAddress },
          fromBlock,
          toBlock: head,
        }),
        client.getLogs({
          address: vaultAddress,
          event: WITHDRAWAL_QUEUED_EVENT,
          args: { user: userAddress },
          fromBlock,
          toBlock: head,
        }),
        client.getLogs({
          address: vaultAddress,
          event: WITHDRAWAL_CLAIMED_EVENT,
          args: { user: userAddress },
          fromBlock,
          toBlock: head,
        }),
      ])

      const entries: VaultActivityEntry[] = []
      for (const log of depositLogs) {
        const a = log.args
        if (a.assets === undefined || a.shares === undefined) continue
        entries.push({
          kind: 'deposit',
          blockNumber: log.blockNumber!,
          txHash: log.transactionHash!,
          assets: a.assets,
          shares: a.shares,
        })
      }
      for (const log of queuedLogs) {
        const a = log.args
        if (a.assets === undefined || a.shares === undefined) continue
        entries.push({
          kind: 'withdraw-queued',
          blockNumber: log.blockNumber!,
          txHash: log.transactionHash!,
          assets: a.assets,
          shares: a.shares,
        })
      }
      for (const log of claimedLogs) {
        const a = log.args
        if (a.assets === undefined) continue
        entries.push({
          kind: 'withdraw-claimed',
          blockNumber: log.blockNumber!,
          txHash: log.transactionHash!,
          assets: a.assets,
        })
      }

      // Resolve block timestamps for unique blocks (cheap on most RPCs)
      const uniqueBlocks = [...new Set(entries.map((e) => e.blockNumber))]
      const blockTimes = new Map<bigint, bigint>()
      await Promise.all(
        uniqueBlocks.map(async (bn) => {
          try {
            const block = await client.getBlock({ blockNumber: bn })
            blockTimes.set(bn, block.timestamp)
          } catch {
            /* leave timestamp undefined */
          }
        }),
      )
      for (const e of entries) {
        e.timestamp = blockTimes.get(e.blockNumber)
      }

      // Newest first
      return entries.sort((a, b) =>
        a.blockNumber === b.blockNumber ? 0 : a.blockNumber < b.blockNumber ? 1 : -1,
      )
    },
  })
}
