import {
  AddressDisplay,
  EntityCard,
} from '../../components/ui'
import { SectionHeading } from './SectionHeading'

export function EntityCardsSection() {
  return (
    <section className="ds-stack ds-stack-8">
      <SectionHeading
        id="entity-cards"
        title="Entity Cards"
        lead="A labelled card that pairs a name with a description and a row of addresses, IDs, or attestations. Used for smart contracts, role holders, and auditors — surfaces where the relationship between a label and a set of identifiers is the whole point. The left rule picks up a tone; the body slot is freeform so the caller renders any mix of <AddressDisplay>, links, or text."
      />

      {/* Smart contracts */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">smart contracts · single address</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          <EntityCard
            tone="info"
            label="Vault"
            description="ERC-1967 proxy · UUPS upgradable · ERC-4626 share token"
          >
            <AddressDisplay
              address={'0x4f12cf3a9b2e1d8c47f0a6e13b5d29ba0aae9012' as `0x${string}`}
              compact
              explorerUrl="https://etherscan.io/address/0x4f12cf3a9b2e1d8c47f0a6e13b5d29ba0aae9012"
            />
          </EntityCard>
          <EntityCard
            tone="info"
            label="Commitment manager"
            description="UUPS proxy · two-phase forfeit · agreement settlement"
            meta="v2.5"
          >
            <AddressDisplay
              address={'0x3a4f12cd9e2b1f8a47b06e3c5d9b2af0a8e91234' as `0x${string}`}
              compact
              explorerUrl="https://etherscan.io/address/0x3a4f12cd9e2b1f8a47b06e3c5d9b2af0a8e91234"
            />
          </EntityCard>
          <EntityCard
            tone="warn"
            label="Mesh factory"
            description="EIP-1167 minimal-clone factory for mesh topology nodes"
            meta="paused"
          >
            <AddressDisplay
              address={'0x9c1ab7d8e2a3f5b6c4d8e1f0a3b2c4d5e6f78901' as `0x${string}`}
              compact
              explorerUrl="https://etherscan.io/address/0x9c1ab7d8e2a3f5b6c4d8e1f0a3b2c4d5e6f78901"
            />
          </EntityCard>
        </div>
      </div>

      {/* Role holders */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">roles · multiple holders</div>
        <div className="ds-stack ds-stack-2">
          <EntityCard
            tone="info"
            label="Vault admin"
            description="Pauses deposits and withdrawals; authorises UUPS upgrades."
            meta="2 holders"
          >
            <AddressDisplay
              address={'0xc1ab4d09e80a30bb15d9e2abc3df41a82de42de9' as `0x${string}`}
              compact
              explorerUrl="https://etherscan.io/address/0xc1ab4d09e80a30bb15d9e2abc3df41a82de42de9"
            />
            <AddressDisplay
              address={'0xe7d391bc04ab09f8e43c2f1d09bcde3a29a82de1' as `0x${string}`}
              compact
              explorerUrl="https://etherscan.io/address/0xe7d391bc04ab09f8e43c2f1d09bcde3a29a82de1"
            />
          </EntityCard>
          <EntityCard
            tone="warn"
            label="Manager keeper"
            description="Triggers permissioned harvests and yield distributions."
            meta={
              <span title="Scan window bounded by RPC budget">recent grants only</span>
            }
          >
            <AddressDisplay
              address={'0x8f2e91a4d3c5b7a9f1e2c8b6d4e5f6a7b8c9d0e1' as `0x${string}`}
              compact
              explorerUrl="https://etherscan.io/address/0x8f2e91a4d3c5b7a9f1e2c8b6d4e5f6a7b8c9d0e1"
            />
          </EntityCard>
          <EntityCard
            tone="neutral"
            label="Registry admin"
            description="Manages operator registry policy parameters."
          >
            <span className="ds-subtle ds-text-sm">No active holders found.</span>
          </EntityCard>
        </div>
      </div>

      {/* Auditors */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">auditors · with optional report link</div>
        <div className="ds-stack ds-stack-2">
          <EntityCard
            tone="success"
            label="Hashlock"
            description="POA middleware v1.0.1 · September 2025"
            action={
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                style={{ color: 'var(--accent)' }}
              >
                View report ↗
              </a>
            }
          />
          <EntityCard
            tone="success"
            label="Pashov Audit Group"
            description="Multi-agent audit of v1.2 / v2.0 — full report in audits/"
            meta="9 highs"
            action={
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                style={{ color: 'var(--accent)' }}
              >
                View report ↗
              </a>
            }
          />
          <EntityCard
            tone="neutral"
            label="Internal v2.5 review"
            description="May 2026 · 9-agent parallel audit · 7 highs landed and verified"
          />
        </div>
        <div className="ds-text-xs ds-subtle">
          Tone drives the left rule only — `success` for completed audits, `warn` for paused
          contracts, `danger` for emergency states. Body is freeform; pass any combination of
          addresses, lists, or text.
        </div>
      </div>
    </section>
  )
}
