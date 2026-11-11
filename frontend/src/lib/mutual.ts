import { type Address, type Hex, zeroHash } from 'viem'


/**
 * Mutual lifecycle. Driven by the mutual header's `active` / `terminal` flags
 * plus the live derived state (a bonded loss under challenge, or members still
 * owing markdown after execution). Pages must not invent ad-hoc colors for
 * these states.
 *
 * - `pending`     — registered but not yet activated.
 * - `active`      — open and covering. Members still settling owed markdown
 *                   after an executed loss stay `active` (the pool keeps
 *                   covering); the owed-markdown footnote carries that nuance
 *                   rather than a distinct badge.
 * - `loss-pending`— a bonded loss is in its challenge window; capacity frozen.
 * - `terminated`  — terminal; no new losses can be initiated.
 */
export type MutualLifecycle =
  | 'pending'
  | 'active'
  | 'loss-pending'
  | 'terminated'

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
    metadataHash: zeroHash,
  }
}
