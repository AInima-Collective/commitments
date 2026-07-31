import { useEffect, useMemo, useRef, useState } from 'react'
import { erc20Abi, parseUnits, parseEventLogs, type Address } from 'viem'
import { formatTokenAmount } from '../../lib/format'
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useChainId,
} from 'wagmi'
import { commitmentManagerAbi, operatorRegistryAbi } from '../../generated'
import { type FullCommitmentParams } from '../../hooks/useCreateCommitmentFlow'
import { useRegistryPolicy } from '../../hooks/useRegistryPolicy'
import { getDefaultBacking } from '../../config/contracts'
import {
  Input,
  Notice,
  TokenAmount,
  useToasts,
} from '../ui'

/**
 * Delegation is a two-tx flow (three when the stake exceeds free shares and the
 * shortfall is funded from the wallet):
 *   0. (optional) ERC-20 approve(manager, shortfall) so `createAndFund` can pull
 *   1. CommitmentManager.createCommitment / createAndFund(arbiter, operatorRegistry, amount, ...)
 *   2. OperatorRegistry.delegate(operator, commitmentId)
 *
 * The commitmentId isn't known until tx1's receipt emits CommitmentCreated; we
 * parse it out with viem and auto-fire tx2. Phase state mirrors the UI so the
 * user sees what's happening.
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
  | { kind: 'error'; message: string }

interface Props {
  operatorAddress: Address
  commitmentManagerAddress: Address | undefined
  operatorRegistryAddress: Address | undefined
  freeShares: bigint | undefined
  shareDecimals: number | undefined
}

const CHALLENGE_WINDOW_DEFAULT = 86400 // 1 day — min allowed by contract

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
  const backing = getDefaultBacking(chainId)
  const shareToken = backing?.token
  const { requiredArbiter, minMaxPenaltyBps } = useRegistryPolicy(
    operatorRegistryAddress,
  )

  const { push } = useToasts()
  const lastToastedIdRef = useRef<string | null>(null)

  const [amountText, setAmountText] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  // Max penalty is not a delegator-facing knob. The registry policy fixes the
  // floor, and a delegator gains nothing by committing to more slashing
  // exposure than required — so we bind it to the policy floor and surface no
  // control. Falls back to 50% only while policy is still loading (submission
  // is gated on `requiredArbiter`, which resolves in the same multicall, so
  // the fallback never reaches the contract).
  const maxPenaltyBps = minMaxPenaltyBps ?? 5000

  const parsedAmount = useMemo(() => {
    if (!amountText) return undefined
    try {
      const v = parseUnits(amountText, decimals)
      return v > 0n ? v : undefined
    } catch {
      return undefined
    }
  }, [amountText, decimals])

  // Shortfall between the staked amount and free shares. When positive it's
  // deposited from the wallet in the same flow (approve → createAndFund) rather
  // than blocking submit; only a wallet that can't cover it is a hard stop.
  const { data: walletBalance } = useReadContract({
    abi: erc20Abi,
    address: shareToken,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!shareToken && !!address, refetchInterval: 15_000 },
  })
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20Abi,
    address: shareToken,
    functionName: 'allowance',
    args: address && commitmentManagerAddress ? [address, commitmentManagerAddress] : undefined,
    query: { enabled: !!shareToken && !!address && !!commitmentManagerAddress, refetchInterval: 15_000 },
  })

  const shortfall =
    parsedAmount !== undefined && freeShares !== undefined && parsedAmount > freeShares
      ? parsedAmount - freeShares
      : 0n
  const needsDeposit = shortfall > 0n
  const exceedsWallet = needsDeposit && walletBalance !== undefined && shortfall > (walletBalance as bigint)

  const canSubmit =
    isConnected &&
    !!commitmentManagerAddress &&
    !!operatorRegistryAddress &&
    parsedAmount !== undefined &&
    !!requiredArbiter &&
    // Funding needs a known share token to approve/deposit against.
    (!needsDeposit || !!shareToken) &&
    !exceedsWallet &&
    (phase.kind === 'idle' || phase.kind === 'done' || phase.kind === 'error')

  // ── tx1: createCommitment ────────────────────────────────────────────────
  const {
    writeContract: writeCreate,
    data: createHash,
    reset: resetCreate,
    error: createWriteError,
  } = useWriteContract()
  const {
    data: createReceipt,
    isSuccess: createConfirmed,
    isError: createReceiptFailed,
    error: createReceiptError,
  } = useWaitForTransactionReceipt({ hash: createHash })

  // ── tx2: delegate ─────────────────────────────────────────────────────────
  const {
    writeContract: writeDelegate,
    data: delegateHash,
    reset: resetDelegate,
    error: delegateWriteError,
  } = useWriteContract()
  const {
    isSuccess: delegateConfirmed,
    isError: delegateReceiptFailed,
    error: delegateReceiptError,
  } = useWaitForTransactionReceipt({ hash: delegateHash })

  // ── tx0 (optional): approve the funding shortfall ─────────────────────────
  const {
    writeContract: writeApprove,
    data: approveHash,
    reset: resetApprove,
    error: approveWriteError,
  } = useWriteContract()
  const {
    isSuccess: approveConfirmed,
    isError: approveReceiptFailed,
    error: approveReceiptError,
  } = useWaitForTransactionReceipt({ hash: approveHash })

  // Create params + shortfall stashed at submit so the create can fire after the
  // approve confirms (and isn't recomputed against a mid-flight balance refetch).
  const pendingCreateRef = useRef<{ params: FullCommitmentParams; depositAmount: bigint } | null>(null)

  function fireCreate(pending: NonNullable<typeof pendingCreateRef.current>) {
    if (!commitmentManagerAddress) return
    if (pending.depositAmount > 0n) {
      writeCreate({
        abi: commitmentManagerAbi,
        address: commitmentManagerAddress,
        functionName: 'createAndFund',
        args: [pending.depositAmount, pending.params],
      })
    } else {
      writeCreate({
        abi: commitmentManagerAbi,
        address: commitmentManagerAddress,
        functionName: 'createCommitment',
        args: [pending.params],
      })
    }
  }

  // Phase transitions driven by tx lifecycle
  useEffect(() => {
    if (approveHash && phase.kind === 'approving') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setPhase({ kind: 'confirmingApprove' })
    }
  }, [approveHash, phase])

  useEffect(() => {
    if (approveConfirmed && phase.kind === 'confirmingApprove') {
      void refetchAllowance()
      const pending = pendingCreateRef.current
      if (pending) {
        setPhase({ kind: 'creating' })
        fireCreate(pending)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveConfirmed, phase])

  useEffect(() => {
    if (createHash && phase.kind === 'creating') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setPhase({ kind: 'confirmingCreate' })
    }
  }, [createHash, phase])

  useEffect(() => {
    if (createConfirmed && createReceipt && phase.kind === 'confirmingCreate') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setPhase({ kind: 'extractingId' })
      try {
        const logs = parseEventLogs({
          abi: commitmentManagerAbi,
          eventName: 'CommitmentCreated',
          logs: createReceipt.logs,
        })
        const created = logs[0]
        if (!created) throw new Error('CommitmentCreated event not found in receipt')
        const commitmentId = created.args.commitmentId as bigint
        setPhase({ kind: 'delegating', commitmentId })
        writeDelegate({
          abi: operatorRegistryAbi,
          address: operatorRegistryAddress!,
          functionName: 'delegate',
          args: [operatorAddress, commitmentId],
        })
      } catch (err) {
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to parse commitment receipt',
        })
      }
    }
  }, [
    createConfirmed,
    createReceipt,
    phase,
    operatorRegistryAddress,
    operatorAddress,
    writeDelegate,
  ])

  useEffect(() => {
    if (delegateHash && phase.kind === 'delegating') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setPhase({ kind: 'confirmingDelegate', commitmentId: phase.commitmentId })
    }
  }, [delegateHash, phase])

  useEffect(() => {
    if (delegateConfirmed && phase.kind === 'confirmingDelegate') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setPhase({ kind: 'done', commitmentId: phase.commitmentId })
    }
  }, [delegateConfirmed, phase])

  // Surface errors from any tx
  useEffect(() => {
    const err =
      approveWriteError ??
      approveReceiptError ??
      createWriteError ??
      createReceiptError ??
      delegateWriteError ??
      delegateReceiptError
    if (!err) return
    if (phase.kind === 'idle' || phase.kind === 'done' || phase.kind === 'error') return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
    setPhase({
      kind: 'error',
      message: (err as { shortMessage?: string }).shortMessage ?? (err as Error).message,
    })
  }, [
    approveWriteError,
    approveReceiptError,
    createWriteError,
    createReceiptError,
    delegateWriteError,
    delegateReceiptError,
    phase,
  ])

  useEffect(() => {
    if (approveReceiptFailed || createReceiptFailed || delegateReceiptFailed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setPhase({ kind: 'error', message: 'Transaction reverted on-chain' })
    }
  }, [approveReceiptFailed, createReceiptFailed, delegateReceiptFailed])

  // ── useToasts panel-owns-success / button-owns-error split ───────────────
  // Effect 1: success — push DELEGATED COMMITMENT #N once on phase=done.
  useEffect(() => {
    if (phase.kind !== 'done') return
    const id = `done-${phase.commitmentId.toString()}`
    if (lastToastedIdRef.current === id) return
    lastToastedIdRef.current = id
    push({
      tone: 'success',
      title: `DELEGATED COMMITMENT #${phase.commitmentId}`,
      body:
        parsedAmount !== undefined ? (
          <TokenAmount amount={parsedAmount} decimals={decimals} />
        ) : null,
    })
  }, [phase, parsedAmount, decimals, push])

  // Effect 2: error — push TRANSACTION FAILED once on phase=error.
  useEffect(() => {
    if (phase.kind !== 'error') return
    const id = `error-${phase.message}`
    if (lastToastedIdRef.current === id) return
    lastToastedIdRef.current = id
    push({
      tone: 'danger',
      title: 'TRANSACTION FAILED',
      body: phase.message,
    })
  }, [phase, push])

  function handleMaxFree() {
    if (freeShares === undefined) return
    setAmountText(formatTokenAmount(freeShares, decimals).full)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (
      !canSubmit ||
      !commitmentManagerAddress ||
      !operatorRegistryAddress ||
      !parsedAmount ||
      !requiredArbiter
    )
      return

    resetApprove()
    resetCreate()
    resetDelegate()
    lastToastedIdRef.current = null

    const params: FullCommitmentParams = {
      arbiter: requiredArbiter,
      counterparty: operatorRegistryAddress,
      token: (backing?.token ?? operatorRegistryAddress) as `0x${string}`,
      adapter: (backing?.adapter ?? operatorRegistryAddress) as `0x${string}`,
      amount: parsedAmount,
      maxPenaltyBps,
      challengeWindow: BigInt(CHALLENGE_WINDOW_DEFAULT),
      expiresAt: 0n,
      strategies: [],
      metadataURI: '',
      metadataHash: ('0x' + '00'.repeat(32)) as `0x${string}`,
    }
    // Fund the shortfall from the wallet in-flow (0 ⇒ free shares cover it).
    const depositAmount =
      freeShares !== undefined && parsedAmount > freeShares ? parsedAmount - freeShares : 0n
    const pending = { params, depositAmount }
    pendingCreateRef.current = pending

    // Approve first only when funding and the manager lacks allowance.
    if (depositAmount > 0n && shareToken && (allowance === undefined || (allowance as bigint) < depositAmount)) {
      setPhase({ kind: 'approving' })
      writeApprove({
        abi: erc20Abi,
        address: shareToken,
        functionName: 'approve',
        args: [commitmentManagerAddress, depositAmount],
      })
      return
    }

    setPhase({ kind: 'creating' })
    fireCreate(pending)
  }

  function handleReset() {
    resetApprove()
    resetCreate()
    resetDelegate()
    lastToastedIdRef.current = null
    setPhase({ kind: 'idle' })
    setAmountText('')
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
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0.0000"
            disabled={!isConnected}
          />
          <button
            type="button"
            className="ds-btn ds-btn--max"
            onClick={handleMaxFree}
            disabled={!isConnected || freeShares === undefined}
          >
            MAX FREE
          </button>
        </span>
        {needsDeposit && !exceedsWallet && (
          <Notice tone="info" size="sm" title="WILL FUND FROM WALLET">
            Free shares cover{' '}
            <TokenAmount amount={freeShares ?? 0n} decimals={decimals} size="inline" /> — the remaining{' '}
            <TokenAmount amount={shortfall} decimals={decimals} size="inline" /> is deposited from your wallet
            in the same flow.
          </Notice>
        )}
        {exceedsWallet && (
          <Notice tone="warn" size="sm" title="NOT ENOUGH SHARES">
            This delegation locks{' '}
            <TokenAmount amount={parsedAmount ?? 0n} decimals={decimals} size="inline" />, but you have only{' '}
            <TokenAmount amount={freeShares ?? 0n} decimals={decimals} size="inline" /> free plus{' '}
            <TokenAmount amount={(walletBalance as bigint) ?? 0n} decimals={decimals} size="inline" /> in your
            wallet.
          </Notice>
        )}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button
          type="submit"
          className="ds-btn ds-btn--primary ds-btn--full"
          disabled={!canSubmit}
          title={!isConnected ? 'Connect wallet to delegate' : undefined}
        >
          {needsDeposit ? 'FUND & DELEGATE' : 'DELEGATE'}
        </button>
        {(phase.kind === 'done' || phase.kind === 'error') && (
          <button
            type="button"
            className="ds-btn"
            onClick={handleReset}
          >
            NEW DELEGATION
          </button>
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
