import { useEffect, useState } from 'react'
import { type Address } from 'viem'

import {
  BalanceLine,
  Button,
  Card,
  Notice,
  TokenAmount,
  TokenChip,
  useToasts,
} from '../ui'
import { useAmountInput } from '../../hooks/useAmountInput'
import { useDepositFlow } from '../../hooks/useDepositFlow'
import { useLedgerBalance } from '../../hooks/useLedgerBalance'
import { useManagerLedgerFlow } from '../../hooks/useManagerLedgerFlow'
import { useTokenMeta } from '../../hooks/useTokenMeta'
import { useVaultPosition } from '../../hooks/useVaultPosition'
import type { BackingOption } from '../../config/contracts'
import { DepositStepper } from '../vault/DepositStepper'
import { deriveDepositSteps, type StepDescriptor } from '../vault/depositSteps'
import { legibleWriteError } from '../../lib/contractErrors'

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

  const activeDecimals = phase === 'mint' ? position.assetDecimals ?? 18 : shareDecimals
  const activeSymbol = phase === 'mint' ? position.assetSymbol ?? 'TOKEN' : shareSymbol
  const amountInput = useAmountInput(activeDecimals)
  const parsed = amountInput.amount
  const parseError = amountInput.invalid

  const resetInput = amountInput.clear

  // The wallet balance the active phase draws against: the underlying asset for
  // the mint hop, the share/token balance for the back hop.
  const sourceBalance = phase === 'mint' ? mintFlow.tokenBalance : backFlow.walletBalance
  function handleMax() {
    if (sourceBalance !== undefined) amountInput.setMax(sourceBalance)
  }

  // Auto-advance to the back hop once minting confirms; prefill nothing (the
  // user MAXes the freshly-minted shares) and surface them on the BalanceLine.
  useEffect(() => {
    if (isVaultShare && mintFlow.step === 'complete' && phase === 'mint') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- moves to the back hop when the mint transaction confirms
      setPhase('back')
      resetInput()
      mintFlow.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the mint step only; the flow object and input reset are new every render
  }, [mintFlow.step])

  // Toast feedback off both sub-flow state machines.
  useEffect(() => {
    if (mintFlow.step === 'approved') {
      push({ tone: 'success', title: 'APPROVAL CONFIRMED', body: <>{activeSymbol} approved for the vault. Tap MINT next.</> })
    }
    if (mintFlow.step === 'error') {
      push({ tone: 'danger', title: 'MINT FAILED', body: legibleWriteError(mintFlow.error) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per step transition; the flow object is new every render, so listing it would repeat the toast
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
      push({ tone: 'danger', title: 'DEPOSIT FAILED', body: legibleWriteError(backFlow.error) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per step transition; the flow object is new every render, so listing it would repeat the toast
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
  const rawSteps = deriveDepositSteps(backFlow.step, rawHasAllowance || backUsesPermit)

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
        <DepositStepper steps={isVaultShare ? [step1, step2] : [rawSteps.step1, rawSteps.step2]} />

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
          value={amountInput.text}
          onChange={(e) => amountInput.setText(e.target.value)}
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

        <Button variant="primary" fullWidth onClick={handleAction} disabled={actionDisabled}>
          {actionLabel()}
        </Button>

        {/* Phase navigation (vault-share only). */}
        {isVaultShare && phase === 'mint' && (
          <Button size="sm" variant="ghost" fullWidth onClick={skipToBack} disabled={inProgress}>
            Skip — I already hold shares
          </Button>
        )}
        {isVaultShare && phase === 'back' && (
          <Button size="sm" variant="ghost" fullWidth onClick={skipToMint} disabled={inProgress}>
            ← Mint more shares first
          </Button>
        )}
      </div>
    </Card>
  )
}
