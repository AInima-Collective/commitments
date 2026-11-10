import {
  EntityLogo,
} from '../../components/ui'
import { SectionHeading } from './SectionHeading'

export function EntityLogoSection() {
  return (
    <section className="ds-stack ds-stack-8">
      <SectionHeading
        id="entity-logo"
        title="Entity Logo"
        lead="Square logo tile for branded entities — services, vaults, curators. Inherits the design system's sharp geometry (`--radius: 0`) and surface palette so the placeholder reads as a chip rather than a portrait. Distinct from OperatorAvatar (round, address-seeded) — reach for EntityLogo whenever the surface is `this is the brand`, not `this is an actor`."
      />
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">size · sm 32 · md 48 · lg 64 · xl 96</div>
        <div className="ds-row ds-row-4" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <span className="ds-stack ds-stack-1" style={{ alignItems: 'center' }}>
            <EntityLogo name="Service" src="/assets/usdc.png" size="sm" />
            <span className="ds-text-xs ds-subtle">sm</span>
          </span>
          <span className="ds-stack ds-stack-1" style={{ alignItems: 'center' }}>
            <EntityLogo name="Service" src="/assets/usdc.png" size="md" />
            <span className="ds-text-xs ds-subtle">md</span>
          </span>
          <span className="ds-stack ds-stack-1" style={{ alignItems: 'center' }}>
            <EntityLogo name="Service" src="/assets/usdc.png" size="lg" />
            <span className="ds-text-xs ds-subtle">lg</span>
          </span>
          <span className="ds-stack ds-stack-1" style={{ alignItems: 'center' }}>
            <EntityLogo name="Service" src="/assets/usdc.png" size="xl" />
            <span className="ds-text-xs ds-subtle">xl</span>
          </span>
        </div>
      </div>
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">resolution</div>
        <div className="ds-row ds-row-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="ds-row ds-row-2">
            <EntityLogo name="USDC Vault" src="/assets/usdc.png" size="md" />
            <span className="ds-text-sm">via src= URL</span>
          </span>
          <span className="ds-row ds-row-2">
            <EntityLogo name="Demo Labs" size="md" />
            <span className="ds-text-sm">name → initials</span>
          </span>
          <span className="ds-row ds-row-2">
            <EntityLogo size="md" />
            <span className="ds-text-sm">no name → ?</span>
          </span>
        </div>
      </div>
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">shape · default square; circle escape hatch</div>
        <div className="ds-row ds-row-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="ds-row ds-row-2">
            <EntityLogo name="Service" src="/assets/usdc.png" size="lg" shape="square" />
            <span className="ds-text-sm">square (default)</span>
          </span>
          <span className="ds-row ds-row-2">
            <EntityLogo name="Service" src="/assets/usdc.png" size="lg" shape="circle" />
            <span className="ds-text-sm">circle</span>
          </span>
        </div>
      </div>
    </section>
  )
}
