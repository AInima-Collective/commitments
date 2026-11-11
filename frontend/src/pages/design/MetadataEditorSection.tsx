import {
  SourceBlock,
} from '../../components/ui'
import { MetadataEditor } from '../../components/metadata/MetadataEditor'
import { SectionHeading } from './SectionHeading'

const SRC_METADATA_EDITOR =
  `// Schema is a prop — same component serves both flows.
<MetadataEditor
  schema="commitment.v1"
  onChange={(v) => setMetadata(v) /* { metadataURI, metadataHash } | null */}
/>

// On pin: serialize fields -> POST /metadata/pin -> authoritative hash.
// Advanced disclosure preserves the raw URI + hash paste path.`

export function MetadataEditorSection() {
  return (
    <section className="ds-stack ds-stack-8">
      <SectionHeading
        id="metadata-editor"
        title="Metadata Editor"
        lead="Reusable, flow-agnostic authoring shell for protocol metadata. Structured fields are the inline default (driven by a schema prop — commitment.v1 or agreement.v1); the legacy raw URI + hash paste lives in an Advanced disclosure. Pinning POSTs the exact bytes to the indexer and surfaces the authoritative { metadataURI, metadataHash } to the parent form. Consumed by the create-commitment and propose-agreement flows."
      />
      <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-6)' }}>
        <div className="ds-stack ds-stack-3">
          <div className="ds-label">schema · commitment.v1</div>
          <div className="ds-surface" style={{ padding: 'var(--space-4)' }}>
            <MetadataEditor schema="commitment.v1" />
          </div>
        </div>
        <div className="ds-stack ds-stack-3">
          <div className="ds-label">schema · agreement.v1</div>
          <div className="ds-surface" style={{ padding: 'var(--space-4)' }}>
            <MetadataEditor schema="agreement.v1" />
          </div>
        </div>
      </div>
      <SourceBlock label="example" source={SRC_METADATA_EDITOR} />
    </section>
  )
}
