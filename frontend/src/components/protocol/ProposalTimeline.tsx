import { LifecycleStepper, type LifecycleStep } from './LifecycleStepper'
import type { ProposalState } from './Status'

export interface ProposalTimelineProps {
  state: ProposalState
}

/**
 * ProposalTimeline — five-step lifecycle for an OZ Governor proposal.
 *
 * Composes the existing LifecycleStepper so the visual treatment matches
 * other phase-tracking surfaces in the app (commitment lifecycle, forfeit
 * proposal). The five steps map 1:1 to the canonical proposal lifecycle:
 *
 *   1. created      -> always done after proposal exists
 *   2. voting       -> "active" while voteStart..voteEnd; otherwise done if past
 *   3. succeeded    -> "success" if past deadline + quorum + majority for
 *   4. queued       -> "active" once queued, "done" after execution
 *   5. executed     -> "success" once executed (or "error" if defeated/canceled)
 *
 * Terminal failure states (canceled / defeated / expired) show the failure
 * step in error tone.
 */
export function ProposalTimeline({ state }: ProposalTimelineProps) {
  const steps: LifecycleStep[] = [
    { label: 'created', state: 'done' },
    {
      label: 'voting',
      state:
        state === 'pending'
          ? 'inactive'
          : state === 'active'
            ? 'active'
            : state === 'canceled' || state === 'defeated' || state === 'expired'
              ? 'error'
              : 'done',
    },
    {
      label: 'succeeded',
      state:
        state === 'pending' || state === 'active'
          ? 'inactive'
          : state === 'defeated' || state === 'canceled' || state === 'expired'
            ? 'error'
            : 'success',
    },
    {
      label: 'queued',
      state:
        state === 'queued'
          ? 'active'
          : state === 'executed'
            ? 'done'
            : state === 'expired'
              ? 'error'
              : 'inactive',
    },
    {
      label: 'executed',
      state:
        state === 'executed'
          ? 'success'
          : state === 'canceled' || state === 'defeated' || state === 'expired'
            ? 'error'
            : 'inactive',
    },
  ]
  return <LifecycleStepper steps={steps} />
}
