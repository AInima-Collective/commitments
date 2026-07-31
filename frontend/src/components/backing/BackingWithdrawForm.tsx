import { useEffect, useState } from 'react'
import { type Address, erc20Abi, parseUnits } from 'viem'
import { useReadContracts } from 'wagmi'

import { BalanceLine, Notice, StatBlock, TokenAmount, useToasts } from '../ui'
import { formatTokenAmount } from '../../lib/format'
import { useLedgerBalance } from '../../hooks/useLedgerBalance'
import { useManagerLedgerFlow } from '../../hooks/useManagerLedgerFlow'
import type { BackingOption } from '../../config/contracts'

interface BackingWithdrawFormProps {
  managerAddress: Address | undefined
  option: BackingOption
  userAddress: Address | undefined
  isConnected: boolean
  /** Fired after a withdrawal confirms, so the host can refetch dashboard reads. */
  onWithdrawn?: () => void
}

/**
 * Withdraw the manager-ledger **free** balance for one backing token back to the
 * wallet via `manager.withdraw(token, amount)`. Free balance both backs new
 * commitments and is where forfeit proceeds land (a forfeit credits the
 * recipient's free balance), so this form doubles as the "claim forfeit
 * proceeds" path.
 *
 * The deposit direction lives in BackingFlow (which also handles the vault-share
 * mint hop); this is the withdraw-only counterpart for the dashboard's
 * per-asset "Withdraw" modal.
 */
export function BackingWithdrawForm({
  managerAddress,
  option,
  userAddress,
  isConnected,
  onWithdrawn,
}: BackingWithdrawFormProps) {
  const { push } = useToasts()
  const [inputValue, setInputValue] = useState('')
  const [parsed, setParsed] = useState<bigint | undefined>(undefined)
  const [parseError, setParseError] = useState(false)

  // Token metadata (the backing token — a vault share or raw ERC-20).
  const { data: meta } = useReadContracts({
    contracts: [
      { abi: erc20Abi, address: option.token, functionName: 'decimals' },
      { abi: erc20Abi, address: option.token, functionName: 'symbol' },
    ],
    query: { enabled: !!option.token },
  })
  const decimals = (meta?.[0]?.result as number | undefined) ?? 18
  const symbol = (meta?.[1]?.result as string | undefined) ?? 'TOKEN'

  const ledger = useLedgerBalance({ managerAddress, token: option.token, user: userAddress })
  const flow = useManagerLedgerFlow({
    managerAddress,
    token: option.token,
    userAddress,
    onSuccess: () => {
      ledger.refetch()
      // NOTE: the parent-close (onWithdrawn) is intentionally NOT called here.
      // This fires in the same tick as the step→complete transition; closing
      // now unmounts the form before its `flow.step === 'complete'` effect runs,
      // swallowing the success toast. The close happens in that effect instead,
      // right after the toast is pushed.
    },
  })

  const inProgress = flow.step === 'withdrawing'

  function handleInputChange(value: string) {
    setInputValue(value)
    if (!value) {
      setParsed(undefined)
      setParseError(false)
      return
    }
    try {
      setParsed(parseUnits(value, decimals))
      setParseError(false)
    } catch {
      setParsed(undefined)
      setParseError(true)
    }
  }

  function handleMax() {
    if (ledger.free === undefined) return
    handleInputChange(formatTokenAmount(ledger.free, decimals).full)
  }

  const exceedsBalance =
    parsed !== undefined && ledger.free !== undefined && parsed > ledger.free

  // Toast feedback off the flow state machine.
  useEffect(() => {
    if (flow.step === 'complete') {
      push({
        tone: 'success',
        title: 'WITHDRAWAL CONFIRMED',
        body: (
          <>
            <TokenAmount amount={parsed ?? 0n} decimals={decimals} symbol={symbol} size="inline" />{' '}
            returned to your wallet.
          </>
        ),
      })
      // Toast is pushed above; close the modal now (the parent also refetches).
      onWithdrawn?.()
      const timer = setTimeout(() => {
        flow.reset()
        setInputValue('')
        setParsed(undefined)
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

  function handleWithdraw() {
    if (!parsed || parsed === 0n) return
    flow.withdraw(parsed)
  }

  const actionDisabled =
    !isConnected ||
    !userAddress ||
    !parsed ||
    parsed === 0n ||
    parseError ||
    exceedsBalance ||
    inProgress

  return (
    <div className="ds-stack ds-stack-3">
      <div className="ds-row ds-row-3" style={{ gap: 'var(--space-3)' }}>
        <StatBlock
          label="Free"
          value={
            <TokenAmount amount={ledger.free ?? 0n} decimals={decimals} symbol={symbol} size="inline" />
          }
          meta="withdrawable · includes forfeit proceeds"
        />
        <StatBlock
          label="Encumbered"
          value={
            <span data-tone={(ledger.encumbered ?? 0n) > 0n ? 'warn' : undefined}>
              <TokenAmount amount={ledger.encumbered ?? 0n} decimals={decimals} symbol={symbol} size="inline" />
            </span>
          }
          meta="locked by active commitments"
        />
      </div>

      <input
        type="text"
        className="ds-input"
        placeholder={`Amount (${symbol})`}
        aria-label={`Amount in ${symbol}`}
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        disabled={!isConnected || inProgress}
      />

      {ledger.free !== undefined && (
        <BalanceLine
          label="FREE BALANCE"
          amount={ledger.free}
          decimals={decimals}
          symbol={symbol}
          onMax={handleMax}
          maxDisabled={!isConnected || inProgress}
        />
      )}

      {parseError && (
        <Notice tone="danger" size="sm" title="INVALID AMOUNT">
          Enter a positive number with at most {decimals} decimal places.
        </Notice>
      )}
      {exceedsBalance && !parseError && (
        <Notice tone="danger" size="sm" title="EXCEEDS FREE BALANCE" />
      )}

      <button
        type="button"
        className="ds-btn ds-btn--primary ds-btn--full"
        onClick={handleWithdraw}
        disabled={actionDisabled}
      >
        {inProgress ? 'WITHDRAWING…' : 'WITHDRAW'}
      </button>
    </div>
  )
}
