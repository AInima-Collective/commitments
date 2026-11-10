import { useEffect } from 'react'
import { type Address } from 'viem'
import { useAmountInput } from '../../hooks/useAmountInput'
import { useDepositFlow } from '../../hooks/useDepositFlow'
import { BalanceLine, Notice, TokenAmount, Tooltip, useToasts } from '../ui'
import { DepositStepper } from './DepositStepper'
import { deriveDepositSteps } from './depositSteps'
import { legibleWriteError } from '../../utils/contractErrors'

interface DepositWizardProps {
  vaultAddress: Address | undefined
  assetAddress: Address | undefined
  assetSymbol: string | undefined
  assetDecimals: number | undefined
  userAddress: Address | undefined
  isConnected: boolean
  depositsPaused: boolean
  onDepositSuccess: () => void
}

export function DepositWizard({
  vaultAddress,
  assetAddress,
  assetSymbol,
  assetDecimals,
  userAddress,
  isConnected,
  depositsPaused,
  onDepositSuccess,
}: DepositWizardProps) {
  const decimals = assetDecimals ?? 18
  const symbol = assetSymbol ?? 'TOKEN'
  const amountInput = useAmountInput(decimals)
  const parsedAmount = amountInput.amount
  const parseError = amountInput.invalid

  const { push } = useToasts()

  // NOTE: the parent-close (onDepositSuccess) is deliberately NOT wired to the
  // flow's onSuccess. That fires in the same tick as the step→complete
  // transition, so closing there unmounts this component before its
  // `flow.step === 'complete'` effect runs — swallowing the success toast. The
  // close is invoked from that effect instead, right after the toast is pushed.
  const flow = useDepositFlow({
    vaultAddress,
    assetAddress,
    userAddress,
  })

  // Surface flow state changes via toasts (success/error). Auto-reset 3s
  // after a complete so the user can see the success toast and submit
  // another deposit without manual reset.
  useEffect(() => {
    if (flow.step === 'approving') {
      push({
        tone: 'info',
        title: 'CONFIRM IN WALLET',
        body: <>Approve {symbol} for the vault — check your wallet.</>,
      })
    }
    if (flow.step === 'depositing') {
      push({
        tone: 'info',
        title: 'CONFIRM IN WALLET',
        body: <>Sign the deposit transaction in your wallet.</>,
      })
    }
    if (flow.step === 'approved') {
      push({
        tone: 'success',
        title: 'APPROVAL CONFIRMED',
        body: <>{symbol} approved for the vault. Tap DEPOSIT next.</>,
      })
    }
    if (flow.step === 'complete') {
      push({
        tone: 'success',
        title: 'DEPOSIT CONFIRMED',
        body: (
          <>
            <TokenAmount amount={parsedAmount ?? 0n} decimals={decimals} symbol={symbol} size="inline" /> deposited.
          </>
        ),
      })
      // Toast is pushed above; close the modal now (the parent also refetches).
      onDepositSuccess()
      const timer = setTimeout(() => {
        flow.reset()
        amountInput.clear()
      }, 3000)
      return () => clearTimeout(timer)
    }
    if (flow.step === 'error') {
      push({
        tone: 'danger',
        title: 'TRANSACTION FAILED',
        body: legibleWriteError(flow.error),
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.step])

  const exceedsBalance =
    parsedAmount !== undefined &&
    flow.tokenBalance !== undefined &&
    parsedAmount > flow.tokenBalance

  // If allowance already covers requested amount, skip approve step
  const hasAllowance =
    parsedAmount !== undefined &&
    flow.currentAllowance !== undefined &&
    flow.currentAllowance >= parsedAmount

  const inProgress = flow.step === 'approving' || flow.step === 'depositing'

  const needsApprove = !hasAllowance && (flow.step === 'idle' || flow.step === 'error')
  const actionLabel = needsApprove
    ? flow.step === 'approving' ? 'APPROVING…' : 'APPROVE'
    : flow.step === 'depositing' ? 'DEPOSITING…' : 'DEPOSIT'

  const actionDisabled =
    !isConnected ||
    depositsPaused ||
    !parsedAmount ||
    parseError ||
    exceedsBalance ||
    inProgress ||
    flow.step === 'complete'

  function handleAction() {
    if (!parsedAmount) return
    if (needsApprove) {
      flow.approve(parsedAmount)
    } else {
      flow.deposit(parsedAmount)
    }
  }

  const { step1, step2 } = deriveDepositSteps(flow.step, hasAllowance)

  return (
    <div className="ds-card ds-stack ds-stack-3">
      <p className="ds-text-sm ds-muted" style={{ margin: 0 /* layout only */ }}>
        Depositing mints{' '}
        <Tooltip
          tone="info"
          size="lg"
          content="The vault is a yield-bearing ERC-4626. Your deposit is put to work earning yield, and you receive shares that track your slice of the vault."
        >
          vault shares
        </Tooltip>{' '}
        that keep earning. The same shares can later{' '}
        <Tooltip
          tone="info"
          size="lg"
          content="Shares serve as backing for commitments: the manager custodies them while the underlying assets stay invested, so your capital secures an agreement and accrues yield at the same time."
        >
          back commitments
        </Tooltip>{' '}
        without giving up the yield.
      </p>

      <DepositStepper steps={[step1, step2]} />

      {depositsPaused && (
        <Notice tone="warn" size="md" title="DEPOSITS PAUSED">
          Deposits are temporarily paused by the vault administrator.
        </Notice>
      )}

      {!isConnected && (
        <Notice tone="info" size="md" title="WALLET NOT CONNECTED">
          Connect a wallet to deposit, withdraw, or claim. Read-only browsing is fine without a wallet.
        </Notice>
      )}

      <input
        type="text"
        className="ds-input"
        placeholder={`Amount (${symbol})`}
        aria-label={`Amount in ${symbol}`}
        value={amountInput.text}
        onChange={(e) => amountInput.setText(e.target.value)}
        disabled={depositsPaused || !isConnected || inProgress}
      />

      {flow.tokenBalance !== undefined && assetDecimals !== undefined && (
        <BalanceLine
          label="BALANCE"
          amount={flow.tokenBalance}
          decimals={decimals}
          symbol={symbol}
          onMax={() => flow.tokenBalance !== undefined && amountInput.setMax(flow.tokenBalance)}
          maxDisabled={depositsPaused || !isConnected || inProgress}
        />
      )}

      {parseError && (
        <Notice tone="danger" size="sm" title="INVALID AMOUNT">
          Enter a positive number with at most {decimals} decimal places.
        </Notice>
      )}
      {exceedsBalance && !parseError && (
        <Notice tone="danger" size="sm" title="EXCEEDS BALANCE" />
      )}

      <button
        type="button"
        className="ds-btn ds-btn--primary ds-btn--full"
        onClick={handleAction}
        disabled={actionDisabled}
      >
        {actionLabel}
      </button>
    </div>
  )
}
