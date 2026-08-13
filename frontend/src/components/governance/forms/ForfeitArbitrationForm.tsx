import { useMemo, useState } from 'react'
import { encodeFunctionData, isAddress, type Address } from 'viem'
import { useChainId, useReadContract } from 'wagmi'

import {
  AddressDisplay,
  Button,
  Card,
  Disclosure,
  FormField,
  Input,
  Notice,
  Select,
  Tooltip,
} from '../../ui'
import { ProposalActionRow } from '../../protocol'
import { useCreateProposal } from '../../../hooks/useCreateProposal'
import { commitmentManagerAbi } from '../../../generated'
import { getContractAddresses } from '../../../config/contracts'
import { bpsToPercent, humanizeError, humanizeStep } from './lib'

export interface ForfeitArbitrationFormProps {
  governor: Address
  /** DAO timelock — forfeit arbitration succeeds at execute() only if the
   *  commitment's arbiter is exactly this address. */
  timelock?: Address
  defaultManager?: Address
  defaultCommitmentId?: string
  defaultPenaltyBps?: string
  defaultOp?: 'initiateForfeit' | 'cancelForfeit'
  onSuccess?: (proposalId?: string) => void
}

/**
 * Forfeit arbitration proposal: target = CommitmentManager, calldata =
 * initiateForfeit(id, penaltyBps) or cancelForfeit(id). Only succeeds at
 * execute() time if the DAO's Timelock is the commitment's arbiter; the
 * form pre-reads the commitment's arbiter and surfaces a danger Notice up
 * front when there's a mismatch — so the user doesn't pay gas on a
 * proposal that's guaranteed to revert.
 */
export function ForfeitArbitrationForm({
  governor,
  timelock,
  defaultManager,
  defaultCommitmentId,
  defaultPenaltyBps,
  defaultOp,
  onSuccess,
}: ForfeitArbitrationFormProps) {
  const chainId = useChainId()
  const addrs = getContractAddresses(chainId ?? 31337)
  const initialManager: string = defaultManager ?? addrs.commitmentManager ?? ''

  const [manager, setManager] = useState<string>(initialManager)
  const [commitmentId, setCommitmentId] = useState<string>(defaultCommitmentId ?? '')
  const [penaltyBps, setPenaltyBps] = useState<string>(defaultPenaltyBps ?? '')
  const [op, setOp] = useState<'initiateForfeit' | 'cancelForfeit'>(defaultOp ?? 'initiateForfeit')
  const [description, setDescription] = useState<string>('')
  const flow = useCreateProposal(governor, { onConfirmed: onSuccess })

  const managerOk = isAddress(manager)
  const idOk = /^\d+$/.test(commitmentId)
  const penaltyNum = Number(penaltyBps)
  const penaltyOk = op === 'cancelForfeit' || (/^\d+$/.test(penaltyBps) && penaltyNum > 0 && penaltyNum <= 10000)

  // Pre-flight arbiter check — read commitment.arbiter and compare to the
  // DAO's timelock. Surfaces a danger Notice when mismatched.
  const commitmentRead = useReadContract({
    abi: commitmentManagerAbi,
    address: managerOk ? (manager as Address) : undefined,
    functionName: 'getCommitment',
    args: idOk ? [BigInt(commitmentId)] : undefined,
    query: { enabled: managerOk && idOk },
  })
  const commitmentArbiter = (commitmentRead.data as { arbiter?: Address } | undefined)?.arbiter
  const arbiterMismatch =
    commitmentArbiter !== undefined
    && timelock !== undefined
    && commitmentArbiter.toLowerCase() !== timelock.toLowerCase()

  const canSubmit =
    managerOk && idOk && penaltyOk && (flow.step === 'idle' || flow.step === 'error')

  const calldata = useMemo(() => {
    if (!idOk || (op === 'initiateForfeit' && !penaltyOk)) return null
    return op === 'initiateForfeit'
      ? encodeFunctionData({
          abi: commitmentManagerAbi,
          functionName: 'initiateForfeit',
          args: [BigInt(commitmentId), Number(penaltyBps)],
        })
      : encodeFunctionData({
          abi: commitmentManagerAbi,
          functionName: 'cancelForfeit',
          args: [BigInt(commitmentId)],
        })
  }, [op, commitmentId, penaltyBps, idOk, penaltyOk])

  return (
    <form
      className="ds-stack ds-stack-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit || !calldata) return
        const desc =
          description.trim().length > 0
            ? `[Forfeit] ${description.trim()}`
            : `[Forfeit] ${op} commitment #${commitmentId}${
                op === 'initiateForfeit' ? ` at ${penaltyBps} bps` : ''
              }`
        flow.propose({
          targets: [manager as Address],
          values: [0n],
          calldatas: [calldata],
          description: desc,
        })
      }}
    >
      <Notice tone="info" size="sm">
        Forfeiture is{' '}
        <Tooltip
          tone="info"
          size="lg"
          content="A forfeit happens in two manager steps: initiateForfeit starts a pause-adjusted execution delay, and only after it elapses can executeForfeit penalize the stake. The arbiter or DAO can cancel; any committer dispute method belongs to the configured arbiter mechanism."
        >
          two-phase
        </Tooltip>
        . This proposal only initiates (or cancels) a forfeit — it succeeds at
        execute() only when this DAO's{' '}
        <Tooltip
          tone="info"
          size="lg"
          content="The party the commitment names as its arbiter. Only that address can move a forfeit forward, so the DAO must already be set as arbiter for this proposal to take effect."
        >
          Timelock is the arbiter
        </Tooltip>{' '}
        of the target commitment.
      </Notice>

      {arbiterMismatch && commitmentArbiter && timelock && (
        <Notice tone="danger">
          The commitment's arbiter is{' '}
          <AddressDisplay address={commitmentArbiter} compact /> — not the DAO's
          Timelock (<AddressDisplay address={timelock} compact />). This proposal
          will revert at execute(). Confirm the depositor set the DAO as
          arbiter before proceeding.
        </Notice>
      )}

      <FormField
        label="CommitmentManager"
        required
        helper={
          addrs.commitmentManager
            ? 'Defaulted from VITE_COMMITMENT_MANAGER_ADDRESS.'
            : 'Address of the manager that holds the commitment.'
        }
        error={manager && !managerOk ? 'Not a valid address' : undefined}
      >
        <Input
          value={manager}
          onChange={(e) => setManager(e.target.value)}
          placeholder="0x…"
          tone={manager && !managerOk ? 'danger' : 'neutral'}
        />
      </FormField>

      <FormField
        label="Operation"
        required
        helper={
          op === 'initiateForfeit'
            ? 'Initiates the two-phase forfeit. The pause-adjusted manager delay must elapse before executeForfeit.'
            : 'Cancels a pending manager forfeit before execution.'
        }
      >
        <Select
          value={op}
          onChange={(e) => setOp(e.target.value as 'initiateForfeit' | 'cancelForfeit')}
          options={[
            { value: 'initiateForfeit', label: 'Initiate forfeit' },
            { value: 'cancelForfeit', label: 'Cancel pending forfeit' },
          ]}
        />
      </FormField>

      <FormField
        label="Commitment ID"
        required
        helper={
          commitmentArbiter
            ? `Arbiter: ${commitmentArbiter.slice(0, 10)}… · Loaded from chain.`
            : commitmentRead.isLoading
              ? 'Loading commitment…'
              : 'Numeric id from /commitments. The form pre-checks the arbiter once you fill this in.'
        }
        error={commitmentId && !idOk ? 'Must be a positive integer' : undefined}
      >
        <Input
          value={commitmentId}
          onChange={(e) => setCommitmentId(e.target.value)}
          placeholder="42"
          inputMode="numeric"
          tone={commitmentId && !idOk ? 'danger' : 'neutral'}
        />
      </FormField>

      {op === 'initiateForfeit' && (
        <FormField
          label="Penalty (bps)"
          required
          helper="Range 1–10000. 10000 bps = 100% (full forfeit)."
          error={penaltyBps && !penaltyOk ? 'Must be 1–10000' : undefined}
        >
          <Input
            value={penaltyBps}
            onChange={(e) => setPenaltyBps(e.target.value)}
            placeholder="2500"
            inputMode="numeric"
            suffix={penaltyBps && penaltyOk ? bpsToPercent(penaltyBps) : undefined}
            tone={penaltyBps && !penaltyOk ? 'danger' : 'neutral'}
          />
        </FormField>
      )}

      <FormField
        label="Description"
        helper="Optional explanation stored on-chain alongside the proposal."
      >
        <textarea
          className="ds-textarea"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Why this forfeit?"
        />
      </FormField>

      {calldata && managerOk && idOk && (
        <Card density="compact" tone="info">
          <div className="ds-text-sm ds-muted" style={{ marginBottom: 'var(--space-2)' }}>
            Preview
          </div>
          <ProposalActionRow
            index={0}
            target={manager as Address}
            value={0n}
            calldata={calldata}
            kind="forfeit_arbitration"
            decoded={{
              manager: manager as Address,
              op,
              commitmentId,
              penaltyBps: op === 'initiateForfeit' ? Number(penaltyBps) : undefined,
            }}
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
            ? `Submit ${op === 'initiateForfeit' ? 'forfeit' : 'cancellation'}`
            : humanizeStep(flow.step)}
        </Button>
      </div>
    </form>
  )
}
