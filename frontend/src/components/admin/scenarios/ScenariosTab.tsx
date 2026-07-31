import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Input, Notice } from '../../ui'
import { SCENARIOS } from './library'
import { useScenarioRunner } from './runner'
import {
  SCENARIO_CATEGORIES,
  type Scenario,
  type ScenarioCategory,
  type ScenarioStep,
  type StepResult,
} from './types'
import { truncateAddress } from '../../../lib/format'

const STATUS_GLYPH: Record<StepResult['status'], string> = {
  pending: '○',
  running: '⟳',
  success: '✓',
  error: '✗',
  skipped: '·',
}

function describeStep(step: ScenarioStep): string {
  if (step.kind === 'time') {
    const parts: string[] = []
    if (step.advance) parts.push(`advance ${step.advance}s`)
    if (step.mine) parts.push(`mine ${step.mine}`)
    return parts.join(' + ') || 'no-op'
  }
  if (step.kind === 'switch') {
    return `wallet := ${step.actor}`
  }
  return `as ${step.actor}`
}

const SCENARIOS_BY_CATEGORY: Record<ScenarioCategory, Scenario[]> = SCENARIO_CATEGORIES.reduce(
  (acc, cat) => {
    acc[cat.id] = SCENARIOS.filter((s) => s.category === cat.id)
    return acc
  },
  {} as Record<ScenarioCategory, Scenario[]>,
)

export function ScenariosTab() {
  const runner = useScenarioRunner()
  const [selectedId, setSelectedId] = useState<string>(SCENARIOS[0]?.id ?? '')
  const scenario = useMemo<Scenario | undefined>(
    () => SCENARIOS.find((s) => s.id === selectedId),
    [selectedId],
  )

  const [inputValues, setInputValues] = useState<Record<string, string>>({})

  // Reset inputs + preview ONLY when the selected scenario changes. Input edits
  // do NOT trigger a re-preview — that would wipe the post-run results panel.
  // The actual run uses whatever inputValues happen to be at click time.
  useEffect(() => {
    if (!scenario) return
    const defaults = Object.fromEntries(
      (scenario.inputs ?? []).map((i) => [i.key, i.defaultValue]),
    )
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing form state to selected scenario; see frontend/docs/eslint-disable-rationale.md §Pattern-1
    setInputValues(defaults)
    runner.preview(scenario, defaults)
    // runner.preview is stable (useCallback with []), but we keep it out of deps
    // to avoid any chance of a preview→state→preview loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario])

  if (!SCENARIOS.length) {
    return (
      <Notice tone="neutral">
        No scenarios defined yet. Add one to <code>components/admin/scenarios/library.ts</code>.
      </Notice>
    )
  }

  return (
    <div className="ds-stack ds-stack-4">
      <Notice tone="info" size="sm" title="What is a scenario?">
        A scenario is a multi-step script that takes the protocol through a real lifecycle
        flow — deposit, commit, forfeit, agree, etc. Pick one, tweak the inputs, click
        Run. Each step shows its tx hash + receipt as it lands.
      </Notice>

      <div className="ds-scenarios-shell">
        <ScenarioPicker selectedId={selectedId} onSelect={setSelectedId} />

        <div className="ds-scenarios-detail">
          {scenario && (
            <ScenarioPanel
              scenario={scenario}
              inputs={inputValues}
              onInputChange={(key, value) =>
                setInputValues((prev) => ({ ...prev, [key]: value }))
              }
              onRun={() => runner.run(scenario, inputValues)}
              onReset={runner.reset}
              isRunning={runner.state.isRunning}
              results={runner.state.results}
              steps={runner.state.steps}
              vars={runner.state.vars}
            />
          )}
        </div>
      </div>
    </div>
  )
}

interface ScenarioPickerProps {
  selectedId: string
  onSelect: (id: string) => void
}

function ScenarioPicker({ selectedId, onSelect }: ScenarioPickerProps) {
  return (
    <nav
      className="ds-scenarios-sidebar"
      aria-label="Scenarios"
      role="tablist"
      aria-orientation="vertical"
    >
      {SCENARIO_CATEGORIES.map((cat) => {
        const items = SCENARIOS_BY_CATEGORY[cat.id]
        if (!items.length) return null
        return (
          <div key={cat.id} className="ds-scenarios-group">
            <div className="ds-scenarios-group-label">{cat.label}</div>
            {items.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-current={selectedId === s.id}
                aria-selected={selectedId === s.id}
                className="ds-scenarios-link"
                onClick={() => onSelect(s.id)}
                title={s.title}
              >
                {s.id}
              </button>
            ))}
          </div>
        )
      })}
    </nav>
  )
}

interface ScenarioPanelProps {
  scenario: Scenario
  inputs: Record<string, string>
  onInputChange: (key: string, value: string) => void
  onRun: () => void
  onReset: () => void
  isRunning: boolean
  results: StepResult[]
  steps: ScenarioStep[]
  vars: Record<string, unknown>
}

function ScenarioPanel({
  scenario,
  inputs,
  onInputChange,
  onRun,
  onReset,
  isRunning,
  results,
  steps,
  vars,
}: ScenarioPanelProps) {
  return (
    <Card as="section" className="ds-stack ds-stack-4">
      <header className="ds-stack ds-stack-1">
        <h3 className="ds-text-lg">{scenario.title}</h3>
        <p className="ds-text-sm ds-muted">{scenario.description}</p>
      </header>

      {scenario.inputs && scenario.inputs.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-2)',
          }}
        >
          {scenario.inputs.map((input) => (
            <label key={input.key} className="ds-stack ds-stack-1">
              <span className="ds-text-xs ds-subtle">{input.label}</span>
              <Input
                value={inputs[input.key] ?? input.defaultValue}
                onChange={(e) => onInputChange(input.key, e.target.value)}
                placeholder={input.placeholder}
                size="sm"
              />
              {input.hint && (
                <span className="ds-text-xs ds-subtle">{input.hint}</span>
              )}
            </label>
          ))}
        </div>
      )}

      <div className="ds-row ds-row-2" style={{ gap: 'var(--space-2)' }}>
        <Button variant="primary" disabled={isRunning} onClick={onRun}>
          {isRunning ? 'running…' : 'Run scenario'}
        </Button>
        <Button variant="ghost" disabled={isRunning} onClick={onReset}>
          Reset
        </Button>
      </div>

      <ol className="ds-stack ds-stack-2" style={{ paddingLeft: 0, margin: 0, listStyle: 'none' }}>
        {steps.map((step, i) => {
          const r = results[i] ?? { status: 'pending' as const }
          return <StepRow key={i} index={i} step={step} result={r} />
        })}
      </ol>

      {Object.keys(vars).length > 0 && (
        <details>
          <summary className="ds-text-xs ds-subtle" style={{ cursor: 'pointer' }}>
            Captured variables ({Object.keys(vars).length})
          </summary>
          <pre className="ds-text-xs" style={{ marginTop: 'var(--space-2)', overflow: 'auto' }}>
{JSON.stringify(
              vars,
              (_, v) => (typeof v === 'bigint' ? v.toString() : v),
              2,
            )}
          </pre>
        </details>
      )}
    </Card>
  )
}

function StepRow({
  index,
  step,
  result,
}: {
  index: number
  step: ScenarioStep
  result: StepResult
}) {
  const tone =
    result.status === 'success'
      ? 'var(--success)'
      : result.status === 'error'
      ? 'var(--error)'
      : result.status === 'running'
      ? 'var(--accent)'
      : 'var(--text-subtle)'

  const duration =
    result.startedAt && result.endedAt ? `${result.endedAt - result.startedAt}ms` : null

  return (
    <li
      className="ds-stack ds-stack-1"
      style={{
        padding: 'var(--space-2) var(--space-3)',
        border: '1px solid var(--border)',
        background: 'var(--surface-2)',
      }}
    >
      <div
        className="ds-row ds-row-2"
        style={{ alignItems: 'baseline', gap: 'var(--space-2)' }}
      >
        <span style={{ color: tone, width: '1.25em', textAlign: 'center' }}>
          {STATUS_GLYPH[result.status]}
        </span>
        <span className="ds-text-xs ds-subtle ds-mono-num" style={{ minWidth: '2em' }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <span style={{ flex: 1 }}>{step.label}</span>
        <span className="ds-text-xs ds-subtle ds-mono-num">[{step.kind}]</span>
        <span className="ds-text-xs ds-subtle">{describeStep(step)}</span>
      </div>
      {step.description && (
        <div
          className="ds-text-xs ds-subtle"
          style={{ paddingLeft: 'calc(1.25em + var(--space-4))' }}
        >
          {step.description}
        </div>
      )}
      {(result.hash || result.error || duration) && (
        <div
          className="ds-text-xs ds-subtle ds-row ds-row-2"
          style={{
            paddingLeft: 'calc(1.25em + var(--space-4))',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
          }}
        >
          {result.hash && (
            <span className="ds-mono-num" title={result.hash}>
              tx {truncateAddress(result.hash, 10, 6)}
            </span>
          )}
          {result.receipt && (
            <span className="ds-mono-num">
              block {result.receipt.blockNumber.toString()} · gas{' '}
              {result.receipt.gasUsed.toString()}
            </span>
          )}
          {duration && <span className="ds-mono-num">{duration}</span>}
          {result.error && (
            <span style={{ color: 'var(--error)' }}>{result.error.message}</span>
          )}
        </div>
      )}
    </li>
  )
}
