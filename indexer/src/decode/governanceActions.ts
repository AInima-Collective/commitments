/**
 * Pure decoder for governance proposal actions. The Governor emits proposals
 * as parallel arrays of (target, value, calldata); this module classifies each
 * action into one of the four kinds the protocol exposes:
 *
 *   - weight_update     — TokenWeighting.updateWeight(denom, weightBps)
 *   - forfeit_arbitration — CommitmentManager.initiateForfeit | cancelForfeit
 *   - signaling         — empty calldata + zero value (no-op to timelock)
 *   - treasury          — anything else (raw calldata preserved)
 *
 * Decoding happens at index time so the proposal-detail page can render
 * human-readable action cards without round-tripping ABI decoders in the
 * browser.
 */
import { decodeFunctionData, parseAbi, type Hex } from 'viem'

const tokenWeightingAbi = parseAbi([
  'function updateWeight(bytes32 denom, uint256 weightBps)',
])

const commitmentManagerAbi = parseAbi([
  'function initiateForfeit(uint256 commitmentId, uint16 penaltyBps)',
  'function cancelForfeit(uint256 commitmentId)',
])

export type ProposalActionKind =
  | 'weight_update'
  | 'forfeit_arbitration'
  | 'treasury'
  | 'signaling'

export interface DecodedAction {
  kind: ProposalActionKind
  selector: Hex | null
  decoded: unknown // shape depends on kind; consumed as jsonb
}

export interface RawAction {
  target: Hex
  value: bigint
  calldata: Hex
}

/**
 * Decode a single proposal action. The function never throws — unknown
 * selectors fall through to the `treasury` bucket with raw calldata
 * preserved so nothing is lost.
 */
export function decodeProposalAction(action: RawAction): DecodedAction {
  // Empty calldata + zero value → signaling.
  if ((action.calldata === '0x' || action.calldata === '0x0') && action.value === 0n) {
    return { kind: 'signaling', selector: null, decoded: null }
  }

  if (action.calldata.length < 10) {
    return { kind: 'treasury', selector: null, decoded: { rawCalldata: action.calldata } }
  }

  const selector = action.calldata.slice(0, 10) as Hex

  // updateWeight(bytes32,uint256) → 0x...
  try {
    const decoded = decodeFunctionData({ abi: tokenWeightingAbi, data: action.calldata })
    if (decoded.functionName === 'updateWeight') {
      const [denom, weightBps] = decoded.args as readonly [Hex, bigint]
      return {
        kind: 'weight_update',
        selector,
        decoded: {
          tokenWeighting: action.target,
          denom,
          newWeightBps: weightBps.toString(),
        },
      }
    }
  } catch {
    // Not a TokenWeighting.updateWeight call — fall through.
  }

  try {
    const decoded = decodeFunctionData({ abi: commitmentManagerAbi, data: action.calldata })
    if (decoded.functionName === 'initiateForfeit') {
      const [commitmentId, penaltyBps] = decoded.args as readonly [bigint, number]
      return {
        kind: 'forfeit_arbitration',
        selector,
        decoded: {
          manager: action.target,
          op: 'initiateForfeit',
          commitmentId: commitmentId.toString(),
          penaltyBps,
        },
      }
    }
    if (decoded.functionName === 'cancelForfeit') {
      const [commitmentId] = decoded.args as readonly [bigint]
      return {
        kind: 'forfeit_arbitration',
        selector,
        decoded: {
          manager: action.target,
          op: 'cancelForfeit',
          commitmentId: commitmentId.toString(),
        },
      }
    }
  } catch {
    // Not a CommitmentManager call — fall through.
  }

  return {
    kind: 'treasury',
    selector,
    decoded: { rawCalldata: action.calldata },
  }
}

/**
 * Roll up an array of decoded actions into a single proposal-level kind.
 *   - All same kind → that kind
 *   - All signaling → signaling
 *   - Mixed → 'mixed'
 */
export function rollupProposalKind(actions: DecodedAction[]): ProposalActionKind | 'mixed' {
  if (actions.length === 0) return 'signaling'
  const first = actions[0].kind
  for (let i = 1; i < actions.length; i++) {
    if (actions[i].kind !== first) return 'mixed'
  }
  return first
}
