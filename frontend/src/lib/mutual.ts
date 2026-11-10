import { type Address, type Hex } from 'viem'

import { type MutualLifecycle } from '../components/protocol'
import { ZERO_HASH } from '../utils/metadataForm'

/**
 * A mutual's lifecycle badge. `hasPendingLoss` needs the per-mutual bonded-loss
 * read, which list views skip; without it the result is terminated / active /
 * pending. Members still settling a past loss stay `active`.
 */
export function mutualLifecycle(m: { terminal: boolean; active: boolean; hasPendingLoss?: boolean }): MutualLifecycle {
  if (m.terminal) return 'terminated'
  if (m.hasPendingLoss) return 'loss-pending'
  return m.active ? 'active' : 'pending'
}

/**
 * `joinMutual` params for a homogeneous join: the member posts `amount` of the
 * numeraire, fully forfeitable to the mutual's beneficiary under its arbiter
 * and challenge window, until the listing's term end (0 = open-ended).
 */
export function buildJoinMutualParams(input: {
  mutual: { arbiter: Address; beneficiary: Address; challengeWindow: bigint }
  numeraire: Address
  adapter: Address
  amount: bigint
  termEnd: bigint | undefined
}) {
  return {
    arbiter: input.mutual.arbiter,
    counterparty: input.mutual.beneficiary,
    token: input.numeraire,
    adapter: input.adapter,
    amount: input.amount,
    maxPenaltyBps: 10_000,
    challengeWindow: input.mutual.challengeWindow,
    expiresAt: input.termEnd ?? 0n,
    strategies: [] as { strategy: Address; params: Hex }[],
    metadataURI: '',
    metadataHash: ZERO_HASH,
  }
}
