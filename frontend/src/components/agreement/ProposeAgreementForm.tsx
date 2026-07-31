import { useEffect, useState } from 'react'
import { isAddress, parseUnits, type Address } from 'viem'
import { formatTokenAmount, formatDuration } from '../../lib/format'
import { useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { commitmentManagerAbi } from '../../generated'
import { getBackingOptions } from '../../config/contracts'
import { useLedgerBalance } from '../../hooks/useLedgerBalance'
import { useTokenMeta } from '../../hooks/useTokenMeta'
import { formatBps } from '../../utils/commitments'
import { type AgreementProposalWithStatus } from '../../utils/agreements'
import { ZERO_HASH, resolveMetadataArgs } from '../../utils/metadataForm'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import {
  AddressDisplay,
  Input,
  Notice,
  Select,
  TokenAmount,
  useToasts,
} from '../ui'
import { MetadataEditor, type MetadataEditorStatus } from '../metadata/MetadataEditor'

interface ProposeAgreementFormProps {
  managerAddress: Address | undefined
  isConnected: boolean
  connectedAddress?: Address | undefined
  onProposalCreated: (proposal: AgreementProposalWithStatus) => void
}

interface DurationPreset {
  label: string
  value: number
}

const CHALLENGE_WINDOW_PRESETS: DurationPreset[] = [
  { label: '1 DAY', value: 86400 },
  { label: '3 DAYS', value: 259200 },
  { label: '7 DAYS', value: 604800 },
  { label: '30 DAYS', value: 2592000 },
]

const PROPOSAL_DURATION_PRESETS: DurationPreset[] = [
  { label: '1 DAY', value: 86400 },
  { label: '7 DAYS', value: 604800 },
  { label: '30 DAYS', value: 2592000 },
]

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const
const UINT128_MAX = (1n << 128n) - 1n

type WizardStep = 1 | 2 | 3
type PresetKey = 'balanced' | 'high-trust' | 'custom'

interface TermPreset {
  key: Exclude<PresetKey, 'custom'>
  label: string
  description: string
  maxPenaltyBps: number
  challengeWindow: number
  proposalDuration: number
}

const TERM_PRESETS: TermPreset[] = [
  {
    key: 'balanced',
    label: 'Balanced 7d',
    description:
      '5% max penalty, 24h challenge window, 7d proposal expiry. Reasonable for most agreements.',
    maxPenaltyBps: 500,
    challengeWindow: 86400,
    proposalDuration: 604800,
  },
  {
    key: 'high-trust',
    label: 'High-trust 30d',
    description:
      '10% max penalty, 3d challenge window, 30d proposal expiry. Higher stakes, slower disputes.',
    maxPenaltyBps: 1000,
    challengeWindow: 259200,
    proposalDuration: 2592000,
  },
]

/**
 * ProposeAgreementForm — Phase 25-03 v2.4 design-system migration.
 *
 * Locked-arbiter pattern (mirrors 24-03 DelegateMode):
 *   The arbiter is locked to `connectedAddress` (the proposer arbitrates the
 *   bilateral agreement). Rendered via a read-only `<AddressDisplay>` inside
 *   `<Notice tone="neutral" title="ARBITER (LOCKED)">`. Never an `<Input>` and
 *   the arbiter is never wired to a writable form element.
 *
 *   Behavior change vs. the pre-Phase-25 form: the form previously took a
 *   freeform arbiter address. Post-Phase-25 the arbiter is always the connected
 *   wallet. If the protocol later supports third-party arbiters, the source
 *   becomes a derived hook (e.g. operator-registry policy lookup) — still
 *   rendered via the same locked-arbiter Notice + AddressDisplay surface.
 *
 * Two-column leg layout (.ds-agreement-detail-legs grid, from Phase 25-01):
 *   YOUR LEG: amount + metadata URI + metadata hash
 *   COUNTERPARTY LEG: counterparty address + their amount
 *
 * Range sliders kept as bare `<input type="range">` per 24-03 deferral; all
 * text/numeric/date inputs migrated to the `<Input>` primitive.
 */
export function ProposeAgreementForm({
  managerAddress,
  isConnected,
  connectedAddress,
  onProposalCreated,
}: ProposeAgreementFormProps) {
  // v2 backing: any configured (token, adapter) pair. Canonical vault share
  // leads + defaults. Both legs and the settlement caps are denominated in the
  // selected token, so its decimals/symbol drive every amount field here.
  const chainId = useChainId()
  const backingOptions = getBackingOptions(chainId)
  const [backingToken, setBackingToken] = useState<Address | undefined>(backingOptions[0]?.token)
  const backing = backingOptions.find((o) => o.token === backingToken) ?? backingOptions[0]
  const { decimals, symbol, isLoading: metaLoading } = useTokenMeta(backing?.token)
  const ledger = useLedgerBalance({
    managerAddress,
    token: backing?.token,
    user: connectedAddress,
  })
  const freeBalance = ledger.free

  // ── Locked arbiter ──────────────────────────────────────────────────────────
  const lockedArbiter = (connectedAddress ?? ZERO_ADDRESS) as Address
  const arbiterAvailable = !!connectedAddress

  // ── Field state ─────────────────────────────────────────────────────────────

  const [acceptor, setAcceptor] = useState('')
  const [acceptorError, setAcceptorError] = useState<string | null>(null)

  const [proposerAmountValue, setProposerAmountValue] = useState('')
  const [proposerAmountError, setProposerAmountError] = useState<string | null>(null)
  const [parsedProposerAmount, setParsedProposerAmount] = useState<bigint | undefined>(undefined)

  const [acceptorAmountValue, setAcceptorAmountValue] = useState('')
  const [acceptorAmountError, setAcceptorAmountError] = useState<string | null>(null)
  const [parsedAcceptorAmount, setParsedAcceptorAmount] = useState<bigint | undefined>(undefined)

  const [maxPenaltyBps, setMaxPenaltyBps] = useState(0)

  const [challengeWindow, setChallengeWindow] = useState<number>(86400)
  const [selectedChallengePreset, setSelectedChallengePreset] = useState<number | null>(86400)
  const [challengeCustomSeconds, setChallengeCustomSeconds] = useState('')
  const [showChallengeCustom, setShowChallengeCustom] = useState(false)

  const [proposalDuration, setProposalDuration] = useState<number>(86400)
  const [selectedProposalPreset, setSelectedProposalPreset] = useState<number | null>(86400)
  const [proposalCustomSeconds, setProposalCustomSeconds] = useState('')
  const [showProposalCustom, setShowProposalCustom] = useState(false)

  // Bilateral settlement caps (v2.5). Both default to 0 = legacy agreement
  // (no arbiter-mediated rebalancing allowed). Setting > 0 in either direction
  // opts that direction in for cumulative arbiter settlement up to the cap.
  // Denominated in the selected backing token, like proposer/acceptor amounts.
  const [capP2AValue, setCapP2AValue] = useState('')
  const [capP2AError, setCapP2AError] = useState<string | null>(null)
  const [parsedCapP2A, setParsedCapP2A] = useState<bigint | undefined>(undefined)

  const [capA2PValue, setCapA2PValue] = useState('')
  const [capA2PError, setCapA2PError] = useState<string | null>(null)
  const [parsedCapA2P, setParsedCapA2P] = useState<bigint | undefined>(undefined)

  // Fed by the inline MetadataEditor (agreement.v1). `metadataStatus === 'dirty'`
  // blocks submit; `metadataKey` remounts the uncontrolled editor on reset.
  const [metadataURI, setMetadataURI] = useState('')
  const [metadataHash, setMetadataHash] = useState<string>(ZERO_HASH)
  const [metadataStatus, setMetadataStatus] = useState<MetadataEditorStatus>('empty')
  const [metadataKey, setMetadataKey] = useState(0)

  // Wizard navigation state
  const [step, setStep] = useState<WizardStep>(1)
  const [activePreset, setActivePreset] = useState<PresetKey | null>(null)

  // ── Toasts ───────────────────────────────────────────────────────────────────
  const { push } = useToasts()

  // ── Transaction ──────────────────────────────────────────────────────────────
  const {
    writeContract,
    data: hash,
    isPending,
    reset: resetWrite,
    error: writeError,
  } = useWriteContract()
  const {
    isLoading: isConfirming,
    isSuccess,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash })

  // On success: optimistic update + toast + clear form. The set-state-in-effect
  // disable mirrors the canonical 24-03 DelegateMode reset-on-success
  // pattern; the form is wallet-driven, so the reset must wait for the receipt.
  useEffect(() => {
    if (isSuccess) {
      let pAmount: bigint = 0n
      let aAmount: bigint = 0n
      try {
        pAmount = parsedProposerAmount ?? parseUnits(proposerAmountValue, decimals)
      } catch {
        pAmount = 0n
      }
      try {
        aAmount = parsedAcceptorAmount ?? parseUnits(acceptorAmountValue, decimals)
      } catch {
        aAmount = 0n
      }

      const acceptorAddr = (isAddress(acceptor)
        ? acceptor
        : ZERO_ADDRESS) as Address

      const nowSecs = BigInt(Math.floor(Date.now() / 1000))
      const optimistic: AgreementProposalWithStatus = {
        proposalId: 0n,
        proposer: (connectedAddress ?? ZERO_ADDRESS) as Address,
        acceptor: acceptorAddr,
        arbiter: lockedArbiter,
        token: (backing?.token ?? ZERO_ADDRESS) as Address,
        adapter: (backing?.adapter ?? ZERO_ADDRESS) as Address,
        proposerAmount: pAmount,
        acceptorAmount: aAmount,
        maxPenaltyBps,
        challengeWindow: BigInt(challengeWindow),
        expiresAt: nowSecs + BigInt(proposalDuration),
        accepted: false,
        cancelled: false,
        status: 'PROPOSED',
        viewerIsProposer: true,
      }
      onProposalCreated(optimistic)

      push({
        tone: 'success',
        title: 'PROPOSAL SENT',
        body: (
          <TokenAmount
            amount={pAmount}
            decimals={decimals}
            symbol={symbol}
            size="inline"
          />
        ),
      })

      // Clear form
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAcceptor('')
      setAcceptorError(null)
      setProposerAmountValue('')
      setProposerAmountError(null)
      setParsedProposerAmount(undefined)
      setAcceptorAmountValue('')
      setAcceptorAmountError(null)
      setParsedAcceptorAmount(undefined)
      setMaxPenaltyBps(0)
      setChallengeWindow(86400)
      setSelectedChallengePreset(86400)
      setShowChallengeCustom(false)
      setChallengeCustomSeconds('')
      setProposalDuration(86400)
      setSelectedProposalPreset(86400)
      setShowProposalCustom(false)
      setProposalCustomSeconds('')
      setCapP2AValue('')
      setCapP2AError(null)
      setParsedCapP2A(undefined)
      setCapA2PValue('')
      setCapA2PError(null)
      setParsedCapA2P(undefined)
      setMetadataURI('')
      setMetadataHash(ZERO_HASH)
      setMetadataStatus('empty')
      setMetadataKey((k) => k + 1)

      setStep(1)
      setActivePreset(null)

      ledger.refetch()
      resetWrite()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  // Surface revert / receipt errors via toast (button-owns-error split)
  useEffect(() => {
    if (writeError || isReceiptError) {
      push({
        tone: 'danger',
        title: 'TRANSACTION FAILED',
        body:
          (writeError as { shortMessage?: string } | undefined)?.shortMessage ??
          (receiptError as { shortMessage?: string } | undefined)?.shortMessage ??
          'Unknown error.',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeError, isReceiptError])

  // ── Debounced live validation ────────────────────────────────────────────────
  // The user gets blur-time validation immediately; this layer runs the same
  // validators ~300ms after they pause typing so errors surface without
  // requiring a tab-out. Debounced effects skip empty values so we don't
  // shout "REQUIRED" while the user is mid-thought.
  const debouncedAcceptor = useDebouncedValue(acceptor, 300)
  const debouncedProposerAmount = useDebouncedValue(proposerAmountValue, 300)
  const debouncedAcceptorAmount = useDebouncedValue(acceptorAmountValue, 300)

  // Re-parse all amount fields when the token's decimals resolve (useTokenMeta
  // returns an 18-decimal fallback while in flight). Mirrors DelegateMode.
  useEffect(() => {
    if (proposerAmountValue) parseProposerAmount(proposerAmountValue)
    if (acceptorAmountValue) parseAcceptorAmount(acceptorAmountValue)
    if (capP2AValue) parseSettlementCap(capP2AValue, setCapP2AError, setParsedCapP2A)
    if (capA2PValue) parseSettlementCap(capA2PValue, setCapA2PError, setParsedCapA2P)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when decimals settle
  }, [decimals])

  useEffect(() => {
    if (debouncedAcceptor) validateAcceptor(debouncedAcceptor)
  }, [debouncedAcceptor])

  useEffect(() => {
    if (debouncedProposerAmount) parseProposerAmount(debouncedProposerAmount)
    // parseProposerAmount is a stable in-component helper; including it as a
    // dep would re-fire every render and defeat the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedProposerAmount])

  useEffect(() => {
    if (debouncedAcceptorAmount) parseAcceptorAmount(debouncedAcceptorAmount)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see proposer effect above
  }, [debouncedAcceptorAmount])

  // ── Validation helpers ────────────────────────────────────────────────────────

  function validateAcceptor(value: string) {
    if (!value) {
      setAcceptorError('ACCEPTOR ADDRESS IS REQUIRED')
    } else if (!isAddress(value)) {
      setAcceptorError('INVALID ETHEREUM ADDRESS')
    } else {
      setAcceptorError(null)
    }
  }

  function parseProposerAmount(value: string) {
    if (!value) {
      setParsedProposerAmount(undefined)
      setProposerAmountError(null)
      return
    }
    try {
      const parsed = parseUnits(value, decimals)
      if (parsed === 0n) {
        setProposerAmountError('AMOUNT MUST BE GREATER THAN ZERO')
        setParsedProposerAmount(undefined)
      } else {
        setParsedProposerAmount(parsed)
        setProposerAmountError(null)
      }
    } catch {
      setParsedProposerAmount(undefined)
      setProposerAmountError('INVALID AMOUNT')
    }
  }

  function parseAcceptorAmount(value: string) {
    if (!value) {
      setParsedAcceptorAmount(undefined)
      setAcceptorAmountError(null)
      return
    }
    try {
      const parsed = parseUnits(value, decimals)
      if (parsed === 0n) {
        setAcceptorAmountError('AMOUNT MUST BE GREATER THAN ZERO')
        setParsedAcceptorAmount(undefined)
      } else {
        setParsedAcceptorAmount(parsed)
        setAcceptorAmountError(null)
      }
    } catch {
      setParsedAcceptorAmount(undefined)
      setAcceptorAmountError('INVALID AMOUNT')
    }
  }

  // Settlement caps share the same decimal convention as proposer/acceptor amounts.
  // Empty input is treated as 0 (legacy agreement, that direction disabled).
  // A truthy parse below uint128 max enables settlement up to that cumulative cap.
  function parseSettlementCap(
    value: string,
    setError: (e: string | null) => void,
    setParsed: (n: bigint | undefined) => void,
  ) {
    if (!value) {
      setParsed(undefined)
      setError(null)
      return
    }
    try {
      const parsed = parseUnits(value, decimals)
      if (parsed > UINT128_MAX) {
        setError('CAP EXCEEDS UINT128 MAX')
        setParsed(undefined)
      } else {
        setParsed(parsed)
        setError(null)
      }
    } catch {
      setParsed(undefined)
      setError('INVALID AMOUNT')
    }
  }

  function handleMaxFree() {
    if (freeBalance === undefined) return
    const formatted = formatTokenAmount(freeBalance, decimals).full
    setProposerAmountValue(formatted)
    parseProposerAmount(formatted)
  }

  // Switching the backing token clears every amount field (both legs + the
  // settlement caps): values typed at the prior token's decimals must not
  // carry over and be re-parsed at the new token's scale.
  function handleBackingChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setBackingToken(e.target.value as Address)
    setProposerAmountValue('')
    setParsedProposerAmount(undefined)
    setProposerAmountError(null)
    setAcceptorAmountValue('')
    setParsedAcceptorAmount(undefined)
    setAcceptorAmountError(null)
    setCapP2AValue('')
    setParsedCapP2A(undefined)
    setCapP2AError(null)
    setCapA2PValue('')
    setParsedCapA2P(undefined)
    setCapA2PError(null)
  }

  function handleMaxPenaltySlider(e: React.ChangeEvent<HTMLInputElement>) {
    setMaxPenaltyBps(Number(e.target.value))
    setActivePreset(null)
  }

  function applyPreset(preset: TermPreset) {
    setMaxPenaltyBps(preset.maxPenaltyBps)
    setChallengeWindow(preset.challengeWindow)
    setSelectedChallengePreset(
      CHALLENGE_WINDOW_PRESETS.some((p) => p.value === preset.challengeWindow)
        ? preset.challengeWindow
        : null,
    )
    setShowChallengeCustom(false)
    setChallengeCustomSeconds('')
    setProposalDuration(preset.proposalDuration)
    setSelectedProposalPreset(
      PROPOSAL_DURATION_PRESETS.some((p) => p.value === preset.proposalDuration)
        ? preset.proposalDuration
        : null,
    )
    setShowProposalCustom(false)
    setProposalCustomSeconds('')
    setActivePreset(preset.key)
  }

  function handleChallengePresetSelect(preset: DurationPreset) {
    setChallengeWindow(preset.value)
    setSelectedChallengePreset(preset.value)
    setShowChallengeCustom(false)
    setChallengeCustomSeconds('')
    setActivePreset(null)
  }

  function handleChallengeCustomSelect() {
    setSelectedChallengePreset(null)
    setShowChallengeCustom(true)
    setActivePreset(null)
  }

  function handleChallengeCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setChallengeCustomSeconds(val)
    const n = Number(val)
    if (!isNaN(n) && n > 0) {
      setChallengeWindow(n)
    }
    setActivePreset(null)
  }

  function handleProposalPresetSelect(preset: DurationPreset) {
    setProposalDuration(preset.value)
    setSelectedProposalPreset(preset.value)
    setShowProposalCustom(false)
    setProposalCustomSeconds('')
    setActivePreset(null)
  }

  function handleProposalCustomSelect() {
    setSelectedProposalPreset(null)
    setShowProposalCustom(true)
    setActivePreset(null)
  }

  function handleProposalCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setProposalCustomSeconds(val)
    const n = Number(val)
    if (!isNaN(n) && n > 0) {
      setProposalDuration(n)
    }
    setActivePreset(null)
  }

  // ── Form validity ─────────────────────────────────────────────────────────────
  const acceptorValid = acceptor !== '' && isAddress(acceptor) && !acceptorError
  const proposerAmountValid = parsedProposerAmount !== undefined && parsedProposerAmount > 0n
  const acceptorAmountValid = parsedAcceptorAmount !== undefined && parsedAcceptorAmount > 0n
  const maxPenaltyValid = maxPenaltyBps >= 0 && maxPenaltyBps <= 10000
  const challengeWindowValid = challengeWindow >= 86400
  const proposalDurationValid = proposalDuration > 0

  // `empty` (no metadata) and `ready` (pinned) pass; `dirty` blocks the wizard.
  const metadataValid = metadataStatus !== 'dirty'
  const exceedsFree =
    parsedProposerAmount !== undefined &&
    freeBalance !== undefined &&
    parsedProposerAmount > freeBalance

  // Per-step validity for the wizard's Next button. `!metaLoading` gates step 1
  // so amounts are never parsed/submitted against the fallback decimals.
  const step1Valid =
    arbiterAvailable &&
    !metaLoading &&
    acceptorValid &&
    proposerAmountValid &&
    acceptorAmountValid &&
    !exceedsFree
  const settlementCapsValid = capP2AError === null && capA2PError === null
  const step2Valid =
    maxPenaltyValid &&
    challengeWindowValid &&
    proposalDurationValid &&
    settlementCapsValid
  const step3Valid = metadataValid

  const isValidForm = step1Valid && step2Valid && step3Valid

  // ── Submit ────────────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidForm || !managerAddress) return

    const pAmount = parsedProposerAmount ?? parseUnits(proposerAmountValue, decimals)
    const aAmount = parsedAcceptorAmount ?? parseUnits(acceptorAmountValue, decimals)

    const { uri: uriArg, hash: hashArg } = resolveMetadataArgs(metadataURI, metadataHash)
    if (!backing) return
    writeContract({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'proposeAgreement',
      args: [{
        arbiter: lockedArbiter,
        acceptor: acceptor as Address,
        // Per-leg terms. This UI proposes a same-token agreement, so both legs
        // share backing.token / backing.adapter / maxPenaltyBps and differ only
        // in stake amount. Cross-token legs are a future enhancement (FUTURE_WORK §2).
        proposerLeg: {
          token: backing.token,
          adapter: backing.adapter,
          amount: pAmount,
          maxPenaltyBps,
          // Strategy bindings deferred — plain agreement. See FUTURE_WORK §2.
          strategies: [],
        },
        acceptorLeg: {
          token: backing.token,
          adapter: backing.adapter,
          amount: aAmount,
          maxPenaltyBps,
          strategies: [],
        },
        challengeWindow: BigInt(challengeWindow),
        proposalDuration: BigInt(proposalDuration),
        metadataURI: uriArg,
        metadataHash: hashArg,
        maxFlowProposerToAcceptor: parsedCapP2A ?? 0n,
        maxFlowAcceptorToProposer: parsedCapA2P ?? 0n,
      }],
    })
  }

  const isPendingAny = isPending || isConfirming
  const disabled = !isConnected

  function handleNext() {
    if (step === 1 && step1Valid) setStep(2)
    else if (step === 2 && step2Valid) setStep(3)
  }
  function handleBack() {
    if (step === 2) setStep(1)
    else if (step === 3) setStep(2)
  }

  const decimalsForDisplay = decimals

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <form className="ds-card" onSubmit={handleSubmit} noValidate>
      <header className="ds-stack ds-stack-2">
        <h3 className="vault-section-title">PROPOSE AGREEMENT</h3>
        <WizardStepper current={step} />
      </header>

      {step === 1 && (
        <div className="ds-stack ds-stack-3">
          <Notice tone="neutral" size="sm" title="ARBITER (LOCKED)">
            {arbiterAvailable ? (
              <div className="ds-stack ds-stack-1">
                <AddressDisplay address={lockedArbiter} />
                <span className="ds-text-xs ds-subtle">
                  You are the arbiter — you can release or forfeit this commitment. The counterparty is trusting your judgment.
                </span>
              </div>
            ) : (
              'WALLET NOT CONNECTED'
            )}
          </Notice>

          {backingOptions.length > 1 && (
            <div className="commitment-form-field">
              <label className="commitment-form-label" htmlFor="ent-backing-select">
                BACKING TOKEN
              </label>
              <Select
                id="ent-backing-select"
                value={backingToken}
                onChange={handleBackingChange}
                disabled={disabled}
                options={backingOptions.map((o) => ({ value: o.token, label: o.label }))}
              />
              <Notice tone="info" size="sm">
                Both legs and any settlement caps are denominated in {symbol}.
              </Notice>
            </div>
          )}

          <section className="ds-agreement-detail-legs">
            <article className="ds-agreement-detail-leg">
              <header className="ds-agreement-detail-leg-header">YOUR LEG</header>
              <div className="commitment-form-field">
                <label className="commitment-form-label" htmlFor="proposer-amount-input">
                  AMOUNT ({symbol})
                </label>
                <div className="ds-input-group">
                  <Input
                    id="proposer-amount-input"
                    type="text"
                    value={proposerAmountValue}
                    onChange={(e) => setProposerAmountValue(e.target.value)}
                    onBlur={() => parseProposerAmount(proposerAmountValue)}
                    disabled={disabled}
                    placeholder="0.0000"
                    tone={proposerAmountError ? 'danger' : 'neutral'}
                    title={disabled ? 'Connect wallet to propose agreements' : undefined}
                  />
                  <button
                    type="button"
                    className="ds-btn ds-btn--max"
                    onClick={handleMaxFree}
                    disabled={disabled || freeBalance === undefined}
                  >
                    MAX FREE
                  </button>
                </div>
                {freeBalance !== undefined && (
                  <Notice tone="info" size="sm">
                    FREE: <TokenAmount amount={freeBalance} decimals={decimals} symbol={symbol} size="inline" />
                  </Notice>
                )}
                {proposerAmountError && (
                  <Notice tone="danger" size="sm">{proposerAmountError}</Notice>
                )}
                {exceedsFree && !proposerAmountError && (
                  <Notice tone="warn" size="sm">
                    EXCEEDS FREE BALANCE — exposure allocation will fail
                  </Notice>
                )}
              </div>
            </article>

            <article className="ds-agreement-detail-leg">
              <header className="ds-agreement-detail-leg-header">COUNTERPARTY LEG</header>
              <div className="commitment-form-field">
                <label className="commitment-form-label" htmlFor="acceptor-input">
                  COUNTERPARTY ADDRESS
                </label>
                <Input
                  id="acceptor-input"
                  type="text"
                  value={acceptor}
                  onChange={(e) => setAcceptor(e.target.value)}
                  onBlur={() => validateAcceptor(acceptor)}
                  disabled={disabled}
                  placeholder="0x..."
                  tone={acceptorError ? 'danger' : 'neutral'}
                  title={disabled ? 'Connect wallet to propose agreements' : undefined}
                  style={{ width: '100%' /* layout only */ }}
                />
                {acceptorError && (
                  <Notice tone="danger" size="sm">{acceptorError}</Notice>
                )}
              </div>

              <div className="commitment-form-field">
                <label className="commitment-form-label" htmlFor="acceptor-amount-input">
                  THEIR AMOUNT ({symbol})
                </label>
                <Input
                  id="acceptor-amount-input"
                  type="text"
                  value={acceptorAmountValue}
                  onChange={(e) => setAcceptorAmountValue(e.target.value)}
                  onBlur={() => parseAcceptorAmount(acceptorAmountValue)}
                  disabled={disabled}
                  placeholder="0.0000"
                  tone={acceptorAmountError ? 'danger' : 'neutral'}
                  title={disabled ? 'Connect wallet to propose agreements' : undefined}
                  style={{ width: '100%' /* layout only */ }}
                />
                {acceptorAmountError && (
                  <Notice tone="danger" size="sm">{acceptorAmountError}</Notice>
                )}
              </div>
            </article>
          </section>
        </div>
      )}

      {step === 2 && (
        <div className="ds-stack ds-stack-3">
          <Notice tone="info" size="sm">
            Pick a preset to fill these in, or tweak any value to switch to custom mode.
          </Notice>
          <div
            role="group"
            aria-label="Term presets"
            style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}
          >
            {TERM_PRESETS.map((preset) => {
              const selected = activePreset === preset.key
              return (
                <button
                  key={preset.key}
                  type="button"
                  className={`ds-card${selected ? ' ds-card--selected' : ''}`}
                  onClick={() => applyPreset(preset)}
                  disabled={disabled}
                  aria-pressed={selected}
                  style={{
                    flex: '1 1 200px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div className="ds-stack ds-stack-1">
                    <span className="ds-text-base" style={{ fontWeight: 500 }}>
                      {preset.label}
                    </span>
                    <span className="ds-text-xs ds-subtle">{preset.description}</span>
                  </div>
                </button>
              )
            })}
            <button
              type="button"
              className={`ds-card${activePreset === null ? ' ds-card--selected' : ''}`}
              onClick={() => setActivePreset('custom')}
              disabled={disabled}
              aria-pressed={activePreset === null}
              style={{
                flex: '1 1 200px',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div className="ds-stack ds-stack-1">
                <span className="ds-text-base" style={{ fontWeight: 500 }}>Custom</span>
                <span className="ds-text-xs ds-subtle">Choose every parameter yourself.</span>
              </div>
            </button>
          </div>

          <div className="commitment-form-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 /* layout only */ }}>
              <label className="commitment-form-label" htmlFor="max-penalty-slider" style={{ marginBottom: 0 /* layout only */ }}>
                MAX PENALTY (BPS)
              </label>
              <span className="commitment-slider-value">{formatBps(maxPenaltyBps)}</span>
            </div>
            <input
              id="max-penalty-slider"
              className="commitment-slider"
              type="range"
              min={0}
              max={10000}
              step={100}
              value={maxPenaltyBps}
              onChange={handleMaxPenaltySlider}
              disabled={disabled}
              aria-label={`Max penalty: ${formatBps(maxPenaltyBps)}`}
            />
          </div>

          <div className="commitment-form-field">
            <label className="commitment-form-label">CHALLENGE WINDOW</label>
            <div className="duration-picker">
              {CHALLENGE_WINDOW_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={`duration-btn${selectedChallengePreset === preset.value ? ' selected' : ''}`}
                  onClick={() => handleChallengePresetSelect(preset)}
                  disabled={disabled}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                className={`duration-btn${showChallengeCustom ? ' selected' : ''}`}
                onClick={handleChallengeCustomSelect}
                disabled={disabled}
              >
                CUSTOM
              </button>
            </div>
            {showChallengeCustom && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' /* layout only */ }}>
                <Input
                  type="number"
                  value={challengeCustomSeconds}
                  onChange={handleChallengeCustomChange}
                  disabled={disabled}
                  placeholder="Seconds"
                  min={1}
                  style={{ width: 160 /* layout only */ }}
                  aria-label="Custom challenge window in seconds"
                  suffix={<span>seconds</span>}
                />
              </div>
            )}
            <Notice tone="info" size="sm">= {formatDuration(challengeWindow)}</Notice>
            {!challengeWindowValid && (
              <Notice tone="danger" size="sm">CHALLENGE WINDOW MUST BE AT LEAST 24 HOURS</Notice>
            )}
          </div>

          <div className="commitment-form-field">
            <label className="commitment-form-label">PROPOSAL DURATION</label>
            <div className="duration-picker">
              {PROPOSAL_DURATION_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={`duration-btn${selectedProposalPreset === preset.value ? ' selected' : ''}`}
                  onClick={() => handleProposalPresetSelect(preset)}
                  disabled={disabled}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                className={`duration-btn${showProposalCustom ? ' selected' : ''}`}
                onClick={handleProposalCustomSelect}
                disabled={disabled}
              >
                CUSTOM
              </button>
            </div>
            {showProposalCustom && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' /* layout only */ }}>
                <Input
                  type="number"
                  value={proposalCustomSeconds}
                  onChange={handleProposalCustomChange}
                  disabled={disabled}
                  placeholder="Seconds"
                  min={1}
                  style={{ width: 160 /* layout only */ }}
                  aria-label="Custom proposal duration in seconds"
                  suffix={<span>seconds</span>}
                />
              </div>
            )}
            <Notice tone="info" size="sm">= {formatDuration(proposalDuration)}</Notice>
          </div>

          <details className="metadata-compute-area">
            <summary className="metadata-compute-label">
              SETTLEMENT CAPS (ADVANCED, OPTIONAL)
            </summary>
            <div className="ds-stack ds-stack-2" style={{ marginTop: 'var(--space-2)' }}>
              <Notice tone="neutral" size="sm">
                Bilateral settlement lets the arbiter rebalance encumbered shares between
                the two parties up to a per-direction cumulative cap. Leave both at 0 for
                a legacy agreement (no rebalancing).
              </Notice>

              <div className="commitment-form-field">
                <label className="commitment-form-label" htmlFor="cap-p2a-input">
                  PROPOSER → ACCEPTOR CAP ({symbol})
                </label>
                <Input
                  id="cap-p2a-input"
                  type="text"
                  value={capP2AValue}
                  onChange={(e) => setCapP2AValue(e.target.value)}
                  onBlur={() =>
                    parseSettlementCap(capP2AValue, setCapP2AError, setParsedCapP2A)
                  }
                  disabled={disabled}
                  placeholder="0.0000"
                  tone={capP2AError ? 'danger' : 'neutral'}
                  title={disabled ? 'Connect wallet to propose agreements' : undefined}
                />
                {capP2AError && (
                  <Notice tone="danger" size="sm">{capP2AError}</Notice>
                )}
              </div>

              <div className="commitment-form-field">
                <label className="commitment-form-label" htmlFor="cap-a2p-input">
                  ACCEPTOR → PROPOSER CAP ({symbol})
                </label>
                <Input
                  id="cap-a2p-input"
                  type="text"
                  value={capA2PValue}
                  onChange={(e) => setCapA2PValue(e.target.value)}
                  onBlur={() =>
                    parseSettlementCap(capA2PValue, setCapA2PError, setParsedCapA2P)
                  }
                  disabled={disabled}
                  placeholder="0.0000"
                  tone={capA2PError ? 'danger' : 'neutral'}
                  title={disabled ? 'Connect wallet to propose agreements' : undefined}
                />
                {capA2PError && (
                  <Notice tone="danger" size="sm">{capA2PError}</Notice>
                )}
              </div>
            </div>
          </details>
        </div>
      )}

      {step === 3 && (
        <div className="ds-stack ds-stack-3">
          <MetadataEditor
            key={metadataKey}
            schema="agreement.v1"
            disabled={disabled}
            onChange={(v) => {
              setMetadataURI(v?.metadataURI ?? '')
              setMetadataHash(v?.metadataHash ?? ZERO_HASH)
            }}
            onStatusChange={setMetadataStatus}
          />

          {metadataStatus === 'dirty' && (
            <Notice tone="warn" size="sm" title="METADATA NOT PINNED">
              Pin your metadata (or clear the fields) before proposing the agreement.
            </Notice>
          )}

          <ReviewSummary
            arbiter={arbiterAvailable ? lockedArbiter : null}
            acceptor={acceptor}
            proposerAmount={parsedProposerAmount}
            acceptorAmount={parsedAcceptorAmount}
            decimals={decimalsForDisplay}
            symbol={symbol}
            maxPenaltyBps={maxPenaltyBps}
            challengeWindow={challengeWindow}
            proposalDuration={proposalDuration}
            preset={activePreset}
            capP2A={parsedCapP2A}
            capA2P={parsedCapA2P}
          />
        </div>
      )}

      <footer
        className="ds-row ds-row-2"
        style={{ marginTop: 'var(--space-3)', justifyContent: 'space-between' }}
      >
        <button
          type="button"
          className="ds-btn ds-btn--ghost"
          onClick={handleBack}
          disabled={step === 1 || isPendingAny}
        >
          ← Back
        </button>
        {step < 3 ? (
          <button
            type="button"
            className="ds-btn ds-btn--primary"
            onClick={handleNext}
            disabled={
              disabled ||
              (step === 1 && !step1Valid) ||
              (step === 2 && !step2Valid) ||
              isPendingAny
            }
            title={!isConnected ? 'Connect wallet to propose agreements' : undefined}
          >
            Next →
          </button>
        ) : (
          <button
            type="submit"
            className="ds-btn ds-btn--primary"
            disabled={disabled || !isValidForm || isPendingAny}
            title={!isConnected ? 'Connect wallet to propose agreements' : undefined}
          >
            {isPendingAny ? 'SENDING…' : 'SEND PROPOSAL'}
          </button>
        )}
      </footer>
    </form>
  )
}

function WizardStepper({ current }: { current: WizardStep }) {
  const steps: { n: WizardStep; label: string }[] = [
    { n: 1, label: 'Parties' },
    { n: 2, label: 'Terms' },
    { n: 3, label: 'Review' },
  ]
  return (
    <ol
      className="ds-row ds-row-2"
      aria-label="Wizard progress"
      style={{ listStyle: 'none', padding: 0, margin: 0 }}
    >
      {steps.map((s, idx) => {
        const status: 'done' | 'current' | 'todo' =
          s.n < current ? 'done' : s.n === current ? 'current' : 'todo'
        const tone =
          status === 'current'
            ? 'var(--accent)'
            : status === 'done'
            ? 'var(--success)'
            : 'var(--text-subtle)'
        return (
          <li
            key={s.n}
            aria-current={status === 'current' ? 'step' : undefined}
            className="ds-row ds-row-2"
            style={{ alignItems: 'center', color: tone }}
          >
            <span className="ds-text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {status === 'done' ? '[✓]' : `[${s.n}]`} {s.label}
            </span>
            {idx < steps.length - 1 && (
              <span aria-hidden style={{ color: 'var(--text-subtle)' }}>—</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

interface ReviewSummaryProps {
  arbiter: Address | null
  acceptor: string
  proposerAmount: bigint | undefined
  acceptorAmount: bigint | undefined
  decimals: number
  symbol: string
  maxPenaltyBps: number
  challengeWindow: number
  proposalDuration: number
  preset: PresetKey | null
  capP2A: bigint | undefined
  capA2P: bigint | undefined
}

function ReviewSummary({
  arbiter,
  acceptor,
  proposerAmount,
  acceptorAmount,
  decimals,
  symbol,
  maxPenaltyBps,
  challengeWindow,
  proposalDuration,
  preset,
  capP2A,
  capA2P,
}: ReviewSummaryProps) {
  const presetLabel =
    preset === 'balanced'
      ? 'Balanced 7d'
      : preset === 'high-trust'
      ? 'High-trust 30d'
      : 'Custom'
  return (
    <Notice tone="neutral" size="md" title="REVIEW">
      <dl className="ds-stack ds-stack-2" style={{ margin: 0 }}>
        <ReviewRow label="Arbiter (you)" value={arbiter ?? '—'} mono />
        <ReviewRow label="Counterparty" value={acceptor || '—'} mono />
        <ReviewRow
          label="Your stake"
          value={
            proposerAmount !== undefined ? (
              <TokenAmount amount={proposerAmount} decimals={decimals} symbol={symbol} size="inline" />
            ) : (
              '—'
            )
          }
        />
        <ReviewRow
          label="Their stake"
          value={
            acceptorAmount !== undefined ? (
              <TokenAmount amount={acceptorAmount} decimals={decimals} symbol={symbol} size="inline" />
            ) : (
              '—'
            )
          }
        />
        <ReviewRow label="Preset" value={presetLabel} />
        <ReviewRow label="Max penalty" value={formatBps(maxPenaltyBps)} />
        <ReviewRow label="Challenge window" value={formatDuration(challengeWindow)} />
        <ReviewRow label="Proposal expires in" value={formatDuration(proposalDuration)} />
        <ReviewRow
          label="Settlement caps"
          value={
            (capP2A ?? 0n) === 0n && (capA2P ?? 0n) === 0n
              ? 'Disabled (legacy)'
              : (
                <span className="ds-stack ds-stack-1" style={{ alignItems: 'flex-end' }}>
                  <TokenAmount
                    amount={capP2A ?? 0n}
                    decimals={decimals}
                    symbol={`${symbol} P→A`}
                    size="inline"
                  />
                  <TokenAmount
                    amount={capA2P ?? 0n}
                    decimals={decimals}
                    symbol={`${symbol} A→P`}
                    size="inline"
                  />
                </span>
              )
          }
        />
      </dl>
    </Notice>
  )
}

function ReviewRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="ds-row ds-row-3" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
      <dt className="ds-text-xs ds-subtle">{label}</dt>
      <dd
        className="ds-text-sm"
        style={{
          margin: 0,
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          textAlign: 'right',
          wordBreak: mono ? 'break-all' : undefined,
        }}
      >
        {value}
      </dd>
    </div>
  )
}
