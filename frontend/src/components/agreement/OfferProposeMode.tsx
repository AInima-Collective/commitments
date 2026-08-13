import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { parseUnits, type Address } from 'viem'
import { useChainId, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { getDefaultBacking } from '../../config/contracts'
import { useLedgerBalance } from '../../hooks/useLedgerBalance'
import { useTokenMeta } from '../../hooks/useTokenMeta'

import type { MarketOffer } from '../../config/marketOffers'
import { commitmentManagerAbi } from '../../generated'
import {
  buildOfferProposeParams,
  isAgreementNegotiable,
  isAgreementOffer,
  lockedAgreementTerms,
} from '../../lib/offerProposeParams'
import { formatTokenAmount, formatDuration } from '../../lib/format'
import { type AgreementProposalWithStatus } from '../../utils/agreements'
import { formatBps } from '../../utils/commitments'
import { ZERO_HASH } from '../../utils/metadataForm'
import { AddressDisplay, Input, Notice, TokenAmount, useToasts } from '../ui'
import { OperatorIdentity } from '../protocol'
import { MetadataEditor, type MetadataEditorStatus } from '../metadata/MetadataEditor'

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

const PROPOSAL_PRESETS: DurationPreset[] = [
  { label: '1 DAY', value: 86_400 },
  { label: '7 DAYS', value: 604_800 },
  { label: '30 DAYS', value: 2_592_000 },
]

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

export interface OfferProposeModeProps {
  offer: MarketOffer
  managerAddress: Address | undefined
  isConnected: boolean
  connectedAddress?: Address
  onProposalCreated: (proposal: AgreementProposalWithStatus) => void
  onCancel?: () => void
}

/**
 * Single-step proposeAgreement form for agreement-shape marketplace
 * offers (reciprocal-mutual, mutual-aid). Sits alongside the freeform
 * `ProposeAgreementForm` wizard — the offer locks the acceptor, the
 * acceptor amount, the shared arbiter, the forfeit ceiling, and (for
 * mutual-aid) the bilateral settlement caps. The proposer adjusts their
 * own stake, challenge window, yield share, proposal expiry, and metadata.
 */
export function OfferProposeMode({
  offer,
  managerAddress,
  isConnected,
  connectedAddress,
  onProposalCreated,
  onCancel,
}: OfferProposeModeProps) {
  const chainId = useChainId()
  // The offer is anchored to the canonical vault share; resolve its real
  // decimals/symbol on-chain and read the proposer's per-(token) free balance.
  const backing = getDefaultBacking(chainId)
  const { decimals, symbol, isLoading: metaLoading } = useTokenMeta(backing?.token)
  const ledger = useLedgerBalance({
    managerAddress,
    token: backing?.token,
    user: connectedAddress,
  })
  const freeBalance = ledger.free
  const supported = isAgreementOffer(offer)
  const terms = supported ? lockedAgreementTerms(offer) : null

  const initialAmount = terms?.defaultProposerAmount ?? 0n
  const initialAmountText = formatTokenAmount(initialAmount, decimals).full
  const [amountValue, setAmountValue] = useState(initialAmountText)
  const [amountError, setAmountError] = useState<string | null>(null)
  const [parsedAmount, setParsedAmount] = useState<bigint | undefined>(initialAmount || undefined)

  const [challengeWindow, setChallengeWindow] = useState<number>(86_400)
  const [selectedChallenge, setSelectedChallenge] = useState<number | null>(86_400)
  const [showChallengeCustom, setShowChallengeCustom] = useState(false)
  const [challengeCustom, setChallengeCustom] = useState('')

  const [proposalDuration, setProposalDuration] = useState<number>(604_800)
  const [selectedProposal, setSelectedProposal] = useState<number | null>(604_800)
  const [showProposalCustom, setShowProposalCustom] = useState(false)
  const [proposalCustom, setProposalCustom] = useState('')


  // Fed by the inline MetadataEditor (agreement.v1), only when the offer makes
  // metadata negotiable. `dirty` blocks submit.
  const [metadataURI, setMetadataURI] = useState('')
  const [metadataHash, setMetadataHash] = useState<string>(ZERO_HASH)
  const [metadataStatus, setMetadataStatus] = useState<MetadataEditorStatus>('empty')

  const [formError, setFormError] = useState<string | null>(null)

  const { push } = useToasts()
  const { writeContract, data: hash, isPending, reset: resetWrite, error: writeError } = useWriteContract()
  const {
    isLoading: isConfirming,
    isSuccess,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !terms) return
    const nowSecs = BigInt(Math.floor(Date.now() / 1000))
    const optimistic: AgreementProposalWithStatus = {
      proposalId: 0n,
      proposer: (connectedAddress ?? ZERO_ADDRESS) as Address,
      acceptor: terms.acceptor,
      arbiter: terms.arbiter,
      token: (backing?.token ?? ZERO_ADDRESS) as Address,
      adapter: (backing?.adapter ?? ZERO_ADDRESS) as Address,
      proposerAmount: parsedAmount ?? 0n,
      acceptorAmount: terms.acceptorAmount,
      maxPenaltyBps: terms.maxPenaltyBps,
      challengeWindow: BigInt(
        isAgreementNegotiable(terms, 'challengeWindow') ? challengeWindow : terms.challengeWindowSecs,
      ),
      expiresAt:
        nowSecs +
        BigInt(isAgreementNegotiable(terms, 'expiry') ? proposalDuration : terms.proposalDurationSecs),
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
          amount={parsedAmount ?? 0n}
          decimals={decimals}
          symbol={symbol}
          size="inline"
        />
      ),
    })
    ledger.refetch()
    resetWrite()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

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

  function parseAmount(value: string) {
    if (!value) {
      setParsedAmount(undefined)
      setAmountError(null)
      return
    }
    try {
      const parsed = parseUnits(value, decimals)
      if (parsed === 0n) {
        setAmountError('AMOUNT MUST BE GREATER THAN ZERO')
        setParsedAmount(undefined)
        return
      }
      setParsedAmount(parsed)
      setAmountError(null)
    } catch {
      setParsedAmount(undefined)
      setAmountError('INVALID AMOUNT')
    }
  }

  function handleAmountBlur() {
    parseAmount(amountValue)
  }

  function handleMaxFree() {
    if (freeBalance === undefined) return
    const formatted = formatTokenAmount(freeBalance, decimals).full
    setAmountValue(formatted)
    parseAmount(formatted)
  }

  function handleChallengePreset(p: DurationPreset) {
    setChallengeWindow(p.value)
    setSelectedChallenge(p.value)
    setShowChallengeCustom(false)
    setChallengeCustom('')
  }
  function handleChallengeCustom() {
    setSelectedChallenge(null)
    setShowChallengeCustom(true)
  }
  function handleChallengeCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setChallengeCustom(v)
    const n = Number(v)
    if (!isNaN(n) && n > 0) setChallengeWindow(n)
  }

  function handleProposalPreset(p: DurationPreset) {
    setProposalDuration(p.value)
    setSelectedProposal(p.value)
    setShowProposalCustom(false)
    setProposalCustom('')
  }
  function handleProposalCustom() {
    setSelectedProposal(null)
    setShowProposalCustom(true)
  }
  function handleProposalCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setProposalCustom(v)
    const n = Number(v)
    if (!isNaN(n) && n > 0) setProposalDuration(n)
  }


  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!managerAddress) return
    const result = buildOfferProposeParams(offer, {
      connectedAddress,
      proposerAmount: parsedAmount,
      challengeWindowSecs: challengeWindow,
      proposalDurationSecs: proposalDuration,
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
    const p = result.params
    writeContract({
      abi: commitmentManagerAbi,
      address: managerAddress,
      functionName: 'proposeAgreement',
      args: [{
        arbiter: p.arbiter,
        acceptor: p.acceptor,
        // Same-token agreement: both legs share the configured backing and
        // penalty ceiling, differing only in stake. See FUTURE_WORK §2.
        proposerLeg: {
          token: backing.token,
          adapter: backing.adapter,
          amount: p.proposerAmount,
          maxPenaltyBps: p.maxPenaltyBps,
          strategies: [],
        },
        acceptorLeg: {
          token: backing.token,
          adapter: backing.adapter,
          amount: p.acceptorAmount,
          maxPenaltyBps: p.maxPenaltyBps,
          strategies: [],
        },
        challengeWindow: p.challengeWindow,
        proposalDuration: p.proposalDuration,
        metadataURI: p.metadataURI,
        metadataHash: p.metadataHash,
        maxFlowProposerToAcceptor: p.maxFlowProposerToAcceptor,
        maxFlowAcceptorToProposer: p.maxFlowAcceptorToProposer,
      }],
    })
  }

  if (!terms) {
    return (
      <Notice tone="warn" title="UNSUPPORTED PATTERN">
        OfferProposeMode only supports reciprocal-mutual and mutual-aid offers.
      </Notice>
    )
  }

  const disabled = !isConnected
  const isPendingAny = isPending || isConfirming
  // An agreement offer is a fixed deal: the proposer always sets their own
  // stake, but challenge window / proposal duration / metadata are locked unless
  // the offer opts them into negotiation.
  const cwNegotiable = isAgreementNegotiable(terms, 'challengeWindow')
  const durationNegotiable = isAgreementNegotiable(terms, 'expiry')
  const metadataNegotiable = isAgreementNegotiable(terms, 'metadata')
  const exceedsFree =
    parsedAmount !== undefined && freeBalance !== undefined && parsedAmount > freeBalance
  const challengeWindowValid = !cwNegotiable || challengeWindow >= 86_400
  const proposalDurationValid = !durationNegotiable || proposalDuration > 0
  const metadataValid = !metadataNegotiable || metadataStatus !== 'dirty'
  const isValidForm =
    !!connectedAddress &&
    !!backing &&
    !metaLoading && // never parse/submit against the fallback decimals
    parsedAmount !== undefined &&
    parsedAmount > 0n &&
    !exceedsFree && // backing must be funded — proposeAgreement reverts otherwise
    challengeWindowValid &&
    proposalDurationValid &&
    metadataValid

  const ctaLabel = offer.pattern === 'mutual-aid' ? 'PROPOSE MUTUAL AID' : 'PROPOSE AGREEMENT'
  const showSettlementCaps = terms.maxFlowProposerToAcceptor > 0n || terms.maxFlowAcceptorToProposer > 0n

  return (
    <form className="ds-stack ds-stack-4" onSubmit={handleSubmit} noValidate>
      <Notice tone="info" size="sm" title={`PROPOSING TO ${offer.name.toUpperCase()}`}>
        pattern <code>{offer.pattern}</code>
      </Notice>

      <Notice tone="neutral" size="sm" title="ARBITER (LOCKED BY OFFER)">
        <OperatorIdentity address={terms.arbiter} name={terms.arbiterName} size="sm" />
      </Notice>
      <Notice tone="neutral" size="sm" title="COUNTERPARTY (LOCKED BY OFFER)">
        <OperatorIdentity address={terms.acceptor} name={terms.acceptorName} size="sm" />
      </Notice>

      <section className="ds-stat-grid" aria-label="Locked terms">
        <Notice tone="neutral" size="sm" title="THEIR STAKE (LOCKED)">
          <TokenAmount amount={terms.acceptorAmount} decimals={decimals} compact />
        </Notice>
        <Notice tone="neutral" size="sm" title="MAX PENALTY (LOCKED)">
          {formatBps(terms.maxPenaltyBps)}
        </Notice>
      </section>

      {showSettlementCaps && (
        <Notice tone="neutral" size="sm" title="SETTLEMENT CAPS (LOCKED)">
          PROPOSER → ACCEPTOR:{' '}
          <TokenAmount amount={terms.maxFlowProposerToAcceptor} decimals={decimals} compact />
          {' · '}
          ACCEPTOR → PROPOSER:{' '}
          <TokenAmount amount={terms.maxFlowAcceptorToProposer} decimals={decimals} compact />
        </Notice>
      )}

      {/* Proposer's amount — prefilled from offer.yourAmount, editable */}
      <div className="ds-field">
        <label className="ds-label" htmlFor="offer-propose-amount">
          YOUR STAKE ({symbol})
        </label>
        <div className="ds-input-group">
          <Input
            id="offer-propose-amount"
            type="text"
            value={amountValue}
            onChange={(e) => setAmountValue(e.target.value)}
            onBlur={handleAmountBlur}
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
        <Notice tone="info" size="sm">
          OFFER SUGGESTS: <TokenAmount amount={terms.defaultProposerAmount} decimals={decimals} compact />
        </Notice>
        {amountError && <Notice tone="danger" size="sm">{amountError}</Notice>}
        {exceedsFree && !amountError && (
          <Notice tone="warn" size="sm" title="NOT ENOUGH FREE BACKING">
            Your leg locks{' '}
            <TokenAmount amount={parsedAmount ?? 0n} decimals={decimals} symbol={symbol} compact />{' '}
            of free backing, but your manager balance has only{' '}
            <TokenAmount amount={freeBalance ?? 0n} decimals={decimals} symbol={symbol} compact />.
            Fund backing from{' '}
            <Link to="/app">your assets</Link> on the dashboard (deposit into the vault, then add
            those shares as backing), then come back.
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
              className={`duration-btn${selectedChallenge === p.value ? ' selected' : ''}`}
              onClick={() => handleChallengePreset(p)}
              disabled={disabled}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            className={`duration-btn${showChallengeCustom ? ' selected' : ''}`}
            onClick={handleChallengeCustom}
            disabled={disabled}
          >
            CUSTOM
          </button>
        </div>
        {showChallengeCustom && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' /* layout only */ }}>
            <Input
              type="number"
              value={challengeCustom}
              onChange={handleChallengeCustomChange}
              disabled={disabled}
              placeholder="Seconds"
              min={1}
              style={{ width: 160 /* layout only */ }}
              aria-label="Custom forfeit execution delay in seconds"
              suffix={<span>seconds</span>}
            />
          </div>
        )}
        <Notice tone="info" size="sm">= {formatDuration(challengeWindow)}</Notice>
        {!challengeWindowValid && (
          <Notice tone="danger" size="sm">FORFEIT EXECUTION DELAY MUST BE AT LEAST 24 HOURS</Notice>
        )}
      </div>
      )}

      {/* Proposal duration — locked by the offer unless made negotiable */}
      {!durationNegotiable ? (
        <Notice tone="neutral" size="sm" title="PROPOSAL EXPIRES IN (LOCKED BY OFFER)">
          {formatDuration(terms.proposalDurationSecs)}
        </Notice>
      ) : (
      <div className="ds-field">
        <label className="ds-label">PROPOSAL EXPIRES IN</label>
        <div className="duration-picker">
          {PROPOSAL_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`duration-btn${selectedProposal === p.value ? ' selected' : ''}`}
              onClick={() => handleProposalPreset(p)}
              disabled={disabled}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            className={`duration-btn${showProposalCustom ? ' selected' : ''}`}
            onClick={handleProposalCustom}
            disabled={disabled}
          >
            CUSTOM
          </button>
        </div>
        {showProposalCustom && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' /* layout only */ }}>
            <Input
              type="number"
              value={proposalCustom}
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
      )}

      {/* Metadata — only when the offer makes it negotiable */}
      {metadataNegotiable && (
        <details className="metadata-section">
          <summary>METADATA (OPTIONAL)</summary>
          <div className="metadata-section-body">
            <MetadataEditor
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
                Pin your metadata (or clear the fields) before proposing.
              </Notice>
            )}
          </div>
        </details>
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
          title={!isConnected ? 'Connect wallet to propose agreements' : undefined}
        >
          {isPendingAny ? 'CONFIRMING…' : ctaLabel}
        </button>
      </div>

      {formError && (
        <Notice tone="danger" size="sm" title="INVALID FORM">{formError}</Notice>
      )}

      <section className="ds-stack ds-stack-2" aria-label="Addresses">
        <h3 className="ds-section-eyebrow">Addresses</h3>
        <div className="ds-text-xs ds-subtle">
          Acceptor: <AddressDisplay address={terms.acceptor} />
        </div>
        <div className="ds-text-xs ds-subtle">
          Arbiter: <AddressDisplay address={terms.arbiter} />
        </div>
      </section>
    </form>
  )
}
