import { useEffect, useState } from 'react'
import { type Address, parseUnits } from 'viem'

import {
  BalanceLine,
  Card,
  Notice,
  TokenAmount,
  TokenChip,
  useToasts,
} from '../ui'
import { formatTokenAmount } from '../../lib/format'
import { useDepositFlow } from '../../hooks/useDepositFlow'
import { useLedgerBalance } from '../../hooks/useLedgerBalance'
import { type LedgerFlowStep, useManagerLedgerFlow } from '../../hooks/useManagerLedgerFlow'
import { useTokenMeta } from '../../hooks/useTokenMeta'
import { useVaultPosition } from '../../hooks/useVaultPosition'
import type { BackingOption } from '../../config/contracts'

interface BackingFlowProps {
  managerAddress: Address | undefined
  option: BackingOption
  userAddress: Address | undefined
  isConnected: boolean
  /** Fired after the manager-deposit (back) hop confirms — lets a host surface
   *  (e.g. the dashboard) refetch its own reads. The flow already refetches its
   *  internal ledger/vault reads on success. */
  onDeposited?: () => void
}

// Stepper tone/glyph vocabulary, matching DepositWizard.deriveSteps.
type StepTone = 'neutral' | 'info' | 'success' | 'danger'
type StepGlyph = '[ ]' | '[…]' | '[✓]' | '[!]'
interface StepDescriptor {
  tone: StepTone
  glyph: StepGlyph
  label: string
}

type Phase = 'mint' | 'back'

/** Glyph/tone for a phase given its sub-flow step + whether it's the active phase. */
function descriptorFor(
  flowStep: string,
  active: boolean,
  done: boolean,
  baseLabel: string,
): StepDescriptor {
  if (done || flowStep === 'complete') return { tone: 'success', glyph: '[✓]', label: baseLabel }
  if (!active) return { tone: 'neutral', glyph: '[ ]', label: baseLabel }
  if (flowStep === 'approving' || flowStep === 'depositing' || flowStep === 'signing') {
    return { tone: 'info', glyph: '[…]', label: `${baseLabel}…` }
  }
  if (flowStep === 'error') return { tone: 'danger', glyph: '[!]', label: baseLabel }
  return { tone: 'info', glyph: '[ ]', label: baseLabel }
}

/**
 * Stepper descriptors for the raw-ERC-20 back hop (single deposit hop into the
 * manager ledger). Mirrors DepositWizard.deriveSteps so the approval is a
 * first-class, visible step — "STEP 1 OF 2 — APPROVE" → "STEP 2 OF 2 — DEPOSIT"
 * — collapsing to a single "STEP 1 OF 1 — DEPOSIT" when allowance already
 * covers the amount or the token self-authorizes via a one-tap permit.
 *
 * `oneStep` is the analogue of DepositWizard's `hasAllowance`: once approval
 * confirms and the allowance refetch lands, the stepper collapses to the 1-step
 * form, matching the vault wizard's behavior exactly.
 */
function deriveRawSteps(
  step: LedgerFlowStep,
  oneStep: boolean,
): { step1: StepDescriptor; step2: StepDescriptor | null } {
  // 1-step path: allowance covers the requested amount, or permit self-authorizes.
  if (oneStep) {
    if (step === 'signing') return { step1: { tone: 'info', glyph: '[…]', label: 'STEP 1 OF 1 — SIGNING PERMIT…' }, step2: null }
    if (step === 'depositing') return { step1: { tone: 'info', glyph: '[…]', label: 'STEP 1 OF 1 — DEPOSITING…' }, step2: null }
    if (step === 'complete') return { step1: { tone: 'success', glyph: '[✓]', label: 'DEPOSIT COMPLETE' }, step2: null }
    if (step === 'error') return { step1: { tone: 'danger', glyph: '[!]', label: 'STEP 1 OF 1 — DEPOSIT' }, step2: null }
    return { step1: { tone: 'info', glyph: '[ ]', label: 'STEP 1 OF 1 — DEPOSIT' }, step2: null }
  }

  // 2-step path: approve then deposit.
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
    default:
      return {
        step1: { tone: 'info', glyph: '[ ]', label: 'STEP 1 OF 2 — APPROVE' },
        step2: { tone: 'neutral', glyph: '[ ]', label: 'STEP 2 OF 2 — DEPOSIT' },
      }
  }
}

/**
 * One guided "get capital into the protocol" flow for a single backing token.
 *
 * The protocol model is "deposit assets → back commitments"; this component
 * collapses that into one path instead of forcing the user to mint vault shares
 * on the vault page and then move them into the manager on /backing:
 *
 *   - Raw ERC-20 backing → a single manager-deposit hop (useManagerLedgerFlow):
 *     wallet ERC-20 → manager free balance.
 *   - Vault-share backing → an optional "mint shares" hop (useDepositFlow:
 *     wallet asset → vault shares) sequenced into the manager-deposit hop
 *     (useManagerLedgerFlow: shares → manager free balance), presented as a
 *     two-step stepper. Shares keep earning yield while they back commitments.
 *
 * This is the deposit workhorse (mint + back); BackingWithdrawForm is the
 * withdraw-only counterpart. Both are mounted from the dashboard's "Your
 * assets" section as per-asset deposit / withdraw modals.
 */
export function BackingFlow({
  managerAddress,
  option,
  userAddress,
  isConnected,
  onDeposited,
}: BackingFlowProps) {
  const { push } = useToasts()
  const isVaultShare = option.isVaultShare

  // --- Reads (all hooks called unconditionally; disabled by undefined args) ---
  // Vault-share path: resolve the vault's underlying asset + share metadata and
  // the manager-ledger free/encumbered split for the share token.
  const position = useVaultPosition({
    vaultAddress: isVaultShare ? option.token : undefined,
    viewAddress: userAddress,
    managerAddress,
  })
  // Raw-ERC-20 path: token metadata + manager-ledger split for the raw token.
  const rawMeta = useTokenMeta(isVaultShare ? undefined : option.token)
  const rawLedger = useLedgerBalance({
    managerAddress,
    token: isVaultShare ? undefined : option.token,
    user: userAddress,
  })

  // Display metadata + ledger numbers, resolved per path.
  const shareDecimals = isVaultShare ? position.shareDecimals ?? 18 : rawMeta.decimals
  const shareSymbol = isVaultShare ? option.label : rawMeta.symbol

  function refetchAll() {
    if (isVaultShare) position.refetch()
    else rawLedger.refetch()
  }

  // --- Flows ---
  // Mint hop (vault-share only): wallet asset → vault shares.
  const mintFlow = useDepositFlow({
    vaultAddress: isVaultShare ? option.token : undefined,
    assetAddress: isVaultShare ? position.assetAddress : undefined,
    userAddress,
    onSuccess: refetchAll,
  })
  // Back hop: token (raw ERC-20 or vault share) → manager free balance.
  const backFlow = useManagerLedgerFlow({
    managerAddress,
    token: option.token,
    userAddress,
    onSuccess: refetchAll,
  })

  // --- Phase state ---
  // Raw backing has no mint hop, so it starts (and stays) on 'back'.
  const [phase, setPhase] = useState<Phase>(isVaultShare ? 'mint' : 'back')
  const [mintSkipped, setMintSkipped] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [parsed, setParsed] = useState<bigint | undefined>(undefined)
  const [parseError, setParseError] = useState(false)

  const activeDecimals = phase === 'mint' ? position.assetDecimals ?? 18 : shareDecimals
  const activeSymbol = phase === 'mint' ? position.assetSymbol ?? 'TOKEN' : shareSymbol

  function resetInput() {
    setInputValue('')
    setParsed(undefined)
    setParseError(false)
  }

  function handleInputChange(value: string) {
    setInputValue(value)
    if (!value) {
      setParsed(undefined)
      setParseError(false)
      return
    }
    try {
      setParsed(parseUnits(value, activeDecimals))
      setParseError(false)
    } catch {
      setParsed(undefined)
      setParseError(true)
    }
  }

  // The wallet balance the active phase draws against: the underlying asset for
  // the mint hop, the share/token balance for the back hop.
  const sourceBalance = phase === 'mint' ? mintFlow.tokenBalance : backFlow.walletBalance
  function handleMax() {
    if (sourceBalance === undefined) return
    handleInputChange(formatTokenAmount(sourceBalance, activeDecimals).full)
  }

  // Auto-advance to the back hop once minting confirms; prefill nothing (the
  // user MAXes the freshly-minted shares) and surface them on the BalanceLine.
  useEffect(() => {
    if (isVaultShare && mintFlow.step === 'complete' && phase === 'mint') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transaction state machine; see frontend/docs/eslint-disable-rationale.md §Pattern-1
      setPhase('back')
      resetInput()
      mintFlow.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintFlow.step])

  // Toast feedback off both sub-flow state machines.
  useEffect(() => {
    if (mintFlow.step === 'approved') {
      push({ tone: 'success', title: 'APPROVAL CONFIRMED', body: <>{activeSymbol} approved for the vault. Tap MINT next.</> })
    }
    if (mintFlow.step === 'error') {
      push({ tone: 'danger', title: 'MINT FAILED', body: mintFlow.error?.message?.split('\n')[0] ?? 'Unknown error.' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintFlow.step])

  useEffect(() => {
    if (backFlow.step === 'approved') {
      push({ tone: 'success', title: 'APPROVAL CONFIRMED', body: <>{shareSymbol} approved for the manager. Tap DEPOSIT next.</> })
    }
    if (backFlow.step === 'complete') {
      push({
        tone: 'success',
        title: 'BACKING CONFIRMED',
        body: (
          <>
            <TokenAmount amount={parsed ?? 0n} decimals={shareDecimals} symbol={shareSymbol} size="inline" /> moved into free balance.
          </>
        ),
      })
      onDeposited?.()
      const timer = setTimeout(() => {
        backFlow.reset()
        resetInput()
      }, 3000)
      return () => clearTimeout(timer)
    }
    if (backFlow.step === 'error') {
      push({ tone: 'danger', title: 'DEPOSIT FAILED', body: backFlow.error?.message?.split('\n')[0] ?? 'Unknown error.' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backFlow.step])

  // --- Active phase action wiring ---
  const exceedsBalance =
    parsed !== undefined && sourceBalance !== undefined && parsed > sourceBalance

  const mintNeedsApproval =
    parsed !== undefined &&
    mintFlow.currentAllowance !== undefined &&
    mintFlow.currentAllowance < parsed
  const backNeedsApproval =
    parsed !== undefined &&
    backFlow.currentAllowance !== undefined &&
    backFlow.currentAllowance < parsed

  // One-tap permit path: when the back-hop token is ERC-2612, `depositWithPermit`
  // self-authorizes, so no allowance is needed. Only the back hop can use it
  // (the mint hop deposits into the vault, and vault shares aren't permit-enabled).
  const backUsesPermit = backFlow.supportsPermit === true
  const activeUsesPermit = phase === 'back' && backUsesPermit

  // The allowance read is async. Until it resolves we cannot tell whether an
  // approval is required, so we must block the action — otherwise the button
  // defaults to DEPOSIT and a quick click fires a transfer with no allowance
  // that reverts, skipping the approval step entirely. The permit path skips
  // allowance entirely, so it doesn't wait on the read.
  const activeAllowance = phase === 'mint' ? mintFlow.currentAllowance : backFlow.currentAllowance
  const allowancePending =
    !activeUsesPermit && parsed !== undefined && parsed > 0n && activeAllowance === undefined

  const mintInProgress = mintFlow.step === 'approving' || mintFlow.step === 'depositing'
  const backInProgress =
    backFlow.step === 'approving' || backFlow.step === 'signing' || backFlow.step === 'depositing'
  const inProgress = phase === 'mint' ? mintInProgress : backInProgress

  function handleAction() {
    if (!parsed || parsed === 0n) return
    if (phase === 'mint') {
      if (mintNeedsApproval) mintFlow.approve(parsed)
      else mintFlow.deposit(parsed)
    } else if (backUsesPermit) {
      // One tap: sign an off-chain permit, then depositWithPermit in one tx.
      void backFlow.depositWithPermit(parsed)
    } else {
      if (backNeedsApproval) backFlow.approve(parsed)
      else backFlow.deposit(parsed)
    }
  }

  function actionLabel(): string {
    if (allowancePending) return 'CHECKING ALLOWANCE…'
    if (phase === 'mint') {
      if (mintFlow.step === 'approving') return 'APPROVING…'
      if (mintFlow.step === 'depositing') return 'MINTING…'
      return mintNeedsApproval ? `APPROVE ${activeSymbol}` : 'MINT SHARES'
    }
    if (backFlow.step === 'signing') return 'SIGNING PERMIT…'
    if (backFlow.step === 'approving') return 'APPROVING…'
    if (backFlow.step === 'depositing') return 'DEPOSITING…'
    if (backUsesPermit) return 'DEPOSIT — ONE TAP'
    return backNeedsApproval ? `APPROVE ${activeSymbol}` : 'DEPOSIT INTO MANAGER'
  }

  const actionDisabled =
    !isConnected ||
    !userAddress ||
    !parsed ||
    parsed === 0n ||
    parseError ||
    exceedsBalance ||
    allowancePending ||
    inProgress

  function skipToMint() {
    setMintSkipped(false)
    setPhase('mint')
    resetInput()
  }
  function skipToBack() {
    setMintSkipped(true)
    setPhase('back')
    resetInput()
  }

  // --- Stepper descriptors ---
  // Vault-share path: two hops (mint → deposit), each folding its own approve
  // into the phase row. Surface the approve by annotating the row label
  // ("APPROVE & MINT" / "APPROVE & DEPOSIT") whenever that hop still needs an
  // allowance, so the approval is a visible part of the step rather than a
  // silent button flip.
  //
  // The hint is optimistic and mirrors the raw path / DepositWizard's
  // `hasAllowance`: until an entered amount confirms the allowance covers it, we
  // assume the approve is coming so it shows up front (before any amount is
  // typed) rather than only appearing once the input exceeds the allowance.
  // `mintNeedsApproval` / `backNeedsApproval` stay amount-gated — they drive the
  // action, which genuinely can't fire without an amount.
  const mintDone = phase === 'back'
  const mintApproveHint = !(
    parsed !== undefined &&
    mintFlow.currentAllowance !== undefined &&
    mintFlow.currentAllowance >= parsed
  )
  const backApproveHint = !(
    parsed !== undefined &&
    backFlow.currentAllowance !== undefined &&
    backFlow.currentAllowance >= parsed
  )
  // Annotate the APPROVE hint only on the hop the user is currently on, so a
  // two-hop flow never front-loads two "APPROVE" rows at once. The future hop
  // shows its plain destination and reveals its own approve once it goes active
  // — matching the single-hop raw path, where the approve shows because that
  // hop IS the active step.
  const step1Label = mintSkipped
    ? 'STEP 1 — MINT SKIPPED'
    : phase === 'mint' && mintApproveHint
      ? 'STEP 1 — APPROVE & MINT'
      : 'STEP 1 — MINT SHARES'
  const step2Label = backUsesPermit
    ? 'STEP 2 — DEPOSIT (ONE-TAP)'
    : phase === 'back' && backApproveHint
      ? 'STEP 2 — APPROVE & DEPOSIT'
      : 'STEP 2 — DEPOSIT INTO MANAGER'
  const step1 = descriptorFor(mintFlow.step, phase === 'mint', mintDone && !mintSkipped, step1Label)
  const step2 = descriptorFor(backFlow.step, phase === 'back', false, step2Label)

  // Raw-ERC-20 path: a single back hop, rendered with the same explicit
  // APPROVE → DEPOSIT vocabulary as the vault DepositWizard. Collapses to one
  // step when allowance already covers the amount or a permit self-authorizes.
  const rawHasAllowance =
    parsed !== undefined &&
    backFlow.currentAllowance !== undefined &&
    backFlow.currentAllowance >= parsed
  const rawSteps = deriveRawSteps(backFlow.step, rawHasAllowance || backUsesPermit)

  return (
    <Card>
      <div className="ds-stack ds-stack-3">
        <div className="ds-row ds-row-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="ds-row ds-row-2" style={{ alignItems: 'center' }}>
            <TokenChip symbol={shareSymbol} />
            <span className="ds-text-sm ds-muted">{option.label}</span>
          </span>
          {isVaultShare && <span className="ds-text-xs ds-subtle">VAULT SHARE BACKING</span>}
        </div>

        {/* "What this does" explainer — kept to the one essential idea. */}
        <p className="ds-text-sm ds-muted" style={{ margin: 0 }}>
          {isVaultShare ? (
            <>
              Mint vault shares from your {position.assetSymbol ?? 'asset'}, then deposit
              them into the manager. Your capital keeps earning yield while it backs commitments.
            </>
          ) : (
            <>
              Deposit {shareSymbol} into the manager. It lands in your free balance —
              withdrawable, and what backs new commitments.
            </>
          )}
        </p>

        {/* Stepper. Vault-share backing is two hops (mint → deposit); raw
            backing is a single hop rendered as an explicit APPROVE → DEPOSIT
            sequence so the approval is always a visible step. */}
        {isVaultShare ? (
          <div className="ds-stepper">
            <Notice tone={step1.tone} size="sm" icon={step1.glyph}>{step1.label}</Notice>
            <Notice tone={step2.tone} size="sm" icon={step2.glyph}>{step2.label}</Notice>
          </div>
        ) : (
          <div className="ds-stepper">
            <Notice tone={rawSteps.step1.tone} size="sm" icon={rawSteps.step1.glyph}>{rawSteps.step1.label}</Notice>
            {rawSteps.step2 && (
              <Notice tone={rawSteps.step2.tone} size="sm" icon={rawSteps.step2.glyph}>{rawSteps.step2.label}</Notice>
            )}
          </div>
        )}

        {!isConnected && (
          <Notice tone="info" size="md" title="WALLET NOT CONNECTED">
            Connect a wallet to deposit backing. Read-only browsing is fine without one.
          </Notice>
        )}

        {/* Active-phase amount input. */}
        <input
          type="text"
          className="ds-input"
          placeholder={`Amount (${activeSymbol})`}
          aria-label={`Amount in ${activeSymbol}`}
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          disabled={!isConnected || inProgress}
        />

        {sourceBalance !== undefined && (
          <BalanceLine
            label={phase === 'mint' ? 'WALLET ASSET BALANCE' : 'WALLET SHARE BALANCE'}
            amount={sourceBalance}
            decimals={activeDecimals}
            symbol={activeSymbol}
            onMax={handleMax}
            maxDisabled={!isConnected || inProgress}
          />
        )}

        {parseError && (
          <Notice tone="danger" size="sm" title="INVALID AMOUNT">
            Enter a positive number with at most {activeDecimals} decimal places.
          </Notice>
        )}
        {exceedsBalance && !parseError && (
          <Notice tone="danger" size="sm" title="EXCEEDS BALANCE" />
        )}
        {activeUsesPermit && !exceedsBalance && !parseError && (
          <Notice tone="info" size="sm" title="ONE-TAP DEPOSIT">
            {activeSymbol} supports gasless approvals — you'll sign a permit in your wallet, then it deposits
            in a single transaction. No separate approve.
          </Notice>
        )}

        <button
          type="button"
          className="ds-btn ds-btn--primary ds-btn--full"
          onClick={handleAction}
          disabled={actionDisabled}
        >
          {actionLabel()}
        </button>

        {/* Phase navigation (vault-share only). */}
        {isVaultShare && phase === 'mint' && (
          <button
            type="button"
            className="ds-btn ds-btn--sm ds-btn--ghost ds-btn--full"
            onClick={skipToBack}
            disabled={inProgress}
          >
            Skip — I already hold shares
          </button>
        )}
        {isVaultShare && phase === 'back' && (
          <button
            type="button"
            className="ds-btn ds-btn--sm ds-btn--ghost ds-btn--full"
            onClick={skipToMint}
            disabled={inProgress}
          >
            ← Mint more shares first
          </button>
        )}
      </div>
    </Card>
  )
}
