import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { Address, Hex } from 'viem'

import { Button, Card, EmptyState, Notice } from '../components/ui'
import { PageHeader } from '../components/protocol'
import { hasIndexer } from '../config/indexer'
import { useGovernor } from '../hooks/useGovernor'
import { RawProposalForm } from '../components/governance/forms/RawProposalForm'
import { SignalingForm } from '../components/governance/forms/SignalingForm'
import { ForfeitArbitrationForm } from '../components/governance/forms/ForfeitArbitrationForm'
import { WeightUpdateForm } from '../components/governance/forms/WeightUpdateForm'

type Template = 'weight_update' | 'forfeit_arbitration' | 'signaling' | 'raw'

const TEMPLATES: Template[] = ['weight_update', 'forfeit_arbitration', 'signaling', 'raw']

interface TemplateMeta {
  key: Template
  group: string
  label: string
  short: string
  description: string
}

/**
 * Picker model — grouped so it scales as new templates land. To add a
 * template: append a TemplateMeta entry, add the matching key to TEMPLATES
 * + the renderTemplateForm switch below. The group order here is the
 * render order on the picker page.
 */
const TEMPLATE_META: Record<Template, TemplateMeta> = {
  signaling: {
    key: 'signaling',
    group: 'Voice',
    label: 'Signal',
    short: 'Off-chain signal — no execution.',
    description:
      'Executes a no-op call to the Timelock; only the description is stored on-chain. Use for endorsements, surveys, and policy notes.',
  },
  weight_update: {
    key: 'weight_update',
    group: 'Mesh & weighting',
    label: 'Weight update',
    short: 'Adjust how a TokenWeighting node converts a denom into voting power.',
    description:
      'Calls TokenWeighting.updateWeight(denom, newBps) on the target mesh node. Executes through the Timelock as the node\'s governance. The DAO must already hold governance on the target node.',
  },
  forfeit_arbitration: {
    key: 'forfeit_arbitration',
    group: 'Forfeit arbitration',
    label: 'Forfeit',
    short: 'Initiate or cancel a two-phase forfeit on a commitment whose arbiter is the DAO.',
    description:
      'Calls CommitmentManager.initiateForfeit or cancelForfeit. The form pre-flights the commitment\'s arbiter so you don\'t pay gas on a guaranteed revert.',
  },
  raw: {
    key: 'raw',
    group: 'Escape hatch',
    label: 'Raw',
    short: 'Any action the curated templates don\'t cover.',
    description:
      'Provide target / value / calldata directly. Use for treasury transfers, contract upgrades, parameter tweaks on contracts the DAO controls.',
  },
}

const GROUP_ORDER: string[] = ['Voice', 'Mesh & weighting', 'Forfeit arbitration', 'Escape hatch']

function isTemplate(value: string | null): value is Template {
  return TEMPLATES.includes(value as Template)
}

export default function CreateProposal() {
  const params = useParams<{ governor: string }>()
  const govAddress = params.governor as Address | undefined
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const templateParam = searchParams.get('template')
  const template: Template | null = isTemplate(templateParam) ? templateParam : null

  function setTemplate(next: Template | null) {
    const sp = new URLSearchParams(searchParams)
    if (next === null) sp.delete('template')
    else sp.set('template', next)
    setSearchParams(sp, { replace: true })
  }

  const { data, isLoading, error } = useGovernor(govAddress)

  if (!hasIndexer) {
    return (
      <div className="ds-page">
        <PageHeader eyebrow="governance" title="New proposal" />
        <Notice tone="info">
          Indexer not configured. Set <code>VITE_INDEXER_URL</code> to load governor parameters.
        </Notice>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="ds-page">
        <PageHeader eyebrow="governance" title="New proposal" />
        <Card>
          <div className="ds-subtle">Loading governor…</div>
        </Card>
      </div>
    )
  }

  if (error || !data || !govAddress) {
    return (
      <div className="ds-page">
        <PageHeader eyebrow="governance" title="New proposal" />
        <EmptyState
          title="Governor not found"
          description={error ? String((error as Error).message) : 'No governor at that address.'}
        />
      </div>
    )
  }

  const onSuccess = (proposalId?: string) => {
    navigate(proposalId ? `/app/governance/${govAddress}/${proposalId}` : `/app/governance/${govAddress}`)
  }

  // Step 1 — template picker
  if (template === null) {
    const groups = GROUP_ORDER.map((group) => ({
      group,
      items: TEMPLATES.map((t) => TEMPLATE_META[t]).filter((m) => m.group === group),
    })).filter((g) => g.items.length > 0)

    return (
      <div className="ds-page">
        <PageHeader
          eyebrow={`governance · ${data.name || 'DAO'}`}
          title="New proposal"
          lead="Pick what this proposal does. Successful proposals execute via the Timelock after the voting period."
          actions={
            <Button as={Link} to={`/app/governance/${govAddress}`} variant="ghost">
              Cancel
            </Button>
          }
        />

        <div className="ds-stack ds-stack-4">
          {groups.map(({ group, items }) => (
            <section key={group} className="ds-stack ds-stack-2">
              <div className="ds-section-eyebrow">{group}</div>
              <div className="ds-grid-auto-fit">
                {items.map((item) => (
                  <Card
                    key={item.key}
                    as="button"
                    type="button"
                    onClick={() => setTemplate(item.key)}
                    aria-label={`Use the ${item.label} template`}
                  >
                    <div className="ds-stack ds-stack-2" style={{ textAlign: 'left' }}>
                      <div className="ds-text-base" style={{ fontWeight: 600 }}>
                        {item.label}
                      </div>
                      <div className="ds-subtle ds-text-sm">{item.short}</div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    )
  }

  // Step 2 — selected template form
  const meta = TEMPLATE_META[template]

  return (
    <div className="ds-page">
      <PageHeader
        eyebrow={`governance · ${data.name || 'DAO'} · ${meta.group}`}
        title={`New proposal · ${meta.label}`}
        lead={meta.description}
        actions={
          <Button type="button" variant="ghost" onClick={() => setTemplate(null)}>
            ← Change template
          </Button>
        }
      />

      <Card>
        {template === 'weight_update' && (
          <WeightUpdateForm
            governor={govAddress}
            defaultNode={(searchParams.get('node') as Address | null) ?? undefined}
            defaultDenom={(searchParams.get('denom') as Hex | null) ?? undefined}
            defaultNewBps={searchParams.get('newBps') ?? undefined}
            onSuccess={onSuccess}
          />
        )}
        {template === 'forfeit_arbitration' && (
          <ForfeitArbitrationForm
            governor={govAddress}
            timelock={data.timelock}
            defaultManager={(searchParams.get('manager') as Address | null) ?? undefined}
            defaultCommitmentId={searchParams.get('commitmentId') ?? undefined}
            defaultPenaltyBps={searchParams.get('penaltyBps') ?? undefined}
            defaultOp={
              searchParams.get('op') === 'cancelForfeit'
                ? 'cancelForfeit'
                : searchParams.get('op') === 'initiateForfeit'
                  ? 'initiateForfeit'
                  : undefined
            }
            onSuccess={onSuccess}
          />
        )}
        {template === 'signaling' && (
          <SignalingForm governor={govAddress} timelock={data.timelock} onSuccess={onSuccess} />
        )}
        {template === 'raw' && <RawProposalForm governor={govAddress} onSuccess={onSuccess} />}
      </Card>
    </div>
  )
}
