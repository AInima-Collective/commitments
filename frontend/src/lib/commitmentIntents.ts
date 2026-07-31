/**
 * Task-first entry points for the create-commitment form. The raw protocol
 * verbs (DELEGATE / DONATE) are jargon; these intents lead with "what do you
 * want to do?" and map to whitepaper patterns. Copy lives here (not in JSX) so
 * it is unit-testable and stays out of the component.
 */
export type CommitmentIntent = 'delegate-stake' | 'donate-yield' | 'mutual-cover' | 'custom'

export interface IntentDescriptor {
  id: CommitmentIntent
  /** Short label for the tab strip. */
  label: string
  /** Task-oriented one-liner shown under the picker. */
  blurb: string
  /** Whitepaper section, e.g. '§4'. Renders as a chip. */
  whitepaperRef: string
  /**
   * Which mode body to mount. `'redirect'` mounts no body and instead points
   * the user elsewhere (agreement creation only lives in the marketplace).
   */
  mode: 'delegate' | 'donate' | 'custom' | 'redirect'
  /** Defaults seeded into the mode body when this intent is selected. */
  defaults?: { maxPenaltyBps?: number; challengeWindowSecs?: number }
  /** Destination for `mode: 'redirect'` intents. */
  redirectTo?: string
}

/**
 * The four create-flow intents. `delegate-stake` and `donate-yield` map to the
 * existing modes; `custom` is the full-control advanced path; `mutual-cover`
 * redirects to the risk-coverage marketplace, where coverage pools live.
 */
export function getCommitmentIntents(): IntentDescriptor[] {
  return [
    {
      id: 'delegate-stake',
      label: 'Back a service',
      blurb: 'Stake to back an operator or service — forfeitable by an arbiter if you break the terms.',
      whitepaperRef: '§4',
      mode: 'delegate',
      defaults: { maxPenaltyBps: 1000, challengeWindowSecs: 86_400 },
    },
    {
      id: 'donate-yield',
      label: 'Gift yield',
      blurb: 'Stream the yield on your stake to a recipient. No forfeiture — a pure yield gift.',
      whitepaperRef: '§6.1',
      mode: 'donate',
    },
    {
      id: 'mutual-cover',
      label: 'Risk coverage',
      blurb: 'Join a coverage pool — underwrite a risk to earn premium, or buy cover to protect a position. Browse the marketplace.',
      whitepaperRef: '§6.2',
      mode: 'redirect',
      redirectTo: '/app/marketplace',
    },
    {
      id: 'custom',
      label: 'Advanced / custom',
      blurb: 'Full control over every term: arbiter, penalty, challenge window, expiry, metadata, and strategies.',
      whitepaperRef: '§5',
      mode: 'custom',
    },
  ]
}

/** Look up a single intent descriptor by id. */
export function getCommitmentIntent(id: CommitmentIntent): IntentDescriptor | undefined {
  return getCommitmentIntents().find((i) => i.id === id)
}
