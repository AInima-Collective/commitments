export type LifecycleStepState = 'done' | 'active' | 'inactive' | 'success' | 'error' | 'warn'

export interface LifecycleStep {
  label: string
  state: LifecycleStepState
}

export interface LifecycleStepperProps {
  steps: LifecycleStep[]
}

function lineToneFor(prev: LifecycleStepState): string {
  if (prev === 'done') return 'ds-lifecycle-line--done'
  if (prev === 'success') return 'ds-lifecycle-line--success'
  if (prev === 'error') return 'ds-lifecycle-line--error'
  if (prev === 'warn') return 'ds-lifecycle-line--warn'
  return ''
}

export function LifecycleStepper({ steps }: LifecycleStepperProps) {
  return (
    <div className="ds-lifecycle">
      {steps.map((step, i) => (
        <span
          key={`${step.label}-${i}`}
          className="ds-row"
          style={{ flex: i === steps.length - 1 ? '0 0 auto' : '1 1 auto', alignItems: 'flex-start' }}
        >
          <span className={`ds-lifecycle-step ds-lifecycle-step--${step.state}`}>
            <span className="ds-lifecycle-step-dot" />
            <span className="ds-lifecycle-step-label">{step.label}</span>
          </span>
          {i < steps.length - 1 && (
            <span className={`ds-lifecycle-line ${lineToneFor(step.state)}`} />
          )}
        </span>
      ))}
    </div>
  )
}
