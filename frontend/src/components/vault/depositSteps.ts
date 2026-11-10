// Stepper tone resolution per UI-SPEC §Stepper.
type StepTone = 'neutral' | 'info' | 'success' | 'danger'
type StepGlyph = '[ ]' | '[…]' | '[✓]' | '[!]'

export interface StepDescriptor {
  tone: StepTone
  glyph: StepGlyph
  label: string
}

/** The deposit-hop steps the stepper understands (vault deposit or manager deposit). */
type DepositHopStep = 'idle' | 'approving' | 'approved' | 'signing' | 'depositing' | 'complete' | 'error' | 'withdrawing'

/**
 * Stepper descriptors for one deposit hop: "STEP 1 OF 2 — APPROVE" →
 * "STEP 2 OF 2 — DEPOSIT", collapsing to "STEP 1 OF 1 — DEPOSIT" when
 * `oneStep` (allowance covers the amount, or a permit self-authorizes).
 */
export function deriveDepositSteps(
  step: DepositHopStep,
  oneStep: boolean,
): { step1: StepDescriptor; step2: StepDescriptor | null } {
  if (oneStep) {
    if (step === 'signing') return { step1: { tone: 'info', glyph: '[…]', label: 'STEP 1 OF 1 — SIGNING PERMIT…' }, step2: null }
    if (step === 'depositing') return { step1: { tone: 'info', glyph: '[…]', label: 'STEP 1 OF 1 — DEPOSITING…' }, step2: null }
    if (step === 'complete') return { step1: { tone: 'success', glyph: '[✓]', label: 'DEPOSIT COMPLETE' }, step2: null }
    if (step === 'error') return { step1: { tone: 'danger', glyph: '[!]', label: 'STEP 1 OF 1 — DEPOSIT' }, step2: null }
    return { step1: { tone: 'info', glyph: '[ ]', label: 'STEP 1 OF 1 — DEPOSIT' }, step2: null }
  }

  switch (step) {
    case 'approving':
      return {
        step1: { tone: 'info', glyph: '[…]', label: 'STEP 1 OF 2 — APPROVING…' },
        step2: { tone: 'neutral', glyph: '[ ]', label: 'STEP 2 OF 2 — DEPOSIT' },
      }
    case 'approved':
      return {
        step1: { tone: 'success', glyph: '[✓]', label: 'STEP 1 OF 2 — APPROVE' },
        step2: { tone: 'info', glyph: '[ ]', label: 'STEP 2 OF 2 — DEPOSIT' },
      }
    case 'depositing':
      return {
        step1: { tone: 'success', glyph: '[✓]', label: 'STEP 1 OF 2 — APPROVE' },
        step2: { tone: 'info', glyph: '[…]', label: 'STEP 2 OF 2 — DEPOSITING…' },
      }
    case 'complete':
      return {
        step1: { tone: 'success', glyph: '[✓]', label: 'STEP 1 OF 2 — APPROVE' },
        step2: { tone: 'success', glyph: '[✓]', label: 'DEPOSIT COMPLETE' },
      }
    case 'error':
      return {
        step1: { tone: 'danger', glyph: '[!]', label: 'STEP 1 OF 2 — APPROVE' },
        step2: { tone: 'neutral', glyph: '[ ]', label: 'STEP 2 OF 2 — DEPOSIT' },
      }
    default:
      return {
        step1: { tone: 'info', glyph: '[ ]', label: 'STEP 1 OF 2 — APPROVE' },
        step2: { tone: 'neutral', glyph: '[ ]', label: 'STEP 2 OF 2 — DEPOSIT' },
      }
  }
}
