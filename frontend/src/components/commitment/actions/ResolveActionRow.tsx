import { useState, type ReactNode } from 'react'
import { type Address, type Hex, type TransactionReceipt, encodeAbiParameters } from 'viem'
import { useChainId } from 'wagmi'
import { commitmentManagerAbi } from '../../../generated'
import { getContractAddresses } from '../../../config/contracts'
import { type CommitmentYieldEntry } from '../../../hooks/useCommitmentYield'
import {
  formatBps,
  type CommitmentWithStatus,
} from '../../../utils/commitments'
import {
  type ResolveAction,
  type ResolveActionKind,
} from '../../../utils/resolveActions'
import { Button, Input, TokenAmount, type ButtonVariant } from '../../ui'
import { useWriteAction } from '../../../hooks/useWriteAction'

interface ResolveActionRowProps {
  action: ResolveAction
  commitment: CommitmentWithStatus
  managerAddress: Address
  /** Decimals + symbol of the commitment's backing token (v2 — amounts are
   *  denominated in the commitment's own token, not the vault share). */
  decimals: number
  symbol: string
  /** Per-strategy pending amounts (from useCommitmentYield) — drives the claim
   *  buttons. Undefined for callers that don't surface yield actions. */
  yieldEntries?: CommitmentYieldEntry[]
  /** Raw token units owed on `settle-mutual-loss` (from useMutualMembership).
   *  Labels the settle button; 0n still renders (a snapshot sync can owe 0). */
  owedLossUnits?: bigint
  /** Fired after the action's tx confirms. Receives the receipt (when the
   *  underlying write hook surfaces one) so parents can wait out indexer lag. */
  onActed?: (receipt?: TransactionReceipt) => void
}

/** claimData for the committer's abandonment reclaim path: `abi.encode(true)`. */
const RECLAIM_CLAIM_DATA: Hex = encodeAbiParameters([{ type: 'bool' }], [true])
const EMPTY_CLAIM_DATA: Hex = '0x'

interface ActionMeta {
  title: string
  helper: string
}

const META: Record<ResolveActionKind, ActionMeta> = {
  release: {
    title: 'Release commitment',
    helper:
      'Closes the commitment and returns its backing to the committer’s free balance in the manager. Arbiter only.',
  },
  expire: {
    title: 'Expire commitment',
    helper:
      'Closes a commitment whose `expiresAt` has passed. Depositor only.',
  },
  'request-unbond': {
    title: 'Request unbond',
    helper:
      'Starts this commitment’s unbonding period. After it elapses anyone can finalize, and the backing returns to the committer’s free balance.',
  },
  'finalize-unbond': {
    title: 'Finalize unbond',
    helper:
      'Closes the commitment now that the unbond period has matured. Permissionless.',
  },
  'cancel-unbond': {
    title: 'Cancel unbond',
    helper:
      'Cancels a pending unbond and restores the commitment to ACTIVE.',
  },
  'initiate-forfeit': {
    title: 'Initiate forfeit',
    helper:
      'Opens a two-phase forfeit proposal. The pause-adjusted manager execution delay must elapse before execution.',
  },
  'execute-forfeit': {
    title: 'Execute forfeit',
    helper:
      'Executes the active proposal once its pause-adjusted manager delay has elapsed and execution is not paused. Permissionless.',
  },
  'cancel-forfeit': {
    title: 'Cancel forfeit',
    helper: 'Withdraws the active forfeit proposal. Arbiter only.',
  },
  'cancel-stale-forfeit': {
    title: 'Cancel stale forfeit',
    helper:
      'Force-cancels a proposal after its pause-adjusted execution time plus the 14-day liveness TTL.',
  },
  'claim-yield': {
    title: 'Claim yield',
    helper:
      'Pays each bound strategy’s accrued yield for this commitment to the counterparty’s wallet.',
  },
  'reclaim-yield': {
    title: 'Reclaim abandoned yield',
    helper:
      'Frees encumbrance on yield the counterparty did not claim within 90 days.',
  },
  'distribute-yield': {
    title: 'Distribute yield',
    helper:
      'Records accrued yield since the last distribution. Permissionless trigger.',
  },
  'settle-mutual-loss': {
    title: 'Settle loss share',
    helper:
      'Pays this commitment’s accrued share of the mutual’s declared losses to the beneficiary, out of the encumbered stake. Permissionless.',
  },
  'request-mutual-exit': {
    title: 'Request mutual exit',
    helper:
      'Starts the mutual’s deallocation window. The stake stays slashable — and keeps earning premium — until it elapses. Committer only.',
  },
  'release-mutual-member': {
    title: 'Release from mutual',
    helper:
      'Closes the membership and the commitment once the deallocation window has elapsed and losses are settled; the remaining stake returns to the committer’s free balance. Permissionless.',
  },
}

export function ResolveActionRow(props: ResolveActionRowProps) {
  const { action } = props
  const meta = META[action.kind]

  return (
    <div className="ds-card ds-stack ds-stack-3" data-action-kind={action.kind}>
      <div className="ds-stack ds-stack-1">
        <div className="ds-row ds-row-2" style={{ justifyContent: 'space-between' }}>
          <span className="ds-text-base" style={{ fontWeight: 500 }}>
            {meta.title}
          </span>
        </div>
        <span className="ds-text-xs ds-subtle">{meta.helper}</span>
        {action.reason && (
          <span className="ds-text-xs ds-muted">{action.reason}</span>
        )}
      </div>
      <ActionBody {...props} />
    </div>
  )
}

function ActionBody(props: ResolveActionRowProps) {
  const { action } = props
  switch (action.kind) {
    case 'release':
      return <SimpleAction {...props} fnName="releaseCommitment" idle="Release" pending="Releasing…" success="Released" />
    case 'expire':
      return <SimpleAction {...props} fnName="expireCommitment" idle="Expire" pending="Expiring…" success="Expired" />
    case 'request-unbond':
      return <SimpleAction {...props} fnName="requestUnbond" idle="Request unbond" pending="Submitting…" success="Unbond requested" />
    case 'finalize-unbond':
      return <SimpleAction {...props} fnName="finalizeUnbond" idle="Close commitment" pending="Closing…" success="Closed" variant="primary" />
    case 'cancel-unbond':
      return <SimpleAction {...props} fnName="cancelUnbond" idle="Cancel unbond" pending="Cancelling…" success="Cancelled" variant="ghost" />
    case 'execute-forfeit':
      return <SimpleAction {...props} fnName="executeForfeit" idle="Execute forfeit" pending="Executing…" success="Executed" variant="primary" />
    case 'cancel-forfeit':
      return <SimpleAction {...props} fnName="cancelForfeit" idle="Cancel forfeit" pending="Cancelling…" success="Cancelled" variant="ghost" />
    case 'cancel-stale-forfeit':
      return <SimpleAction {...props} fnName="cancelStaleForfeitProposal" idle="Cancel stale forfeit" pending="Cancelling…" success="Cancelled" />
    case 'claim-yield':
      return <ClaimYieldAction {...props} />
    case 'reclaim-yield':
      return <ReclaimYieldAction {...props} />
    case 'initiate-forfeit':
      return <InitiateForfeitAction {...props} />
    case 'distribute-yield':
      return <DistributeYieldAction {...props} />
    case 'settle-mutual-loss':
      return <SettleMutualLossAction {...props} />
    case 'request-mutual-exit':
      return <SimpleAction {...props} fnName="requestMutualExit" idle="Request exit" pending="Submitting…" success="Exit requested" />
    case 'release-mutual-member':
      return <SimpleAction {...props} fnName="releaseMutualMember" idle="Release member" pending="Releasing…" success="Released" variant="primary" />
  }
}

interface SimpleActionExtras {
  fnName:
    | 'releaseCommitment'
    | 'expireCommitment'
    | 'requestUnbond'
    | 'finalizeUnbond'
    | 'cancelUnbond'
    | 'executeForfeit'
    | 'cancelForfeit'
    | 'cancelStaleForfeitProposal'
    | 'requestMutualExit'
    | 'releaseMutualMember'
  idle: string
  pending: string
  success: string
  variant?: ButtonVariant
}

/** Disabled placeholder for yield actions whose v2 UI is deferred. */
function DeferredAction({ label, reason }: { label: string; reason: string }) {
  return (
    <ButtonRow
      variant="ghost"
      onClick={() => {}}
      disabled
      label={label}
      success={null}
      title={reason}
    />
  )
}

function SimpleAction({
  action,
  commitment,
  managerAddress,
  fnName,
  idle,
  pending,
  success,
  variant,
  onActed,
}: ResolveActionRowProps & SimpleActionExtras) {
  const { write, isPending, isConfirming, isSuccess } = useWriteAction({
    successTitle: success.toUpperCase(),
    onSuccess: onActed,
  })
  const isPendingAny = isPending || isConfirming

  function handleClick() {
    write({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: fnName,
      args: [commitment.id],
    })
  }

  return (
    <ButtonRow
      variant={variant}
      onClick={handleClick}
      disabled={!action.enabled || isPendingAny}
      label={isPendingAny ? pending : idle}
      success={isSuccess ? success.toLowerCase() : null}
    />
  )
}

function InitiateForfeitAction({
  action,
  commitment,
  managerAddress,
  decimals,
  symbol,
  onActed,
}: ResolveActionRowProps) {
  const [penaltyBps, setPenaltyBps] = useState<number>(commitment.maxPenaltyBps)
  const { write, isPending, isConfirming, isSuccess } = useWriteAction({
    successTitle: 'FORFEIT PROPOSED',
    onSuccess: onActed,
  })

  function handleClick() {
    write({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'initiateForfeit',
      args: [commitment.id, penaltyBps],
    })
  }
  const isPendingAny = isPending || isConfirming

  // Computed impact: stake the depositor would lose at this penalty.
  const impactAmount = (commitment.amount * BigInt(penaltyBps)) / 10000n

  return (
    <div className="ds-stack ds-stack-2">
      <div className="ds-field" style={{ maxWidth: 240 }}>
        <label className="ds-label" htmlFor={`penalty-${commitment.id}`}>
          Penalty (BPS)
        </label>
        <Input
          id={`penalty-${commitment.id}`}
          type="number"
          min={0}
          max={commitment.maxPenaltyBps}
          value={penaltyBps}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!isNaN(n) && n >= 0 && n <= commitment.maxPenaltyBps) {
              setPenaltyBps(Math.round(n))
            }
          }}
          aria-label="Penalty BPS for forfeit"
          suffix={<span>= {formatBps(penaltyBps)}</span>}
        />
        <span className="ds-field-helper">
          Typical: 500–1000 BPS (5–10%). Max allowed: {formatBps(commitment.maxPenaltyBps)}.
        </span>
        <span className="ds-field-helper">
          Impact: ~<TokenAmount amount={impactAmount} decimals={decimals} symbol={symbol} size="inline" /> of depositor stake.
        </span>
      </div>
      <ButtonRow
        onClick={handleClick}
        disabled={!action.enabled || isPendingAny}
        label={isPendingAny ? 'Initiating…' : 'Initiate forfeit'}
        success={isSuccess ? 'proposed' : null}
      />
    </div>
  )
}

/**
 * Counterparty claim — one button per bound strategy with a positive pending
 * amount, each firing `claim(id, strategy, 0x)`. v2 has no aggregate claim, so
 * the counterparty collects from each strategy independently.
 */
function ClaimYieldAction({
  action,
  commitment,
  managerAddress,
  decimals,
  symbol,
  yieldEntries,
  onActed,
}: ResolveActionRowProps) {
  const claimable = (yieldEntries ?? []).filter((e) => e.pending > 0n)
  if (claimable.length === 0) {
    return <DeferredAction label="Claim yield" reason="Nothing to claim right now" />
  }
  return (
    <div className="ds-stack ds-stack-2">
      {claimable.map((entry) => (
        <StrategyClaimButton
          key={entry.strategy}
          commitmentId={commitment.id}
          strategy={entry.strategy}
          managerAddress={managerAddress}
          claimData={EMPTY_CLAIM_DATA}
          enabled={action.enabled}
          verb="Claim"
          pending={entry.pending}
          decimals={decimals}
          symbol={symbol}
          onActed={onActed}
        />
      ))}
    </div>
  )
}

/**
 * Committer reclaim of abandoned yield — `claim(id, strategy, abi.encode(true))`
 * after the strategy's reclaim window. Only IndexAppreciationYield supports the
 * reclaim path, so we target the configured index-yield strategy bound to this
 * commitment. The contract enforces the timing; the action's reason warns.
 */
function ReclaimYieldAction({
  action,
  commitment,
  managerAddress,
  onActed,
}: ResolveActionRowProps) {
  const chainId = useChainId()
  const indexYieldStrategy = getContractAddresses(chainId).indexYieldStrategy
  const targets = (commitment.strategies ?? []).filter(
    (s) => indexYieldStrategy && s.toLowerCase() === indexYieldStrategy.toLowerCase(),
  )
  if (targets.length === 0) {
    return <DeferredAction label="Reclaim yield" reason="No reclaimable strategy bound" />
  }
  return (
    <div className="ds-stack ds-stack-2">
      {targets.map((strategy) => (
        <StrategyClaimButton
          key={strategy}
          commitmentId={commitment.id}
          strategy={strategy}
          managerAddress={managerAddress}
          claimData={RECLAIM_CLAIM_DATA}
          enabled={action.enabled}
          verb="Reclaim"
          onActed={onActed}
        />
      ))}
    </div>
  )
}

interface StrategyClaimButtonProps {
  commitmentId: bigint
  strategy: Address
  managerAddress: Address
  claimData: Hex
  enabled: boolean
  verb: 'Claim' | 'Reclaim'
  /** When set, the button labels the claimable amount. */
  pending?: bigint
  decimals?: number
  symbol?: string
  onActed?: (receipt?: TransactionReceipt) => void
}

function StrategyClaimButton({
  commitmentId,
  strategy,
  managerAddress,
  claimData,
  enabled,
  verb,
  pending,
  decimals,
  symbol,
  onActed,
}: StrategyClaimButtonProps) {
  const { write, isPending, isConfirming, isSuccess } = useWriteAction({
    successTitle: `${verb.toUpperCase()} SUBMITTED`,
    onSuccess: onActed,
  })
  const isPendingAny = isPending || isConfirming

  function handleClick() {
    write({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'claim',
      args: [commitmentId, strategy, claimData],
    })
  }

  const idleLabel: ReactNode =
    pending !== undefined ? (
      <>
        {verb}{' '}
        <TokenAmount amount={pending} decimals={decimals ?? 18} symbol={symbol ?? 'TOKEN'} size="inline" />
      </>
    ) : (
      verb
    )

  return (
    <ButtonRow
      onClick={handleClick}
      disabled={!enabled || isPendingAny}
      label={isPendingAny ? `${verb}ing…` : idleLabel}
      success={isSuccess ? `${verb.toLowerCase()}ed` : null}
    />
  )
}

function DistributeYieldAction({
  action,
  commitment,
  managerAddress,
  onActed,
}: ResolveActionRowProps) {
  // v2 has no aggregate pending-yield read — distributeAll is permissionless and
  // idempotent, so we offer it whenever a strategy is bound (caller-gated). The
  // per-strategy pending estimate is deferred (FUTURE_WORK §2).
  const { write, isPending, isConfirming, isSuccess } = useWriteAction({ onSuccess: onActed })
  const isPendingAny = isPending || isConfirming

  function distribute() {
    if (!managerAddress) return
    write({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'distributeAll',
      args: [commitment.id],
    })
  }

  return (
    <div className="ds-stack ds-stack-2">
      <ButtonRow
        onClick={() => distribute()}
        disabled={!action.enabled || isPendingAny}
        label={isPendingAny ? 'Distributing…' : 'Distribute yield'}
        success={isSuccess ? 'distributed' : null}
      />
    </div>
  )
}

/**
 * Settle the member's accrued share of the mutual's declared losses —
 * `settleMemberLoss(id)`, permissionless. The button carries the owed amount
 * so the user sees exactly what leaves the stake; a 0-owed settle still runs
 * (it syncs the loss snapshot, which release requires).
 */
function SettleMutualLossAction({
  action,
  commitment,
  managerAddress,
  decimals,
  symbol,
  owedLossUnits,
  onActed,
}: ResolveActionRowProps) {
  const { write, isPending, isConfirming, isSuccess } = useWriteAction({
    successTitle: 'LOSS SETTLED',
    onSuccess: onActed,
  })
  const isPendingAny = isPending || isConfirming

  function handleClick() {
    write({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'settleMemberLoss',
      args: [commitment.id],
    })
  }

  const owed = owedLossUnits ?? 0n
  const idleLabel: ReactNode =
    owed > 0n ? (
      <>
        Settle <TokenAmount amount={owed} decimals={decimals} symbol={symbol} size="inline" />
      </>
    ) : (
      'Sync loss snapshot'
    )

  return (
    <ButtonRow
      onClick={handleClick}
      disabled={!action.enabled || isPendingAny}
      label={isPendingAny ? 'Settling…' : idleLabel}
      success={isSuccess ? 'settled' : null}
    />
  )
}

interface ButtonRowProps {
  variant?: ButtonVariant
  onClick: () => void
  disabled: boolean
  label: ReactNode
  success: string | null
  title?: string
}

function ButtonRow({
  variant,
  onClick,
  disabled,
  label,
  success,
  title,
}: ButtonRowProps) {
  return (
    <div className="ds-row ds-row-2">
      <Button variant={variant} onClick={onClick} disabled={disabled} title={title}>
        {label}
      </Button>
      {success && (
        <span className="ds-tx-success ds-text-xs">{success}</span>
      )}
    </div>
  )
}
