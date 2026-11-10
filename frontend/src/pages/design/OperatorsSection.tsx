import { parseEther } from 'viem'
import {
  Button,
  OperatorAvatar,
  SourceBlock,
  TokenAmount,
} from '../../components/ui'
import {
  AgreementStatusBadge,
  MetadataStatusBadge,
  MetadataSummary,
  OperatorIdentity,
  OperatorStatusBadge,
  RiskTierBadge,
  type MetadataStatus,
} from '../../components/protocol'
import { SectionHeading } from './SectionHeading'

const SRC_OPERATORS =
  `<OperatorAvatar address={addr} name="Pellar Labs" size="md" />
<OperatorIdentity address={addr} name="Pellar Labs" size="sm" hideAddress />
<OperatorStatusBadge status="ACTIVE" />`

export function OperatorsSection() {
  return (
    <section className="ds-stack ds-stack-8">
      <SectionHeading
        id="operators"
        title="Operators"
        lead="Validator-style identity primitives for mesh operators. The on-chain registry stores an address, stake, and a metadata pointer; the off-chain JSON (operator.v1) carries name, logo, services, and contact. The design treats unnamed and unverified operators as first-class — never break the row."
      />

      {/* Operator avatar */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">avatar · sizes</div>
        <div className="ds-row ds-row-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="ds-row ds-row-2">
            <OperatorAvatar address="0xC4f7000000000000000000000000000000003Ab9" name="Pellar Labs" size="sm" />
            <span className="ds-text-xs ds-subtle">sm · 20</span>
          </span>
          <span className="ds-row ds-row-2">
            <OperatorAvatar address="0xC4f7000000000000000000000000000000003Ab9" name="Pellar Labs" size="md" />
            <span className="ds-text-xs ds-subtle">md · 32</span>
          </span>
          <span className="ds-row ds-row-2">
            <OperatorAvatar address="0xC4f7000000000000000000000000000000003Ab9" name="Pellar Labs" size="lg" />
            <span className="ds-text-xs ds-subtle">lg · 48</span>
          </span>
          <span className="ds-row ds-row-2">
            <OperatorAvatar address="0xC4f7000000000000000000000000000000003Ab9" name="Pellar Labs" size="xl" />
            <span className="ds-text-xs ds-subtle">xl · 72</span>
          </span>
        </div>
        <div className="ds-stack ds-stack-2">
          <div className="ds-label">avatar · resolution</div>
          <div className="ds-row ds-row-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="ds-row ds-row-2">
              <OperatorAvatar src="https://avatars.githubusercontent.com/u/4153810?s=200" name="Service" size="md" />
              <span className="ds-text-sm">via src= URL</span>
            </span>
            <span className="ds-row ds-row-2">
              <OperatorAvatar address="0xC4f7000000000000000000000000000000003Ab9" name="Pellar Labs" size="md" />
              <span className="ds-text-sm">name → initials</span>
            </span>
            <span className="ds-row ds-row-2">
              <OperatorAvatar address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e" size="md" />
              <span className="ds-text-sm">unnamed → addr seed</span>
            </span>
            <span className="ds-row ds-row-2">
              <OperatorAvatar address="0xab5801a7d398351b8be11c439e05c5b3259aec9b" size="md" />
              <span className="ds-text-sm">stable per-address gradient</span>
            </span>
            <span className="ds-row ds-row-2">
              <OperatorAvatar address="0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97" size="md" />
              <span className="ds-text-sm">low saturation, mono palette</span>
            </span>
          </div>
        </div>
      </div>

      {/* Operator status */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">status</div>
        <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap' }}>
          <OperatorStatusBadge status="ACTIVE" />
          <OperatorStatusBadge status="BELOW_MIN_STAKE" />
          <OperatorStatusBadge status="COOLDOWN" />
          <OperatorStatusBadge status="INACTIVE" />
        </div>
        <div className="ds-text-xs ds-subtle" style={{ maxWidth: '60ch' }}>
          Status precedence in the registry: INACTIVE (deregistered) wins, then BELOW_MIN_STAKE
          (registered but under floor), else ACTIVE. COOLDOWN is the operator-driven pause flag.
        </div>
      </div>

      {/* Agreement status */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">agreement state</div>
        <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap' }}>
          <AgreementStatusBadge status="active" />
          <AgreementStatusBadge status="released" />
          <AgreementStatusBadge status="forfeited" />
          <AgreementStatusBadge status="partialForfeitA" />
          <AgreementStatusBadge status="partialForfeitB" />
          <AgreementStatusBadge status="expired" />
          <AgreementStatusBadge status="cancelled" />
        </div>
        <div className="ds-text-xs ds-subtle" style={{ maxWidth: '60ch' }}>
          Bilateral state machine: <code>active</code> (both sides bound) →
          terminal (<code>released</code>, <code>forfeited</code>, <code>expired</code>,
          <code>cancelled</code>). Partial-forfeit variants surface asymmetric resolution
          when one side has been adversely resolved while the other has not.
        </div>
      </div>

      {/* Risk tier */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">risk tier · aggregate forfeiture exposure</div>
        <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap' }}>
          <RiskTierBadge tier="success" />
          <RiskTierBadge tier="warn" />
          <RiskTierBadge tier="danger" />
          <RiskTierBadge tier="unknown" />
        </div>
        <div className="ds-text-xs ds-subtle" style={{ maxWidth: '60ch' }}>
          Derived via <code>riskTier(maxPenaltyBps)</code>: ≤25% → low, ≤75% → medium, &gt;75% → high.
          <code>unknown</code> is the no-actives case (no current exposure to score).
        </div>
      </div>

      {/* Operator identity */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">identity · sizes</div>
        <div className="ds-stack ds-stack-3">
          <div className="ds-row" style={{ alignItems: 'center', gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 64 }}>sm</div>
            <OperatorIdentity
              address="0xC4f7000000000000000000000000000000003Ab9"
              name="Pellar Labs"
              size="sm"
              hideAddress
            />
          </div>
          <div className="ds-row" style={{ alignItems: 'center', gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 64 }}>md</div>
            <OperatorIdentity
              address="0xC4f7000000000000000000000000000000003Ab9"
              name="Pellar Labs"
              size="md"
            />
          </div>
          <div className="ds-row" style={{ alignItems: 'center', gap: 'var(--space-6)' }}>
            <div className="ds-label" style={{ minWidth: 64 }}>lg</div>
            <OperatorIdentity
              address="0xC4f7000000000000000000000000000000003Ab9"
              name="Pellar Labs"
              size="lg"
            />
          </div>
        </div>
        <div className="ds-stack ds-stack-2" style={{ paddingTop: 'var(--space-2)' }}>
          <div className="ds-label">identity · variants</div>
          <div className="ds-stack ds-stack-3">
            <OperatorIdentity
              address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
              name="Pinax"
              badge={<span className="ds-badge ds-badge--accent">verified</span>}
              explorerUrl="https://etherscan.io/address/0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
            />
            <OperatorIdentity
              address="0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97"
              name="Operator A"
              badge={<span className="ds-badge ds-badge--solid">YOU</span>}
            />
            <OperatorIdentity address="0xab5801a7d398351b8be11c439e05c5b3259aec9b" />
            <OperatorIdentity
              address="0xab5801a7d398351b8be11c439e05c5b3259aec9b"
              size="lg"
            />
          </div>
        </div>
      </div>

      {/* Stake breakdown */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">stake breakdown · stat tiles</div>
        <div className="ds-grid-4">
          <div className="ds-stat">
            <span className="ds-stat-label">Self Stake</span>
            <span className="ds-stat-value">
              <TokenAmount amount={parseEther('32')} decimals={18} symbol="ETH" />
            </span>
            <span className="ds-stat-meta ds-muted">commitment #0042</span>
          </div>
          <div className="ds-stat">
            <span className="ds-stat-label">Total Delegated</span>
            <span className="ds-stat-value">
              <TokenAmount amount={parseEther('1247.328')} decimals={18} symbol="ETH" compact />
            </span>
            <span className="ds-stat-delta ds-stat-delta--success">↑ 12 deleg / 7d</span>
          </div>
          <div className="ds-stat">
            <span className="ds-stat-label">Active Delegations</span>
            <span className="ds-stat-value">87</span>
            <span className="ds-stat-meta ds-muted">across 3 services</span>
          </div>
          <div className="ds-stat ds-stat--accent">
            <span className="ds-stat-label">Voting Power</span>
            <span className="ds-stat-value">
              <TokenAmount amount={parseEther('1279.328')} decimals={18} symbol="ETH" compact />
            </span>
            <span className="ds-stat-meta ds-muted">3.2% of mesh</span>
          </div>
        </div>
      </div>

      {/* Operator profile card */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">operator profile card</div>
        <div className="ds-operator-card">
          <div className="ds-operator-card-header">
            <OperatorIdentity
              address="0xC4f7000000000000000000000000000000003Ab9"
              name="Pellar Labs"
              size="lg"
              badge={<OperatorStatusBadge status="ACTIVE" />}
              explorerUrl="https://etherscan.io/address/0xC4f7000000000000000000000000000000003Ab9"
            />
            <div className="ds-operator-card-header-actions">
              <Button variant="ghost" size="sm">Undelegate</Button>
              <Button variant="primary" size="sm">Delegate</Button>
            </div>
          </div>
          <p className="ds-operator-card-description">
            Veteran AVS operator running production operator services since mainnet beta.
            Bare-metal infrastructure across two regions, 99.97% lifetime uptime, and a
            public post-mortem policy. Specializes in price feed and randomness AVSs.
          </p>
          <div className="ds-operator-card-services">
            <span className="ds-service-tag">price-oracle</span>
            <span className="ds-service-tag">randomness</span>
            <span className="ds-service-tag">attestation</span>
            <span className="ds-service-tag">forfeiture-arbiter</span>
          </div>
          <div className="ds-operator-card-meta">
            <span className="ds-operator-card-meta-label">self stake</span>
            <span className="ds-operator-card-meta-value">
              <TokenAmount amount={parseEther('32')} decimals={18} symbol="ETH" size="inline" />
            </span>
            <span className="ds-operator-card-meta-label">total delegated</span>
            <span className="ds-operator-card-meta-value">
              <TokenAmount amount={parseEther('1247.328')} decimals={18} symbol="ETH" compact size="inline" />
            </span>
            <span className="ds-operator-card-meta-label">delegations</span>
            <span className="ds-operator-card-meta-value">87 active</span>
            <span className="ds-operator-card-meta-label">p2p endpoint</span>
            <span className="ds-operator-card-meta-value">
              /dns/ops.pellar.io/tcp/26656
            </span>
            <span className="ds-operator-card-meta-label">registered</span>
            <span className="ds-operator-card-meta-value">2026-02-14</span>
          </div>
          <div className="ds-operator-card-social">
            <a href="https://pellar.io" target="_blank" rel="noreferrer">
              <span aria-hidden>↗</span> pellar.io
            </a>
            <a href="https://twitter.com/pellarlabs" target="_blank" rel="noreferrer">
              <span aria-hidden>↗</span> @pellarlabs
            </a>
            <a href="https://github.com/pellarlabs" target="_blank" rel="noreferrer">
              <span aria-hidden>↗</span> github.com/pellarlabs
            </a>
          </div>
          <MetadataSummary
            uri="ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
            contentHash="0x9f3e2b71c8d4a51b8e7c3f0291a5d1f8c4b2e6a91f3d8e7c5b2a91f3d8e7c5b2"
            status="ok"
            updatedAt="2026-04-21"
          />
        </div>
      </div>

      {/* Operator list row */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">operator list · table</div>
        <table className="ds-table">
          <thead>
            <tr>
              <th>Operator</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Self Stake</th>
              <th style={{ textAlign: 'right' }}>Total Delegated</th>
              <th style={{ textAlign: 'right' }}>Delegations</th>
              <th>Metadata</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <OperatorIdentity
                  address="0xC4f7000000000000000000000000000000003Ab9"
                  name="Pellar Labs"
                  size="sm"
                  hideAddress
                />
              </td>
              <td><OperatorStatusBadge status="ACTIVE" /></td>
              <td style={{ textAlign: 'right' }}>
                <TokenAmount amount={parseEther('32')} decimals={18} symbol="ETH" size="inline" />
              </td>
              <td style={{ textAlign: 'right' }}>
                <TokenAmount amount={parseEther('1247.328')} decimals={18} symbol="ETH" compact size="inline" />
              </td>
              <td style={{ textAlign: 'right' }} className="ds-mono-num">87</td>
              <td><MetadataStatusBadge status="ok" /></td>
            </tr>
            <tr>
              <td>
                <OperatorIdentity
                  address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
                  name="Pinax"
                  size="sm"
                  hideAddress
                />
              </td>
              <td><OperatorStatusBadge status="ACTIVE" /></td>
              <td style={{ textAlign: 'right' }}>
                <TokenAmount amount={parseEther('48')} decimals={18} symbol="ETH" size="inline" />
              </td>
              <td style={{ textAlign: 'right' }}>
                <TokenAmount amount={parseEther('820.4')} decimals={18} symbol="ETH" size="inline" />
              </td>
              <td style={{ textAlign: 'right' }} className="ds-mono-num">42</td>
              <td><MetadataStatusBadge status="ok" /></td>
            </tr>
            <tr>
              <td>
                <OperatorIdentity
                  address="0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97"
                  name="Operator A"
                  size="sm"
                  hideAddress
                />
              </td>
              <td><OperatorStatusBadge status="BELOW_MIN_STAKE" /></td>
              <td style={{ textAlign: 'right' }}>
                <TokenAmount amount={parseEther('4.2')} decimals={18} symbol="ETH" size="inline" />
              </td>
              <td style={{ textAlign: 'right' }}>
                <TokenAmount amount={0n} decimals={18} symbol="ETH" size="inline" />
              </td>
              <td style={{ textAlign: 'right' }} className="ds-mono-num">0</td>
              <td><MetadataStatusBadge status="invalid" /></td>
            </tr>
            <tr>
              <td>
                <OperatorIdentity
                  address="0xab5801a7d398351b8be11c439e05c5b3259aec9b"
                  size="sm"
                  hideAddress
                />
              </td>
              <td><OperatorStatusBadge status="INACTIVE" /></td>
              <td style={{ textAlign: 'right' }}>
                <TokenAmount amount={0n} decimals={18} symbol="ETH" size="inline" />
              </td>
              <td style={{ textAlign: 'right' }}>
                <TokenAmount amount={0n} decimals={18} symbol="ETH" size="inline" />
              </td>
              <td style={{ textAlign: 'right' }} className="ds-mono-num">0</td>
              <td><MetadataStatusBadge status="missing" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Metadata health inline */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">metadata · integrity states</div>
        <div className="ds-stack ds-stack-2">
          {(['ok', 'checking', 'missing', 'invalid'] as MetadataStatus[]).map((s) => (
            <div key={s} className="ds-row" style={{ gap: 'var(--space-6)', alignItems: 'center' }}>
              <div className="ds-label" style={{ minWidth: 96 }}>{s}</div>
              <MetadataStatusBadge status={s} />
              <span className="ds-text-xs ds-subtle">
                {s === 'ok' && '— fetched JSON hashes back to the on-chain contentHash'}
                {s === 'checking' && '— hash verification in flight'}
                {s === 'missing' && '— no uri set; falls back to address-only identity'}
                {s === 'invalid' && '— hash mismatch; UI surfaces this prominently'}
              </span>
            </div>
          ))}
        </div>
      </div>
      <SourceBlock label="example" source={SRC_OPERATORS} />
    </section>
  )
}
