import { useEffect, useState } from 'react'
import { type Address, parseUnits } from 'viem'
import { useDepositFlow } from '../../hooks/useDepositFlow'
import { formatTokenAmount } from '../../lib/format'
import { BalanceLine, Notice, TokenAmount, Tooltip, useToasts } from '../ui'

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

// Stepper tone resolution per UI-SPEC §Stepper.
type StepTone = 'neutral' | 'info' | 'success' | 'danger'
type StepGlyph = '[ ]' | '[…]' | '[✓]' | '[!]'

interface StepDescriptor {
  tone: StepTone
  glyph: StepGlyph
  label: string
}

function deriveSteps(
  step: 'idle' | 'approving' | 'approved' | 'depositing' | 'complete' | 'error',
  hasAllowance: boolean,
): { step1: StepDescriptor; step2: StepDescriptor | null } {
  // 1-step path: allowance covers the requested amount
  if (hasAllowance) {
    if (step === 'depositing') {
      return { step1: { tone: 'info', glyph: '[…]', label: 'STEP 1 OF 1 — DEPOSITING…' }, step2: null }
    }
    if (step === 'complete') {
      return { step1: { tone: 'success', glyph: '[✓]', label: 'DEPOSIT COMPLETE' }, step2: null }
    }
    if (step === 'error') {
      return { step1: { tone: 'danger', glyph: '[!]', label: 'STEP 1 OF 1 — DEPOSIT' }, step2: null }
    }
    return { step1: { tone: 'info', glyph: '[ ]', label: 'STEP 1 OF 1 — DEPOSIT' }, step2: null }
  }

  // 2-step path
  switch (step) {
    case 'approving':
      return {
        step1: { tone: 'info', glyph: '[…]', label: 'STEP 1 OF 2 — APPROVING…' },
        step2: { tone: 'neutral', glyph: '[ ]', label: 'STEP 2 OF 2 — DEPOSIT' },
      }
    case 'approved':
      return {
        step1: { tone: 'success', glyph: '[✓]', label: 'STEP 1 OF 2 — APPROVE' },
        step2: { tone: 'info', glyph: '[ ]', label: 'STEP 2 OF 2 — DEPOSIT' },
      }
    case 'depositing':
      return {
        step1: { tone: 'success', glyph: '[✓]', label: 'STEP 1 OF 2 — APPROVE' },
        step2: { tone: 'info', glyph: '[…]', label: 'STEP 2 OF 2 — DEPOSITING…' },
      }
    case 'complete':
      return {
        step1: { tone: 'success', glyph: '[✓]', label: 'STEP 1 OF 2 — APPROVE' },
        step2: { tone: 'success', glyph: '[✓]', label: 'DEPOSIT COMPLETE' },
      }
    case 'error':
      return {
        step1: { tone: 'danger', glyph: '[!]', label: 'STEP 1 OF 2 — APPROVE' },
        step2: { tone: 'neutral', glyph: '[ ]', label: 'STEP 2 OF 2 — DEPOSIT' },
      }
    case 'idle':
    default:
      return {
        step1: { tone: 'info', glyph: '[ ]', label: 'STEP 1 OF 2 — APPROVE' },
        step2: { tone: 'neutral', glyph: '[ ]', label: 'STEP 2 OF 2 — DEPOSIT' },
      }
  }
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
  const [inputValue, setInputValue] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsedAmount, setParsedAmount] = useState<bigint | undefined>(undefined)

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

  // Parse input on change
  function handleInputChange(value: string) {
    setInputValue(value)
    if (!value) {
      setParsedAmount(undefined)
      setParseError(null)
      return
    }
    try {
      const decimals = assetDecimals ?? 18
      const parsed = parseUnits(value, decimals)
      setParsedAmount(parsed)
      setParseError(null)
    } catch {
      setParsedAmount(undefined)
      setParseError('INVALID AMOUNT')
    }
  }

  // MAX button handler
  function handleMax() {
    if (flow.tokenBalance === undefined || assetDecimals === undefined) return
    const maxValue = formatTokenAmount(flow.tokenBalance, assetDecimals).full
    handleInputChange(maxValue)
  }

  const decimals = assetDecimals ?? 18
  const symbol = assetSymbol ?? 'TOKEN'

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
        setInputValue('')
        setParsedAmount(undefined)
        setParseError(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
    if (flow.step === 'error') {
      push({
        tone: 'danger',
        title: 'TRANSACTION FAILED',
        body: flow.error?.message?.split('\n')[0] ?? 'Unknown error.',
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
    !!parseError ||
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

  const { step1, step2 } = deriveSteps(flow.step, hasAllowance)

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

      <div className="ds-stepper">
        <Notice tone={step1.tone} size="sm" icon={step1.glyph}>{step1.label}</Notice>
        {step2 && (
          <Notice tone={step2.tone} size="sm" icon={step2.glyph}>{step2.label}</Notice>
        )}
      </div>

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
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        disabled={depositsPaused || !isConnected || inProgress}
      />

      {flow.tokenBalance !== undefined && assetDecimals !== undefined && (
        <BalanceLine
          label="BALANCE"
          amount={flow.tokenBalance}
          decimals={decimals}
          symbol={symbol}
          onMax={handleMax}
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
