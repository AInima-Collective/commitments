import { useEffect, useState } from 'react'
import { parseUnits, type Address } from 'viem'
import { useChainId } from 'wagmi'
import { getBackingOptions, getContractAddresses, getDefaultBacking } from '../../../config/contracts'
import { useLedgerBalance } from '../../../hooks/useLedgerBalance'
import { useCreateCommitmentFlow } from '../../../hooks/useCreateCommitmentFlow'
import { useTokenMeta } from '../../../hooks/useTokenMeta'

import { formatDuration, formatTokenAmount } from '../../../lib/format'
import { buildStrategyBindings } from '../../../lib/strategyBindings'
import {
  buildOfferCommitParams,
  isNegotiable,
  isSingleCommitOffer,
  lockedOfferTerms,
} from '../../../lib/offerCommitmentParams'
import type { MarketOffer } from '../../../config/marketOffers'
import { type CommitmentWithStatus, formatBps } from '../../../utils/commitments'
import {
  MAX_INLINE_JSON_BYTES,
  ZERO_HASH,
  buildDataJsonUri,
  computeHashFromJsonText,
  validateMetadataURI,
} from '../../../utils/metadataForm'
import { AddressDisplay, Input, Notice, TokenAmount, useToasts } from '../../ui'
import { DerivedLabelPreview, OperatorIdentity } from '../../protocol'
import { MetadataEditor, type MetadataEditorStatus } from '../../metadata/MetadataEditor'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

interface DurationPreset {
  label: string
  value: number
}

const CHALLENGE_PRESETS: DurationPreset[] = [
  { label: '1 DAY', value: 86_400 },
  { label: '3 DAYS', value: 259_200 },
  { label: '7 DAYS', value: 604_800 },
  { label: '30 DAYS', value: 2_592_000 },
]

export interface OfferModeProps {
  offer: MarketOffer
  managerAddress: Address | undefined
  isConnected: boolean
  connectedAddress?: Address
  onCommitmentCreated: (commitment: CommitmentWithStatus) => void
  onCancel?: () => void
}

/**
 * OfferMode — committing to a marketplace offer.
 *
 * Sits alongside DelegateMode + CustomMode and is rendered by
 * `CreateCommitmentForm` when the parent passes an `offer` prop.
 *
 * Locked vs. editable contract per `lockedOfferTerms`:
 * - **locked** — arbiter, counterparty, maxPenaltyBps, yieldShareBps
 *   (changing these would break the offer's semantic invariant)
 * - **prefilled but editable** — amount (within offer.minAmount / maxAmount),
 *   challenge window (≥ 86_400s), expiry, metadata
 *
 * Today only the single-commit patterns are supported here (`avs-stake`,
 * `direct-coverage`, `agent-underwriting`, `agent-sla-bond`,
 * `yield-donation` — see `SINGLE_COMMIT_PATTERNS`). Agreement-shape and
 * linked-pair patterns route through their own surfaces and never mount
 * this component.
 */
export function OfferMode({
  offer,
  managerAddress,
  isConnected,
  connectedAddress,
  onCommitmentCreated,
  onCancel,
}: OfferModeProps) {
  const terms = lockedOfferTerms(offer)
  // An offer is a fixed deal: only fields the publisher opts into are editable.
  const cwNegotiable = isNegotiable(terms, 'challengeWindow')
  const expiryNegotiable = isNegotiable(terms, 'expiry')
  const metadataNegotiable = isNegotiable(terms, 'metadata')
  // v2 backing: an offer that names its own `token` commits that token (it
  // must be a known backing option so the pricing adapter resolves); anything
  // else is anchored to the canonical vault share. Real decimals/symbol are
  // read on-chain (rather than assuming 18 / "shares") and the committer's
  // per-(token) ledger free balance drives the MAX cap.
  const chainId = useChainId()
  const offerToken = offer.token
  const backing = offerToken
    ? getBackingOptions(chainId).find((b) => b.token.toLowerCase() === offerToken.toLowerCase())
    : getDefaultBacking(chainId)
  const { decimals, symbol, isLoading: metaLoading } = useTokenMeta(backing?.token)
  const ledger = useLedgerBalance({
    managerAddress,
    token: backing?.token,
    user: connectedAddress,
  })
  const freeBalance = ledger.free
  // The offer's locked yield share becomes an IndexAppreciationYield binding.
  const indexYieldStrategy = getContractAddresses(chainId).indexYieldStrategy
  const offerStrategies = buildStrategyBindings(
    { yieldShareBps: terms.yieldShareBps },
    { indexYieldStrategy, flatFeeStrategy: undefined },
  )

  // Amount: defaults to offer.minAmount. The untouched text + parsed value are
  // DERIVED from the live decimals rather than state-initialized — token meta
  // resolves async (18-decimal fallback first), so freezing the first render's
  // formatting would show the wrong scale for 15/27-decimal vault shares.
  const defaultAmountText = formatTokenAmount(offer.minAmount, decimals).full
  const [editedAmountText, setEditedAmountText] = useState<string | null>(null)
  const [editedParsedAmount, setEditedParsedAmount] = useState<bigint | undefined>(undefined)
  const [amountError, setAmountError] = useState<string | null>(null)
  const amountValue = editedAmountText ?? defaultAmountText
  const parsedAmount = editedAmountText === null ? offer.minAmount : editedParsedAmount

  const [challengeWindow, setChallengeWindow] = useState<number>(86_400)
  const [selectedPreset, setSelectedPreset] = useState<number | null>(86_400)
  const [showCustom, setShowCustom] = useState(false)
  const [customSeconds, setCustomSeconds] = useState('')

  const [expiryValue, setExpiryValue] = useState<string>('')
  // Metadata template pre-fill: when the offer publishes a JSON template
  // (e.g. an agent SLA), the form seeds a single JSON editor and derives BOTH
  // metadata fields from its exact bytes — the URI as an inline
  // data:application/json;base64 payload and the hash as keccak256(bytes).
  // Editing the JSON recomputes both; the indexer verifies the hash against
  // the decoded data-URI payload, so they can never drift apart.
  const metadataTemplate =
    metadataNegotiable && offer.metadataTemplateJson && offer.metadataTemplateJson.length > 0
      ? offer.metadataTemplateJson
      : undefined
  const [metadataURI, setMetadataURI] = useState(() =>
    metadataTemplate ? buildDataJsonUri(metadataTemplate) : '',
  )
  const [metadataHash, setMetadataHash] = useState<string>(() =>
    metadataTemplate ? computeHashFromJsonText(metadataTemplate) : ZERO_HASH,
  )
  const [metadataJsonScratch, setMetadataJsonScratch] = useState(metadataTemplate ?? '')
  const [uriError, setUriError] = useState<string | null>(null)
  const [uriWarning, setUriWarning] = useState<string | null>(null)
  // Authoring status from the inline MetadataEditor; `dirty` blocks submit so
  // half-authored metadata is never silently dropped on create.
  const [metadataStatus, setMetadataStatus] = useState<MetadataEditorStatus>('empty')

  const [formError, setFormError] = useState<string | null>(null)

  const { push } = useToasts()

  // Create with optional inline funding: when the amount exceeds free backing,
  // the shortfall is pulled from the wallet via approve → createAndFund in place
  // of sending the user off to the dashboard to deposit first.
  const flow = useCreateCommitmentFlow({
    managerAddress,
    token: backing?.token,
    userAddress: connectedAddress,
  })

  useEffect(() => {
    if (!flow.isSuccess) return
    const synthetic: CommitmentWithStatus = {
      id: 0n,
      committer: (connectedAddress ?? ZERO_ADDRESS) as Address,
      arbiter: terms.arbiter,
      counterparty: terms.counterparty,
      token: (backing?.token ?? ZERO_ADDRESS) as Address,
      adapter: (backing?.adapter ?? ZERO_ADDRESS) as Address,
      amount: parsedAmount ?? 0n,
      maxPenaltyBps: terms.maxPenaltyBps,
      challengeWindow: BigInt(cwNegotiable ? challengeWindow : terms.challengeWindowSecs),
      createdAt: BigInt(Math.floor(Date.now() / 1000)),
      expiresAt:
        expiryNegotiable && expiryValue
          ? BigInt(Math.floor(new Date(expiryValue).getTime() / 1000))
          : offer.durationSecs
            ? BigInt(Math.floor(Date.now() / 1000) + offer.durationSecs)
            : 0n,
      released: false,
      forfeited: false,
      strategies: offerStrategies.map((b) => b.strategy),
      status: 'ACTIVE',
    }
    onCommitmentCreated(synthetic)
    push({
      tone: 'success',
      title: 'COMMITMENT CREATED',
      body: (
        <TokenAmount
          amount={parsedAmount ?? 0n}
          decimals={decimals}
          symbol={symbol}
          size="inline"
        />
      ),
    })
    ledger.refetch()
    flow.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.isSuccess])

  useEffect(() => {
    if (flow.error) {
      push({
        tone: 'danger',
        title: 'TRANSACTION FAILED',
        body: (flow.error as { shortMessage?: string }).shortMessage ?? 'Unknown error.',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.error])

  function parseAmount(value: string) {
    if (!value) {
      setEditedParsedAmount(undefined)
      setAmountError(null)
      return
    }
    try {
      const parsed = parseUnits(value, decimals)
      if (parsed === 0n) {
        setAmountError('AMOUNT MUST BE GREATER THAN ZERO')
        setEditedParsedAmount(undefined)
        return
      }
      if (parsed < offer.minAmount) {
        setAmountError('BELOW OFFER MINIMUM')
        setEditedParsedAmount(undefined)
        return
      }
      if (parsed > offer.maxAmount) {
        setAmountError('ABOVE OFFER MAXIMUM')
        setEditedParsedAmount(undefined)
        return
      }
      setEditedParsedAmount(parsed)
      setAmountError(null)
    } catch {
      setEditedParsedAmount(undefined)
      setAmountError('INVALID AMOUNT')
    }
  }

  function handleAmountBlur() {
    parseAmount(amountValue)
  }

  function handleMaxOffer() {
    const capByFree =
      freeBalance !== undefined && freeBalance < offer.maxAmount ? freeBalance : offer.maxAmount
    const formatted = formatTokenAmount(capByFree, decimals).full
    setEditedAmountText(formatted)
    parseAmount(formatted)
  }

  function handlePresetSelect(p: DurationPreset) {
    setChallengeWindow(p.value)
    setSelectedPreset(p.value)
    setShowCustom(false)
    setCustomSeconds('')
  }

  function handleCustomSelect() {
    setSelectedPreset(null)
    setShowCustom(true)
  }

  function handleCustomSecondsChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setCustomSeconds(v)
    const n = Number(v)
    if (!isNaN(n) && n > 0) setChallengeWindow(n)
  }

  /** Template-driven single editor: JSON text → data: URI + keccak hash, in lockstep. */
  function handleTemplateJsonChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value
    setMetadataJsonScratch(v)
    if (v.trim().length === 0) {
      setMetadataURI('')
      setMetadataHash(ZERO_HASH)
      setUriError(null)
      setUriWarning(null)
      return
    }
    const uri = buildDataJsonUri(v)
    setMetadataURI(uri)
    setMetadataHash(computeHashFromJsonText(v))
    const r = validateMetadataURI(uri)
    // The generic "URI too long" is the wrong story here: the author never
    // wrote a URI, they wrote terms. What is over the limit is the inline
    // encoding this path uses, and the fix is to shorten the terms by a
    // knowable amount. Say that instead.
    if (r.error) {
      const over = new TextEncoder().encode(v).length - MAX_INLINE_JSON_BYTES
      setUriError(
        `These terms are stored inline, inside the on-chain URI, and at this length they no longer fit. ` +
          `Trim about ${over > 0 ? over : 1} more ${over === 1 ? 'character' : 'characters'} to stay under the limit.`,
      )
    } else {
      setUriError(null)
    }
    setUriWarning(r.warning)
  }

  // Non-blocking heads-up: the chain accepts any bytes, but the indexer only
  // stores parsed content for valid JSON.
  const templateJsonWarning = (() => {
    if (!metadataTemplate || metadataJsonScratch.trim().length === 0) return null
    try {
      JSON.parse(metadataJsonScratch)
      return null
    } catch {
      return 'NOT VALID JSON — THE HASH STILL ATTESTS THESE EXACT BYTES, BUT VIEWERS WON’T GET A PARSED RENDERING'
    }
  })()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!managerAddress) return

    const result = buildOfferCommitParams(offer, {
      connectedAddress,
      amount: parsedAmount,
      challengeWindowSecs: challengeWindow,
      expiryValue,
      metadataURI,
      metadataHash,
    })
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    if (!backing) {
      setFormError('NO BACKING TOKEN CONFIGURED')
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
        strategies: offerStrategies,
      },
      depositAmount,
    )
  }

  const disabled = !isConnected
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
  // `empty` (no metadata) and `ready` (pinned) pass; `dirty` blocks submit.
  const metadataValid =
    !metadataNegotiable || (uriError === null && metadataStatus !== 'dirty')
  // Only the negotiable challenge window is user-validated; a locked offer
  // window is trusted as-is.
  const challengeWindowValid = !cwNegotiable || challengeWindow >= 86_400
  const isValidForm =
    !!connectedAddress &&
    !metaLoading && // never parse/submit against the fallback decimals
    parsedAmount !== undefined &&
    parsedAmount > 0n &&
    // Free backing may fall short — that's funded inline — but if the wallet
    // can't cover the shortfall either, the deposit would revert.
    !exceedsWallet &&
    challengeWindowValid &&
    metadataValid

  const ctaLabel = ctaVerbForOffer(offer)
  const isPendingAny = flow.isPending
  const supported = isSingleCommitOffer(offer)

  return (
    <form className="ds-stack ds-stack-4" onSubmit={handleSubmit} noValidate>
      <Notice tone="info" size="sm" title={`COMMITTING TO ${offer.name.toUpperCase()}`}>
        pattern <code>{offer.pattern}</code>
      </Notice>

      {!supported && (
        <Notice tone="warn" size="sm" title="PATTERN NOT YET SUPPORTED">
          This offer pattern requires a different flow (agreement, linked
          pair, or wizard). Single-commit prefill ships first; the matching
          UI is coming next.
        </Notice>
      )}

      {/* Locked counterparty + arbiter */}
      <Notice tone="neutral" size="sm" title="ARBITER (LOCKED BY OFFER)">
        <OperatorIdentity address={terms.arbiter} name={terms.arbiterName} size="sm" />
      </Notice>
      <Notice tone="neutral" size="sm" title="COUNTERPARTY (LOCKED BY OFFER)">
        <OperatorIdentity
          address={terms.counterparty}
          name={terms.counterpartyName}
          size="sm"
        />
      </Notice>
      <Notice tone="neutral" size="sm" title="LOCKED PARAMETERS">
        MAX PENALTY: {formatBps(terms.maxPenaltyBps)}
        {' — '}
        YIELD SHARE: {formatBps(terms.yieldShareBps)}
      </Notice>

      {/* Amount — editable within offer bounds */}
      <div className="ds-field">
        <label className="ds-label" htmlFor="offer-amount-input">
          AMOUNT ({symbol})
        </label>
        <div className="ds-input-group">
          <Input
            id="offer-amount-input"
            type="text"
            value={amountValue}
            onChange={(e) => setEditedAmountText(e.target.value)}
            onBlur={handleAmountBlur}
            disabled={disabled}
            placeholder="0.0000"
            tone={amountError ? 'danger' : 'neutral'}
          />
          <button
            type="button"
            className="ds-btn ds-btn--max"
            onClick={handleMaxOffer}
            disabled={disabled}
          >
            MAX
          </button>
        </div>
        <Notice tone="info" size="sm">
          OFFER RANGE:{' '}
          <TokenAmount amount={offer.minAmount} decimals={decimals} compact />
          {' .. '}
          <TokenAmount amount={offer.maxAmount} decimals={decimals} compact />
        </Notice>
        {amountError && <Notice tone="danger" size="sm">{amountError}</Notice>}
        {needsDeposit && !exceedsWallet && !amountError && (
          <Notice tone="info" size="sm" title="WILL FUND FROM WALLET">
            Free backing covers{' '}
            <TokenAmount amount={freeBalance ?? 0n} decimals={decimals} symbol={symbol} size="inline" /> — the
            remaining{' '}
            <TokenAmount amount={shortfall} decimals={decimals} symbol={symbol} size="inline" /> is deposited
            from your wallet in the same transaction.
          </Notice>
        )}
        {exceedsWallet && !amountError && (
          <Notice tone="warn" size="sm" title="NOT ENOUGH BACKING">
            This commitment locks{' '}
            <TokenAmount amount={parsedAmount ?? 0n} decimals={decimals} symbol={symbol} size="inline" />, but
            you have only{' '}
            <TokenAmount amount={freeBalance ?? 0n} decimals={decimals} symbol={symbol} size="inline" /> free
            plus{' '}
            <TokenAmount amount={flow.walletBalance ?? 0n} decimals={decimals} symbol={symbol} size="inline" />{' '}
            in your wallet. Add more {symbol} to continue.
          </Notice>
        )}
      </div>

      {/* Forfeit execution delay — locked by the offer unless made negotiable */}
      {!cwNegotiable ? (
        <Notice tone="neutral" size="sm" title="FORFEIT EXECUTION DELAY (LOCKED BY OFFER)">
          {formatDuration(terms.challengeWindowSecs)}
        </Notice>
      ) : (
      <div className="ds-field">
        <label className="ds-label">FORFEIT EXECUTION DELAY</label>
        <div className="duration-picker">
          {CHALLENGE_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`duration-btn${selectedPreset === p.value ? ' selected' : ''}`}
              onClick={() => handlePresetSelect(p)}
              disabled={disabled}
            >
              {p.label}
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
      )}

      {/* Expiry — locked by the offer unless made negotiable */}
      {!expiryNegotiable ? (
        <Notice tone="neutral" size="sm" title="EXPIRY (LOCKED BY OFFER)">
          {offer.durationSecs
            ? `Now + ${Math.round(offer.durationSecs / 86_400)} days (offer duration)`
            : 'No expiry'}
        </Notice>
      ) : (
      <div className="ds-field">
        <label className="ds-label" htmlFor="offer-expiry-input">
          EXPIRY DATE (OPTIONAL)
        </label>
        <div className="ds-input-group">
          <Input
            id="offer-expiry-input"
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
        {!expiryValue && offer.durationSecs ? (
          <Notice tone="info" size="sm">
            DEFAULTS TO NOW + {Math.round(offer.durationSecs / 86_400)} DAYS (OFFER DURATION)
          </Notice>
        ) : !expiryValue ? (
          <Notice tone="info" size="sm">NO EXPIRY</Notice>
        ) : null}
      </div>
      )}

      {/* Metadata with a publisher template (e.g. agent SLA): one JSON editor
          drives both fields — URI (inline data: payload) + hash (keccak of the
          exact bytes) regenerate on every edit. */}
      {metadataNegotiable && metadataTemplate && (
        <div className="ds-field">
          <label className="ds-label" htmlFor="offer-metadata-template">
            TERMS (JSON — ATTESTED ON-CHAIN)
          </label>
          <textarea
            id="offer-metadata-template"
            className="ds-textarea"
            rows={4}
            value={metadataJsonScratch}
            onChange={handleTemplateJsonChange}
            disabled={disabled}
            spellCheck={false}
          />
          <Notice tone="info" size="sm">
            Stored as an inline <code>data:application/json;base64</code> URI (
            {new TextEncoder().encode(metadataURI).length} / 512 bytes) with content hash{' '}
            <span title={metadataHash}>
              {metadataHash === ZERO_HASH ? 'none' : `${metadataHash.slice(0, 10)}…${metadataHash.slice(-6)}`}
            </span>
            {' '}— both recompute as you edit.
          </Notice>
          {templateJsonWarning && <Notice tone="warn" size="sm">{templateJsonWarning}</Notice>}
          {uriError && <Notice tone="danger" size="sm">{uriError}</Notice>}
          {uriWarning && !uriError && <Notice tone="warn" size="sm">{uriWarning}</Notice>}
        </div>
      )}

      {/* Metadata (optional) — only when the offer makes it negotiable. Same
          structured editor every other create path uses, so committing to an
          offer can name the commitment instead of only pasting a pinned URI. */}
      {metadataNegotiable && !metadataTemplate && (
        <details className="metadata-section">
          <summary>METADATA (OPTIONAL)</summary>
          <div className="metadata-section-body">
            <MetadataEditor
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
                counterparty={terms.counterparty}
                token={backing?.token}
                amount={parsedAmount}
                decimals={decimals}
                symbol={symbol}
              />
            )}
          </div>
        </details>
      )}

      {metadataStatus === 'dirty' && (
        <Notice tone="warn" size="sm" title="METADATA NOT PINNED">
          Pin your metadata (or clear the fields) before committing to this offer.
        </Notice>
      )}

      <div className="ds-row ds-row-2" style={{ justifyContent: 'flex-end' /* layout only */ }}>
        {onCancel && (
          <button type="button" className="ds-btn" onClick={onCancel} disabled={isPendingAny}>
            CANCEL
          </button>
        )}
        <button
          type="submit"
          className="ds-btn ds-btn--primary"
          disabled={disabled || !supported || !isValidForm || isPendingAny}
          title={!isConnected ? 'Connect wallet to commit to this offer' : undefined}
        >
          {flow.step === 'approving'
            ? 'APPROVING…'
            : isPendingAny
              ? 'CONFIRMING…'
              : needsDeposit
                ? 'FUND & CREATE'
                : ctaLabel}
        </button>
      </div>

      {formError && (
        <Notice tone="danger" size="sm" title="INVALID FORM">{formError}</Notice>
      )}

      {/* Tiny address footer mirrors the marketplace drawer for verification. */}
      <section className="ds-stack ds-stack-2" aria-label="Addresses">
        <h3 className="ds-section-eyebrow">Addresses</h3>
        <div className="ds-text-xs ds-subtle">
          Counterparty: <AddressDisplay address={terms.counterparty} />
        </div>
        <div className="ds-text-xs ds-subtle">
          Arbiter: <AddressDisplay address={terms.arbiter} />
        </div>
      </section>
    </form>
  )
}

function ctaVerbForOffer(offer: MarketOffer): string {
  switch (offer.pattern) {
    case 'avs-stake':
      return 'STAKE TO OPERATOR'
    case 'direct-coverage':
      return 'UNDERWRITE COVER'
    case 'agent-underwriting':
      return 'UNDERWRITE AGENT'
    case 'agent-sla-bond':
      return 'POST SLA BOND'
    case 'yield-donation':
      return 'CREATE DONATION'
    default:
      return 'CREATE COMMITMENT'
  }
}
