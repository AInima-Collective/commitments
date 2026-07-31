import { type Address, type Hex, encodeAbiParameters } from 'viem'

/**
 * v2 distribution-strategy binding encoders.
 *
 * A `StrategyBinding` is `{ strategy, params }` where `params` is the
 * strategy-specific ABI-encoded config the manager forwards verbatim to the
 * strategy's `onCommitmentCreated`. This module is the single place that knows
 * each strategy's param schema, so the create-commitment flows never hand-roll
 * `encodeAbiParameters`.
 *
 * - IndexAppreciationYield: `abi.encode(uint16 yieldShareBps)` — the share of
 *   backing appreciation routed to the counterparty (0–10000). No pre-funding;
 *   accrual comes from the encumbered backing itself.
 * - FlatFeeAtCreate: `abi.encode(uint256 fee)` in backing-token units. Requires
 *   the strategy escrow to be pre-funded via `manager.fundStrategy(strategy,
 *   token, fee)` before creation, else `onCommitmentCreated` reverts
 *   `FeeNotFunded`.
 */

/** ABI-encode the IndexAppreciationYield param (`uint16 yieldShareBps`). */
export function encodeIndexYieldParams(yieldShareBps: number): Hex {
  return encodeAbiParameters([{ type: 'uint16' }], [yieldShareBps])
}

/** ABI-encode the FlatFeeAtCreate param (`uint256 fee`, backing-token units). */
export function encodeFlatFeeParams(fee: bigint): Hex {
  return encodeAbiParameters([{ type: 'uint256' }], [fee])
}

export interface StrategyBinding {
  strategy: Address
  params: Hex
}

/** A user's strategy choices in the create-commitment form. */
export interface StrategyChoices {
  /** When > 0, bind IndexAppreciationYield routing this bps share to the counterparty. */
  yieldShareBps?: number
  /** When > 0, bind FlatFeeAtCreate charging this fee (backing-token units). */
  flatFee?: bigint
}

/** Resolved strategy addresses for the connected chain (from config). */
export interface StrategyAddresses {
  indexYieldStrategy: Address | undefined
  flatFeeStrategy: Address | undefined
}

/**
 * Translate the user's choices + the chain's strategy addresses into the
 * `StrategyBinding[]` the manager's `createCommitment` expects. Choices whose
 * strategy address is unconfigured, or whose value is non-positive, are
 * silently dropped (the create call still succeeds as a plain commitment).
 */
export function buildStrategyBindings(
  choices: StrategyChoices,
  addrs: StrategyAddresses,
): StrategyBinding[] {
  const bindings: StrategyBinding[] = []
  if (
    choices.yieldShareBps !== undefined &&
    choices.yieldShareBps > 0 &&
    addrs.indexYieldStrategy
  ) {
    bindings.push({
      strategy: addrs.indexYieldStrategy,
      params: encodeIndexYieldParams(choices.yieldShareBps),
    })
  }
  if (choices.flatFee !== undefined && choices.flatFee > 0n && addrs.flatFeeStrategy) {
    bindings.push({
      strategy: addrs.flatFeeStrategy,
      params: encodeFlatFeeParams(choices.flatFee),
    })
  }
  return bindings
}
