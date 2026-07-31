import { useEffect, useState } from 'react'
import { type Address, parseUnits } from 'viem'
import {
  useReadCommitmentsVaultPreviewRedeem,
  useWriteCommitmentsVaultRedeem,
} from '../../generated'
import { formatTokenAmount } from '../../lib/format'
import { BalanceLine, Notice, TokenAmount, useToasts } from '../ui'

interface WithdrawFormProps {
  vaultAddress: Address | undefined
  userAddress: Address | undefined
  /** Wallet share balance (ERC-4626 balanceOf) — all of it is redeemable.
   *  Encumbered backing lives in the manager ledger, not in the wallet. */
  shares: bigint | undefined
  shareDecimals: number | undefined
  assetDecimals: number | undefined
  assetSymbol: string | undefined
  isConnected: boolean
  onWithdrawSuccess: () => void
}

/**
 * Instant ERC-4626 redeem. v2 vault has no withdrawal queue or unbonding —
 * shares burn and the underlying asset returns to the wallet in one tx. The
 * vault's strategy override pulls any liquidity shortfall synchronously.
 */
export function WithdrawForm({
  vaultAddress,
  userAddress,
  shares,
  shareDecimals,
  assetDecimals,
  assetSymbol,
  isConnected,
  onWithdrawSuccess,
}: WithdrawFormProps) {
  const [inputValue, setInputValue] = useState('')
  const [parsedShares, setParsedShares] = useState<bigint | undefined>(undefined)
  const [parseError, setParseError] = useState<string | null>(null)

  const sDecimals = shareDecimals ?? 18
  const aDecimals = assetDecimals ?? 18
  const symbol = assetSymbol ?? 'TOKEN'

  const { push } = useToasts()

  function handleInputChange(value: string) {
    setInputValue(value)
    if (!value) {
      setParsedShares(undefined)
      setParseError(null)
      return
    }
    try {
      const parsed = parseUnits(value, sDecimals)
      setParsedShares(parsed)
      setParseError(null)
    } catch {
      setParsedShares(undefined)
      setParseError('INVALID AMOUNT')
    }
  }

  function handleMax() {
    if (shares === undefined) return
    handleInputChange(formatTokenAmount(shares, sDecimals).full)
  }

  const exceedsBalance =
    parsedShares !== undefined && shares !== undefined && parsedShares > shares

  const previewEnabled =
    !!vaultAddress && !!parsedShares && parsedShares > 0n && !exceedsBalance
  const { data: previewAssets } = useReadCommitmentsVaultPreviewRedeem({
    address: vaultAddress,
    args: parsedShares ? [parsedShares] : undefined,
    query: { enabled: previewEnabled },
  })

  const { writeContract, isPending, isSuccess, isError, error, reset } =
    useWriteCommitmentsVaultRedeem()

  useEffect(() => {
    if (isSuccess) {
      const submittedShares = parsedShares ?? 0n
      push({
        tone: 'success',
        title: 'WITHDRAWAL COMPLETE',
        body: (
          <>
            Redeemed <TokenAmount amount={submittedShares} decimals={sDecimals} size="inline" /> shares.
          </>
        ),
      })
      onWithdrawSuccess()
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine (post-tx form reset); see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setInputValue('')
      setParsedShares(undefined)
      reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  useEffect(() => {
    if (isError) {
      push({
        tone: 'danger',
        title: 'TRANSACTION FAILED',
        body: error?.message?.split('\n')[0] ?? 'Unknown error.',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError])

  const actionDisabled =
    !isConnected ||
    !userAddress ||
    !parsedShares ||
    parsedShares === 0n ||
    !!parseError ||
    exceedsBalance ||
    isPending

  function handleAction() {
    if (!vaultAddress || !parsedShares || !userAddress) return
    // redeem(shares, receiver, owner) — burn the caller's shares, asset to wallet.
    writeContract({ address: vaultAddress, args: [parsedShares, userAddress, userAddress] })
  }

  const stepGlyph: '[ ]' | '[…]' = isPending ? '[…]' : '[ ]'
  const stepLabel = isPending ? 'STEP 1 OF 1 — REDEEMING…' : 'STEP 1 OF 1 — REDEEM SHARES'

  return (
    <div className="ds-card ds-stack ds-stack-3">
      <div className="ds-stepper">
        <Notice tone="info" size="sm" icon={stepGlyph}>{stepLabel}</Notice>
      </div>

      {!isConnected && (
        <Notice tone="info" size="md" title="WALLET NOT CONNECTED">
          Connect a wallet to deposit or withdraw. Read-only browsing is fine without a wallet.
        </Notice>
      )}

      <input
        type="text"
        className="ds-input"
        placeholder="Share amount"
        aria-label="Share amount"
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        disabled={!isConnected || isPending}
      />

      {shares !== undefined && (
        <BalanceLine
          label="YOUR SHARES"
          amount={shares}
          decimals={sDecimals}
          symbol="shares"
          onMax={handleMax}
          maxDisabled={!isConnected || isPending}
        />
      )}

      {previewAssets !== undefined && parsedShares && parsedShares > 0n && (
        <span className="ds-row ds-row-2 ds-text-sm">
          <span className="ds-label">estimated return</span>
          <TokenAmount amount={previewAssets as bigint} decimals={aDecimals} symbol={symbol} size="inline" />
        </span>
      )}

      {parseError && (
        <Notice tone="danger" size="sm" title="INVALID AMOUNT">
          Enter a positive number with at most {sDecimals} decimal places.
        </Notice>
      )}
      {exceedsBalance && !parseError && (
        <Notice tone="danger" size="sm" title="EXCEEDS YOUR SHARES" />
      )}

      <button
        type="button"
        className="ds-btn ds-btn--primary ds-btn--full"
        onClick={handleAction}
        disabled={actionDisabled}
      >
        REDEEM
      </button>
    </div>
  )
}
