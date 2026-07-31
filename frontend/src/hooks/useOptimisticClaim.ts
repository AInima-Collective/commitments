import { erc20Abi, type Address } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'

import { optimisticInsuranceArbiterAbi } from '../abi/optimisticInsuranceArbiterAbi'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

/**
 * Numeric values map to OptimisticInsuranceArbiter.ClaimState in the same
 * order — `None=0` through `Cancelled=5` — so the contract's `uint8` reads
 * line up directly. (Resolution is timeout-only; the former `Escalated`
 * state was removed.)
 */
export type ClaimState =
  | 'None'
  | 'Proposed'
  | 'Resolved'
  | 'Forfeiture'
  | 'Settled'
  | 'Cancelled'

const CLAIM_STATE_LABELS: ClaimState[] = [
  'None',
  'Proposed',
  'Resolved',
  'Forfeiture',
  'Settled',
  'Cancelled',
]

export function claimStateLabel(state: number): ClaimState {
  return CLAIM_STATE_LABELS[state] ?? 'None'
}

export interface BondEntry {
  asserter: Address
  amountBps: number
  bond: bigint
}

export interface OptimisticClaim {
  claimId: bigint
  commitmentId: bigint
  state: ClaimState
  winningAmtBps: number
  lastBondAt: bigint
  templateId: `0x${string}`
  stack: BondEntry[]
  /** Top-of-stack convenience accessor — empty when stack is empty. */
  top?: BondEntry
  /** `lastBondAt + answerTimeout` — when finalize-by-timeout becomes legal. */
  answerDeadline: bigint
  /** `answerDeadline + CLAIM_STALE_TTL` — when cancelStaleClaim becomes legal. */
  staleDeadline: bigint
}

export interface OptimisticArbiterConfig {
  manager: Address
  bondToken: Address
  bondSymbol?: string
  bondDecimals?: number
  minBond: bigint
  answerTimeout: bigint
  fallbackArbitrator: Address
  /** Convenience: true iff fallback != zero. */
  fallbackEnabled: boolean
  winnerShareBps: number
  treasury: Address
  staleTtl: bigint
  maxBondDoublings: number
}

interface UseOptimisticClaimResult {
  claim: OptimisticClaim | undefined
  config: OptimisticArbiterConfig | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Read all the state needed to render `/claims/:id` for a single
 * OptimisticInsuranceArbiter:
 *
 *   - The claim itself (`getClaim`) — bond stack, state, fee escrow.
 *   - The top-of-stack convenience accessor (`getBondStackTop`) — used to
 *     surface the answer deadline without re-deriving from `lastBondAt`.
 *   - Per-arbiter constants (`minBond`, `answerTimeout`, `fallbackArbitrator`,
 *     `winnerShareBps`, `treasury`, `CLAIM_STALE_TTL`, `MAX_BOND_DOUBLINGS`).
 *   - Bond-token symbol + decimals — needed everywhere we render a bond
 *     amount.
 *
 * The hook is intentionally scoped to a single arbiter address. If the
 * site ever surfaces multiple OptimisticInsuranceArbiter deployments at
 * once, the caller passes the address; today the routing layer reads it
 * from `getContractAddresses(chainId).optimisticInsuranceArbiter`.
 */
export function useOptimisticClaim(
  arbiterAddress: Address | undefined,
  claimId: bigint | undefined,
): UseOptimisticClaimResult {
  const enabled = !!arbiterAddress && claimId !== undefined && claimId > 0n

  const claimRead = useReadContract({
    abi: optimisticInsuranceArbiterAbi,
    address: arbiterAddress,
    functionName: 'getClaim',
    args: enabled && claimId !== undefined ? [claimId] : undefined,
    query: { enabled },
  })

  const topRead = useReadContract({
    abi: optimisticInsuranceArbiterAbi,
    address: arbiterAddress,
    functionName: 'getBondStackTop',
    args: enabled && claimId !== undefined ? [claimId] : undefined,
    query: { enabled },
  })

  const arbiterContract = arbiterAddress
    ? ({ abi: optimisticInsuranceArbiterAbi, address: arbiterAddress } as const)
    : undefined

  const configRead = useReadContracts({
    contracts: arbiterContract
      ? [
          { ...arbiterContract, functionName: 'manager' },
          { ...arbiterContract, functionName: 'bondToken' },
          { ...arbiterContract, functionName: 'minBond' },
          { ...arbiterContract, functionName: 'answerTimeout' },
          { ...arbiterContract, functionName: 'winnerShareBps' },
          { ...arbiterContract, functionName: 'treasury' },
          { ...arbiterContract, functionName: 'CLAIM_STALE_TTL' },
          { ...arbiterContract, functionName: 'MAX_BOND_DOUBLINGS' },
        ]
      : [],
    query: { enabled: !!arbiterContract },
  })

  const bondTokenAddress =
    configRead.data?.[1]?.status === 'success'
      ? (configRead.data[1].result as Address)
      : undefined
  const bondMetaContract = bondTokenAddress
    ? ({ abi: erc20Abi, address: bondTokenAddress } as const)
    : undefined
  const bondMeta = useReadContracts({
    contracts: bondMetaContract
      ? [
          { ...bondMetaContract, functionName: 'symbol' },
          { ...bondMetaContract, functionName: 'decimals' },
        ]
      : [],
    query: { enabled: !!bondMetaContract },
  })

  const isLoading =
    (enabled && (claimRead.isLoading || topRead.isLoading)) ||
    configRead.isLoading ||
    bondMeta.isLoading

  const error =
    (claimRead.error as Error | null) ??
    (topRead.error as Error | null) ??
    (configRead.error as Error | null) ??
    (bondMeta.error as Error | null) ??
    null

  const claimRaw = claimRead.data as
    | {
        commitmentId: bigint
        winningAmtBps: number
        lastBondAt: bigint
        state: number
        templateId: `0x${string}`
        stack: { asserter: Address; amountBps: number; bond: bigint }[]
      }
    | undefined

  const topRaw = topRead.data as
    | readonly [Address, number, bigint, bigint] // asserter, amountBps, bond, deadline
    | undefined

  const config: OptimisticArbiterConfig | undefined = (() => {
    if (!arbiterAddress) return undefined
    const data = configRead.data as
      | readonly { status: string; result?: unknown; error?: unknown }[]
      | undefined
    if (!data || data.length < 8 || !data.every((r) => r.status === 'success')) {
      return undefined
    }
    return {
      manager: data[0].result as Address,
      bondToken: data[1].result as Address,
      bondSymbol:
        bondMeta.data?.[0]?.status === 'success'
          ? (bondMeta.data[0].result as string)
          : undefined,
      bondDecimals:
        bondMeta.data?.[1]?.status === 'success'
          ? Number(bondMeta.data[1].result)
          : undefined,
      minBond: data[2].result as bigint,
      answerTimeout: data[3].result as bigint,
      // Fallback-arbitrator escalation was removed; resolution is timeout-only.
      // These fields are retained for the config shape but are always inert.
      fallbackArbitrator: ZERO_ADDRESS,
      fallbackEnabled: false,
      winnerShareBps: Number(data[4].result),
      treasury: data[5].result as Address,
      staleTtl: data[6].result as bigint,
      maxBondDoublings: Number(data[7].result),
    }
  })()

  const claim: OptimisticClaim | undefined =
    claimId !== undefined && claimRaw && config
      ? {
          claimId,
          commitmentId: claimRaw.commitmentId,
          state: claimStateLabel(Number(claimRaw.state)),
          winningAmtBps: Number(claimRaw.winningAmtBps),
          lastBondAt: claimRaw.lastBondAt,
          templateId: claimRaw.templateId,
          stack: claimRaw.stack.map((e) => ({
            asserter: e.asserter,
            amountBps: Number(e.amountBps),
            bond: e.bond,
          })),
          top: topRaw && topRaw[0] !== ZERO_ADDRESS
            ? { asserter: topRaw[0], amountBps: Number(topRaw[1]), bond: topRaw[2] }
            : undefined,
          answerDeadline: claimRaw.lastBondAt + config.answerTimeout,
          staleDeadline: claimRaw.lastBondAt + config.answerTimeout + config.staleTtl,
        }
      : undefined

  function refetch() {
    claimRead.refetch()
    topRead.refetch()
    configRead.refetch()
    bondMeta.refetch()
  }

  return { claim, config, isLoading, error, refetch }
}
