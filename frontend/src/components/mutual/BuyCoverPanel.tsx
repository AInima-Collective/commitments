import { useReadContract } from 'wagmi'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { type Address, parseUnits } from 'viem'

import { Button, Input, Notice, StatBlock, TokenAmount } from '../ui'
import { linkedMutualPolicyAbi, premiumSchedulerAbi } from '../../generated'
import { useBuyCoverFlow } from '../../hooks/useBuyCoverFlow'
import { POLL } from '../../hooks/polling'
import { legibleWriteError } from '../../lib/contractErrors'

interface BuyCoverPanelProps {
  mutualId: bigint
  /** Mutual numeraire — the vault-share ERC-20 the premium is paid in. */
  numeraire: Address | undefined
  /** Numeraire decimals (vault-share scale, e.g. 15 for cvUSDC). */
  decimals: number
  symbol: string
  /** LinkedMutualPolicy address (bindCover + approval spender). */
  policyAddress: Address | undefined
  /** PremiumScheduler address (premium quote). */
  schedulerAddress: Address | undefined
  userAddress: Address | undefined
  /** Cover sales paused (terminal mutual or loss under challenge). */
  frozen: boolean
  /** Called after a successful bindCover so the page can refetch premium state. */
  onBound?: () => void
}

const DEFAULT_DURATION_DAYS = '90'
const SECONDS_PER_DAY = 86_400n

/**
 * BuyCoverPanel — the policyholder side of a mutual. Quote a premium for a
 * prospective cover (`premiumScheduler.quote`), approve the numeraire to the
 * policy, then `bindCover`. Premium is pulled from the buyer's vault-share
 * balance, so when the buyer holds none we route them to the vault to deposit
 * rather than dead-ending.
 *
 * Lives in the mutual feature folder: it composes ui primitives + the
 * {@link useBuyCoverFlow} transaction machine and knows the mutual vocabulary,
 * but is not the page itself.
 */
export function BuyCoverPanel({
  mutualId,
  numeraire,
  decimals,
  symbol,
  policyAddress,
  schedulerAddress,
  userAddress,
  frozen,
  onBound,
}: BuyCoverPanelProps) {
  const [coverText, setCoverText] = useState('')
  const [durationText, setDurationText] = useState(DEFAULT_DURATION_DAYS)

  const notional = useMemo(() => {
    if (!coverText) return undefined
    try {
      const n = parseUnits(coverText, decimals)
      return n > 0n ? n : undefined
    } catch {
      return undefined
    }
  }, [coverText, decimals])

  const durationDays = Number(durationText)
  const durationValid = Number.isFinite(durationDays) && durationDays > 0
  const duration = durationValid ? BigInt(Math.floor(durationDays)) * SECONDS_PER_DAY : undefined
  const inputsValid = notional !== undefined && duration !== undefined

  // Live premium quote for the prospective cover. Returns premium in numeraire
  // (vault-share) units, paid up-front to fund the stream over `duration`.
  const quote = useReadContract({
    abi: premiumSchedulerAbi,
    functionName: 'quote',
    address: schedulerAddress,
    args: inputsValid ? [mutualId, notional, duration] : undefined,
    query: { enabled: Boolean(schedulerAddress) && inputsValid },
  })
  const premium = quote.data as bigint | undefined

  // Total active cover already sold against this mutual — fresh on-chain read.
  const activeSold = useReadContract({
    abi: linkedMutualPolicyAbi,
    functionName: 'getActiveNotionalSold',
    address: policyAddress,
    args: [mutualId],
    query: { enabled: Boolean(policyAddress), refetchInterval: POLL.fast },
  })

  const flow = useBuyCoverFlow({
    numeraire,
    policyAddress,
    userAddress,
    onSuccess: () => onBound?.(),
  })

  const balance = flow.tokenBalance
  const allowance = flow.currentAllowance ?? 0n
  const insufficientBalance = premium !== undefined && balance !== undefined && balance < premium
  const allowanceOk = premium !== undefined && allowance >= premium
  const busy = flow.step === 'approving' || flow.step === 'binding'
  const quoting = inputsValid && quote.isLoading

  const canAct =
    inputsValid &&
    premium !== undefined &&
    !insufficientBalance &&
    !frozen &&
    !busy &&
    Boolean(policyAddress && schedulerAddress)

  if (!userAddress) {
    return (
      <Notice tone="info" size="sm" title="Connect a wallet">
        Connect a wallet to buy cover from this mutual.
      </Notice>
    )
  }

  if (!policyAddress || !schedulerAddress) {
    return (
      <Notice tone="warn" size="sm" title="Cover market unavailable">
        No premium policy is configured for this network, so cover can't be bought here. Deploy the
        LinkedMutualPolicy + PremiumScheduler (the local seed wires both) and reload.
      </Notice>
    )
  }

  return (
    <div className="ds-stack ds-stack-3">
      <StatBlock
        label="cover currently bound"
        value={
          activeSold.data !== undefined ? (
            <TokenAmount amount={activeSold.data as bigint} decimals={decimals} symbol={symbol} compact />
          ) : (
            '—'
          )
        }
        meta="active notional sold across all policyholders"
      />

      <div className="ds-row ds-row-3" style={{ alignItems: 'flex-start' }}>
        <div className="ds-stack ds-stack-2" style={{ flex: 2 }}>
          <label className="ds-label" htmlFor="cover-notional">
            Cover amount ({symbol})
          </label>
          <Input
            id="cover-notional"
            inputMode="decimal"
            placeholder="0.0"
            value={coverText}
            onChange={(e) => setCoverText(e.target.value)}
            suffix={symbol}
            tone={insufficientBalance ? 'danger' : 'neutral'}
          />
        </div>
        <div className="ds-stack ds-stack-2" style={{ flex: 1 }}>
          <label className="ds-label" htmlFor="cover-duration">
            Term (days)
          </label>
          <Input
            id="cover-duration"
            inputMode="numeric"
            placeholder="90"
            value={durationText}
            onChange={(e) => setDurationText(e.target.value)}
            tone={durationText && !durationValid ? 'danger' : 'neutral'}
          />
        </div>
      </div>

      {/* Quoted premium for the prospective cover. */}
      <div className="ds-stat-grid" data-cols="2">
        <StatBlock
          label="premium due now"
          tone="accent"
          loading={quoting}
          value={
            premium !== undefined ? (
              <TokenAmount amount={premium} decimals={decimals} symbol={symbol} compact />
            ) : (
              '—'
            )
          }
          meta={
            inputsValid
              ? `up-front for ${Math.floor(durationDays)} days · quoted live, final premium set at purchase`
              : 'enter an amount + term'
          }
        />
        <StatBlock
          label={`your ${symbol} balance`}
          value={
            balance !== undefined ? (
              <TokenAmount amount={balance} decimals={decimals} symbol={symbol} compact />
            ) : (
              '—'
            )
          }
          meta="premium is pulled from vault shares"
        />
      </div>

      {insufficientBalance && numeraire && (
        <Notice tone="warn" size="sm" title={`Not enough ${symbol} to pay the premium`}>
          The premium is paid from your vault-share balance.{' '}
          <Link to={`/app/vaults/${numeraire}`}>Deposit into the vault</Link> to get {symbol}, then
          come back to buy cover.
        </Notice>
      )}

      {frozen && (
        <Notice tone="warn" size="sm" title="Cover sales paused">
          A loss is under challenge or the mutual has terminated — new cover can't be bound right now.
        </Notice>
      )}

      {flow.step === 'complete' ? (
        <Notice tone="success" size="sm" title="Cover bound">
          Your cover is active and the premium has funded the underwriters' stream.{' '}
          <Button size="sm" variant="ghost" onClick={() => { flow.reset(); setCoverText('') }}>
            Buy more
          </Button>
        </Notice>
      ) : !allowanceOk ? (
        <div className="ds-stack ds-stack-1">
          {premium !== undefined && (
            <span className="ds-text-xs ds-subtle">
              Step 1 of 2 — approve {symbol} so the policy can pull the premium.
            </span>
          )}
          <Button onClick={() => premium !== undefined && flow.approve(premium)} disabled={!canAct}>
            {flow.step === 'approving' ? 'Approving…' : `Approve ${symbol}`}
          </Button>
        </div>
      ) : (
        <div className="ds-stack ds-stack-1">
          {premium !== undefined && (
            <span className="ds-text-xs ds-subtle">Step 2 of 2 — bind the cover.</span>
          )}
          <Button
            onClick={() => inputsValid && flow.bind(mutualId, notional, duration)}
            disabled={!canAct}
          >
            {flow.step === 'binding' ? 'Buying cover…' : 'Buy cover'}
          </Button>
        </div>
      )}

      {flow.error && (
        <Notice tone="danger" size="sm" title="Transaction failed">
          {legibleWriteError(flow.error)}
        </Notice>
      )}

      <Notice tone="info" size="sm" title="How cover works">
        You pay the quoted premium up-front; it funds the reward stream the mutual's underwriters
        earn. If the risk triggers and a loss executes, the mutual's beneficiary routes the
        recovery to the cover claimant.
      </Notice>
    </div>
  )
}
