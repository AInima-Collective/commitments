import { parseEther } from 'viem'
import {
  AllocationBar,
  BalanceLine,
  ChainBadge,
  SectionNav,
  SettlementBar,
  ShareRatio,
  Skeleton,
  SourceBlock,
  TokenAmount,
  TokenChip,
  TokenIcon,
  UsdAmount,
} from '../../components/ui'
import {
  EncumbranceBar,
  RiskRow,
} from '../../components/protocol'
import { formatPercent } from '../../lib/format'
import { SectionHeading } from './SectionHeading'
import { anvil } from '../../config/anvil'

const SRC_ASSETS =
  `<TokenAmount amount={parseEther('12.4057')} decimals={18} symbol="ETH" />
<TokenAmount amount={parseEther('1247.328573')} decimals={18} symbol="ETH" size="display" />
<TokenAmount amount={parseEther('4221000')} decimals={18} symbol="USDC" compact />
<EncumbranceBar encumbered={position.encumbered} total={position.free + position.encumbered} />`

export function AssetsSection() {
  return (
    <section className="ds-stack ds-stack-8">
      <SectionHeading
        id="assets"
        title="Assets"
        lead="The canonical vocabulary for tokens, vault shares, balances, and yield. Hover any amount to see full precision in the tooltip — even when truncated or compacted."
      />

      {/* Token icon */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">token icon · sizes</div>
        <div className="ds-row ds-row-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="ds-row ds-row-2"><TokenIcon symbol="ETH" size="sm" /><span className="ds-text-xs ds-subtle">sm · 14</span></span>
          <span className="ds-row ds-row-2"><TokenIcon symbol="ETH" size="md" /><span className="ds-text-xs ds-subtle">md · 20</span></span>
          <span className="ds-row ds-row-2"><TokenIcon symbol="ETH" size="lg" /><span className="ds-text-xs ds-subtle">lg · 32</span></span>
          <span className="ds-row ds-row-2"><TokenIcon symbol="ETH" size="xl" /><span className="ds-text-xs ds-subtle">xl · 48</span></span>
        </div>
        <div className="ds-stack ds-stack-2">
          <div className="ds-label">token icon · resolution</div>
          <div className="ds-row ds-row-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="ds-row ds-row-2"><TokenIcon symbol="ETH"  size="md" /><span className="ds-text-sm">ETH</span><span className="ds-text-xs ds-subtle">bundled</span></span>
            <span className="ds-row ds-row-2"><TokenIcon symbol="USDC" size="md" /><span className="ds-text-sm">USDC</span><span className="ds-text-xs ds-subtle">bundled</span></span>
            <span className="ds-row ds-row-2"><TokenIcon symbol="cETH" size="md" /><span className="ds-text-sm">cETH</span><span className="ds-text-xs ds-subtle">bundled</span></span>
            <span className="ds-row ds-row-2"><TokenIcon symbol="DAI"  size="md" /><span className="ds-text-sm">DAI</span><span className="ds-text-xs ds-subtle">monogram fallback</span></span>
            <span className="ds-row ds-row-2"><TokenIcon symbol="rETH" size="md" /><span className="ds-text-sm">rETH</span><span className="ds-text-xs ds-subtle">monogram fallback</span></span>
            <span className="ds-row ds-row-2">
              <TokenIcon symbol="WBTC" src="https://cryptologos.cc/logos/wrapped-bitcoin-wbtc-logo.png" size="md" />
              <span className="ds-text-sm">WBTC</span>
              <span className="ds-text-xs ds-subtle">via src= URL</span>
            </span>
          </div>
        </div>
      </div>

      {/* Token chip */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">token chip</div>
        <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap' }}>
          <TokenChip symbol="ETH" />
          <TokenChip symbol="WETH" />
          <TokenChip symbol="cETH" />
          <TokenChip symbol="USDC" />
          <TokenChip symbol="DAI" />
          <TokenChip symbol="rETH" />
        </div>
      </div>

      {/* Chain badge — chain identity in headers / meta rows */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">chain badge · sizes</div>
        <div className="ds-row ds-row-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <ChainBadge chainId={1} size="sm" />
          <ChainBadge chainId={1} size="md" />
          <ChainBadge chainId={1} size="lg" />
        </div>
        <div className="ds-stack ds-stack-2">
          <div className="ds-label">chain badge · resolution</div>
          <div className="ds-row ds-row-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <ChainBadge chainId={1} />
            <ChainBadge chainId={11155111} />
            <ChainBadge chainId={anvil.id} />
            <ChainBadge chainId={999999} />
            <ChainBadge chainId={1} iconOnly />
          </div>
        </div>
      </div>

      {/* Section nav — scroll-spy nav for long pages */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">section nav · scroll-spy</div>
        <div className="ds-stack ds-stack-2 ds-text-sm">
          <div className="ds-subtle">
            Tab-styled anchor list. Click to smooth-scroll to <code>#id</code>;
            IntersectionObserver tracks the in-view section. Use for long pages
            with multiple stacked sections (dashboard, vault detail).
          </div>
          <SectionNav
            sticky={false}
            items={[
              { id: 'sn-demo-1', label: 'overview' },
              { id: 'sn-demo-2', label: 'positions', count: 3 },
              { id: 'sn-demo-3', label: 'history' },
              { id: 'sn-demo-4', label: 'settings' },
            ]}
          />
        </div>
      </div>

      {/* Asset row — canonical icon + amount pattern for balance lists & tables */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">asset row · balance list</div>
        <div className="ds-surface" style={{ padding: 0 }}>
          <div className="ds-stack" style={{ padding: 'var(--space-2) 0' }}>
            {[
              { symbol: 'ETH',  amount: parseEther('12.4057'),     bps: 0 },
              { symbol: 'cETH', amount: parseEther('1247.3286'),   bps: 1000 },
              { symbol: 'USDC', amount: parseEther('4221000'),     bps: 0,  decimals: 18 },
              { symbol: 'DAI',  amount: parseEther('850.42'),      bps: 0 },
            ].map((row) => (
              <div
                key={row.symbol}
                className="ds-row"
                style={{ padding: 'var(--space-2) var(--space-4)', justifyContent: 'space-between', gap: 'var(--space-4)' }}
              >
                <span className="ds-row ds-row-3">
                  <TokenIcon symbol={row.symbol} size="md" />
                  <span className="ds-stack ds-stack-1">
                    <span className="ds-text-sm">{row.symbol}</span>
                    {row.bps > 0 && <span className="ds-text-xs ds-subtle">yield share {formatPercent(row.bps)}</span>}
                  </span>
                </span>
                <TokenAmount
                  amount={row.amount}
                  decimals={row.decimals ?? 18}
                  symbol={row.symbol}
                  compact
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Amount sizes */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">amount · sizes</div>
        <div className="ds-stack ds-stack-3">
          <div className="ds-row" style={{ alignItems: 'baseline', gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 64 }}>inline</div>
            <span className="ds-text-sm">
              Position: <TokenAmount amount={parseEther('12.4057')} decimals={18} symbol="ETH" size="inline" />
              &nbsp;·&nbsp;Free: <TokenAmount amount={parseEther('8.2')} decimals={18} symbol="ETH" size="inline" />
            </span>
          </div>
          <div className="ds-row" style={{ alignItems: 'baseline', gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 64 }}>default</div>
            <TokenAmount amount={parseEther('12.4057')} decimals={18} symbol="ETH" />
          </div>
          <div className="ds-row" style={{ alignItems: 'baseline', gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 64 }}>display</div>
            <TokenAmount amount={parseEther('1247.328573')} decimals={18} symbol="ETH" size="display" />
          </div>
        </div>
      </div>

      {/* Compact */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">amount · compact (k/m/b)</div>
        <div className="ds-stack ds-stack-2 ds-text-sm">
          <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 80 }}>1.25K</div>
            <TokenAmount amount={parseEther('1247.328573')} decimals={18} symbol="ETH" compact />
            <span className="ds-subtle">— hover for full precision</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 80 }}>4.22M</div>
            <TokenAmount amount={parseEther('4221000')} decimals={18} symbol="USDC" compact />
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 80 }}>fallback</div>
            <TokenAmount amount={parseEther('12.4057')} decimals={18} symbol="ETH" compact />
            <span className="ds-subtle">— under 10K threshold, renders full</span>
          </div>
        </div>
      </div>

      {/* Precision & truncation */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">precision · trailing decimals</div>
        <div className="ds-stack ds-stack-2 ds-text-sm">
          <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 80 }}>default</div>
            <TokenAmount amount={parseEther('1.328573291847562')} decimals={18} symbol="ETH" />
            <span className="ds-subtle">— precision=4, trailing zeros stripped</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 80 }}>display</div>
            <TokenAmount amount={parseEther('1.328573291847562')} decimals={18} symbol="ETH" size="display" />
            <span className="ds-subtle">— fraction dimmed</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 80 }}>round</div>
            <TokenAmount amount={parseEther('1.0')} decimals={18} symbol="ETH" />
            <span className="ds-subtle">— no fraction emitted for whole values</span>
          </div>
        </div>
      </div>

      {/* USD amount — primitive parallel to TokenAmount, used by the
          dashboard hero, claim modals, and any USD-denominated stat. */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">usd · UsdAmount primitive</div>
        <div className="ds-stack ds-stack-2 ds-text-sm">
          <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 64 }}>inline</div>
            <UsdAmount amount={1234_560000n} size="inline" />
            <span className="ds-subtle">— stat tile / row trailing</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 64 }}>default</div>
            <UsdAmount amount={48531_420000n} />
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 64 }}>display</div>
            <UsdAmount amount={48531_420000n} size="display" />
            <span className="ds-subtle">— hero headline</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 64 }}>compact</div>
            <UsdAmount amount={4_221_000_000_000n} compact />
            <span className="ds-subtle">— hover for full precision</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 64 }}>missing</div>
            <UsdAmount amount={null} />
            <span className="ds-subtle">— price unavailable</span>
          </div>
        </div>
      </div>

      {/* BPS / percentage */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">bps · percentage</div>
        <div className="ds-stack ds-stack-2 ds-text-sm">
          <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 96 }}>maxPenaltyBps</div>
            <span className="ds-mono-num">{formatPercent(2500)}</span>
            <span className="ds-subtle">· 2500</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 96 }}>yieldShareBps</div>
            <span className="ds-mono-num">{formatPercent(1000)}</span>
            <span className="ds-subtle">· 1000</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 96 }}>full forfeit</div>
            <span className="ds-mono-num">{formatPercent(10000)}</span>
            <span className="ds-subtle">· 10000</span>
          </div>
        </div>
      </div>

      {/* Risk dot */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">penalty · risk threshold</div>
        <div className="ds-stack ds-stack-2">
          <RiskRow bps={2500} label="maxPenaltyBps" />
          <RiskRow bps={5000} label="maxPenaltyBps" />
          <RiskRow bps={10000} label="maxPenaltyBps" />
        </div>
      </div>

      {/* Balance line */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">balance line</div>
        <div className="ds-stack ds-stack-2">
          <BalanceLine
            amount={parseEther('12.4057')}
            decimals={18}
            symbol="ETH"
            label="Balance"
            onMax={() => undefined}
          />
          <BalanceLine
            amount={parseEther('0')}
            decimals={18}
            symbol="ETH"
            label="Available"
            onMax={() => undefined}
            maxDisabled
          />
        </div>
      </div>

      {/* Share / asset ratio */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">share · asset ratio</div>
        <div className="ds-stack ds-stack-2 ds-text-sm">
          <ShareRatio
            shares={parseEther('1')}
            assets={parseEther('1.023456')}
            shareSymbol="cETH"
            assetSymbol="ETH"
            decimals={18}
          />
          <ShareRatio
            shares={parseEther('100')}
            assets={parseEther('102.3456')}
            shareSymbol="cETH"
            assetSymbol="ETH"
            decimals={18}
          />
          <span className="ds-subtle ds-text-xs">erc-4626 conversion · share supply × pricePerShare</span>
        </div>
      </div>

      {/* Allocation bar */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">allocation bar · vault encumbrance</div>
        <AllocationBar
          total={parseEther('100')}
          decimals={18}
          symbol="ETH"
          segments={[
            { label: 'encumbered', value: parseEther('62.5'), tone: 'warn' },
            { label: 'free', value: parseEther('37.5'), tone: 'success' },
          ]}
        />
      </div>

      {/* Encumbrance bar — one position's free / encumbered split */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">encumbrance bar · md · sm · no position</div>
        <div className="ds-stack ds-stack-3">
          <EncumbranceBar encumbered={parseEther('62.5')} total={parseEther('100')} />
          <EncumbranceBar encumbered={parseEther('8.2')} total={parseEther('12.4057')} size="sm" />
          <EncumbranceBar encumbered={0n} total={0n} />
        </div>
      </div>

      {/* Settlement bar — v2.5 bilateral agreement flow */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">settlement bar · agreement bilateral flow (v2.5)</div>
        <SettlementBar
          decimals={18}
          symbol="ETH"
          tone="info"
          directions={[
            { label: 'proposer → acceptor', cap: parseEther('100'), cumulative: parseEther('40') },
            { label: 'acceptor → proposer', cap: parseEther('80'), cumulative: parseEther('5') },
          ]}
        />
        <span className="ds-subtle ds-text-xs">
          cumulative-vs-cap per direction · disabled track shown when cap == 0
        </span>
        <SettlementBar
          decimals={18}
          symbol="ETH"
          tone="info"
          directions={[
            { label: 'junior → senior (coupon)', cap: parseEther('50'), cumulative: parseEther('30') },
            { label: 'senior → junior', cap: 0n, cumulative: 0n },
          ]}
        />
      </div>

      {/* Stat tones */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">stat · tone variants</div>
        <div className="ds-grid-4">
          <div className="ds-stat ds-stat--success">
            <span className="ds-stat-label">Yield (7d)</span>
            <span className="ds-stat-value">
              <TokenAmount amount={parseEther('0.4232')} decimals={18} symbol="ETH" />
            </span>
            <span className="ds-stat-delta ds-stat-delta--success">↑ 4.21% APY</span>
          </div>
          <div className="ds-stat ds-stat--danger">
            <span className="ds-stat-label">Forfeited</span>
            <span className="ds-stat-value">
              <TokenAmount amount={parseEther('1.85')} decimals={18} symbol="ETH" />
            </span>
            <span className="ds-stat-delta ds-stat-delta--danger">↓ 0.92 / 24h</span>
          </div>
          <div className="ds-stat ds-stat--accent">
            <span className="ds-stat-label">Pending Reward</span>
            <span className="ds-stat-value">
              <TokenAmount amount={parseEther('0.0421')} decimals={18} symbol="ETH" />
            </span>
            <span className="ds-stat-meta ds-muted">claim available</span>
          </div>
          <div className="ds-stat">
            <span className="ds-stat-label">Encumbered</span>
            <span className="ds-stat-value">
              <TokenAmount amount={parseEther('62.5')} decimals={18} symbol="ETH" compact />
            </span>
            <span className="ds-stat-meta ds-muted">62.5% of vault</span>
          </div>
        </div>
      </div>

      {/* Token pair */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">token pair · proposer / acceptor</div>
        <div className="ds-surface" style={{ padding: 'var(--space-4)' }}>
          <div className="ds-row" style={{ gap: 'var(--space-6)', alignItems: 'stretch' }}>
            <div className="ds-stack ds-stack-2" style={{ flex: 1 }}>
              <span className="ds-label">proposer commits</span>
              <TokenAmount amount={parseEther('5')} decimals={18} symbol="ETH" size="display" withIcon />
              <span className="ds-text-xs ds-subtle">max penalty {formatPercent(5000)}</span>
            </div>
            <div className="ds-row" style={{ alignItems: 'center' }}>
              <span className="ds-glyph ds-glyph--muted" style={{ fontSize: 'var(--text-xl)' }}>↔</span>
            </div>
            <div className="ds-stack ds-stack-2" style={{ flex: 1, alignItems: 'flex-end' }}>
              <span className="ds-label">acceptor commits</span>
              <TokenAmount amount={parseEther('2500')} decimals={18} symbol="USDC" size="display" withIcon />
              <span className="ds-text-xs ds-subtle">max penalty {formatPercent(2500)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Empty / loading */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">empty · loading</div>
        <div className="ds-stack ds-stack-2 ds-text-sm">
          <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 80 }}>zero</div>
            <TokenAmount amount={0n} decimals={18} symbol="ETH" />
            <span className="ds-subtle">— dimmed em-dash, never `0.0000 ETH`</span>
          </div>
          <div className="ds-row" style={{ gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 80 }}>loading</div>
            <Skeleton shape="block" width={96} height={16} />
            <span className="ds-subtle">— reserves width while async reads settle</span>
          </div>
        </div>
      </div>
      <SourceBlock label="example" source={SRC_ASSETS} />
    </section>
  )
}
