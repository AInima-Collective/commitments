import { useState } from 'react'
import {
  Button,
  ErrorBlock,
  ErrorPanel,
  FormField,
  Input,
  Notice,
  SourceBlock,
  Toast,
  useToasts,
  type PushArgs,
} from '../../components/ui'
import { SectionHeading } from './SectionHeading'

// Notice (inline), Toast (transient overlay) and ErrorBlock (technical,
// copyable) share the icon · title · message · actions vocabulary.

// Each sample is pushed live by its trigger and rendered in place below it.
const TOAST_SAMPLES: Array<{ trigger: string; toast: PushArgs }> = [
  { trigger: 'Trigger info', toast: { tone: 'info', title: 'Refreshing balances', body: 'Reading on-chain state.' } },
  {
    trigger: 'Trigger success',
    toast: {
      tone: 'success',
      title: 'Stake released',
      body: '8.00 ETH returned to your vault balance.',
      actions: <Button size="sm">View tx</Button>,
    },
  },
  { trigger: 'Trigger warn', toast: { tone: 'warn', title: 'Network changed', body: 'Switched to Sepolia. Re-check your active commitments.' } },
  {
    trigger: 'Trigger error',
    toast: {
      tone: 'danger',
      title: 'Transaction reverted',
      body: 'ChallengeWindowTooShort — forfeit execution delay must be ≥ 1 day.',
    },
  },
]

function FragilePanel({ broken }: { broken: boolean }) {
  if (broken) throw new Error('Simulated render failure.')
  return <div className="ds-text-sm ds-muted">Positions render here while the subtree is healthy.</div>
}

function ErrorPanelDemo() {
  const [broken, setBroken] = useState(false)
  return (
    <div className="ds-stack ds-stack-3">
      <Button size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => setBroken((b) => !b)}>
        {broken ? 'Repair child' : 'Throw in child'}
      </Button>
      <div className="ds-card">
        <ErrorPanel panelName="vault positions">
          <FragilePanel broken={broken} />
        </ErrorPanel>
      </div>
    </div>
  )
}

function NotificationsShowcase() {
  const { push } = useToasts()
  const sampleErrorDetail = `ContractFunctionRevertedError: The contract function "proposeAgreement" reverted with the following reason:
ForfeitWindowTooShort(uint256 challengeWindow, uint256 minWindow)

Contract Call:
  address:   0x9f4Ec3CA88c8bC2c5BcD7c2cD0d4f87e1Fa2dE74
  function:  proposeAgreement(AgreementProposal proposal)
  args:                       ({ amount: 5000000000000000000n, ... })
  sender:    0x0123456789abcdef0123456789abcdef01234567

Docs: https://commitments.layer.xyz/docs/errors#ForfeitWindowTooShort
Version: viem@2.21.45`

  return (
    <div className="ds-stack ds-stack-8">
      {/* Inline notices */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">notice · inline · 4 tones</div>
        <div className="ds-stack ds-stack-3">
          <Notice tone="info" title="Indexer is catching up" onDismiss={() => {}}>
            New commitments may take up to 30 seconds to appear in this view.
          </Notice>
          <Notice
            tone="success"
            title="Commitment created"
            onDismiss={() => {}}
            actions={
              <>
                <Button size="sm">View on explorer</Button>
                <Button size="sm">Copy ID</Button>
              </>
            }
          >
            Commitment <code>#0042</code> is now active. The committer's shares remain locked until a valid release or terminal outcome.
          </Notice>
          <Notice tone="warn" title="Forfeit execution delay nearly elapsed" onDismiss={() => {}}>
            Commitment <code>#0039</code> may become executable in 14 minutes, subject to manager pause credit. The arbiter may still cancel if appropriate.
          </Notice>
          <Notice
            tone="danger"
            title="RPC request failed"
            onDismiss={() => {}}
            actions={
              <>
                <Button variant="primary" size="sm">Retry</Button>
                <Button size="sm">Switch RPC</Button>
              </>
            }
          >
            Couldn't reach the configured RPC endpoint. The node may be syncing or rate-limited.
          </Notice>
        </div>
        <div className="ds-text-xs ds-subtle">
          Inline notices live in flow next to the thing they describe. Persistent unless explicitly dismissed. The colored left border carries tone — fills are kept off so the notice doesn't shout louder than the content.
        </div>
      </div>

      {/* Toasts */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">toast · transient overlay</div>
        <div className="ds-row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {TOAST_SAMPLES.map((s) => (
            <Button key={s.trigger} size="sm" onClick={() => push(s.toast)}>
              {s.trigger}
            </Button>
          ))}
        </div>

        {/* Local region so the samples stack within the showcase frame, not the viewport */}
        <div
          style={{
            position: 'relative',
            border: 'var(--border-width) solid var(--border)',
            background: 'var(--surface-2)',
            padding: 'var(--space-3)',
            minHeight: 140,
          }}
        >
          <div className="ds-text-xs ds-subtle">Triggers push through useToasts() into the app's region, top-right. Auto-dismiss after 5s for non-errors; errors are sticky until dismissed; three stack at most.</div>
          <div className="ds-toast-region ds-toast-region--local" style={{ marginTop: 'var(--space-3)' }}>
            {TOAST_SAMPLES.map(({ trigger, toast }) => (
              <Toast key={trigger} tone={toast.tone} title={toast.title} actions={toast.actions} onDismiss={() => {}}>
                {toast.body}
              </Toast>
            ))}
          </div>
        </div>

        <div className="ds-text-xs ds-subtle" style={{ maxWidth: '70ch' }}>
          Position: <code>top-right</code> by default for desktop, <code>bottom-center</code> by convention on mobile. Errors are <em>sticky</em> — auto-dismiss is appropriate for confirmations, not for surfaces the user needs to read and act on. <code>aria-live="polite"</code> on the region announces non-error toasts; error toasts use <code>role="alert"</code> for immediate announcement.
        </div>
      </div>

      {/* Error block — copyable */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">error block · copyable technical detail</div>
        <ErrorBlock
          title="Transaction reverted"
          message={
            <>
              The contract rejected <code>proposeAgreement</code> with{' '}
              <code>ChallengeWindowTooShort</code>. The forfeit execution delay must be at least 1 day.
            </>
          }
          meta={[
            { label: 'tx', value: '0xa1b2…f7e3' },
            { label: 'block', value: '21,407,118' },
            { label: 'gas', value: '184,221' },
          ]}
          detail={sampleErrorDetail}
          actions={<Button variant="primary" size="sm">Retry</Button>}
        />
        <div className="ds-text-xs ds-subtle" style={{ maxWidth: '70ch' }}>
          The copy button surfaces the raw error string — including the contract function, args, sender, and viem version — so users can paste a full reproduction into a bug report without manual selection. The "Show details" disclosure keeps the error block compact by default; technical readers expand on demand.
        </div>
      </div>

      {/* Error panel — render-failure boundary */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">error panel · render-failure boundary</div>
        <ErrorPanelDemo />
        <div className="ds-text-xs ds-subtle" style={{ maxWidth: '70ch' }}>
          An error boundary around one panel. A throw anywhere below it renders the fallback with the panel's name instead of blanking the page; retry re-renders the children.
        </div>
      </div>

      {/* Inline form error reminder */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">inline form error · existing primitive</div>
        <div style={{ maxWidth: 360 }}>
          <FormField label="arbiter" htmlFor="ds-demo-arbiter">
            <Input
              id="ds-demo-arbiter"
              defaultValue="0xnotvalid"
              error="Not a valid Ethereum address — must be 0x-prefixed and 40 hex chars."
            />
          </FormField>
        </div>
        <div className="ds-text-xs ds-subtle">
          Inline field errors go through <code>Input</code>'s <code>error</code> prop, which sets <code>aria-invalid</code> and links the message with <code>aria-describedby</code>. They're the right shape for input validation; reach for <code>Notice</code> or <code>ErrorBlock</code> only when the error spans a panel or carries technical detail worth copying.
        </div>
      </div>

      {/* Decision matrix */}
      <div className="ds-stack ds-stack-3">
        <div className="ds-label">when to use which</div>
        <div className="ds-card">
          <table className="ds-table">
            <thead>
              <tr>
                <th>surface</th>
                <th>use when</th>
                <th>persistence</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>field-error</code></td>
                <td>input validation, scoped to one field</td>
                <td>until the field is corrected</td>
              </tr>
              <tr>
                <td><code>Notice</code></td>
                <td>state of a panel or section</td>
                <td>until dismissed</td>
              </tr>
              <tr>
                <td><code>Toast</code></td>
                <td>confirmation of a one-shot action</td>
                <td>~5s · errors sticky</td>
              </tr>
              <tr>
                <td><code>ErrorBlock</code></td>
                <td>technical errors worth copying</td>
                <td>until resolved</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const SRC_NOTIFICATIONS =
  `<Notice tone="warn" title="Forfeit execution delay nearly elapsed" onDismiss={dismiss}>
  Pause-adjusted execution may become available in 14 minutes.
</Notice>

// ToastProvider is mounted once at the root (main.tsx); pages only push.
const { push } = useToasts()
push({ tone: 'success', title: 'Stake released', body: '8.00 ETH returned.' })

<ErrorPanel panelName="vault positions">
  <PositionsTable />
</ErrorPanel>`

export function NotificationsSection() {
  return (
    <section className="ds-stack ds-stack-8">
      <SectionHeading
        id="notifications"
        title="Notifications & Errors"
        lead="Four surfaces for surfacing state changes, ordered by weight: inline field errors for input validation, Notice for panel-level state, Toast for transient confirmations, ErrorBlock for technical errors that deserve a copy button. They share the same icon · title · message · actions vocabulary so the brain learns one shape regardless of which surface raises."
      />
      <NotificationsShowcase />
      <SourceBlock label="example" source={SRC_NOTIFICATIONS} />
    </section>
  )
}
