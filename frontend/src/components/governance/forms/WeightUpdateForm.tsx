import { useMemo, useState } from 'react'
import { encodeFunctionData, isAddress, type Address, type Hex } from 'viem'
import { useChainId } from 'wagmi'

import { Button, Card, Disclosure, FormField, Input, Notice, Select } from '../../ui'
import { ProposalActionRow } from '../../protocol'
import { useCreateProposal } from '../../../hooks/useCreateProposal'
import { useMeshNodeSecurity } from '../../../hooks/useMeshNodeSecurity'
import { tokenWeightingAbi } from '../../../generated'
import { getContractAddresses } from '../../../config/contracts'
import { bpsToPercent, humanizeError, humanizeStep } from './lib'

export interface WeightUpdateFormProps {
  governor: Address
  /** Default TokenWeighting from URL prefill. */
  defaultNode?: Address
  /** Default denom (bytes32) from URL prefill. */
  defaultDenom?: Hex
  /** Default new weight in bps. */
  defaultNewBps?: string
  onSuccess?: (proposalId?: string) => void
}

/**
 * Weight-update proposal: target = TokenWeighting, calldata =
 * updateWeight(denom, newWeightBps). The DAO's Timelock must already hold
 * `governance` on the target node — call tw.transferGovernance(timelock)
 * once at deploy, after which every weight update flows through proposals.
 *
 * The denom Select is populated from the indexer's mesh-security feed for
 * the chosen node, so the user picks from existing registered denoms
 * (recognition over recall) instead of typing a 32-byte hex hash.
 */
export function WeightUpdateForm({
  governor,
  defaultNode,
  defaultDenom,
  defaultNewBps,
  onSuccess,
}: WeightUpdateFormProps) {
  const chainId = useChainId()
  const addrs = getContractAddresses(chainId ?? 31337)
  const initialNode: string = defaultNode ?? addrs.tokenWeighting ?? ''

  const [node, setNode] = useState<string>(initialNode)
  const [denom, setDenom] = useState<string>(defaultDenom ?? '')
  const [bps, setBps] = useState<string>(defaultNewBps ?? '')
  const [description, setDescription] = useState<string>('')
  const flow = useCreateProposal(governor, { onConfirmed: onSuccess })

  const nodeOk = isAddress(node)
  const security = useMeshNodeSecurity(nodeOk ? (node as Address) : null)
  const denomOptions = useMemo(() => {
    const rows = security.data?.weights ?? []
    return rows.map((w) => ({
      value: w.denom,
      label: `${w.denom.slice(0, 10)}…${w.denom.slice(-6)} · ${bpsToPercent(w.weightBps.toString())}`,
    }))
  }, [security.data])
  const currentBps = useMemo(() => {
    const row = security.data?.weights.find((w) => w.denom.toLowerCase() === denom.toLowerCase())
    return row ? row.weightBps.toString() : null
  }, [security.data, denom])

  const denomOk = /^0x[0-9a-fA-F]{64}$/.test(denom)
  const bpsNum = Number(bps)
  const bpsOk = /^\d+$/.test(bps) && bpsNum > 0 && bpsNum <= 65535
  const canSubmit =
    nodeOk && denomOk && bpsOk && (flow.step === 'idle' || flow.step === 'error')

  const calldata = useMemo<Hex | null>(() => {
    if (!denomOk || !bpsOk) return null
    return encodeFunctionData({
      abi: tokenWeightingAbi,
      functionName: 'updateWeight',
      args: [denom as Hex, BigInt(bps)],
    })
  }, [denom, bps, denomOk, bpsOk])

  return (
    <form
      className="ds-stack ds-stack-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit || !calldata) return
        flow.propose({
          targets: [node as Address],
          values: [0n],
          calldatas: [calldata],
          description:
            description.trim().length > 0
              ? `[Weight] ${description.trim()}`
              : `[Weight] Update denom ${denom.slice(0, 10)}… to ${bps} bps`,
        })
      }}
    >
      <FormField
        label="TokenWeighting node"
        required
        helper={
          addrs.tokenWeighting
            ? 'Defaulted from VITE_TOKEN_WEIGHTING_ADDRESS. Edit if proposing against a different mesh node.'
            : 'Address of the TokenWeighting node whose weights this proposal updates.'
        }
        error={node && !nodeOk ? 'Not a valid address' : undefined}
      >
        <Input
          value={node}
          onChange={(e) => setNode(e.target.value)}
          placeholder="0x…"
          tone={node && !nodeOk ? 'danger' : 'neutral'}
        />
      </FormField>

      <FormField
        label="Denom"
        required
        helper={
          security.isLoading
            ? 'Loading registered denoms…'
            : denomOptions.length > 0
              ? `${denomOptions.length} registered. Current weight shown beside each option.`
              : nodeOk
                ? 'No registered denoms found for this node — verify the address.'
                : 'Pick a TokenWeighting node first.'
        }
      >
        <Select
          value={denom}
          onChange={(e) => setDenom(e.target.value)}
          options={denomOptions}
          placeholder={denomOptions.length > 0 ? 'Select a registered denom' : 'No denoms available'}
          disabled={denomOptions.length === 0}
          tone={denom && !denomOk ? 'danger' : 'neutral'}
        />
      </FormField>

      <FormField
        label="New weight (bps)"
        required
        helper={
          currentBps != null
            ? `Currently ${currentBps} bps (${bpsToPercent(currentBps)}). Range 1–65535. 10000 bps = 100%.`
            : 'Range 1–65535. 10000 bps = 100% (1.0× weight).'
        }
        error={bps && !bpsOk ? 'Must be 1–65535' : undefined}
      >
        <Input
          value={bps}
          onChange={(e) => setBps(e.target.value)}
          placeholder="9000"
          inputMode="numeric"
          suffix={bps && bpsOk ? bpsToPercent(bps) : undefined}
          tone={bps && !bpsOk ? 'danger' : 'neutral'}
        />
      </FormField>

      <FormField
        label="Description"
        helper="Optional one-liner stored on-chain alongside the proposal — surfaced on /governance/:gov/:id."
      >
        <textarea
          className="ds-textarea"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Why this weight change?"
        />
      </FormField>

      {calldata && nodeOk && denomOk && bpsOk && (
        <Card density="compact" tone="info">
          <div className="ds-text-sm ds-muted" style={{ marginBottom: 'var(--space-2)' }}>
            Preview
          </div>
          <ProposalActionRow
            index={0}
            target={node as Address}
            value={0n}
            calldata={calldata}
            kind="weight_update"
            decoded={{ tokenWeighting: node as Address, denom: denom as Hex, newWeightBps: bps }}
          />
        </Card>
      )}

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
            ? 'Submit weight update'
            : humanizeStep(flow.step)}
        </Button>
      </div>
    </form>
  )
}
