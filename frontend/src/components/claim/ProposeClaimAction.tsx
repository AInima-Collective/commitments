import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { parseUnits, type Address, type Hex } from 'viem'
import { useAccount } from 'wagmi'

import {
  useReadOptimisticInsuranceArbiterActiveClaimOf,
  useReadOptimisticInsuranceArbiterAnswerTimeout,
  useReadOptimisticInsuranceArbiterBondFloor,
  useReadOptimisticInsuranceArbiterBondToken,
} from '../../generated'
import { useProposeClaimFlow } from '../../hooks/useProposeClaimFlow'
import { useTokenMeta } from '../../hooks/useTokenMeta'
import { formatTokenAmount } from '../../lib/format'
import { formatBps } from '../../utils/commitments'
import { ZERO_HASH, computeHashFromJsonText } from '../../utils/metadataForm'
import { Input, Modal, Notice, TokenAmount, useToasts } from '../ui'

/** Claim-size presets as a fraction of the commitment's maxPenaltyBps. */
const CLAIM_PRESETS = [
  { label: '25%', fraction: 0.25 },
  { label: '50%', fraction: 0.5 },
  { label: '75%', fraction: 0.75 },
  { label: '100%', fraction: 1 },
] as const

export interface ProposeClaimActionProps {
  /** The commitment's arbiter — must be an OptimisticInsuranceArbiter. */
  arbiterAddress: Address
  commitmentId: bigint
  /** Mapped domain status of the commitment (`'ACTIVE'`, …). */
  status: string
  /** The commitment's challenge window (seconds); undefined while loading. */
  challengeWindow: bigint | undefined
  maxPenaltyBps: number
  /** Backing amount + display meta for the claim-value preview. */
  amount: bigint
  tokenDecimals: number
  tokenSymbol: string | undefined
}

/**
 * "Propose claim" affordance for commitments arbitrated by the
 * OptimisticInsuranceArbiter. Anyone can open a claim against an active
 * commitment by posting a bond ≥ `bondFloor(commitmentId, amountBps)`;
 * an undisputed claim finalizes by timeout into the manager's two-phase
 * forfeit (see /app/claims/:id for the full game).
 *
 * Approve → propose follows the {@link useProposeClaimFlow} state machine
 * (same shape as useBuyCoverFlow / useDepositFlow). On success the new claim
 * id is parsed from the receipt's ClaimProposed log and the user is routed to
 * the claim detail page.
 */
export function ProposeClaimAction({
  arbiterAddress,
  commitmentId,
  status,
  challengeWindow,
  maxPenaltyBps,
  amount,
  tokenDecimals,
  tokenSymbol,
}: ProposeClaimActionProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="ds-btn" onClick={() => setOpen(true)}>
        Propose claim
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Propose claim on commitment #${commitmentId.toString()}`}
        description="Assert an SLA breach (or other covered event) against this bond. Post a bond behind your assertion — it is refunded (plus a winner's share) if the claim stands, forfeited if a disputer beats it."
        size="lg"
      >
        {open && (
          <ProposeClaimBody
            arbiterAddress={arbiterAddress}
            commitmentId={commitmentId}
            status={status}
            challengeWindow={challengeWindow}
            maxPenaltyBps={maxPenaltyBps}
            amount={amount}
            tokenDecimals={tokenDecimals}
            tokenSymbol={tokenSymbol}
            onClose={() => setOpen(false)}
          />
        )}
      </Modal>
    </>
  )
}

function ProposeClaimBody({
  arbiterAddress,
  commitmentId,
  status,
  challengeWindow,
  maxPenaltyBps,
  amount,
  tokenDecimals,
  tokenSymbol,
  onClose,
}: ProposeClaimActionProps & { onClose: () => void }) {
  const navigate = useNavigate()
  const { push } = useToasts()
  const { address: connectedAddress, isConnected } = useAccount()

  // ── Claim size ────────────────────────────────────────────────────────────
  const [amountBps, setAmountBps] = useState<number>(maxPenaltyBps)
  const [customBpsText, setCustomBpsText] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  // ── Evidence ──────────────────────────────────────────────────────────────
  const [evidenceText, setEvidenceText] = useState('')
  const evidenceHash: Hex = evidenceText.length > 0 ? computeHashFromJsonText(evidenceText) : ZERO_HASH

  // ── Arbiter reads ─────────────────────────────────────────────────────────
  const { data: activeClaimId } = useReadOptimisticInsuranceArbiterActiveClaimOf({
    address: arbiterAddress,
    args: [commitmentId],
    query: { refetchInterval: 15_000 },
  })
  const { data: answerTimeout } = useReadOptimisticInsuranceArbiterAnswerTimeout({
    address: arbiterAddress,
  })
  const { data: bondToken } = useReadOptimisticInsuranceArbiterBondToken({
    address: arbiterAddress,
  })
  const validBps = amountBps >= 1 && amountBps <= maxPenaltyBps
  const { data: bondFloor } = useReadOptimisticInsuranceArbiterBondFloor({
    address: arbiterAddress,
    args: [commitmentId, amountBps],
    query: { enabled: validBps },
  })

  const { decimals: bondDecimals, symbol: bondSymbol, isLoading: bondMetaLoading } = useTokenMeta(
    bondToken as Address | undefined,
  )

  // ── Bond input (prefilled with the quoted floor) ──────────────────────────
  const [bondText, setBondText] = useState('')
  const parsedBond = useMemo<bigint | undefined>(() => {
    if (bondText.trim().length === 0) return bondFloor as bigint | undefined
    try {
      return parseUnits(bondText, bondDecimals)
    } catch {
      return undefined
    }
  }, [bondText, bondFloor, bondDecimals])
  const bondBelowFloor =
    parsedBond !== undefined && bondFloor !== undefined && parsedBond < (bondFloor as bigint)

  // ── Flow ──────────────────────────────────────────────────────────────────
  const flow = useProposeClaimFlow({
    arbiterAddress,
    bondToken: bondToken as Address | undefined,
    userAddress: connectedAddress,
    onSuccess: (claimId) => {
      push({
        tone: 'success',
        title: 'CLAIM PROPOSED',
        body: claimId !== undefined ? `Claim #${claimId.toString()} opened.` : undefined,
      })
      onClose()
      // Claim ids are per-arbiter counters — the detail route needs to know
      // WHICH OptimisticInsuranceArbiter instance the claim lives on.
      if (claimId !== undefined) navigate(`/app/claims/${claimId.toString()}?arbiter=${arbiterAddress}`)
    },
  })

  // ── Gates (disabled-with-reason, mirroring the contract's revert paths) ───
  const existingClaim = (activeClaimId as bigint | undefined) ?? 0n
  const windowTooShort =
    challengeWindow !== undefined &&
    answerTimeout !== undefined &&
    challengeWindow < (answerTimeout as bigint)
  const needsApproval =
    parsedBond !== undefined && flow.currentAllowance !== undefined && flow.currentAllowance < parsedBond
  const insufficientBalance =
    parsedBond !== undefined && flow.tokenBalance !== undefined && flow.tokenBalance < parsedBond

  const disabledReason = !isConnected
    ? 'Connect a wallet to propose a claim.'
    : existingClaim > 0n
      ? `Claim #${existingClaim.toString()} is already active on this commitment — one claim at a time.`
      : status !== 'ACTIVE'
        ? `The commitment is ${status.toLowerCase().replace('_', '-')} — claims can only be opened against an active commitment.`
        : windowTooShort
          ? `The commitment's forfeit execution delay (${challengeWindow?.toString()}s) is shorter than the arbiter's answer timeout (${(answerTimeout as bigint | undefined)?.toString()}s) — the arbiter rejects claims it could not resolve in time.`
          : insufficientBalance
            ? `Your ${bondSymbol} balance does not cover the bond.`
            : undefined

  const claimUnits = validBps ? (amount * BigInt(amountBps)) / 10_000n : 0n
  const isPending = flow.step === 'approving' || flow.step === 'proposing'
  const canSubmit =
    !disabledReason && validBps && parsedBond !== undefined && !bondBelowFloor && !isPending && !bondMetaLoading

  function handlePreset(fraction: number) {
    setAmountBps(Math.max(1, Math.round(maxPenaltyBps * fraction)))
    setShowCustom(false)
    setCustomBpsText('')
  }

  function handleCustomBps(v: string) {
    setCustomBpsText(v)
    const n = Number(v)
    if (!isNaN(n) && Number.isInteger(n)) setAmountBps(n)
  }

  function handleSubmit() {
    if (!canSubmit || parsedBond === undefined) return
    if (needsApproval) {
      flow.approve(parsedBond)
      return
    }
    flow.propose(commitmentId, amountBps, evidenceHash, parsedBond)
  }

  return (
    <div className="ds-stack ds-stack-4">
      {disabledReason && (
        <Notice tone={existingClaim > 0n ? 'info' : 'warn'} size="sm" title="CANNOT PROPOSE">
          {disabledReason}
          {existingClaim > 0n && (
            <>
              {' '}
              <Link to={`/app/claims/${existingClaim.toString()}?arbiter=${arbiterAddress}`}>
                View claim #{existingClaim.toString()} →
              </Link>
            </>
          )}
        </Notice>
      )}

      {/* Claim size */}
      <div className="ds-field">
        <label className="ds-label">CLAIM SIZE (OF THE FORFEITABLE STAKE)</label>
        <div className="duration-picker">
          {CLAIM_PRESETS.map((p) => {
            const bps = Math.max(1, Math.round(maxPenaltyBps * p.fraction))
            return (
              <button
                key={p.label}
                type="button"
                className={`duration-btn${!showCustom && amountBps === bps ? ' selected' : ''}`}
                onClick={() => handlePreset(p.fraction)}
                disabled={isPending}
              >
                {p.label}
              </button>
            )
          })}
          <button
            type="button"
            className={`duration-btn${showCustom ? ' selected' : ''}`}
            onClick={() => setShowCustom(true)}
            disabled={isPending}
          >
            CUSTOM
          </button>
        </div>
        {showCustom && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' /* layout only */ }}>
            <Input
              type="number"
              value={customBpsText}
              onChange={(e) => handleCustomBps(e.target.value)}
              placeholder={`1..${maxPenaltyBps}`}
              min={1}
              max={maxPenaltyBps}
              style={{ width: 160 /* layout only */ }}
              aria-label="Custom claim size in basis points"
              suffix={<span>bps</span>}
              disabled={isPending}
              tone={validBps ? 'neutral' : 'danger'}
            />
          </div>
        )}
        <Notice tone="info" size="sm">
          Asserting {formatBps(amountBps)} of the stake —{' '}
          <TokenAmount amount={claimUnits} decimals={tokenDecimals} symbol={tokenSymbol} size="inline" /> of{' '}
          <TokenAmount amount={amount} decimals={tokenDecimals} symbol={tokenSymbol} size="inline" />. Cap:{' '}
          {formatBps(maxPenaltyBps)} (the commitment's max penalty).
        </Notice>
        {!validBps && (
          <Notice tone="danger" size="sm">
            CLAIM SIZE MUST BE 1..{maxPenaltyBps} BPS
          </Notice>
        )}
      </div>

      {/* Evidence */}
      <div className="ds-field">
        <label className="ds-label" htmlFor="propose-claim-evidence">
          EVIDENCE (OPTIONAL)
        </label>
        <textarea
          id="propose-claim-evidence"
          className="ds-textarea"
          rows={3}
          value={evidenceText}
          onChange={(e) => setEvidenceText(e.target.value)}
          placeholder="Describe the breach — tx hashes, block numbers, SLA clause violated…"
          disabled={isPending}
        />
        <Notice tone="info" size="sm">
          Only the keccak256 hash goes on-chain:{' '}
          <span title={evidenceHash}>
            {evidenceHash === ZERO_HASH ? 'no evidence (zero hash)' : `${evidenceHash.slice(0, 10)}…${evidenceHash.slice(-6)}`}
          </span>
          . Keep the full text — disputers and the counterparty will ask for it.
        </Notice>
      </div>

      {/* Bond */}
      <div className="ds-field">
        <label className="ds-label" htmlFor="propose-claim-bond">
          BOND ({bondSymbol})
        </label>
        <Input
          id="propose-claim-bond"
          type="text"
          value={bondText}
          onChange={(e) => setBondText(e.target.value)}
          placeholder={
            bondFloor !== undefined ? formatTokenAmount(bondFloor as bigint, bondDecimals).full : 'quoting floor…'
          }
          disabled={isPending}
          tone={bondBelowFloor ? 'danger' : 'neutral'}
        />
        <Notice tone="info" size="sm">
          Required floor:{' '}
          {bondFloor !== undefined ? (
            <TokenAmount amount={bondFloor as bigint} decimals={bondDecimals} symbol={bondSymbol} size="inline" />
          ) : (
            '…'
          )}
          {' — '}scales with the claimed value. Leave blank to post exactly the floor. A disputer must at least
          double your bond to challenge.
        </Notice>
        {bondBelowFloor && (
          <Notice tone="danger" size="sm">
            BOND BELOW THE REQUIRED FLOOR
          </Notice>
        )}
      </div>

      {flow.error && (
        <Notice tone="danger" size="sm" title="TRANSACTION FAILED">
          {(flow.error as { shortMessage?: string }).shortMessage ?? flow.error.message}
        </Notice>
      )}

      <div className="ds-row ds-row-2" style={{ justifyContent: 'flex-end' /* layout only */ }}>
        <button type="button" className="ds-btn" onClick={onClose} disabled={isPending}>
          CANCEL
        </button>
        <button
          type="button"
          className="ds-btn ds-btn--primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          title={disabledReason}
        >
          {flow.step === 'approving'
            ? 'APPROVING…'
            : flow.step === 'proposing'
              ? 'CONFIRMING…'
              : needsApproval
                ? `APPROVE ${bondSymbol} BOND`
                : 'PROPOSE CLAIM'}
        </button>
      </div>

      <Notice tone="neutral" size="sm" title="WHAT HAPPENS NEXT">
        Proposing immediately opens a manager-side forfeit hold at the claimed size, so the committer cannot exit
        while the claim runs. If nobody disputes within the answer window, the claim finalizes and the forfeit
        executes after the commitment's manager-side forfeit delay; each claim-process dispute doubles the bond at stake.
      </Notice>
    </div>
  )
}
