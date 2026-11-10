import { useState } from 'react'
import { parseUnits, type Address, zeroHash } from 'viem'

import { optimisticInsuranceArbiterAbi } from '../../generated'
import { useDisplayNow } from '../../hooks/useDisplayNow'
import { useWriteAction } from '../../hooks/useWriteAction'
import type { OptimisticArbiterConfig, OptimisticClaim } from '../../hooks/useOptimisticClaim'
import { Button, Input, Notice } from '../ui'
import { formatDuration, formatTokenAmount } from '../../lib/format'

interface ClaimActionsProps {
  arbiterAddress: Address
  claim: OptimisticClaim
  config: OptimisticArbiterConfig
  viewer: Address | undefined
  onActed: () => void
}

type WriteName =
  | 'disputeClaim'
  | 'cancelClaim'
  | 'finalizeClaim'
  | 'executeClaim'
  | 'cancelStaleClaim'

/**
 * State-aware action panel for /claims/:id.
 *
 * The buttons are gated on the claim state and the viewer's role. Each
 * write uses its own `useWriteAction` instance to keep tx state isolated.
 *
 * Approval flow:
 *  - `disputeClaim` requires bond-token allowance to the arbiter. The
 *    helper checks current allowance and renders an APPROVE button when
 *    the allowance is below the proposed bond, then enables the
 *    DISPUTE button after the receipt lands.
 *
 * Resolution is timeout-only: an undisputed claim finalizes after the answer
 * window. A configured fallback arbitrator is described, but this panel has
 * no action that escalates to it.
 */
export function ClaimActions({
  arbiterAddress,
  claim,
  config,
  viewer,
  onActed,
}: ClaimActionsProps) {
  const now = useDisplayNow()
  const isProposer =
    !!viewer && claim.stack.length > 0 &&
    claim.stack[0].asserter.toLowerCase() === viewer.toLowerCase()
  const isTopAsserter =
    !!viewer && claim.top &&
    claim.top.asserter.toLowerCase() === viewer.toLowerCase()
  const undisputed = claim.stack.length === 1
  const answerElapsed = BigInt(now) >= claim.answerDeadline
  const staleElapsed = BigInt(now) >= claim.staleDeadline
  const maxDoublingsReached = claim.stack.length >= config.maxBondDoublings

  return (
    <section className="ds-stack ds-stack-3" aria-label="Actions">
      <h3 className="ds-section-eyebrow">Actions</h3>

      {claim.state === 'Proposed' && (
        <>
          <DisputeAction
            arbiterAddress={arbiterAddress}
            claim={claim}
            config={config}
            disabled={!viewer || isTopAsserter || maxDoublingsReached}
            disabledReason={
              !viewer
                ? 'Connect a wallet to dispute.'
                : isTopAsserter
                  ? 'You posted the top-of-stack bond — wait for someone else to dispute.'
                  : maxDoublingsReached
                    ? `Bond stack hit MAX_BOND_DOUBLINGS (${config.maxBondDoublings}). No further disputes — the claim finalizes by timeout once the answer window elapses.`
                    : undefined
            }
            onActed={onActed}
          />
          <NoBondAction
            label={isProposer && undisputed ? 'CANCEL CLAIM' : 'CANCEL CLAIM (proposer only)'}
            description={
              isProposer && undisputed
                ? 'Refund your bond and free the commitment for future claims.'
                : 'Only the proposer may cancel — and only before the first dispute.'
            }
            disabled={!isProposer || !undisputed}
            functionName="cancelClaim"
            arbiterAddress={arbiterAddress}
            claim={claim}
            onActed={onActed}
          />
          {config.fallbackEnabled ? (
            <Notice tone="info" size="sm" title="ESCALATE TO FALLBACK">
              Fallback escalation pulls the fallback's quoted fee. The full
              escalation flow ships with the service-driven fallback in a
              follow-up; today the seeded arbiter runs without a fallback.
            </Notice>
          ) : (
            <Notice tone="neutral" size="sm" title="NO FALLBACK CONFIGURED">
              This arbiter has no fallback. Bond exhaustion is terminal — keep
              disputing until either side gives up or the answer window closes.
            </Notice>
          )}
          <NoBondAction
            label={
              answerElapsed
                ? 'FINALIZE CLAIM (timeout)'
                : `FINALIZE CLAIM (waits ${formatDuration(Number(claim.answerDeadline) - now)})`
            }
            description={
              answerElapsed
                ? 'Top-of-stack assertion wins by exhaustion. Calls manager.initiateForfeit.'
                : 'Finalize unlocks once the answer window elapses without a new bond.'
            }
            disabled={!answerElapsed}
            functionName="finalizeClaim"
            arbiterAddress={arbiterAddress}
            claim={claim}
            onActed={onActed}
          />
          {staleElapsed && (
            <NoBondAction
              label="CANCEL STALE CLAIM"
              description="The answer + stale TTL has elapsed without finalization. Anyone can refund all bonds and free the commitment."
              disabled={false}
              functionName="cancelStaleClaim"
              arbiterAddress={arbiterAddress}
              claim={claim}
              onActed={onActed}
            />
          )}
        </>
      )}

      {claim.state === 'Resolved' && (
        <NoBondAction
          label="FINALIZE CLAIM"
          description="A ruling has landed. Calls manager.initiateForfeit with the winning amount; the manager's pause-adjusted forfeit execution delay then runs."
          disabled={false}
          functionName="finalizeClaim"
          arbiterAddress={arbiterAddress}
          claim={claim}
          onActed={onActed}
        />
      )}

      {claim.state === 'Forfeiture' && (
        <NoBondAction
          label="EXECUTE CLAIM"
          description="Attempts manager execution and bond settlement. It succeeds only when the live pause-adjusted execution delay has elapsed and manager forfeiture is not paused."
          disabled={false}
          functionName="executeClaim"
          arbiterAddress={arbiterAddress}
          claim={claim}
          onActed={onActed}
        />
      )}

      {(claim.state === 'Settled' || claim.state === 'Cancelled') && (
        <Notice tone="neutral" size="sm" title={`Claim ${claim.state.toUpperCase()}`}>
          Terminal state — no further actions. {' '}
          {claim.state === 'Settled'
            ? `Winning amount: ${(claim.winningAmtBps / 100).toFixed(2)}% of the commitment's maxPenaltyBps.`
            : 'All bonds were refunded.'}
        </Notice>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispute — bond-approval gated.
// ─────────────────────────────────────────────────────────────────────────────

interface DisputeActionProps {
  arbiterAddress: Address
  claim: OptimisticClaim
  config: OptimisticArbiterConfig
  disabled: boolean
  disabledReason?: string
  onActed: () => void
}

function DisputeAction({
  arbiterAddress,
  claim,
  config,
  disabled,
  disabledReason,
  onActed,
}: DisputeActionProps) {
  const required = claim.top
    ? maxBigint(BigInt(claim.top.bond) * 2n, config.minBond)
    : config.minBond
  const decimals = config.bondDecimals ?? 18
  const initial = formatTokenAmount(required, decimals).full
  const [counterAmtText, setCounterAmtText] = useState('0')
  const [bondText, setBondText] = useState(initial)
  const [parsedBond, setParsedBond] = useState<bigint | undefined>(required)
  const [bondError, setBondError] = useState<string | null>(null)

  const { write: writeContract, isPending, isConfirming } = useWriteAction({
    successTitle: 'CLAIM DISPUTED',
    onSuccess: () => onActed(),
  })

  function parseBond(value: string) {
    if (!value) {
      setParsedBond(undefined)
      setBondError(null)
      return
    }
    try {
      const parsed = parseUnits(value, decimals)
      if (parsed < required) {
        setBondError(`BOND BELOW REQUIRED ${formatTokenAmount(required, decimals).full}`)
        setParsedBond(undefined)
        return
      }
      setParsedBond(parsed)
      setBondError(null)
    } catch {
      setParsedBond(undefined)
      setBondError('INVALID BOND')
    }
  }

  function handleSubmit() {
    if (parsedBond === undefined) return
    const counter = Number(counterAmtText)
    if (isNaN(counter) || counter < 0 || counter > 10_000) return
    writeContract({
      abi: optimisticInsuranceArbiterAbi,
      address: arbiterAddress,
      functionName: 'disputeClaim',
      args: [claim.claimId, counter, zeroHash, parsedBond],
    })
  }

  const isPendingAny = isPending || isConfirming

  return (
    <div className="ds-stack ds-stack-3" aria-label="Dispute">
      <Notice tone="neutral" size="sm" title="POST A DISPUTE">
        Post a counter-assertion with a bond ≥ 2× the top-of-stack bond.
        Bond goes to the winner of the dispute (refunded if you're right,
        forfeited if not). Required: {formatTokenAmount(required, decimals).full}{' '}
        {config.bondSymbol ?? ''}.
      </Notice>
      <div className="ds-field">
        <label className="ds-label" htmlFor="dispute-counter-amt">COUNTER AMOUNT (BPS)</label>
        <Input
          id="dispute-counter-amt"
          type="text"
          value={counterAmtText}
          onChange={(e) => setCounterAmtText(e.target.value)}
          placeholder="0..10000"
          disabled={disabled || isPendingAny}
        />
        <Notice tone="info" size="sm">
          Bps of the commitment's maxPenaltyBps you assert the policy should pay.
          0 = "no payout"; 10_000 = "full forfeit."
        </Notice>
      </div>
      <div className="ds-field">
        <label className="ds-label" htmlFor="dispute-bond">BOND ({config.bondSymbol ?? '—'})</label>
        <Input
          id="dispute-bond"
          type="text"
          value={bondText}
          onChange={(e) => setBondText(e.target.value)}
          onBlur={() => parseBond(bondText)}
          placeholder="0.0000"
          disabled={disabled || isPendingAny}
          tone={bondError ? 'danger' : 'neutral'}
        />
        {bondError && <Notice tone="danger" size="sm">{bondError}</Notice>}
      </div>
      <Button
        variant="primary"
        onClick={handleSubmit}
        disabled={
          disabled || isPendingAny || parsedBond === undefined || !!bondError
        }
        title={disabledReason}
      >
        {isPendingAny ? 'CONFIRMING…' : 'DISPUTE CLAIM'}
      </Button>
      {disabledReason && disabled && (
        <Notice tone="neutral" size="sm">{disabledReason}</Notice>
      )}
      <Notice tone="info" size="sm">
        The dispute call pulls bond via <code>safeTransferFrom</code>; if your
        wallet's allowance to the arbiter is below the bond, MetaMask will
        prompt you for an approval first, then the dispute tx.
      </Notice>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic no-bond action — cancel, finalize, execute, cancelStaleClaim.
// ─────────────────────────────────────────────────────────────────────────────

interface NoBondActionProps {
  label: string
  description: string
  disabled: boolean
  functionName: WriteName
  arbiterAddress: Address
  claim: OptimisticClaim
  onActed: () => void
}

function NoBondAction({
  label,
  description,
  disabled,
  functionName,
  arbiterAddress,
  claim,
  onActed,
}: NoBondActionProps) {
  const { write: writeContract, isPending, isConfirming } = useWriteAction({
    successTitle: label.toUpperCase(),
    onSuccess: () => onActed(),
  })

  function handleClick() {
    writeContract({
      abi: optimisticInsuranceArbiterAbi,
      address: arbiterAddress,
      functionName,
      args: [claim.claimId],
    })
  }

  const isPendingAny = isPending || isConfirming

  return (
    <div className="ds-stack ds-stack-2" aria-label={label}>
      <Notice tone="neutral" size="sm" title={label}>
        {description}
      </Notice>
      <Button onClick={handleClick} disabled={disabled || isPendingAny}>
        {isPendingAny ? 'CONFIRMING…' : label}
      </Button>
    </div>
  )
}

function maxBigint(a: bigint, b: bigint): bigint {
  return a > b ? a : b
}
