import {
  SourceBlock,
} from '../../components/ui'
import {
  CommitmentTags,
  CommitmentTerms,
  CommitmentTitle,
  DerivedLabelPreview,
  MetadataProvenance,
  MetadataTrustBadge,
} from '../../components/protocol'
import type { CommitmentLabel } from '../../lib/commitmentLabel'
import type { MetadataTrust } from '../../lib/commitmentMetadata'
import { SectionHeading } from './SectionHeading'

/**
 * The naming vocabulary, tier by tier and trust level by trust level.
 *
 * Labels are constructed literally here rather than derived from fixture rows:
 * the point of the section is the RENDERING contract, and hand-writing the
 * `source` / `trust` combinations makes the ones a real corpus rarely produces
 * (a mismatch, an unreachable URI) as visible as the common case.
 */
function CommitmentNamingDemo() {
  const label = (
    text: string,
    source: CommitmentLabel['source'],
    trust: MetadataTrust,
    extra: Partial<CommitmentLabel> = {},
  ): CommitmentLabel => ({ text, full: text, source, trust, ...extra })

  const tiers: Array<{ tier: string; when: string; label: CommitmentLabel }> = [
    {
      tier: '1 · metadata',
      when: 'title fetched and its hash matched',
      label: label('Weekly market-data delivery', 'metadata', 'attested'),
    },
    {
      tier: '1 · metadata',
      when: 'title fetched, but no hash was ever posted',
      label: label('Oracle uptime bond', 'metadata', 'unattested'),
    },
    {
      tier: '2 · derived',
      when: 'one leg of a bilateral agreement',
      label: label('Agreement #4, side A', 'derived', 'none'),
    },
    {
      tier: '2 · derived',
      when: 'counterparty is a registered operator',
      label: label('Delegation to Acme Node Co.', 'derived', 'none'),
    },
    {
      tier: '2 · derived',
      when: 'counterparty is a known protocol contract',
      label: label('Vault depositors (restitution)', 'derived', 'none'),
    },
    {
      tier: '2 · derived',
      when: 'nothing but the shape of the stake',
      label: label('1,204 cvUSDC held against 0x2222…22ab', 'derived', 'none'),
    },
    {
      tier: '3 · id',
      when: 'no counterparty resolved at all',
      label: label('#12', 'id', 'none'),
    },
  ]

  const gated: Array<{ label: CommitmentLabel; note: string }> = [
    {
      label: label('Nightly backup attestation', 'derived', 'mismatch', {
        text: '1,204 cvUSDC held against 0x2222…22ab',
        full: '1,204 cvUSDC held against 0x2222…22ab',
        withheldTitle: 'Nightly backup attestation',
      }),
      note: 'The off-chain title is refused and the row falls back to its derived label. The refused text survives on `withheldTitle` for the warning block to quote.',
    },
    {
      label: label('1,204 cvUSDC held against 0x2222…22ab', 'derived', 'unreachable'),
      note: 'Nothing could be fetched, so there is no title to consider. The badge says why the row has no name of its own.',
    },
  ]

  return (
    <div className="ds-stack ds-stack-6">
      {/* Tiers */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">commitmentLabel · tiers</div>
        <table className="ds-table ds-table--sm">
          <thead>
            <tr>
              <th style={{ width: '140px' }}>tier</th>
              <th>rendered</th>
              <th>when</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t, i) => (
              <tr key={i}>
                <td className="ds-subtle">{t.tier}</td>
                <td>
                  <CommitmentTitle label={t.label} showAttested />
                </td>
                <td className="ds-subtle ds-text-xs">{t.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ds-text-xs ds-subtle">
          Derived labels render italic and muted so a structural guess never reads as something a
          person typed. The id stays on the row's second line in every tier but the last, where it
          is already the name.
        </p>
      </div>

      {/* The security rule */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">unverified text never gets a heading</div>
        {gated.map((g, i) => (
          <div key={i} className="ds-stack ds-stack-2">
            <CommitmentTitle label={g.label} />
            <p className="ds-text-xs ds-subtle">{g.note}</p>
          </div>
        ))}
      </div>

      {/* Trust badges */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">MetadataTrustBadge · five levels</div>
        <div className="ds-row ds-row-4" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          {(['attested', 'unattested', 'mismatch', 'unreachable', 'none'] as MetadataTrust[]).map(
            (trust) => (
              <span key={trust} className="ds-row ds-row-2" style={{ alignItems: 'center' }}>
                <span className="ds-text-xs ds-subtle" style={{ minWidth: 88 }}>
                  {trust}
                </span>
                <MetadataTrustBadge trust={trust} showAttested size="sm" />
                {trust === 'none' && <span className="ds-text-xs ds-subtle">(renders nothing)</span>}
              </span>
            ),
          )}
        </div>
        <p className="ds-text-xs ds-subtle">
          Distinct from <code>MetadataStatusBadge</code>, which collapses "the hash does not match"
          and "nothing could be fetched" into one <code>invalid</code>. Those ask the reader for
          different reactions, so they keep different tone and different words. In lists the good
          case is silent by default: a badge on every row trains people to ignore the badge on the
          row that matters.
        </p>
      </div>

      {/* Tags */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">CommitmentTags</div>
        <div className="ds-stack ds-stack-2">
          <CommitmentTags tags={['oracle', 'sla', 'uptime']} />
          <CommitmentTags
            tags={['oracle', 'sla', 'uptime', 'weth', 'relay', 'custody']}
            max={3}
            active={['sla']}
            onSelect={() => {}}
          />
        </div>
        <p className="ds-text-xs ds-subtle">
          Inert by default; pass <code>onSelect</code> to make them filters. Clicks are stopped
          before they bubble, so the same markup works inside a click-to-open table row and inside a{' '}
          <code>MediaRow</code> overlay. <code>max</code> collapses the rest into a <code>+N</code>{' '}
          whose tooltip lists them.
        </p>
      </div>

      {/* Terms + provenance */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">CommitmentTerms · leads the detail page</div>
        <CommitmentTerms
          trust="attested"
          description={
            'Backs a weekly OHLCV feed for the desk. Index appreciation on the locked shares pays the buyer a premium for the week it stays live.\n\nMissed deliveries are arbitrated against the published schedule.'
          }
          termsURI="ipfs://bafybeigdyrztterms/terms.pdf"
          tags={['data-feed', 'premium', 'sla']}
        />
        <p className="ds-text-xs ds-subtle">
          Renders nothing for <code>mismatch</code>, <code>unreachable</code>, or <code>none</code>.
          Markdown goes through the docs viewer's configuration with no <code>rehype-raw</code>;
          images are disallowed outright, and a link whose scheme is not on the allowlist renders as
          plain text.
        </p>
      </div>

      <div className="ds-stack ds-stack-3">
        <div className="ds-label">MetadataProvenance · collapses below it</div>
        <MetadataProvenance
          trust="attested"
          uri="ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
          hash="0xab7f1e4c2d5b6a9081726354ffee11223344556677889900aabbccddeeff0011"
          content={{
            schemaVersion: 'commitment.v1',
            title: 'Weekly market-data delivery',
            tags: ['data-feed', 'premium', 'sla'],
          }}
          onRefetch={() => {}}
        />
        <MetadataProvenance
          trust="mismatch"
          uri="ipfs://bafybeimismatchexampleuh7y26nf3efuylqabf3oclgtqy55fbzdi"
          hash="0x0011223344556677889900aabbccddeeff1e4c2d5b6a908172635476ab7f1e4c"
          withheldTitle="Nightly backup attestation"
        />
        <p className="ds-text-xs ds-subtle">
          Schema-agnostic, so vault, operator, and service surfaces can reuse it. Failures render
          outside the disclosure: nobody should have to expand a panel to learn that the text above
          them failed verification.
        </p>
      </div>

      {/* Authoring preview */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">DerivedLabelPreview · in create forms</div>
        <DerivedLabelPreview
          counterparty={'0x22222222222222222222222222222222222222ab'}
          token={'0x4444444444444444444444444444444444444444'}
          amount={1_204_000_000n}
          decimals={6}
          symbol="cvUSDC"
        />
        <p className="ds-text-xs ds-subtle">
          Naming is a nudge, not a gate. Rather than nagging, the form shows what leaving the title
          blank actually produces, and lets the author decide whether that is good enough. Runs the
          same tiers as a live row via <code>pendingCommitmentLabel</code>.
        </p>
      </div>
    </div>
  )
}

const SRC_COMMITMENT_NAMING =
  `// One call resolves the tier AND the security rule. Never read
// metadataContent.title directly at a render site.
const label = commitmentLabel(row, labelContext)   // hooks/useCommitmentLabelContext
<CommitmentTitle label={label} size="md" />

// Tags filter the list; chips stop propagation so they work inside a
// click-to-open row.
<CommitmentTags tags={metadataTags(row)} max={3} onSelect={toggleTag} active={tags} />

// Terms lead the detail page; provenance collapses below it.
<CommitmentTerms
  trust={metadataTrust(row)}
  description={metadataDescription(row)}
  termsURI={metadataTermsURI(row)}
  tags={metadataTags(row)}
/>
<Disclosure label="metadata provenance">
  <MetadataProvenance trust={trust} uri={uri} hash={hash} content={content} />
</Disclosure>`

export function CommitmentNamingSection() {
  return (
    <section className="ds-stack ds-stack-8">
      <SectionHeading
        id="commitment-naming"
        title="Commitment Naming"
        lead="A commitment's name is derived, not read. `commitmentLabel(row, ctx)` in lib/ resolves three tiers — a verified off-chain title, a label derived from the row's own structure, then the bare id — and returns the trust level alongside the text. Every surface that names a commitment goes through it, which is what keeps the table, the cards, and the detail header from drifting apart. The components below render its output; none of them decide what is safe to show."
      />
      <CommitmentNamingDemo />
      <SourceBlock label="example" source={SRC_COMMITMENT_NAMING} />
    </section>
  )
}
