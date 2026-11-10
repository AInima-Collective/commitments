import { useMemo } from 'react'
import { parseEventLogs, type Address, type TransactionReceipt } from 'viem'
import { useAccount, useChainId } from 'wagmi'
import { commitmentManagerAbi, operatorRegistryAbi } from '../../generated'
import { type FullCommitmentParams, useCreateCommitmentFlow } from '../../hooks/useCreateCommitmentFlow'
import { useAmountInput } from '../../hooks/useAmountInput'
import { useRegistryPolicy } from '../../hooks/useRegistryPolicy'
import { useVaults } from '../../hooks/useVaults'
import { useTx, useTxFeedback } from '../../hooks/useWriteAction'
import { getDefaultBacking } from '../../config/contracts'
import { Button, Input, Notice, TokenAmount } from '../ui'
import { FundingNotice } from '../commitment/FundingNotice'

/**
 * Delegation is a two-tx flow (three when the stake exceeds free shares and the
 * shortfall is funded from the wallet):
 *   0. (optional) ERC-20 approve(manager, shortfall) so `createAndFund` can pull
 *   1. CommitmentManager.createCommitment / createAndFund(arbiter, operatorRegistry, amount, ...)
 *   2. OperatorRegistry.delegate(operator, commitmentId)
 *
 * Steps 0 and 1 are `useCreateCommitmentFlow`. The commitmentId isn't known
 * until tx1's receipt emits CommitmentCreated; we parse it out with viem and
 * auto-fire tx2. The phase is derived from the two flows so the user sees
 * what's happening.
 */
type Phase =
  | { kind: 'idle' }
  | { kind: 'approving' }
  | { kind: 'confirmingApprove' }
  | { kind: 'creating' }
  | { kind: 'confirmingCreate' }
  | { kind: 'extractingId' }
  | { kind: 'delegating'; commitmentId: bigint }
  | { kind: 'confirmingDelegate'; commitmentId: bigint }
  | { kind: 'done'; commitmentId: bigint }
  | { kind: 'error' }

interface Props {
  operatorAddress: Address
  commitmentManagerAddress: Address | undefined
  operatorRegistryAddress: Address | undefined
  freeShares: bigint | undefined
  shareDecimals: number | undefined
}

const CHALLENGE_WINDOW_DEFAULT = 86400 // 1 day — min allowed by contract

/** The new commitment's id from the create receipt's CommitmentCreated log. */
function createdIdOf(receipt: TransactionReceipt): bigint {
  const created = parseEventLogs({
    abi: commitmentManagerAbi,
    eventName: 'CommitmentCreated',
    logs: receipt.logs,
  })[0]
  if (!created) throw new Error('CommitmentCreated event not found in receipt')
  return created.args.commitmentId
}

export function DelegateToOperatorForm({
  operatorAddress,
  commitmentManagerAddress,
  operatorRegistryAddress,
  freeShares,
  shareDecimals,
}: Props) {
  const { address, isConnected } = useAccount()
  const decimals = shareDecimals ?? 18

  const chainId = useChainId()
  const { vaults } = useVaults()
  const backing = getDefaultBacking(chainId, vaults)
  const shareToken = backing?.token
  const { requiredArbiter, minMaxPenaltyBps } = useRegistryPolicy(
    operatorRegistryAddress,
  )

  const amountInput = useAmountInput(decimals)
  const parsedAmount = amountInput.amount !== 0n ? amountInput.amount : undefined

  // Max penalty is not a delegator-facing knob. The registry policy fixes the
  // floor, and a delegator gains nothing by committing to more slashing
  // exposure than required — so we bind it to the policy floor and surface no
  // control. Falls back to 50% only while policy is still loading (submission
  // is gated on `requiredArbiter`, which resolves in the same multicall, so
  // the fallback never reaches the contract).
  const maxPenaltyBps = minMaxPenaltyBps ?? 5000

  // ── tx2: delegate, fired once the create receipt names the new id ─────────
  const delegate = useTx()
  // ── tx0 + tx1: approve the shortfall if needed, then create ───────────────
  const flow = useCreateCommitmentFlow({
    managerAddress: commitmentManagerAddress,
    token: shareToken,
    userAddress: address,
    onSuccess: (receipt) => {
      if (!operatorRegistryAddress) return
      let commitmentId: bigint
      try {
        commitmentId = createdIdOf(receipt)
      } catch {
        return // surfaced as the phase error below
      }
      delegate.write({
        abi: operatorRegistryAbi,
        address: operatorRegistryAddress,
        functionName: 'delegate',
        args: [operatorAddress, commitmentId],
      })
    },
  })

  // The parsed id, or the parse failure (memoised so it toasts once).
  const created = useMemo(() => {
    if (!flow.receipt) return { id: undefined, error: null }
    try {
      return { id: createdIdOf(flow.receipt), error: null }
    } catch (err) {
      return { id: undefined, error: err instanceof Error ? err : new Error('Failed to parse commitment receipt') }
    }
  }, [flow.receipt])
  const createdId = created.id

  const phase: Phase =
    delegate.step !== 'idle' && createdId !== undefined
      ? delegate.step === 'signing'
        ? { kind: 'delegating', commitmentId: createdId }
        : delegate.step === 'confirming'
          ? { kind: 'confirmingDelegate', commitmentId: createdId }
          : delegate.step === 'confirmed'
            ? { kind: 'done', commitmentId: createdId }
            : { kind: 'error' }
      : flow.step === 'complete'
        ? created.error
          ? { kind: 'error' }
          : { kind: 'extractingId' }
        : flow.step === 'approving'
          ? { kind: flow.awaitingWallet ? 'approving' : 'confirmingApprove' }
          : flow.step === 'creating'
            ? { kind: flow.awaitingWallet ? 'creating' : 'confirmingCreate' }
            : flow.step === 'error'
              ? { kind: 'error' }
              : { kind: 'idle' }

  // Success and failure toasts for the whole flow. Each error object toasts once.
  const flowError = delegate.error ?? flow.error ?? created.error
  useTxFeedback(delegate.receipt, flowError, {
    successTitle: createdId !== undefined ? `DELEGATED COMMITMENT #${createdId}` : undefined,
    successBody:
      parsedAmount !== undefined ? <TokenAmount amount={parsedAmount} decimals={decimals} /> : null,
  })

  // Shortfall between the staked amount and free shares. When positive it's
  // deposited from the wallet in the same flow (approve → createAndFund) rather
  // than blocking submit; only a wallet that can't cover it is a hard stop.
  const shortfall =
    parsedAmount !== undefined && freeShares !== undefined && parsedAmount > freeShares
      ? parsedAmount - freeShares
      : 0n
  const needsDeposit = shortfall > 0n
  const exceedsWallet = needsDeposit && flow.walletBalance !== undefined && shortfall > flow.walletBalance

  const canSubmit =
    isConnected &&
    !!commitmentManagerAddress &&
    !!operatorRegistryAddress &&
    parsedAmount !== undefined &&
    !!requiredArbiter &&
    // The commitment is backed by the configured token; none configured, no submit.
    !!backing &&
    // Funding needs a known share token to approve/deposit against.
    (!needsDeposit || !!shareToken) &&
    !exceedsWallet &&
    (phase.kind === 'idle' || phase.kind === 'done' || phase.kind === 'error')

  function handleMaxFree() {
    if (freeShares !== undefined) amountInput.setMax(freeShares)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (
      !canSubmit ||
      !commitmentManagerAddress ||
      !operatorRegistryAddress ||
      !parsedAmount ||
      !requiredArbiter ||
      !backing
    )
      return

    delegate.reset()

    const params: FullCommitmentParams = {
      arbiter: requiredArbiter,
      counterparty: operatorRegistryAddress,
      token: backing.token,
      adapter: backing.adapter,
      amount: parsedAmount,
      maxPenaltyBps,
      challengeWindow: BigInt(CHALLENGE_WINDOW_DEFAULT),
      expiresAt: 0n,
      strategies: [],
      metadataURI: '',
      metadataHash: ('0x' + '00'.repeat(32)) as `0x${string}`,
    }
    // Fund the shortfall from the wallet in-flow (0 ⇒ free shares cover it).
    // The flow approves first only when the manager lacks allowance.
    flow.submit(params, shortfall)
  }

  function handleReset() {
    flow.reset()
    delegate.reset()
    amountInput.clear()
  }

  const statusText = (() => {
    switch (phase.kind) {
      case 'approving':
        return 'AWAITING WALLET: APPROVE DEPOSIT'
      case 'confirmingApprove':
        return 'CONFIRMING APPROVAL...'
      case 'creating':
        return 'AWAITING WALLET: CREATE COMMITMENT'
      case 'confirmingCreate':
        return 'CONFIRMING COMMITMENT TX...'
      case 'extractingId':
        return 'PARSING COMMITMENT RECEIPT...'
      case 'delegating':
        return `AWAITING WALLET: DELEGATE COMMITMENT #${phase.commitmentId}`
      case 'confirmingDelegate':
        return `CONFIRMING DELEGATE TX (COMMITMENT #${phase.commitmentId})...`
      default:
        return null
    }
  })()

  const isInFlight =
    phase.kind === 'approving' ||
    phase.kind === 'confirmingApprove' ||
    phase.kind === 'creating' ||
    phase.kind === 'confirmingCreate' ||
    phase.kind === 'extractingId' ||
    phase.kind === 'delegating' ||
    phase.kind === 'confirmingDelegate'

  return (
    <form
      onSubmit={handleSubmit}
      className="ds-card"
      style={{ marginTop: 'var(--space-3)' }}
    >
      <h3>DELEGATE TO OPERATOR</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
        <label htmlFor="delegate-amount">AMOUNT (SHARES)</label>
        <span className="ds-input-group">
          <Input
            id="delegate-amount"
            type="text"
            value={amountInput.text}
            onChange={(e) => amountInput.setText(e.target.value)}
            placeholder="0.0000"
            disabled={!isConnected}
          />
          <Button
            className="ds-btn--max"
            onClick={handleMaxFree}
            disabled={!isConnected || freeShares === undefined}
          >
            MAX FREE
          </Button>
        </span>
        <FundingNotice
          amount={parsedAmount}
          free={freeShares}
          shortfall={shortfall}
          wallet={flow.walletBalance}
          decimals={decimals}
          noun="shares"
          subject="delegation"
        />
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button
          type="submit"
          variant="primary"
          fullWidth
          disabled={!canSubmit}
          title={!isConnected ? 'Connect wallet to delegate' : undefined}
        >
          {needsDeposit ? 'FUND & DELEGATE' : 'DELEGATE'}
        </Button>
        {(phase.kind === 'done' || phase.kind === 'error') && (
          <Button
            onClick={handleReset}
          >
            NEW DELEGATION
          </Button>
        )}
      </div>

      {isInFlight && statusText && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          <Notice tone="info" size="sm">
            {statusText}
          </Notice>
        </div>
      )}
    </form>
  )
}
