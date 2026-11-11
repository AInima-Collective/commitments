import { parseEther, parseUnits } from 'viem'
import {
  ApyMeter,
  CapacityMeter,
  HealthGauge,
  SourceBlock,
  StrategyFlow,
  TimeSeriesChart,
  YieldSparkline,
} from '../../components/ui'
import { SectionHeading } from './SectionHeading'

// ─── Synthetic yield series for the YieldSparkline demos ──────────────────
// A 30-sample mean-reverting walk in [3.8, 6.2] — visually interesting but
// not noisy. Generated once at module load so re-renders stay deterministic.
const YIELD_SERIES_30D: number[] = (() => {
  const out: number[] = []
  let v = 5.0
  for (let i = 0; i < 30; i += 1) {
    // Deterministic pseudo-random in [-0.45, 0.55] biased toward mean reversion.
    const drift = Math.sin(i * 0.8) * 0.35 + Math.cos(i * 1.7) * 0.18
    const pull = (5.0 - v) * 0.18
    v = Math.max(3.6, Math.min(6.4, v + drift + pull))
    out.push(v / 100)
  }
  return out
})()

const YIELD_SERIES_DOWN: number[] = (() => {
  const out: number[] = []
  for (let i = 0; i < 24; i += 1) {
    const v = 6.4 - i * 0.07 + Math.sin(i * 1.3) * 0.12
    out.push(v / 100)
  }
  return out
})()

// ─── Synthetic time-series for the TimeSeriesChart demos ──────────────────
// 5-min buckets across ~30 days, anchored to "now" so the range selector
// (1D/1W/1M/ALL) finds samples in every bucket.
const TVL_SERIES_DEMO: { t: number; v: number }[] = (() => {
  const out: { t: number; v: number }[] = []
  const now = Date.now()
  const stepMs = 60 * 60 * 1000 // 1h granularity is plenty for a demo
  const samples = 24 * 30
  let v = 23_000_000
  for (let i = samples; i >= 0; i -= 1) {
    const drift = Math.sin(i * 0.18) * 120_000 + Math.cos(i * 0.07) * 80_000
    const trend = i * -2_500
    v = Math.max(18_000_000, v + drift + trend * 0.05)
    out.push({ t: now - i * stepMs, v })
  }
  return out
})()

const APY_7D_SERIES_DEMO: { t: number; v: number }[] = (() => {
  const out: { t: number; v: number }[] = []
  const now = Date.now()
  const stepMs = 6 * 60 * 60 * 1000
  for (let i = 28 * 4; i >= 0; i -= 1) {
    const v = 480 + Math.sin(i * 0.4) * 60 + Math.cos(i * 0.13) * 40
    out.push({ t: now - i * stepMs, v: Math.max(0, v) })
  }
  return out
})()

const APY_30D_SERIES_DEMO: { t: number; v: number }[] = (() => {
  const out: { t: number; v: number }[] = []
  const now = Date.now()
  const stepMs = 6 * 60 * 60 * 1000
  for (let i = 28 * 4; i >= 0; i -= 1) {
    const v = 510 + Math.sin(i * 0.18) * 30
    out.push({ t: now - i * stepMs, v: Math.max(0, v) })
  }
  return out
})()

// Free/encumbered split of one portfolio, for the stacked-mode demo. The two
// series are additive by construction — that is the only case `stacked` is for.
const LEDGER_FREE_DEMO: { t: number; v: number }[] = (() => {
  const out: { t: number; v: number }[] = []
  const now = Date.now()
  const stepMs = 6 * 60 * 60 * 1000
  for (let i = 28 * 4; i >= 0; i -= 1) {
    // Steps down as capital gets committed, back up as commitments release.
    const v = 42_000 + Math.sin(i * 0.09) * 16_000 - i * 60
    out.push({ t: now - i * stepMs, v: Math.max(2_000, v) })
  }
  return out
})()

const LEDGER_ENCUMBERED_DEMO: { t: number; v: number }[] = (() => {
  const out: { t: number; v: number }[] = []
  const now = Date.now()
  const stepMs = 6 * 60 * 60 * 1000
  for (let i = 28 * 4; i >= 0; i -= 1) {
    const v = 58_000 - Math.sin(i * 0.09) * 16_000 + i * 40
    out.push({ t: now - i * stepMs, v: Math.max(2_000, v) })
  }
  return out
})()

const SRC_DEFI_VAULTS =
  `<ApyMeter
  total={0.0512}
  sources={[
    { label: 'Aave supply',  apy: 0.0312, tone: 'info' },
    { label: 'Boost (veCRV)', apy: 0.0168, tone: 'success' },
    { label: 'Incentives',   apy: 0.0032, tone: 'neutral' },
  ]}
  delta={0.0034}
  period="30d"
/>

<HealthGauge
  value={1.84}
  min={1.0}
  max={3.0}
  zones={[
    { to: 1.10, tone: 'danger', label: 'liquidate' },
    { to: 1.40, tone: 'warn',   label: 'guardrail' },
    { to: 3.00, tone: 'success' },
  ]}
  target={2.0}
  label="health factor"
  caption="Below 1.10 the vault auto-deleverages; below 1.00 the position is liquidated."
/>

<CapacityMeter
  filled={parseUnits('23400000', 6)}
  cap={parseUnits('30000000', 6)}
  softCap={parseUnits('25000000', 6)}
  decimals={6}
  symbol="USDC"
/>

<YieldSparkline values={apy30d} showRange tone="accent" />

<StrategyFlow
  source={{ label: 'Vault deposits', sub: '23.4M USDC' }}
  allocations={[
    { label: 'Aave wstETH supply', bps: 6000, tone: 'info',    detail: '4.32% APY · single market' },
    { label: 'Compound USDC',      bps: 2500, tone: 'success', detail: '3.18% APY' },
    { label: 'Uniswap v3 LP',      bps: 1500, tone: 'warn',    detail: 'volatile · 50/50 ETH-USDC' },
  ]}
/>`

export function DefiVaultsSection() {
  return (
    <section className="ds-stack ds-stack-8">
      <SectionHeading
        id="defi-vaults"
        title="DeFi Vaults"
        lead="Five primitives for the surfaces every vault page reaches for: a yield read-out, a safety gauge, a capacity meter, a sparkline, and a routing diagram. None of them know what a commitment is — they're shaped for any DeFi vault. Compose them in feature folders; reach for them through the barrel."
      />

      {/* APY Meter */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">apy meter · headline yield with source decomposition</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <ApyMeter
            size="lg"
            total={0.0512}
            sources={[
              { label: 'Aave supply', apy: 0.0312, tone: 'info', detail: 'wstETH market' },
              { label: 'Boost · veCRV', apy: 0.0168, tone: 'success' },
              { label: 'Incentives', apy: 0.0032, tone: 'neutral' },
            ]}
            delta={0.0034}
            period="30d"
            caption="Net of 2% management fee · before performance fee on profit."
          />
          <ApyMeter
            size="md"
            total={0.0289}
            sources={[
              { label: 'Aerodrome LP fees', apy: 0.0214, tone: 'info' },
              { label: 'AERO emissions', apy: 0.0075, tone: 'neutral' },
            ]}
            delta={-0.0048}
            period="30d"
          />
        </div>
        <div className="ds-text-xs ds-subtle">
          The headline carries six-decimal precision in <code>title</code>; the bar paints
          source contributions proportional to their share of total APY. Delta tag is optional
          and tone-driven by sign.
        </div>
      </div>

      {/* Health Gauge */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">health gauge · threshold-zone safety read-out</div>
        <div
          className="ds-card ds-stack ds-stack-4"
          style={{ padding: 'var(--space-6)' }}
        >
          <HealthGauge
            size="lg"
            value={1.84}
            min={1.0}
            max={3.0}
            zones={[
              { to: 1.1, tone: 'danger', label: 'liquidate' },
              { to: 1.4, tone: 'warn', label: 'guardrail' },
              { to: 3.0, tone: 'success' },
            ]}
            target={2.0}
            label="health factor"
            caption="Below 1.10 the vault auto-deleverages via keeper cron; below 1.00 the position is liquidated by Aave."
          />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <div className="ds-card ds-stack ds-stack-3">
            <HealthGauge
              size="md"
              value={0.62}
              min={0}
              max={1}
              zones={[
                { to: 0.5, tone: 'success' },
                { to: 0.8, tone: 'warn', label: 'cap' },
                { to: 1.0, tone: 'danger' },
              ]}
              format={(n) => `${(n * 100).toFixed(1)}%`}
              label="ltv"
            />
            <span className="ds-text-xs ds-subtle">
              In the warning band — adding leverage soon trips the cap.
            </span>
          </div>
          <div className="ds-card ds-stack ds-stack-3">
            <HealthGauge
              size="md"
              value={1.04}
              min={1.0}
              max={3.0}
              zones={[
                { to: 1.1, tone: 'danger', label: 'liquidate' },
                { to: 1.4, tone: 'warn' },
                { to: 3.0, tone: 'success' },
              ]}
              label="health factor"
            />
            <span className="ds-text-xs ds-subtle">
              Critical zone — indicator paints in <code>--error</code> automatically.
            </span>
          </div>
          <div className="ds-card ds-stack ds-stack-3">
            <HealthGauge
              size="md"
              value={2.6}
              min={1.0}
              max={3.0}
              zones={[
                { to: 1.1, tone: 'danger' },
                { to: 1.4, tone: 'warn' },
                { to: 3.0, tone: 'success' },
              ]}
              label="health factor"
            />
            <span className="ds-text-xs ds-subtle">
              Comfortable — but capital-inefficient. Dial up borrow.
            </span>
          </div>
        </div>
      </div>

      {/* Capacity Meter */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">capacity meter · stepped utilization with soft-cap tick</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <div className="ds-card ds-stack ds-stack-3">
            <CapacityMeter
              filled={parseUnits('23400000', 6)}
              cap={parseUnits('30000000', 6)}
              softCap={parseUnits('25000000', 6)}
              decimals={6}
              symbol="USDC"
            />
            <span className="ds-text-xs ds-subtle">
              78% — auto-tone says <code>warn</code>. Soft cap at 83% paints a hairline tick.
            </span>
          </div>
          <div className="ds-card ds-stack ds-stack-3">
            <CapacityMeter
              filled={parseUnits('29200000', 6)}
              cap={parseUnits('30000000', 6)}
              softCap={parseUnits('25000000', 6)}
              decimals={6}
              symbol="USDC"
            />
            <span className="ds-text-xs ds-subtle">
              97% — auto-tone shifts to <code>danger</code>. Free tier dwindles.
            </span>
          </div>
          <div className="ds-card ds-stack ds-stack-3">
            <CapacityMeter
              filled={parseEther('142.6')}
              cap={parseEther('500')}
              decimals={18}
              symbol="WETH"
              label="deposits"
              size="lg"
            />
            <span className="ds-text-xs ds-subtle">
              Large variant fills more visual surface; same data shape.
            </span>
          </div>
        </div>
      </div>

      {/* Yield Sparkline */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">yield sparkline · inline time-series</div>
        <div className="ds-card ds-stack ds-stack-4">
          <div className="ds-row" style={{ flexWrap: 'wrap', gap: 'var(--space-6)', alignItems: 'center' }}>
            <span className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
              <span className="ds-label" style={{ minWidth: 36 }}>sm</span>
              <YieldSparkline size="sm" values={YIELD_SERIES_30D} />
            </span>
            <span className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
              <span className="ds-label" style={{ minWidth: 36 }}>md</span>
              <YieldSparkline values={YIELD_SERIES_30D} />
            </span>
            <span className="ds-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
              <span className="ds-label" style={{ minWidth: 36 }}>lg</span>
              <YieldSparkline
                size="lg"
                values={YIELD_SERIES_30D}
                showRange
                showArea
                format={(n) => `${(n * 100).toFixed(2)}%`}
              />
            </span>
          </div>
          <hr className="ds-divider" />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            <div className="ds-stack ds-stack-2">
              <span className="ds-label">trending up · accent</span>
              <span className="ds-row ds-row-3" style={{ alignItems: 'center' }}>
                <span className="ds-mono-num ds-text-lg">5.12%</span>
                <YieldSparkline values={YIELD_SERIES_30D} tone="accent" />
                <span className="ds-text-xs ds-subtle">30d</span>
              </span>
            </div>
            <div className="ds-stack ds-stack-2">
              <span className="ds-label">trending down · danger</span>
              <span className="ds-row ds-row-3" style={{ alignItems: 'center' }}>
                <span className="ds-mono-num ds-text-lg">2.89%</span>
                <YieldSparkline values={YIELD_SERIES_DOWN} tone="danger" />
                <span className="ds-text-xs ds-subtle">24d</span>
              </span>
            </div>
            <div className="ds-stack ds-stack-2">
              <span className="ds-label">filled · success</span>
              <YieldSparkline
                values={YIELD_SERIES_30D}
                tone="success"
                showArea
                showRange
                format={(n) => `${(n * 100).toFixed(2)}%`}
              />
            </div>
            <div className="ds-stack ds-stack-2">
              <span className="ds-label">empty · single point</span>
              <YieldSparkline values={[0.05]} />
            </div>
          </div>
        </div>
        <div className="ds-text-xs ds-subtle">
          Pure SVG · no chart library · no JS animation. Endpoint dot anchors attention on the
          latest sample.
        </div>
      </div>

      {/* Time-Series Chart */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">time-series chart · full-axis line chart</div>
        <div className="ds-card ds-stack ds-stack-4">
          <TimeSeriesChart
            series={[
              { label: 'TVL', data: TVL_SERIES_DEMO, tone: 'accent' },
            ]}
            tUnit="ms"
            unit="USDC"
            ariaLabel="Sample TVL over the last month"
          />
          <hr className="ds-divider" />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            <div className="ds-stack ds-stack-2">
              <span className="ds-label">two-series · success vs muted</span>
              <TimeSeriesChart
                size="sm"
                hideRangeSelector
                series={[
                  { label: 'APY 7d', data: APY_7D_SERIES_DEMO, tone: 'success' },
                  { label: 'APY 30d', data: APY_30D_SERIES_DEMO, tone: 'muted' },
                ]}
                tUnit="ms"
                unit="bps"
              />
            </div>
            <div className="ds-stack ds-stack-2">
              <span className="ds-label">empty state · ALL with no points in range</span>
              <TimeSeriesChart
                size="sm"
                hideRangeSelector
                series={[{ label: 'TVL', data: [], tone: 'accent' }]}
                unit="USDC"
              />
            </div>
          </div>
          <hr className="ds-divider" />
          <div className="ds-stack ds-stack-2">
            <span className="ds-label">
              stacked · additive bands, tooltip gains a total footer
            </span>
            <TimeSeriesChart
              stacked
              size="sm"
              hideRangeSelector
              series={[
                { label: 'free', data: LEDGER_FREE_DEMO, tone: 'success' },
                { label: 'encumbered', data: LEDGER_ENCUMBERED_DEMO, tone: 'warn' },
              ]}
              tUnit="ms"
              unit="USD"
            />
          </div>
        </div>
        <div className="ds-text-xs ds-subtle">
          chart.js + react-chartjs-2 wrapped in a tone/range vocabulary. Use for tab/panel
          views — for inline at-a-glance series, prefer YieldSparkline. Reach for{' '}
          <code>stacked</code> only when the series are parts of one whole: the top edge
          then reads as a real total. Stacking unrelated series invents a total that means
          nothing.
        </div>
      </div>

      {/* Strategy Flow */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">strategy flow · capital routing diagram</div>
        <StrategyFlow
          source={{ label: 'Vault deposits', sub: '23.4M USDC' }}
          allocations={[
            {
              label: 'Aave wstETH supply',
              bps: 6000,
              tone: 'info',
              detail: '4.32% APY · single market',
            },
            {
              label: 'Compound USDC',
              bps: 2500,
              tone: 'success',
              detail: '3.18% APY · 2 markets',
            },
            {
              label: 'Uniswap v3 LP',
              bps: 1500,
              tone: 'warn',
              detail: 'volatile · 50/50 ETH-USDC',
            },
          ]}
          caption="Connector thickness scales with allocation weight. Hover any row for full bps."
        />
        <StrategyFlow
          source={{ label: 'Treasury', sub: '142.6 WETH' }}
          allocations={[
            { label: 'Lido stake', bps: 7000, tone: 'success', detail: '3.4% APY' },
            { label: 'Rocket pool', bps: 2000, tone: 'info', detail: '3.6% APY' },
            { label: 'Idle (queued unbond)', bps: 1000, tone: 'neutral' },
          ]}
        />
      </div>

      <SourceBlock label="example" source={SRC_DEFI_VAULTS} />
    </section>
  )
}
