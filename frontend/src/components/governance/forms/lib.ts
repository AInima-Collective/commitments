/**
 * Shared helpers for the four governance proposal forms.
 *
 * - `humanizeStep` translates the wagmi step machine into UI copy.
 * - `humanizeError` reduces wagmi/viem error stacks to a one-sentence
 *   summary; the technical message can still be inspected via Disclosure.
 * - `bpsToPercent` mirrors the BPS_DENOMINATOR convention used across the
 *   protocol (10000 bps = 100%).
 */
import type { ProposalStep } from '../../../hooks/useCreateProposal'

export function humanizeStep(step: ProposalStep): string {
  switch (step) {
    case 'idle':
      return 'Submit'
    case 'signing':
      return 'Sign in wallet…'
    case 'confirming':
      return 'Confirming on-chain…'
    case 'confirmed':
      return 'Submitted'
    case 'error':
      return 'Failed'
  }
}

const ACTION_LABELS: Record<string, string> = {
  proposal: 'submit the proposal',
  vote: 'cast the vote',
  queue: 'queue the proposal',
  execute: 'execute the proposal',
}

export function humanizeError(action: keyof typeof ACTION_LABELS, err: Error): string {
  const verb = ACTION_LABELS[action] ?? 'submit the action'
  // Strip the noisy wagmi prefixes so the user sees the on-chain
  // reason (revert string / panic / out of gas) first. The full message
  // is still surfaced via the form's Disclosure for technical debugging.
  const raw = err.message ?? ''
  const lines = raw.split('\n').map((s) => s.trim()).filter(Boolean)
  const head =
    lines.find((l) => l.startsWith('Reason:'))?.replace(/^Reason:\s*/, '') ??
    lines.find((l) => /reverted|panic|out of gas|user rejected/i.test(l)) ??
    lines[0] ??
    'unknown error'
  return `Couldn't ${verb}: ${head}`
}

export function bpsToPercent(bps: string | number): string {
  const n = typeof bps === 'number' ? bps : Number(bps)
  if (!Number.isFinite(n) || n < 0) return '—'
  return `${(n / 100).toFixed(2)}%`
}
