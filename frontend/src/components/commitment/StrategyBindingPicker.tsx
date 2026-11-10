import { useEffect, useState } from 'react'
import { type Address, parseUnits } from 'viem'
import { useChainId } from 'wagmi'

import { Button, Input, Notice } from '../ui'
import { formatBps } from '../../utils/commitments'
import { legibleWriteError } from '../../utils/contractErrors'
import { getContractAddresses } from '../../config/contracts'
import { useFundStrategy } from '../../hooks/useFundStrategy'
import {
  buildStrategyBindings,
  type StrategyBinding,
} from '../../lib/strategyBindings'

/** Parse a fee string at the token's decimals, returning 0n on empty/invalid. */
function parseFeeOrZero(text: string, decimals: number): bigint {
  if (!text) return 0n
  try {
    return parseUnits(text, decimals)
  } catch {
    return 0n
  }
}

export interface StrategyBindingState {
  /** Encoded bindings ready to pass to createCommitment's `strategies`. */
  bindings: StrategyBinding[]
  /** False while a flat fee is entered but its escrow isn't funded yet — the
   *  parent should disable submit until this is true. */
  ready: boolean
}

interface StrategyBindingPickerProps {
  managerAddress: Address | undefined
  /** The commitment's backing token (fee is denominated in it). */
  token: Address | undefined
  tokenDecimals: number
  tokenSymbol: string
  userAddress: Address | undefined
  isConnected: boolean
  onChange: (state: StrategyBindingState) => void
}

/**
 * Optional strategy bindings for commitment creation. Two strategies:
 *
 *  - IndexAppreciationYield — routes a bps share of backing appreciation to the
 *    counterparty. No pre-funding; binds in the single createCommitment tx.
 *  - FlatFeeAtCreate — an upfront fee paid to the counterparty. The strategy
 *    escrow must be funded first (approve + manager.fundStrategy), so this
 *    component owns that pre-step and reports `ready=false` until the exact fee
 *    is funded.
 */
export function StrategyBindingPicker({
  managerAddress,
  token,
  tokenDecimals,
  tokenSymbol,
  userAddress,
  isConnected,
  onChange,
}: StrategyBindingPickerProps) {
  const chainId = useChainId()
  const { indexYieldStrategy, flatFeeStrategy } = getContractAddresses(chainId)

  const [yieldBpsText, setYieldBpsText] = useState('0')
  const yieldBpsNum = Number(yieldBpsText)
  const yieldBps =
    Number.isFinite(yieldBpsNum) && yieldBpsNum >= 0 && yieldBpsNum <= 10000
      ? Math.round(yieldBpsNum)
      : 0

  const [feeText, setFeeText] = useState('')
  const [feeError, setFeeError] = useState(false)
  const flatFee = parseFeeOrZero(feeText, tokenDecimals)

  // The fee escrow funding pre-step.
  const [fundedFee, setFundedFee] = useState<bigint>(0n)
  const funding = useFundStrategy({
    managerAddress,
    strategy: flatFeeStrategy,
    token,
    userAddress,
    onSuccess: () => setFundedFee(flatFee),
  })

  const needsFee = flatFee > 0n
  const feeFunded = needsFee ? fundedFee === flatFee : true
  const needsApproval =
    needsFee &&
    funding.currentAllowance !== undefined &&
    funding.currentAllowance < flatFee

  // Emit bindings + readiness whenever the inputs or funding state change.
  useEffect(() => {
    const bindings = buildStrategyBindings(
      { yieldShareBps: yieldBps, flatFee },
      { indexYieldStrategy, flatFeeStrategy },
    )
    onChange({ bindings, ready: feeFunded })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange is left out: an inline callback would re-emit on every render
  }, [yieldBps, flatFee, feeFunded, indexYieldStrategy, flatFeeStrategy])

  function handleFeeChange(value: string) {
    setFeeText(value)
    // Re-arm funding if the amount changed away from what was funded.
    if (funding.step !== 'idle') funding.reset()
    setFundedFee(0n)
    if (!value) {
      setFeeError(false)
      return
    }
    try {
      parseUnits(value, tokenDecimals)
      setFeeError(false)
    } catch {
      setFeeError(true)
    }
  }

  function handleFund() {
    if (flatFee === 0n) return
    if (needsApproval) funding.approve(flatFee)
    else funding.fund(flatFee)
  }

  const yieldUnconfigured = yieldBps > 0 && !indexYieldStrategy
  const feeUnconfigured = needsFee && !flatFeeStrategy

  const fundLabel =
    funding.step === 'approving'
      ? 'APPROVING…'
      : funding.step === 'funding'
        ? 'FUNDING…'
        : needsApproval
          ? `APPROVE ${tokenSymbol}`
          : 'FUND FEE'

  return (
    <details className="metadata-section">
      <summary>STRATEGY BINDINGS (OPTIONAL)</summary>
      <div className="metadata-section-body ds-stack ds-stack-4">
        {/* IndexAppreciationYield — yield share to counterparty */}
        <div className="ds-field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 /* layout only */ }}>
            <label className="ds-label" htmlFor="yield-share-slider" style={{ marginBottom: 0 /* layout only */ }}>
              YIELD SHARE TO COUNTERPARTY (BPS)
            </label>
            <span className="commitment-slider-value">{formatBps(yieldBps)}</span>
          </div>
          <input
            id="yield-share-slider"
            className="commitment-slider"
            type="range"
            min={0}
            max={10000}
            step={100}
            value={yieldBps}
            onChange={(e) => setYieldBpsText(e.target.value)}
            disabled={!isConnected}
            aria-label={`Yield share: ${formatBps(yieldBps)}`}
          />
          <Input
            type="text"
            value={yieldBpsText}
            onChange={(e) => setYieldBpsText(e.target.value)}
            disabled={!isConnected}
            placeholder="BPS (0-10000)"
            style={{ marginTop: 4, width: 120 /* layout only */ }}
            aria-label="Yield share BPS text input"
          />
          <Notice tone="info" size="sm">
            Routes this share of backing appreciation to the counterparty via
            IndexAppreciationYield. No pre-funding required.
          </Notice>
          {yieldUnconfigured && (
            <Notice tone="warn" size="sm">
              IndexAppreciationYield address is unset on this chain — this binding will be dropped.
            </Notice>
          )}
        </div>

        {/* FlatFeeAtCreate — upfront fee, needs funding */}
        <div className="ds-field">
          <label className="ds-label" htmlFor="flat-fee-input">
            UPFRONT FEE ({tokenSymbol})
          </label>
          <Input
            id="flat-fee-input"
            type="text"
            value={feeText}
            onChange={(e) => handleFeeChange(e.target.value)}
            disabled={!isConnected}
            placeholder="0.0 (leave blank for no fee)"
            tone={feeError ? 'danger' : 'neutral'}
            style={{ width: 200 /* layout only */ }}
          />
          {feeError && <Notice tone="danger" size="sm">INVALID AMOUNT</Notice>}
          {feeUnconfigured && (
            <Notice tone="warn" size="sm">
              FlatFeeAtCreate address is unset on this chain — this binding will be dropped.
            </Notice>
          )}
          {needsFee && !feeUnconfigured && (
            <div className="ds-stack ds-stack-2" style={{ marginTop: 8 /* layout only */ }}>
              <Notice tone={feeFunded ? 'success' : 'warn'} size="sm">
                {feeFunded
                  ? 'FEE FUNDED — ready to create.'
                  : 'Fund the fee escrow before creating, or the commitment will revert.'}
              </Notice>
              {!feeFunded && (
                <Button
                  size="sm"
                  onClick={handleFund}
                  disabled={
                    !isConnected ||
                    feeError ||
                    funding.step === 'approving' ||
                    funding.step === 'funding'
                  }
                >
                  {fundLabel}
                </Button>
              )}
              {funding.step === 'error' && funding.error && (
                <Notice tone="danger" size="sm">
                  {legibleWriteError(funding.error)}
                </Notice>
              )}
            </div>
          )}
        </div>
      </div>
    </details>
  )
}
