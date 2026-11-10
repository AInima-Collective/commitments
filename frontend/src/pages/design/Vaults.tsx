import { Link } from 'react-router-dom'
import { parseEther, parseUnits } from 'viem'
import {
  AddressDisplay,
  Button,
  CapacityMeter,
  SourceBlock,
  TokenAmount,
  TokenIcon,
  VaultHeader,
} from '../../components/ui'
import {
  CuratorCard,
  ServiceStakeBreakdown,
  StrategyCard,
} from '../../components/protocol'
import type { ServiceStakeDenom } from '../../hooks/useServiceStakeSummary'
import { SectionHeading } from './SectionHeading'

const SRC_VAULT_HEADER =
  `<VaultHeader
  icon={<TokenIcon symbol="USDC" size="xl" />}
  eyebrow="Delta-neutral · Base"
  title="USDC Carry Trade"
  subtitle="Aerodrome USDC-ETH LP, hedged with an Avantis perpetual short. keeper cron deleverages on health-factor breach."
  meta={<>
    <TokenChip symbol="USDC" />
    <span>Base · ChainID 8453</span>
    <AddressDisplay address="0x4f12…ae90" title="0x4f12cf…0aae90" />
  </>}
  badges={<>
    <span className="ds-badge ds-badge--success">audited · Hashlock</span>
    <span className="ds-badge ds-badge--muted">v2.1</span>
  </>}
  actions={<>
    <Button variant="primary">Deposit</Button>
    <Button variant="default">Withdraw</Button>
  </>}
  stats={[
    { label: 'TVL', value: '$23.4M', meta: '78% of cap' },
    { label: 'APY', value: '5.12%', meta: '+0.34pp / 30d', tone: 'success', emphasis: true },
    { label: 'Health', value: '1.84', meta: 'guardrail at 1.40', tone: 'success' },
    { label: 'Curator', value: '0xc1ab…42de' },
  ]}
  aside={<CapacityMeter
    filled={parseUnits('23400000', 6)}
    cap={parseUnits('30000000', 6)}
    softCap={parseUnits('25000000', 6)}
    decimals={6}
    symbol="USDC"
  />}
/>`

export function VaultMetadataSection() {
  return (
    <section className="ds-stack ds-stack-8">
      <SectionHeading
        id="vault-metadata"
        title="Vault Metadata"
        lead="Two protocol-layer cards that surface the off-chain `vault.v1` payload — who maintains the vault and what it does with capital. Both read directly from `metadata.content.curator` / `metadata.content.strategy`. Use side-by-side under the vault header."
      />
      <div
        className="ds-stack ds-stack-3"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        <CuratorCard
          curator={{
            name: 'Demo Labs',
            description: 'Maintainer of the Commitments protocol.',
            logoURI: 'https://example.com/logo.png',
            website: 'https://example.com/',
            twitter: 'https://twitter.com/example_service',
          }}
        />
        <StrategyCard
          strategy={{
            name: 'Idle USDC Reserve',
            summary: 'Holds USDC, forwards yield to depositors. No external lending or external venue exposure.',
            riskTier: 'conservative',
          }}
        />
      </div>
      <div
        className="ds-stack ds-stack-3"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        <CuratorCard
          curator={{
            name: 'Acme Risk Co.',
            description: 'Curated mainnet allocator since 2025.',
            website: 'https://acme.example',
            twitter: 'https://twitter.com/acmerisk',
          }}
        />
        <StrategyCard
          strategy={{
            name: 'Cross-Vault Underwriting',
            summary: 'Receives forfeited assets via AgentVaultBeneficiary; depositor NAV lifts when claims pay out.',
            riskTier: 'agent',
            venues: ['CommitmentsVault', 'OptimisticMutualArbiter'],
            documentationURI: 'https://example.com/docs/cross-vault',
          }}
        />
      </div>
    </section>
  )
}

export function ServiceStakeSection() {
  return (
    <section className="ds-stack ds-stack-8">
      <SectionHeading
        id="service-stake"
        title="Service Stake"
        lead="Per-vault committed-stake breakdown for one service. Pure presentation — pages compose with `useServiceStakeSummary` for the data and `useAssetPrices` for the optional USD column. Multi-vault native: one row per backing vault."
      />
      <ServiceStakeBreakdown
        denoms={
          [
            {
              vault: '0x0000000000000000000000000000000000000001',
              // 12,600 shares at 15 decimals (cvUSDC; matches the live
              // ERC-4626 share offset on the USDC vault).
              totalShares: parseUnits('12600', 15),
              // 13,229.99 USDC at 6 decimals — vault accrued ~5% yield.
              totalAssets: parseUnits('13229.99', 6),
              asset: '0x0000000000000000000000000000000000000aaa',
              name: 'Commitments USDC Vault',
              symbol: 'cvUSDC',
              decimals: 15,
              assetSymbol: 'USDC',
              assetDecimals: 6,
              logoURI: '/assets/usdc.png',
            },
            {
              vault: '0x0000000000000000000000000000000000000002',
              totalShares: parseEther('3.247'),
              totalAssets: parseEther('3.247'),
              asset: '0x0000000000000000000000000000000000000bbb',
              name: 'Commitments WETH Vault',
              symbol: 'cvWETH',
              decimals: 18,
              assetSymbol: 'WETH',
              assetDecimals: 18,
              logoURI: '/assets/eth.png',
            },
          ] satisfies ServiceStakeDenom[]
        }
        usdAmountFor={(denom) => {
          if (denom.assetSymbol === 'USDC') return parseUnits('13229.99', 6)
          if (denom.assetSymbol === 'WETH') return parseUnits('11234.50', 6)
          return null
        }}
      />
    </section>
  )
}

export function VaultHeaderSection() {
  return (
    <section className="ds-stack ds-stack-8">
      <SectionHeading
        id="vault-header"
        title="Vault Header"
        lead="Page hero for any DeFi vault surface. Lays out identity (icon · title · meta), badges, primary CTAs, a stats grid, and an optional aside slot for a capacity meter or sparkline. The top hairline carries the vault's status accent — orange for healthy, amber for paused, red for emergency. Caller fills every slot with a ReactNode, so vault-specific concepts (chain, curator, audit) compose without leaking into the primitive."
      />

      {/* Hero variant — full kit */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">hero · full kit</div>
        <VaultHeader
          icon={<TokenIcon symbol="USDC" size="xl" />}
          eyebrow="Delta-neutral · Base"
          title="USDC Carry Trade"
          subtitle="Aerodrome USDC-ETH LP hedged by an Avantis perpetual short. A keeper cron deleverages the position on health-factor breach."
          meta={
            <>
              <span className="ds-row" style={{ gap: 'var(--space-1)', alignItems: 'center' }}>
                <span className="ds-token-chip-dot" data-tone="success" />
                <span>Base · 8453</span>
              </span>
              <span>·</span>
              <span className="ds-row" style={{ gap: 'var(--space-1)', alignItems: 'center' }}>
                <span className="ds-subtle">contract</span>
                <AddressDisplay address={'0x4f12cf3a9b2e1d8c47f0a6e13b5d29ba0aae9012' as `0x${string}`} />
              </span>
              <span>·</span>
              <span className="ds-row" style={{ gap: 'var(--space-1)', alignItems: 'center' }}>
                <span className="ds-subtle">curator</span>
                <AddressDisplay address={'0xc1ab4d09e80a30bb15d9e2abc3df41a82de42de9' as `0x${string}`} />
              </span>
            </>
          }
          badges={
            <>
              <span className="ds-badge ds-badge--success">audited · Hashlock</span>
              <span className="ds-badge ds-badge--muted">v2.1</span>
            </>
          }
          actions={
            <>
              <Button variant="primary">Deposit</Button>
              <Button variant="default">Withdraw</Button>
            </>
          }
          stats={[
            {
              label: 'TVL',
              value: <TokenAmount amount={parseUnits('23400000', 6)} decimals={6} symbol="USDC" compact size="inline" />,
              meta: '78% of cap',
            },
            {
              label: 'APY · trailing 30d',
              value: '5.12%',
              meta: '+0.34pp · 30d',
              tone: 'success',
              emphasis: true,
            },
            {
              label: 'Health factor',
              value: '1.84',
              meta: 'guardrail at 1.40',
              tone: 'success',
            },
            {
              label: 'Last harvest',
              value: '6h ago',
              meta: 'cron · every 4h',
            },
          ]}
          aside={
            <CapacityMeter
              filled={parseUnits('23400000', 6)}
              cap={parseUnits('30000000', 6)}
              softCap={parseUnits('25000000', 6)}
              decimals={6}
              symbol="USDC"
              label="deposit cap"
            />
          }
        />
        <div className="ds-text-xs ds-subtle">
          The emphasised stat (APY) bumps to display size and inherits the accent stripe on its
          left rule — a quiet way to point the eye at the headline number without painting the
          whole row.
        </div>
      </div>

      {/* Compact variant — no icon, no aside */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">compact · stats only</div>
        <VaultHeader
          eyebrow="Lending · Ethereum"
          title="WETH Restaked Yield"
          subtitle="Eigenlayer-restaked stETH pooled across three operator sets. Forfeiture is bounded by per-set caps."
          meta={
            <>
              <span>Ethereum · 1</span>
              <span>·</span>
              <AddressDisplay address={'0xa31bdc0901456f1cc8a92ebf7e89f0301d1b2af3' as `0x${string}`} />
            </>
          }
          actions={
            <>
              <Button variant="primary">Deposit</Button>
              <Button variant="ghost">Details</Button>
            </>
          }
          stats={[
            {
              label: 'TVL',
              value: <TokenAmount amount={parseEther('14260')} decimals={18} symbol="WETH" compact size="inline" />,
            },
            {
              label: 'APY',
              value: '6.81%',
              meta: 'base 3.4 + restake 3.41',
              tone: 'success',
              emphasis: true,
            },
            {
              label: 'Operators',
              value: '24',
              meta: '3 sets',
            },
          ]}
        />
      </div>

      {/* Paused / warn variant */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">paused · accent="warn" · deposits disabled</div>
        <VaultHeader
          accent="warn"
          icon={<TokenIcon symbol="DAI" size="xl" />}
          eyebrow="MakerDAO PSM · Deprecated"
          title="DAI Stability Vault"
          subtitle="Deposits paused 2026-04-22 pending sky-protocol migration. Existing positions accrue at the legacy rate; withdrawals remain open."
          meta={
            <>
              <span>Ethereum · 1</span>
              <span>·</span>
              <span className="ds-subtle">migration:</span>
              <Link to="#" style={{ color: 'var(--accent)' }}>sky-vault-v2</Link>
            </>
          }
          badges={
            <>
              <span className="ds-badge ds-badge--warn">deposits paused</span>
              <span className="ds-badge ds-badge--muted">audited · OpenZeppelin</span>
            </>
          }
          actions={
            <>
              <Button variant="primary" disabled>Deposit</Button>
              <Button variant="default">Withdraw</Button>
            </>
          }
          stats={[
            {
              label: 'TVL',
              value: <TokenAmount amount={parseEther('4220000')} decimals={18} symbol="DAI" compact size="inline" />,
              meta: 'down 12% / 30d',
              tone: 'warn',
            },
            {
              label: 'Last APY',
              value: '3.20%',
              meta: 'frozen since pause',
              tone: 'warn',
              emphasis: true,
            },
            {
              label: 'Open positions',
              value: '1,284',
              meta: 'unwinding · 7d half-life',
            },
          ]}
        />
        <div className="ds-text-xs ds-subtle">
          Status accent paints the top hairline + the emphasised stat's rule in
          <code> --warn</code>. Tone-driven values inherit the same hue without painting the
          whole header.
        </div>
      </div>

      <SourceBlock label="example" source={SRC_VAULT_HEADER} />
    </section>
  )
}
