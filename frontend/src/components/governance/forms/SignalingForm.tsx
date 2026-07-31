import { useState } from 'react'
import type { Address } from 'viem'

import { Button, FormField, Input, Notice } from '../../ui'
import { useCreateProposal } from '../../../hooks/useCreateProposal'
import { humanizeStep, humanizeError } from './lib'

export interface SignalingFormProps {
  governor: Address
  timelock: Address
  onSuccess?: (proposalId?: string) => void
}

/**
 * Signaling proposal: target = timelock, value = 0, calldata = "0x". The
 * timelock's receive() makes the empty call a true no-op; the description
 * carries the signal. Indexer's decoder classifies this kind=signaling.
 */
export function SignalingForm({ governor, timelock, onSuccess }: SignalingFormProps) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const flow = useCreateProposal(governor, { onConfirmed: onSuccess })
  const canSubmit =
    title.trim().length > 0 && (flow.step === 'idle' || flow.step === 'error')

  return (
    <form
      className="ds-stack ds-stack-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit) return
        flow.propose({
          targets: [timelock],
          values: [0n],
          calldatas: ['0x'],
          description: `[Signal] ${title.trim()}${body.trim() ? `\n\n${body.trim()}` : ''}`,
        })
      }}
    >
      <FormField
        label="Title"
        required
        helper={`Prefixed with [Signal] when stored on-chain. Visible on /governance.`}
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Adopt risk tier metadata schema v1"
        />
      </FormField>
      <FormField
        label="Body"
        helper="Optional context (markdown). Stored on-chain as part of the description."
      >
        <textarea
          className="ds-textarea"
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Why this signal? What changes if the DAO endorses it?"
        />
      </FormField>
      {flow.step === 'error' && flow.error && (
        <Notice tone="danger">{humanizeError('proposal', flow.error)}</Notice>
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
            ? 'Submit signal'
            : humanizeStep(flow.step)}
        </Button>
      </div>
    </form>
  )
}
