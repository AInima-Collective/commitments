import type { ArbiterCommitment } from '../hooks/useArbiterCommitments'
import {
  calculateForfeitEnforcement,
  type ManagerPauseSnapshot,
} from './forfeitEnforcement'

export type ArbiterQueueBucket = 'executable' | 'pending' | 'active' | 'other'

/** Pure, live-state-aware bucketing used by the connected arbiter inbox. */
export function bucketForArbiterInbox(
  commitment: ArbiterCommitment,
  nowSec: bigint,
  pauseState: ManagerPauseSnapshot | undefined,
  ttl: bigint | undefined,
): ArbiterQueueBucket {
  if (commitment.status === 'FORFEIT_PENDING') {
    const enforcement = calculateForfeitEnforcement({
      proposal: commitment.forfeitProposal,
      challengeWindow: commitment.challengeWindow,
      pauseState,
      proposalTtl: ttl,
      now: nowSec,
    })
    return enforcement.executionAvailable || enforcement.staleCancellationAvailable
      ? 'executable'
      : 'pending'
  }
  if (commitment.status === 'ACTIVE') return 'active'
  return 'other'
}
