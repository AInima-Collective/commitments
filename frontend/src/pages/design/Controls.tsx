import {
  Button,
  FormField,
  Input,
  Select,
  SourceBlock,
} from '../../components/ui'
import { SectionHeading } from './SectionHeading'

function ButtonsRow() {
  return (
    <div className="ds-stack ds-stack-4">
      <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap' }}>
        <Button variant="primary">Deposit</Button>
        <Button>Withdraw</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="destructive">Forfeit</Button>
        <Button disabled>Disabled</Button>
        <Button leadingIcon={<span className="ds-spinner" aria-hidden />}>Pending</Button>
      </div>
      <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap' }}>
        <Button variant="primary" size="sm">Confirm</Button>
        <Button size="sm">Reset</Button>
        <Button variant="ghost" size="sm">Skip</Button>
        <Button variant="destructive" size="sm">Cancel</Button>
      </div>
      <div className="ds-row ds-row-3" style={{ flexWrap: 'wrap' }}>
        <Button variant="primary" size="lg">Sign Transaction</Button>
        <Button size="lg">Connect Wallet</Button>
      </div>
    </div>
  )
}

function FormFieldDemo() {
  return (
    <div className="ds-stack ds-stack-3">
      <div className="ds-text-sm ds-muted">
        FormField — canonical label / control / helper / error stack. Reach for
        this primitive in every form so the rhythm matches across the app.
      </div>
      <div className="ds-grid-3" style={{ alignItems: 'start' }}>
        <FormField label="Title" required helper="Stored on-chain alongside the proposal.">
          <Input placeholder="Bump vaultShares to 0.9x" />
        </FormField>
        <FormField label="Reason" helper="Markdown supported. Optional.">
          <textarea className="ds-textarea" rows={3} placeholder="Why this change?" />
        </FormField>
        <FormField
          label="Penalty"
          required
          error="Must be 1–10000"
          htmlFor="formfield-error"
        >
          <Input id="formfield-error" tone="danger" defaultValue="999999" />
        </FormField>
      </div>
    </div>
  )
}

// There is no Textarea primitive: textareas take the raw `.ds-textarea` class.
function InputsRow() {
  return (
    <div className="ds-grid-3" style={{ alignItems: 'start' }}>
      <FormField label="Recipient" htmlFor="ds-i-1" helper="Ethereum address or ENS">
        <Input id="ds-i-1" placeholder="0x…" />
      </FormField>
      <FormField label="Amount" htmlFor="ds-i-2" helper={<>Available: <span className="ds-mono-num">12.40</span></>}>
        <Input id="ds-i-2" placeholder="0.00" inputMode="decimal" suffix="ETH" />
      </FormField>
      <FormField label="Penalty" htmlFor="ds-i-3" error="Maximum penalty is 100%.">
        <Input id="ds-i-3" tone="danger" defaultValue="200" />
      </FormField>
      <FormField label="Reason" htmlFor="ds-i-4">
        <textarea id="ds-i-4" className="ds-textarea" placeholder="Justification for arbiter…" />
      </FormField>
      <FormField label="Disabled" htmlFor="ds-i-5" helper="Read-only until commitment matures.">
        <Input id="ds-i-5" disabled defaultValue="locked-value" />
      </FormField>
      <FormField label="URL" htmlFor="ds-i-6">
        <Input id="ds-i-6" prefix="ipfs://" placeholder="bafy…" />
      </FormField>
    </div>
  )
}

const ARBITER_OPTIONS = [
  { value: 'pellar', label: 'Pellar Labs' },
  { value: 'pinax', label: 'Pinax' },
  { value: 'service', label: 'Operator Service' },
]

function SelectsRow() {
  return (
    <div className="ds-stack ds-stack-3">
      <div className="ds-label">select · sizes · tone</div>
      <div className="ds-grid-3" style={{ alignItems: 'center' }}>
        <Select size="sm" aria-label="Arbiter (sm)" defaultValue="pellar" options={ARBITER_OPTIONS} />
        <Select aria-label="Arbiter (md)" defaultValue="pinax" options={ARBITER_OPTIONS} />
        <Select size="lg" aria-label="Arbiter (lg)" defaultValue="service" options={ARBITER_OPTIONS} />
      </div>
      <div className="ds-grid-3" style={{ alignItems: 'start' }}>
        <FormField label="Direction" htmlFor="ds-s-1">
          <Select
            id="ds-s-1"
            defaultValue="one-way"
            options={[
              { value: 'one-way', label: '→ one-way' },
              { value: 'paired', label: '↔ paired' },
            ]}
          />
        </FormField>
        <FormField label="Arbiter" htmlFor="ds-s-2" error="Choose who resolves forfeits.">
          <Select id="ds-s-2" tone="danger" placeholder="Select an arbiter" defaultValue="" options={ARBITER_OPTIONS} />
        </FormField>
        <FormField label="Disabled" htmlFor="ds-s-3" helper="Fixed once the commitment is live.">
          <Select id="ds-s-3" disabled defaultValue="pellar" options={ARBITER_OPTIONS} />
        </FormField>
      </div>
    </div>
  )
}

const SRC_BUTTONS =
  `<Button variant="primary">Deposit</Button>
<Button>Withdraw</Button>
<Button variant="ghost">Cancel</Button>
<Button variant="destructive">Forfeit</Button>
<Button size="sm" leadingIcon={<span className="ds-spinner" aria-hidden />}>Pending</Button>

// as= keeps button styling on a client-side route link.
<Button as={Link} to="/app/vaults" size="lg">Open vaults</Button>`

const SRC_INPUTS =
  `<FormField label="Recipient" htmlFor="addr" helper="Ethereum address or ENS">
  <Input id="addr" placeholder="0x…" />
</FormField>

<FormField label="Amount" htmlFor="amount" error={amountError}>
  <Input id="amount" inputMode="decimal" suffix="ETH" tone={amountError ? 'danger' : 'neutral'} />
</FormField>

<FormField label="Arbiter" htmlFor="arbiter">
  <Select id="arbiter" value={arbiter} onChange={(e) => setArbiter(e.target.value)} options={arbiters} />
</FormField>`

export function ButtonsSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="buttons"
        title="Buttons"
        lead="Primary fills with the accent. Secondary outlines. Ghost has no chrome. Destructive uses the danger tone. Small, base, large heights."
      />
      <ButtonsRow />
      <SourceBlock label="example" source={SRC_BUTTONS} />
    </section>
  )
}

export function InputsSection() {
  return (
    <section className="ds-stack ds-stack-6">
      <SectionHeading
        id="inputs"
        title="Inputs"
        lead="Borders only, no fills. Focus uses the accent ring. Affixes for units (ETH, ipfs://). Errors flash the border red and surface a helper line. Reach for `<FormField>` for the canonical label / control / helper / error stack — every governance and commitment form should compose this primitive instead of hand-rolling the field shape."
      />
      <InputsRow />
      <FormFieldDemo />
      <SelectsRow />
      <SourceBlock label="example" source={SRC_INPUTS} />
    </section>
  )
}
