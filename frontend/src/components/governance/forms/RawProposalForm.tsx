import { useState } from 'react'
import { isAddress, type Address, type Hex } from 'viem'

import { Button, Card, Disclosure, FormField, Input, Notice } from '../../ui'
import { useCreateProposal } from '../../../hooks/useCreateProposal'
import { humanizeError, humanizeStep } from './lib'

interface RawAction {
  target: string
  value: string
  calldata: string
}

const EMPTY_ACTION: RawAction = { target: '', value: '0', calldata: '0x' }

export interface RawProposalFormProps {
  governor: Address
  onSuccess?: (proposalId?: string) => void
}

/**
 * Raw / freeform proposal — escape hatch for treasury moves and any action
 * not covered by the curated templates. The user types target, value, and
 * calldata for one or more actions; the form posts directly to
 * Governor.propose() with no client-side decoding.
 */
export function RawProposalForm({ governor, onSuccess }: RawProposalFormProps) {
  const [actions, setActions] = useState<RawAction[]>([{ ...EMPTY_ACTION }])
  const [description, setDescription] = useState('')
  const flow = useCreateProposal(governor, { onConfirmed: onSuccess })

  function updateAction(i: number, patch: Partial<RawAction>) {
    setActions((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  }

  const allValid = actions.every(
    (a) => isAddress(a.target) && /^\d+$/.test(a.value) && /^0x[0-9a-fA-F]*$/.test(a.calldata),
  )
  const canSubmit =
    allValid
    && description.trim().length > 0
    && (flow.step === 'idle' || flow.step === 'error')

  return (
    <form
      className="ds-stack ds-stack-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit) return
        flow.propose({
          targets: actions.map((a) => a.target as Address),
          values: actions.map((a) => BigInt(a.value)),
          calldatas: actions.map((a) => a.calldata as Hex),
          description: description.trim(),
        })
      }}
    >
      <Notice tone="info" size="sm">
        Escape hatch — the Governor calls each action through the Timelock as
        <code>msg.sender</code>. Use this for treasury moves or any action not
        covered by the curated templates.
      </Notice>

      <div className="ds-stack ds-stack-2">
        {actions.map((a, i) => {
          const targetOk = !a.target || isAddress(a.target)
          const valueOk = !a.value || /^\d+$/.test(a.value)
          const calldataOk = !a.calldata || /^0x[0-9a-fA-F]*$/.test(a.calldata)
          return (
            <Card key={i} density="compact">
              <div
                className="ds-row"
                style={{ alignItems: 'baseline', gap: 8, marginBottom: 'var(--space-2)' }}
              >
                <span className="ds-subtle">action #{i}</span>
                <span style={{ flex: 1 }} />
                {actions.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setActions((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div className="ds-stack ds-stack-2">
                <FormField
                  label="Target"
                  required
                  error={a.target && !targetOk ? 'Not a valid address' : undefined}
                >
                  <Input
                    placeholder="0x…"
                    value={a.target}
                    onChange={(e) => updateAction(i, { target: e.target.value })}
                    tone={targetOk ? 'neutral' : 'danger'}
                  />
                </FormField>
                <FormField
                  label="Value (wei)"
                  helper="ETH forwarded with the call. 0 for token-only actions."
                  error={a.value && !valueOk ? 'Must be a non-negative integer' : undefined}
                >
                  <Input
                    placeholder="0"
                    value={a.value}
                    onChange={(e) => updateAction(i, { value: e.target.value })}
                    inputMode="numeric"
                    tone={valueOk ? 'neutral' : 'danger'}
                  />
                </FormField>
                <FormField
                  label="Calldata"
                  required
                  helper="Encoded function call (e.g. 0xa9059cbb… for transfer)."
                  error={a.calldata && !calldataOk ? 'Must be hex (0x…)' : undefined}
                >
                  <Input
                    placeholder="0x"
                    value={a.calldata}
                    onChange={(e) => updateAction(i, { calldata: e.target.value })}
                    tone={calldataOk ? 'neutral' : 'danger'}
                  />
                </FormField>
              </div>
            </Card>
          )
        })}
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setActions((prev) => [...prev, { ...EMPTY_ACTION }])}
          >
            + Add action
          </Button>
        </div>
      </div>

      <FormField
        label="Description"
        required
        helper="Stored on-chain. The first line is shown as the proposal title on /governance."
      >
        <textarea
          className="ds-textarea"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this proposal do, and why?"
        />
      </FormField>

      {flow.step === 'error' && flow.error && (
        <div className="ds-stack ds-stack-2">
          <Notice tone="danger">{humanizeError('proposal', flow.error)}</Notice>
          <Disclosure label="Technical detail">
            <pre className="ds-mono-num" style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 'var(--text-xs)' }}>
              {flow.error.message}
            </pre>
          </Disclosure>
        </div>
      )}
      {flow.step === 'confirming' && flow.txHash && (
        <Notice tone="info" size="sm">
          Waiting for confirmation… tx <code>{flow.txHash}</code>
        </Notice>
      )}
      {flow.step === 'confirmed' && (
        <Notice tone="success">Proposal submitted. Redirecting…</Notice>
      )}

      <div className="ds-row" style={{ gap: 'var(--space-2)' }}>
        <Button type="submit" variant="primary" disabled={!canSubmit}>
          {flow.step === 'idle' || flow.step === 'error'
            ? 'Submit raw proposal'
            : humanizeStep(flow.step)}
        </Button>
      </div>
    </form>
  )
}
