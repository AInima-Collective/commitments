import { Notice } from '../ui'
import type { StepDescriptor } from './depositSteps'

/** One or two stepper rows. */
export function DepositStepper({ steps }: { steps: (StepDescriptor | null)[] }) {
  return (
    <div className="ds-stepper">
      {steps.map(
        (s, i) =>
          s && (
            <Notice key={i} tone={s.tone} size="sm" icon={s.glyph}>
              {s.label}
            </Notice>
          ),
      )}
    </div>
  )
}
