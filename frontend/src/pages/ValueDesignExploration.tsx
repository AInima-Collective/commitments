import { useState, type ReactNode } from 'react'
import { parseEther, parseUnits } from 'viem'

import { PageHeader, CommitmentStatusBadge } from '../components/protocol'
import {
  Button,
  Card,
  Notice,
  TokenAmount,
  Tooltip,
  UsdAmount,
  ViewToggle,
} from '../components/ui'
import { formatTokenAmount } from '../lib/format'
import '../styles/value-exploration.css'

type DisplayUnit = 'usd' | 'eur' | 'eth' | 'shares'
type ValueBasis = 'now' | 'commit'
type QuoteSet = { usd: bigint; eur: bigint; eth: bigint }

interface ExampleCommitment {
  id: string
  title: string
  counterparty: string
  status: 'ACTIVE' | 'FORFEIT_PENDING' | 'RELEASED'
  shares: bigint
  shareDecimals: number
  shareSymbol: string
  assetSymbol: string
  shareRate: string
  now: QuoteSet
  commit: QuoteSet
  change: string
}

const EXAMPLES: ExampleCommitment[] = [
  {
    id: '0042',
    title: 'Validator availability guarantee',
    counterparty: 'Pellar Labs',
    status: 'ACTIVE',
    shares: parseEther('8.4251'),
    shareDecimals: 18,
    shareSymbol: 'cvWETH',
    assetSymbol: 'WETH',
    shareRate: '1.0297 WETH / cvWETH',
    now: {
      usd: parseUnits('28788.37', 6),
      eur: parseUnits('26335.60', 6),
      eth: parseEther('8.67532547'),
    },
    commit: {
      usd: parseUnits('27298.84', 6),
      eur: parseUnits('25114.93', 6),
      eth: parseEther('8.4251'),
    },
    change: '+5.5%',
  },
  {
    id: '0039',
    title: 'Treasury reporting covenant',
    counterparty: 'Northstar DAO',
    status: 'FORFEIT_PENDING',
    shares: parseUnits('12400', 15),
    shareDecimals: 15,
    shareSymbol: 'cvUSDC',
    assetSymbol: 'USDC',
    shareRate: '1.0301 USDC / cvUSDC',
    now: {
      usd: parseUnits('12773.12', 6),
      eur: parseUnits('11684.05', 6),
      eth: parseEther('3.8491'),
    },
    commit: {
      usd: parseUnits('12400', 6),
      eur: parseUnits('11343.52', 6),
      eth: parseEther('3.8270'),
    },
    change: '+3.0%',
  },
  {
    id: '0034',
    title: 'Price feed response SLA',
    counterparty: 'Resolver Co.',
    status: 'RELEASED',
    shares: parseEther('1.25'),
    shareDecimals: 18,
    shareSymbol: 'cvWETH',
    assetSymbol: 'WETH',
    shareRate: '1.0297 WETH / cvWETH',
    now: {
      usd: parseUnits('4270.94', 6),
      eur: parseUnits('3906.24', 6),
      eth: parseEther('1.287125'),
    },
    commit: {
      usd: parseUnits('4050.23', 6),
      eur: parseUnits('3726.21', 6),
      eth: parseEther('1.25'),
    },
    change: '+5.4%',
  },
]

const DISPLAY_OPTIONS = [
  { id: 'usd', label: 'USD' },
  { id: 'eur', label: 'EUR' },
  { id: 'eth', label: 'ETH' },
  { id: 'shares', label: 'Shares' },
]

const BASIS_OPTIONS = [
  { id: 'now', label: 'Now' },
  { id: 'commit', label: 'At commitment' },
]

const DISPLAY_UNIT_STORAGE_KEY = 'commitments.display-unit'

function initialDisplayUnit(): DisplayUnit {
  if (typeof window === 'undefined') return 'usd'
  try {
    const stored = window.localStorage.getItem(DISPLAY_UNIT_STORAGE_KEY)
    return DISPLAY_OPTIONS.some((option) => option.id === stored) ? stored as DisplayUnit : 'usd'
  } catch {
    return 'usd'
  }
}

function EuroAmount({
  amount,
  size = 'default',
  compact = false,
}: {
  amount: bigint
  size?: 'inline' | 'default' | 'display'
  compact?: boolean
}) {
  const parts = formatTokenAmount(amount, 6, { precision: 2, compact })
  const sizeClass =
    size === 'inline' ? 'ds-amount--inline' : size === 'display' ? 'ds-amount--display' : ''
  const fractionDigits = parts.fraction.startsWith('.') ? parts.fraction.slice(1) : ''
  const paddedFraction = `.${(fractionDigits + '00').slice(0, 2)}`

  return (
    <span className={['ds-amount', sizeClass].filter(Boolean).join(' ')} title={`€${parts.full}`}>
      <span className="ds-amount-symbol uxv-leading-symbol">€</span>
      <span className="ds-amount-int">{parts.compact ?? parts.int}</span>
      {!parts.compact ? (
        <span className={size === 'display' ? 'ds-amount-fraction ds-amount-fraction--dim' : 'ds-amount-fraction'}>
          {paddedFraction}
        </span>
      ) : null}
    </span>
  )
}

function QuoteAmount({
  example,
  unit,
  basis,
  size = 'default',
  compact = false,
  showApproximation = true,
}: {
  example: ExampleCommitment
  unit: DisplayUnit
  basis: ValueBasis
  size?: 'inline' | 'default' | 'display'
  compact?: boolean
  showApproximation?: boolean
}) {
  const quote = example[basis]
  const approximation = showApproximation && unit !== 'shares'

  return (
    <span className="uxv-quote">
      {approximation ? <span className="uxv-approx" aria-label="approximately">≈</span> : null}
      {unit === 'usd' ? (
        <UsdAmount amount={quote.usd} size={size} compact={compact} />
      ) : unit === 'eur' ? (
        <EuroAmount amount={quote.eur} size={size} compact={compact} />
      ) : unit === 'eth' ? (
        <TokenAmount amount={quote.eth} decimals={18} symbol="ETH" size={size} compact={compact} />
      ) : (
        <TokenAmount
          amount={example.shares}
          decimals={example.shareDecimals}
          symbol={example.shareSymbol}
          size={size}
          compact={compact}
        />
      )}
    </span>
  )
}

function ValueStack({
  example,
  unit,
  basis,
  pricingAvailable,
  size = 'default',
  compact = false,
  showComparison = false,
}: {
  example: ExampleCommitment
  unit: DisplayUnit
  basis: ValueBasis
  pricingAvailable: boolean
  size?: 'inline' | 'default' | 'display'
  compact?: boolean
  showComparison?: boolean
}) {
  const canQuote = pricingAvailable || unit === 'shares'
  const fallbackToShares = !canQuote
  const displayedUnit = fallbackToShares ? 'shares' : unit
  const comparisonBasis = basis === 'now' ? 'commit' : 'now'

  return (
    <span className="uxv-value-stack" data-size={size}>
      <span className="uxv-value-label">
        {fallbackToShares ? 'Committed' : unit === 'shares' ? 'Committed' : basis === 'now' ? 'Current value' : 'At commitment'}
      </span>
      <QuoteAmount
        example={example}
        unit={displayedUnit}
        basis={basis}
        size={size}
        compact={compact}
      />
      {displayedUnit !== 'shares' ? (
        <span className="uxv-contract-value">
          <TokenAmount
            amount={example.shares}
            decimals={example.shareDecimals}
            symbol={example.shareSymbol}
            size="inline"
          />{' '}
          committed
        </span>
      ) : fallbackToShares ? (
        <span className="uxv-contract-value">Market price unavailable</span>
      ) : (
        <span className="uxv-contract-value">Exact on-chain amount</span>
      )}
      {showComparison && displayedUnit !== 'shares' ? (
        <span className="uxv-comparison">
          {comparisonBasis === 'commit' ? 'At commitment' : 'Now'}{' '}
          <QuoteAmount
            example={example}
            unit={displayedUnit}
            basis={comparisonBasis}
            size="inline"
            showApproximation={false}
          />
          {basis === 'now' ? <span className="uxv-positive"> {example.change}</span> : null}
        </span>
      ) : null}
    </span>
  )
}

function ExplorationControls({
  unit,
  basis,
  pricingAvailable,
  onUnitChange,
  onBasisChange,
  onPricingChange,
}: {
  unit: DisplayUnit
  basis: ValueBasis
  pricingAvailable: boolean
  onUnitChange: (unit: DisplayUnit) => void
  onBasisChange: (basis: ValueBasis) => void
  onPricingChange: (available: boolean) => void
}) {
  return (
    <div className="uxv-controls" aria-label="Value display controls">
      <div className="uxv-control">
        <span className="uxv-control-label">Primary unit · preference</span>
        <ViewToggle
          aria-label="display currency"
          value={unit}
          options={DISPLAY_OPTIONS}
          onChange={(next) => onUnitChange(next as DisplayUnit)}
        />
      </div>
      <div className="uxv-control">
        <span className="uxv-control-label">Preview time · exploration only</span>
        <ViewToggle
          aria-label="value time"
          value={basis}
          options={BASIS_OPTIONS}
          onChange={(next) => onBasisChange(next as ValueBasis)}
        />
      </div>
      <Button
        size="sm"
        aria-pressed={!pricingAvailable}
        onClick={() => onPricingChange(!pricingAvailable)}
      >
        {pricingAvailable ? 'Simulate missing price' : 'Restore live price'}
      </Button>
    </div>
  )
}

function PatternCard({
  title,
  verdict,
  tone = 'neutral',
  children,
  description,
}: {
  title: string
  verdict: string
  tone?: 'neutral' | 'info'
  children: ReactNode
  description: string
}) {
  return (
    <Card as="article" tone={tone} className="uxv-pattern-card">
      <div className="uxv-pattern-heading">
        <h3>{title}</h3>
        <span className={tone === 'info' ? 'ds-badge ds-badge--accent' : 'ds-badge ds-badge--muted'}>
          {verdict}
        </span>
      </div>
      <div className="uxv-pattern-stage">{children}</div>
      <p>{description}</p>
    </Card>
  )
}

function DisplayPreferenceDemo({
  unit,
  onUnitChange,
}: {
  unit: DisplayUnit
  onUnitChange: (unit: DisplayUnit) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="uxv-preference-demo">
      <div className="uxv-preference-chrome">
        <span className="uxv-preference-brand">Commitments</span>
        <div className="uxv-preference-actions">
          <span className="uxv-preference-context">Display</span>
          <Button
            size="sm"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            {unit.toUpperCase()} <span aria-hidden>▾</span>
          </Button>
        </div>
      </div>
      {open ? (
        <div className="uxv-preference-popover" role="dialog" aria-label="Display preferences">
          <div className="uxv-preference-popover-head">
            <div>
              <span className="uxv-kicker">Display preference</span>
              <h3>Primary value unit</h3>
            </div>
            <span className="ds-badge ds-badge--muted">this device</span>
          </div>
          <p>Used as the leading estimate everywhere values appear.</p>
          <ViewToggle
            aria-label="preferred display currency"
            value={unit}
            options={DISPLAY_OPTIONS}
            onChange={(next) => onUnitChange(next as DisplayUnit)}
          />
          <div className="uxv-policy-list" aria-label="Fixed value display policies">
            <div>
              <span>Exact shares</span>
              <strong>Always visible</strong>
            </div>
            <div>
              <span>Historical quote</span>
              <strong>On details, when available</strong>
            </div>
            <div>
              <span>Missing price</span>
              <strong>Automatic share fallback</strong>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function ValueDesignExploration() {
  const [unit, setUnitState] = useState<DisplayUnit>(initialDisplayUnit)
  const [basis, setBasis] = useState<ValueBasis>('now')
  const [pricingAvailable, setPricingAvailable] = useState(true)
  const primary = EXAMPLES[0]

  const setUnit = (next: DisplayUnit) => {
    setUnitState(next)
    try {
      window.localStorage.setItem(DISPLAY_UNIT_STORAGE_KEY, next)
    } catch {
      // Display still updates for this session when browser storage is unavailable.
    }
  }

  return (
    <div className="ds-page uxv-page">
      <PageHeader
        eyebrow="design exploration · value hierarchy"
        title="Make the value legible. Keep the commitment exact."
        lead="Users reason in dollars, euros, or ETH; the protocol commits vault shares. This exploration gives each fact a distinct job instead of forcing one unit to do both."
      />

      <Notice tone="info" title="Working recommendation">
        Lead with an estimated value in the user’s preferred unit, then keep the exact share amount
        directly beneath it. Label the time basis, mark derived values with ≈, and promote shares
        automatically whenever a trustworthy quote is unavailable.
      </Notice>

      <ExplorationControls
        unit={unit}
        basis={basis}
        pricingAvailable={pricingAvailable}
        onUnitChange={setUnit}
        onBasisChange={setBasis}
        onPricingChange={setPricingAvailable}
      />

      <section className="ds-section" aria-labelledby="directions-title">
        <div className="uxv-section-copy">
          <span className="ds-section-eyebrow">01 · hierarchy</span>
          <h2 className="ds-section-title" id="directions-title">Three directions</h2>
          <p>All three are accurate. Only one answers the user’s first question without hiding the protocol fact.</p>
        </div>
        <div className="uxv-pattern-grid">
          <PatternCard
            title="Quote first, shares second"
            verdict="recommended"
            tone="info"
            description="Fast to scan, explicit about estimation, and the signed unit never disappears."
          >
            <ValueStack
              example={primary}
              unit={unit}
              basis={basis}
              pricingAvailable={pricingAvailable}
              size="display"
            />
          </PatternCard>
          <PatternCard
            title="Shares first, quote second"
            verdict="protocol first"
            description="Technically pure, but preserves the comprehension problem behind the feedback."
          >
            <span className="uxv-value-stack" data-size="display">
              <span className="uxv-value-label">Committed</span>
              <TokenAmount
                amount={primary.shares}
                decimals={primary.shareDecimals}
                symbol={primary.shareSymbol}
                size="display"
              />
              <span className="uxv-contract-value">
                {pricingAvailable ? (
                  <QuoteAmount example={primary} unit={unit === 'shares' ? 'usd' : unit} basis={basis} size="inline" />
                ) : (
                  'Market price unavailable'
                )}
              </span>
            </span>
          </PatternCard>
          <PatternCard
            title="One unit at a time"
            verdict="too hidden"
            description="Visually clean, but a preference switch becomes the only way to recover the contractual amount."
          >
            <span className="uxv-value-stack" data-size="display">
              <span className="uxv-value-label">{basis === 'now' ? 'Current value' : 'At commitment'}</span>
              {pricingAvailable ? (
                <QuoteAmount example={primary} unit={unit === 'shares' ? 'usd' : unit} basis={basis} size="display" />
              ) : (
                <UsdAmount amount={null} size="display" />
              )}
              <span className="uxv-contract-value">Switch units to inspect shares</span>
            </span>
          </PatternCard>
        </div>
      </section>

      <section className="ds-section" aria-labelledby="preference-title">
        <div className="uxv-section-copy">
          <span className="ds-section-eyebrow">02 · preference boundary</span>
          <h2 className="ds-section-title" id="preference-title">One setting. The rest are guarantees.</h2>
          <p>
            Let people choose the unit they naturally reason in. Do not turn accuracy, provenance,
            or visibility of shares into preferences that can be switched off.
          </p>
        </div>
        <div className="uxv-preference-grid">
          <DisplayPreferenceDemo unit={unit} onUnitChange={setUnit} />
          <Card as="article" className="uxv-placement-card">
            <span className="uxv-kicker">Placement recommendation</span>
            <h3>A compact display control—not a Settings page</h3>
            <p>
              Put the current unit in app chrome as a small <strong>{unit.toUpperCase()}</strong>{' '}
              control. It is legible before wallet connection and remains reachable from every value surface.
            </p>
            <div className="uxv-placement-notes">
              <div>
                <span>Persist now</span>
                <strong>Local browser preference</strong>
              </div>
              <div>
                <span>Sync later</span>
                <strong>Optional profile preference</strong>
              </div>
              <div>
                <span>Do not couple to</span>
                <strong>Wallet connection</strong>
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section className="ds-section" aria-labelledby="surfaces-title">
        <div className="uxv-section-copy">
          <span className="ds-section-eyebrow">03 · real surfaces</span>
          <h2 className="ds-section-title" id="surfaces-title">One grammar, three densities</h2>
          <p>The hierarchy stays intact as the interface moves from scan, to inspect, to sign.</p>
        </div>

        <div className="uxv-surface uxv-list-surface">
          <div className="uxv-surface-heading">
            <div>
              <span className="uxv-kicker">Dense list</span>
              <h3>Browse by value; verify shares in place</h3>
            </div>
            <span className="uxv-surface-note">Sort on the displayed value basis</span>
          </div>
          <div className="uxv-table-wrap">
            <table className="ds-table uxv-table">
              <thead>
                <tr>
                  <th>Commitment</th>
                  <th>Status</th>
                  <th>Counterparty</th>
                  <th className="uxv-align-right">Value / committed</th>
                </tr>
              </thead>
              <tbody>
                {EXAMPLES.map((example) => (
                  <tr key={example.id}>
                    <td>
                      <span className="uxv-table-title">{example.title}</span>
                      <span className="uxv-table-meta">#{example.id}</span>
                    </td>
                    <td><CommitmentStatusBadge status={example.status} /></td>
                    <td>{example.counterparty}</td>
                    <td className="uxv-align-right">
                      <ValueStack
                        example={example}
                        unit={unit}
                        basis={basis}
                        pricingAvailable={pricingAvailable}
                        compact
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="uxv-two-up">
          <div className="uxv-surface uxv-detail-surface">
            <div className="uxv-surface-heading">
              <div>
                <span className="uxv-kicker">Commitment detail</span>
                <h3>Current value gets time context</h3>
              </div>
              <CommitmentStatusBadge status="ACTIVE" />
            </div>
            <ValueStack
              example={primary}
              unit={unit}
              basis={basis}
              pricingAvailable={pricingAvailable}
              size="display"
              showComparison
            />
            <div className="uxv-provenance">
              <span>Exact commitment</span>
              <strong>
                <TokenAmount
                  amount={primary.shares}
                  decimals={primary.shareDecimals}
                  symbol={primary.shareSymbol}
                  size="inline"
                />
              </strong>
              <span>Share conversion</span>
              <strong>{primary.shareRate}</strong>
              <span>Market quote</span>
              <strong>
                CoinGecko · 18s ago{' '}
                <Tooltip content="Price provenance and timestamp stay inspectable without competing with the value.">
                  source
                </Tooltip>
              </strong>
            </div>
          </div>

          <div className="uxv-surface uxv-form-surface">
            <div className="uxv-surface-heading">
              <div>
                <span className="uxv-kicker">Commit flow</span>
                <h3>Enter familiar value; sign exact shares</h3>
              </div>
              <span className="uxv-step">1 / 2</span>
            </div>
            <span className="uxv-input-label" id="uxv-amount-label">I want to commit</span>
            <div className="uxv-input-shell">
              <span
                className="uxv-input-value"
                role="textbox"
                aria-readonly="true"
                aria-labelledby="uxv-amount-label"
              >
                {pricingAvailable ? (
                  <QuoteAmount example={primary} unit={unit} basis="now" size="display" showApproximation={false} />
                ) : (
                  <TokenAmount
                    amount={primary.shares}
                    decimals={primary.shareDecimals}
                    symbol={primary.shareSymbol}
                    size="display"
                  />
                )}
              </span>
              <span className="uxv-input-unit">{pricingAvailable ? unit.toUpperCase() : primary.shareSymbol}</span>
            </div>
            <div className="uxv-signing-summary">
              <span className="uxv-signing-check" aria-hidden>✓</span>
              <div>
                <span>You will commit exactly</span>
                <strong>
                  <TokenAmount
                    amount={primary.shares}
                    decimals={primary.shareDecimals}
                    symbol={primary.shareSymbol}
                  />
                </strong>
                <p>This is the amount your wallet will sign. The displayed market value can change.</p>
              </div>
            </div>
            <Button variant="primary" fullWidth>Review commitment</Button>
          </div>
        </div>
      </section>

      <section className="ds-section" aria-labelledby="rules-title">
        <div className="uxv-section-copy">
          <span className="ds-section-eyebrow">04 · decision rules</span>
          <h2 className="ds-section-title" id="rules-title">The recommended contract with users</h2>
        </div>
        <div className="uxv-rules-grid">
          <Card as="article" className="uxv-rule-card">
            <span className="uxv-rule-number">01</span>
            <h3>Lead with the answer</h3>
            <p>Lists and summaries lead with the preferred quote unit. Never label a derived number only “amount.”</p>
          </Card>
          <Card as="article" className="uxv-rule-card">
            <span className="uxv-rule-number">02</span>
            <h3>Keep shares one glance away</h3>
            <p>The exact share quantity is always visible on consequential surfaces and in every signing step.</p>
          </Card>
          <Card as="article" className="uxv-rule-card">
            <span className="uxv-rule-number">03</span>
            <h3>Name the moment</h3>
            <p>Use “current value” and “at commitment.” Yield and market movement make an unlabeled value ambiguous.</p>
          </Card>
          <Card as="article" className="uxv-rule-card">
            <span className="uxv-rule-number">04</span>
            <h3>Fail toward truth</h3>
            <p>Stale or missing quotes promote shares to the headline. Never show $0 or preserve an old quote as if live.</p>
          </Card>
        </div>
      </section>

      <Notice tone="neutral" title="Data implication">
        “Current value” can use the existing token-aware price path. “At commitment” needs a historical asset price
        at the commitment block plus the vault conversion rate at that block. If either is unavailable, the UI should
        omit the historical quote and retain the exact shares—never reconstruct it from today’s rate.
      </Notice>
    </div>
  )
}
