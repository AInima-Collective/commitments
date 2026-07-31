import type { CommitmentStatus } from './Status'
import type { LifecycleStep } from './LifecycleStepper'

/**
 * Map a CommitmentStatus to the canonical four-step lifecycle visualization:
 * created → active → challenge → terminal (released | forfeited | expired).
 *
 * UNBONDING is treated as an in-flight pre-terminal: active is done, challenge
 * stays inactive (we never went through it), and the terminal label flips to
 * "release pending" with an `active` (in-progress) tone so the user reads it
 * as "release is happening, just waiting for the unbonding window to elapse."
 */
export function commitmentLifecycle(status: CommitmentStatus): LifecycleStep[] {
  const proposed: LifecycleStep = {
    label: 'created',
    state: status === 'PROPOSED' ? 'active' : 'done',
  }
  const active: LifecycleStep = {
    label: 'active',
    // An ACTIVE commitment is in a healthy, settled state — surface it green
    // (success) rather than the amber "in-progress" accent.
    state:
      status === 'ACTIVE' ? 'success'
      : status === 'PROPOSED' ? 'inactive'
      : 'done',
  }
  const challenge: LifecycleStep = {
    label: 'challenge',
    state:
      status === 'FORFEIT_PENDING' ? 'warn'
      : status === 'FORFEITED' ? 'done'
      : 'inactive',
  }
  const terminalLabel =
    status === 'FORFEITED' ? 'forfeited'
    : status === 'EXPIRED' ? 'expired'
    : status === 'UNBONDING' ? 'release pending'
    : 'released'
  const terminal: LifecycleStep = {
    label: terminalLabel,
    state:
      status === 'FORFEITED' ? 'error'
      : status === 'EXPIRED' ? 'warn'
      : status === 'RELEASED' ? 'success'
      : status === 'UNBONDING' ? 'active'
      : 'inactive',
  }
  return [proposed, active, challenge, terminal]
}
