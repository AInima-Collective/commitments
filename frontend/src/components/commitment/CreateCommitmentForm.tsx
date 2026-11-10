import { useEffect, useState, type ReactNode } from 'react'
import { isAddress, type Address } from 'viem'
import { useChainId } from 'wagmi'
import { getBackingOptions } from '../../config/contracts'
import { useAmountInput } from '../../hooks/useAmountInput'
import { useLedgerBalance } from '../../hooks/useLedgerBalance'
import { useCreateCommitmentFlow } from '../../hooks/useCreateCommitmentFlow'
import { useTokenMeta } from '../../hooks/useTokenMeta'
import {
  SELF_ARBITER_ID,
  getArbiterDescriptor,
  getArbiterOptions,
  resolveArbiterAddress,
} from '../../config/arbiters'
import { buildCustomParams } from '../../lib/customCommitmentParams'
import { formatBps } from '../../utils/commitments'
import { legibleWriteError } from '../../utils/contractErrors'
import { ZERO_HASH } from '../../utils/metadataForm'
import {
  Disclosure,
  Input,
  Notice,
  Select,
  TokenAmount,
  Tooltip,
  useToasts,
} from '../ui'
import { DerivedLabelPreview } from '../protocol'
import { MetadataEditor, type MetadataEditorStatus } from '../metadata/MetadataEditor'
import { FundingNotice } from './FundingNotice'
import {
  StrategyBindingPicker,
  type StrategyBindingState,
} from './StrategyBindingPicker'

interface CreateCommitmentFormProps {
  managerAddress: Address | undefined
  isConnected: boolean
  connectedAddress?: Address | undefined
  onCommitmentCreated: () => void
}

/**
 * Label + inline term-definition hint. Keeps the educational copy next to the
 * field it explains without nesting the Tooltip's button inside the `<label>`
 * (which would be invalid markup and would re-trigger the associated control).
 */
function FieldLabel({
  htmlFor,
  children,
  hint,
  hintLabel,
}: {
  htmlFor?: string
  children: ReactNode
  hint: ReactNode
  hintLabel: string
}) {
  return (
    <div className="ds-row ds-row-2" style={{ alignItems: 'center', gap: 'var(--space-2)' /* layout only */ }}>
      <label className="ds-label" htmlFor={htmlFor} style={{ marginBottom: 0 /* layout only */ }}>
        {children}
      </label>
      <Tooltip tone="info" size="md" triggerLabel={hintLabel} content={hint} />
    </div>
  )
}

interface DurationPreset {
  label: string
  value: number
}

const DURATION_PRESETS: DurationPreset[] = [
  { label: '1 DAY', value: 86400 },
  { label: '3 DAYS', value: 259200 },
  { label: '7 DAYS', value: 604800 },
  { label: '30 DAYS', value: 2592000 },
]

const DEFAULT_CHALLENGE_WINDOW = 86400

/**
 * The create-commitment form. Essentials (amount, backing token, counterparty,
 * arbiter) sit up front; the rest of the terms (penalty, forfeit execution
 * delay, expiry, metadata, strategies) live in the "Advanced terms" disclosure,
 * open from the start.
 *
 * The arbiter is a first-class choice (default: "you arbitrate this yourself"),
 * each option carrying a plain-language trust assumption. Locked/derived params
 * are computed by `buildCustomParams`, never inlined here (the unit-tested
 * helper seam).
 */
export function CreateCommitmentForm({
  managerAddress,
  isConnected,
  connectedAddress,
  onCommitmentCreated,
}: CreateCommitmentFormProps) {
  const chainId = useChainId()

  // ── Backing token ────────────────────────────────────────────────────────────
  // v2 commitments can be backed by any configured (token, adapter) pair; the
  // canonical vault share leads the list and stays the default. The selected
  // token's own decimals/symbol drive parsing + display, and the user's
  // per-(token) manager-ledger free balance gates the amount.
  const backingOptions = getBackingOptions(chainId)
  const [backingToken, setBackingToken] = useState<Address | undefined>(backingOptions[0]?.token)
  const backing = backingOptions.find((o) => o.token === backingToken) ?? backingOptions[0]

  // Per-token display metadata (raw ERC-20 or vault share) — never assume the
  // vault's share decimals; a 6-decimal token parsed at 18 is 10¹²× wrong.
  const { decimals, symbol, isLoading: metaLoading } = useTokenMeta(backing?.token)
  // Free balance of the SELECTED token in the manager ledger — backs the MAX
  // button and the over-allocation guard.
  const ledger = useLedgerBalance({
    managerAddress,
    token: backing?.token,
    user: connectedAddress,
  })
  const freeBalance = ledger.free

  // ── Arbiter ──────────────────────────────────────────────────────────────────
  const arbiterOptions = getArbiterOptions(chainId)
  const [arbiterId, setArbiterId] = useState<string>(SELF_ARBITER_ID)
  const arbiterDescriptor = getArbiterDescriptor(chainId, arbiterId)
  const resolvedArbiter = resolveArbiterAddress(chainId, arbiterId, connectedAddress)

  // ── Field state ─────────────────────────────────────────────────────────────
  const [counterparty, setCounterparty] = useState('')
  const [counterpartyError, setCounterpartyError] = useState<string | null>(null)

  const amountInput = useAmountInput(decimals)
  const parsedAmount = amountInput.amount !== 0n ? amountInput.amount : undefined
  const amountError = amountInput.invalid
    ? 'INVALID AMOUNT'
    : amountInput.amount === 0n
      ? 'AMOUNT MUST BE GREATER THAN ZERO'
      : null

  const [maxPenaltyBps, setMaxPenaltyBps] = useState(0)
  const [maxPenaltyText, setMaxPenaltyText] = useState('0')

  const [challengeWindow, setChallengeWindow] = useState<number>(DEFAULT_CHALLENGE_WINDOW)
  const [selectedPreset, setSelectedPreset] = useState<number | null>(DEFAULT_CHALLENGE_WINDOW)
  const [customSeconds, setCustomSeconds] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  // Optional v2 strategy bindings (yield routing / upfront fee). `ready` gates
  // submit while a flat fee awaits its escrow funding. `pickerKey` remounts the
  // picker after a successful create so it clears with the rest of the form.
  const [strategyState, setStrategyState] = useState<StrategyBindingState>({
    bindings: [],
    ready: true,
  })
  const [pickerKey, setPickerKey] = useState(0)

  const [metadataURI, setMetadataURI] = useState('')
  const [metadataHash, setMetadataHash] = useState<string>(ZERO_HASH)
  const [expiryValue, setExpiryValue] = useState('')

  // Authoring status from the inline MetadataEditor; `dirty` blocks submit so a
  // half-authored, unpinned payload is never silently dropped. `metadataKey`
  // remounts the (uncontrolled) editor after a successful create so it clears.
  const [metadataStatus, setMetadataStatus] = useState<MetadataEditorStatus>('empty')
  const [metadataKey, setMetadataKey] = useState(0)

  const { push } = useToasts()

  // Create with optional inline funding: when the amount exceeds free backing,
  // the shortfall is pulled from the wallet via approve → createAndFund in place
  // of sending the user off to the dashboard to deposit first.
  const flow = useCreateCommitmentFlow({
    managerAddress,
    token: backing?.token,
    userAddress: connectedAddress,
    onSuccess: () => {
      onCommitmentCreated()
      push({
        tone: 'success',
        title: 'COMMITMENT CREATED',
        body: <TokenAmount amount={parsedAmount ?? 0n} decimals={decimals} symbol={symbol} size="inline" />,
      })

      // Clear form
      setCounterparty('')
      amountInput.clear()
      setMaxPenaltyBps(0)
      setMaxPenaltyText('0')
      setChallengeWindow(DEFAULT_CHALLENGE_WINDOW)
      setSelectedPreset(DEFAULT_CHALLENGE_WINDOW)
      setShowCustom(false)
      setCustomSeconds('')
      setExpiryValue('')
      setMetadataURI('')
      setMetadataHash(ZERO_HASH)
      setMetadataStatus('empty')
      setMetadataKey((k) => k + 1)
      setStrategyState({ bindings: [], ready: true })
      setPickerKey((k) => k + 1)

      ledger.refetch()
      flow.reset()
    },
  })

  // Surface revert / receipt errors via toast
  useEffect(() => {
    if (flow.error) {
      push({ tone: 'danger', title: 'TRANSACTION FAILED', body: legibleWriteError(flow.error) })
    }
  }, [flow.error, push])

  // ── Validation helpers ────────────────────────────────────────────────────────
  function validateCounterparty(value: string) {
    if (value !== '' && !isAddress(value)) {
      setCounterpartyError('INVALID ETHEREUM ADDRESS')
    } else {
      setCounterpartyError(null)
    }
  }

  // Switching the backing token clears the amount: a value typed (or MAX'd) at
  // the previous token's decimals must never carry over and be re-parsed at the
  // new token's scale.
  function handleBackingChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setBackingToken(e.target.value as Address)
    amountInput.clear()
  }

  function handleMaxFree() {
    if (freeBalance !== undefined) amountInput.setMax(freeBalance)
  }

  function handleMaxPenaltySlider(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value)
    setMaxPenaltyBps(val)
    setMaxPenaltyText(String(val))
  }

  function handleMaxPenaltyText(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setMaxPenaltyText(raw)
    const n = Number(raw)
    if (!isNaN(n) && n >= 0 && n <= 10000) {
      setMaxPenaltyBps(Math.round(n))
    }
  }

  function handlePresetSelect(preset: DurationPreset) {
    setChallengeWindow(preset.value)
    setSelectedPreset(preset.value)
    setShowCustom(false)
    setCustomSeconds('')
  }

  function handleCustomSelect() {
    setSelectedPreset(null)
    setShowCustom(true)
  }

  function handleCustomSecondsChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setCustomSeconds(val)
    const n = Number(val)
    if (!isNaN(n) && n > 0) {
      setChallengeWindow(n)
    }
  }

  // ── Form validity ─────────────────────────────────────────────────────────────
  const arbiterAvailable = !!resolvedArbiter
  const counterpartyValid = counterparty === '' || isAddress(counterparty)
  const amountValid = parsedAmount !== undefined && parsedAmount > 0n
  const maxPenaltyValid = maxPenaltyBps >= 0 && maxPenaltyBps <= 10000
  const challengeWindowValid = challengeWindow >= 86400
  // Block submit only while metadata is dirty (entered but not pinned); `empty`
  // (no metadata) and `ready` (pinned) both pass.
  const metadataValid = metadataStatus !== 'dirty'
  // Shortfall between the staked amount and current free backing. When positive
  // it is deposited from the wallet in the same tx (createAndFund); the create
  // is only blocked when the wallet can't cover it either.
  const shortfall =
    parsedAmount !== undefined && freeBalance !== undefined && parsedAmount > freeBalance
      ? parsedAmount - freeBalance
      : 0n
  const needsDeposit = shortfall > 0n
  const exceedsWallet =
    needsDeposit && flow.walletBalance !== undefined && shortfall > flow.walletBalance

  const isValidForm =
    arbiterAvailable &&
    counterpartyValid &&
    amountValid &&
    maxPenaltyValid &&
    challengeWindowValid &&
    !!backing &&
    !metaLoading && // never parse/submit against the fallback decimals
    metadataValid &&
    strategyState.ready &&
    // Free backing may fall short — that's funded inline — but if the wallet
    // can't cover the shortfall either, the deposit would revert.
    !exceedsWallet

  // ── Submit ────────────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidForm || !managerAddress || !backing) return

    const result = buildCustomParams({
      connectedAddress,
      arbiter: resolvedArbiter,
      counterparty,
      amount: parsedAmount,
      maxPenaltyBps,
      challengeWindowSecs: challengeWindow,
      expiryValue,
      metadataURI,
      metadataHash,
    })
    if (!result.ok) {
      push({ tone: 'danger', title: 'INVALID FORM', body: result.error })
      return
    }

    // Fund the shortfall between the staked amount and free backing from the
    // wallet in the same tx (0 ⇒ free balance already covers it).
    const depositAmount =
      freeBalance !== undefined && result.params.amount > freeBalance
        ? result.params.amount - freeBalance
        : 0n

    flow.submit(
      {
        ...result.params,
        token: backing.token,
        adapter: backing.adapter,
        strategies: strategyState.bindings,
      },
      depositAmount,
    )
  }

  const isPendingAny = flow.isPending
  const disabled = !isConnected

  return (
    <div className="ds-stack ds-stack-3">
      <p className="ds-text-sm ds-muted" style={{ margin: 0 /* layout only */ }}>
        A commitment pledges stake you control to an agreement: it stays in custody
        (and keeps earning yield) while a designated arbiter can penalize you through
        a two-phase forfeit if you break the terms. Set the terms below — arbiter,
        penalty, forfeit execution delay, expiry, and metadata are all under your control.
      </p>
      <form className="ds-stack ds-stack-4" onSubmit={handleSubmit} noValidate>
        {/* ── Essentials ───────────────────────────────────────────────────────── */}

        {/* Amount */}
        <div className="ds-field">
          <FieldLabel
            htmlFor="amount-input"
            hintLabel="What does this amount do?"
            hint="The stake you pledge to this commitment. While it's live the stake is encumbered — custodied and locked to this agreement so it can't be moved or withdrawn — but the backing keeps earning yield the whole time."
          >
            AMOUNT ({symbol})
          </FieldLabel>
          <div className="ds-input-group">
            <Input
              id="amount-input"
              type="text"
              value={amountInput.text}
              onChange={(e) => amountInput.setText(e.target.value)}
              disabled={disabled}
              placeholder="0.0000"
              tone={amountError ? 'danger' : 'neutral'}
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
              FREE:{' '}
              <TokenAmount amount={freeBalance} decimals={decimals} symbol={symbol} size="inline" />
            </Notice>
          )}
          {amountError && <Notice tone="danger" size="sm">{amountError}</Notice>}
          {!amountError && (
            <FundingNotice
              amount={parsedAmount}
              free={freeBalance}
              shortfall={shortfall}
              wallet={flow.walletBalance}
              decimals={decimals}
              symbol={symbol}
              noun="backing"
              subject="commitment"
            />
          )}
        </div>

        {/* Backing token */}
        {backingOptions.length > 1 && (
          <div className="ds-field">
            <label className="ds-label" htmlFor="backing-select">
              BACKING TOKEN
            </label>
            <Select
              id="backing-select"
              value={backingToken}
              onChange={handleBackingChange}
              disabled={disabled}
              options={backingOptions.map((o) => ({ value: o.token, label: o.label }))}
            />
          </div>
        )}

        {/* Counterparty */}
        <div className="ds-field">
          <FieldLabel
            htmlFor="counterparty-input"
            hintLabel="Who is the counterparty?"
            hint="The other party this commitment is made to. Leave it blank for an open, counterparty-less pledge — for example a donation or a self-stake."
          >
            COUNTERPARTY ADDRESS
          </FieldLabel>
          <Input
            id="counterparty-input"
            type="text"
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            onBlur={() => validateCounterparty(counterparty)}
            disabled={disabled}
            placeholder="0x... (leave blank for no counterparty)"
            tone={counterpartyError ? 'danger' : 'neutral'}
            title={disabled ? 'Connect wallet to create commitments' : undefined}
            style={{ width: '100%' /* layout only */ }}
          />
          {counterpartyError && <Notice tone="danger" size="sm">{counterpartyError}</Notice>}
        </div>

        {/* Arbiter — first-class, explained choice (default: self) */}
        <div className="ds-field">
          <FieldLabel
            htmlFor="arbiter-select"
            hintLabel="What does the arbiter do?"
            hint="The party trusted to decide if this commitment is broken. To penalize you they must initiate a two-phase forfeit and then wait out the manager's execution delay — so a forfeit is never instant or silent."
          >
            ARBITER
          </FieldLabel>
          <Select
            id="arbiter-select"
            value={arbiterId}
            onChange={(e) => setArbiterId(e.target.value)}
            disabled={disabled}
            options={arbiterOptions}
          />
          {arbiterDescriptor && (
            <Notice tone="info" size="sm">
              {arbiterDescriptor.trustAssumption}
            </Notice>
          )}
          {arbiterId === SELF_ARBITER_ID && !connectedAddress && (
            <Notice tone="warn" size="sm">CONNECT A WALLET TO SELF-ARBITRATE</Notice>
          )}
        </div>

        {/* ── Advanced terms ───────────────────────────────────────────────────── */}
        <Disclosure label="ADVANCED TERMS" defaultOpen>
          <div className="ds-stack ds-stack-4">
            {/* Max Penalty BPS */}
            <div className="ds-field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 /* layout only */ }}>
                <FieldLabel
                  htmlFor="max-penalty-slider"
                  hintLabel="What is the max penalty?"
                  hint="The ceiling on what the arbiter can ever forfeit, as a share of your stake. 10000 bps = 100%. A forfeit can take less than this, but never more."
                >
                  MAX PENALTY (BPS)
                </FieldLabel>
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
              <Input
                type="text"
                value={maxPenaltyText}
                onChange={handleMaxPenaltyText}
                disabled={disabled}
                placeholder="BPS (0-10000)"
                style={{ marginTop: 4, width: 120 /* layout only */ }}
                aria-label="Max penalty BPS text input"
              />
            </div>

            {/* Manager-side forfeit execution delay */}
            <div className="ds-field">
              <FieldLabel
                hintLabel="What is the forfeit execution delay?"
                hint="The minimum wait between forfeit initiation and execution. The arbiter may cancel during or after this timer, but the timer does not give the committer a generic on-chain challenge action. It must be at least 24 hours."
              >
                FORFEIT EXECUTION DELAY
              </FieldLabel>
              <div className="duration-picker">
                {DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`duration-btn${selectedPreset === preset.value ? ' selected' : ''}`}
                    onClick={() => handlePresetSelect(preset)}
                    disabled={disabled}
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`duration-btn${showCustom ? ' selected' : ''}`}
                  onClick={handleCustomSelect}
                  disabled={disabled}
                >
                  CUSTOM
                </button>
              </div>
              {showCustom && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' /* layout only */ }}>
                  <Input
                    type="number"
                    value={customSeconds}
                    onChange={handleCustomSecondsChange}
                    disabled={disabled}
                    placeholder="Seconds"
                    min={1}
                    style={{ width: 160 /* layout only */ }}
                    aria-label="Custom forfeit execution delay in seconds"
                    suffix={<span>seconds</span>}
                  />
                </div>
              )}
              {!challengeWindowValid && (
                <Notice tone="danger" size="sm">FORFEIT EXECUTION DELAY MUST BE AT LEAST 24 HOURS</Notice>
              )}
            </div>

            {/* Expiry Date */}
            <div className="ds-field">
              <label className="ds-label" htmlFor="expiry-input">
                EXPIRY DATE (OPTIONAL)
              </label>
              <div className="ds-input-group">
                <Input
                  id="expiry-input"
                  type="datetime-local"
                  value={expiryValue}
                  onChange={(e) => setExpiryValue(e.target.value)}
                  disabled={disabled}
                />
                <button
                  type="button"
                  className="ds-btn ds-btn--max"
                  onClick={() => setExpiryValue('')}
                  disabled={disabled}
                >
                  CLEAR
                </button>
              </div>
              {!expiryValue && <Notice tone="info" size="sm">NO EXPIRY</Notice>}
            </div>

            {/* Metadata (Optional) — inline structured authoring + pin */}
            <details className="metadata-section">
              <summary>METADATA (OPTIONAL)</summary>
              <div className="metadata-section-body">
                <MetadataEditor
                  key={metadataKey}
                  schema="commitment.v1"
                  disabled={disabled}
                  onChange={(v) => {
                    setMetadataURI(v?.metadataURI ?? '')
                    setMetadataHash(v?.metadataHash ?? ZERO_HASH)
                  }}
                  onStatusChange={setMetadataStatus}
                />
                {metadataStatus === 'empty' && (
                  <DerivedLabelPreview
                    counterparty={counterparty === '' || !isAddress(counterparty) ? undefined : (counterparty as Address)}
                    token={backing?.token}
                    amount={parsedAmount}
                    decimals={decimals}
                    symbol={symbol}
                  />
                )}
              </div>
            </details>

            {/* Strategy bindings (optional) */}
            <StrategyBindingPicker
              key={pickerKey}
              managerAddress={managerAddress}
              token={backing?.token}
              tokenDecimals={decimals}
              tokenSymbol={symbol}
              userAddress={connectedAddress}
              isConnected={isConnected}
              onChange={setStrategyState}
            />
          </div>
        </Disclosure>

        {/* Submit */}
        {metadataStatus === 'dirty' && (
          <Notice tone="warn" size="sm" title="METADATA NOT PINNED">
            Pin your metadata (or clear the fields) before creating the commitment.
          </Notice>
        )}
        <button
          type="submit"
          className="ds-btn ds-btn--primary ds-btn--full"
          disabled={disabled || !isValidForm || isPendingAny}
          title={!isConnected ? 'Connect wallet to create commitments' : undefined}
        >
          {flow.step === 'approving'
            ? 'APPROVING…'
            : isPendingAny
              ? 'CONFIRMING…'
              : needsDeposit
                ? 'FUND & CREATE'
                : 'CREATE COMMITMENT'}
        </button>
      </form>
    </div>
  )
}
