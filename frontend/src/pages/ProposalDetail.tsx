import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Address, Hex } from 'viem'

import {
  AddressDisplay,
  Button,
  Card,
  DataTable,
  Disclosure,
  EmptyState,
  Notice,
  QuorumMeter,
  StatBlock,
  VoteTallyBar,
  type DataTableColumn,
} from '../components/ui'
import {
  PageHeader,
  ProposalActionRow,
  ProposalKindBadge,
  ProposalStateBadge,
  ProposalTimeline,
  SupportBadge,
  type ProposalKind,
  type ProposalState,
  type VoteSupport,
} from '../components/protocol'
import { CastVoteCluster } from '../components/governance/forms/CastVoteCluster'
import { hasIndexer } from '../config/indexer'
import {
  useExecuteProposal,
  useQueueProposal,
  type ProposalActionsArgs,
} from '../hooks/useGovernorActions'
import { useGovernor } from '../hooks/useGovernor'
import { useNowSeconds } from '../hooks/useNow'
import { useProposal, type VotePayload } from '../hooks/useProposal'
import { proposalTitle } from '../lib/governance'
import { humanizeError, humanizeStep } from '../components/governance/forms/lib'
import { Countdown } from '../components/protocol/Countdown'

const VOTE_COLUMNS: DataTableColumn<VotePayload>[] = [
  {
    id: 'voter',
    header: 'Voter',
    render: (v) => <AddressDisplay address={v.voter} compact />,
  },
  {
    id: 'support',
    header: 'Vote',
    render: (v) => <SupportBadge support={v.support as VoteSupport} />,
    width: '120px',
  },
  {
    id: 'weight',
    header: 'Weight',
    align: 'right',
    render: (v) => {
      const big = BigInt(v.weight)
      const wholes = big / 10n ** 18n
      return <span className="ds-mono-num">{wholes.toString()}</span>
    },
  },
  {
    id: 'reason',
    header: 'Reason',
    render: (v) => v.reason || <span className="ds-subtle">—</span>,
  },
]

export default function ProposalDetail() {
  const params = useParams<{ governor: string; id: string }>()
  const govAddress = params.governor as Hex | undefined
  const proposalId = params.id

  const { data, isLoading, error } = useProposal(govAddress, proposalId)
  const { data: governor } = useGovernor(govAddress)

  const tally = useMemo(() => {
    if (!data) return null
    return {
      forVotes: BigInt(data.proposal.forVotes),
      againstVotes: BigInt(data.proposal.againstVotes),
      abstainVotes: BigInt(data.proposal.abstainVotes),
      quorum: data.proposal.quorumAtSnapshot ? BigInt(data.proposal.quorumAtSnapshot) : null,
    }
  }, [data])

  if (!hasIndexer) {
    return (
      <div className="ds-page">
        <PageHeader eyebrow="governance" title="Proposal" />
        <Notice tone="info">
          Indexer not configured. Set <code>VITE_INDEXER_URL</code> to see proposal data.
        </Notice>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="ds-page">
        <PageHeader eyebrow="governance" title="Proposal" />
        <Card>
          <div className="ds-subtle">Loading proposal…</div>
        </Card>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="ds-page">
        <PageHeader eyebrow="governance" title="Proposal" />
        <EmptyState
          title="Proposal not found"
          description={error ? String((error as Error).message) : 'No proposal at that id.'}
        />
      </div>
    )
  }

  const p = data.proposal
  const title = proposalTitle(p.description) || `#${p.proposalId}`

  const actionsArgs: ProposalActionsArgs = {
    targets: data.actions.map((a) => a.target as Address),
    values: data.actions.map((a) => BigInt(a.value)),
    calldatas: data.actions.map((a) => a.calldata as Hex),
    description: p.description,
  }

  const shim = governor?.shim

  return (
    <div className="ds-page">
      <PageHeader
        eyebrow={
          <span className="ds-row" style={{ gap: 8, alignItems: 'baseline' }}>
            <Link to={`/app/governance/${p.governor}`} className="ds-link">
              governor
            </Link>
            <span>·</span>
            <span>#{p.proposalId}</span>
            <ProposalKindBadge kind={p.kind} />
          </span>
        }
        title={title}
        lead={<ProposalStateBadge state={p.state} />}
      />

      <div
        className="ds-grid"
        style={{
          gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 2fr)',
          gap: 'var(--space-4)',
          alignItems: 'start',
        }}
      >
        {/* LEFT — tally + timeline + proposer */}
        <div className="ds-stack ds-stack-3">
          <Card>
            <div className="ds-stack ds-stack-3">
              <div className="ds-text-sm ds-muted">Tally</div>
              {tally && (
                <VoteTallyBar
                  forVotes={tally.forVotes}
                  againstVotes={tally.againstVotes}
                  abstainVotes={tally.abstainVotes}
                  // Voting power is a dimensionless multi-denom weighted sum
                  // (TokenWeighting: Σ stake × weightBps / BPS across denoms of
                  // differing decimals), so there's no canonical scale — render
                  // the raw weighted units, compacted (e.g. 6.45B vp).
                  decimals={0}
                  compact
                />
              )}
              {tally?.quorum != null && (
                <QuorumMeter
                  progress={tally.forVotes + tally.abstainVotes}
                  target={tally.quorum}
                  decimals={0}
                />
              )}
              <div className="ds-row" style={{ gap: 'var(--space-3)' }}>
                <StatBlock label="Voters" value={String(data.votes.length)} />
                <StatBlock label="Vote start" value={`block ${p.voteStart}`} />
                <StatBlock label="Vote end" value={`block ${p.voteEnd}`} />
              </div>
            </div>
          </Card>

          <Card>
            <div className="ds-stack ds-stack-2">
              <div className="ds-text-sm ds-muted">Lifecycle</div>
              <ProposalTimeline state={p.state as ProposalState} />
            </div>
          </Card>

          <ProposalActionPanel
            governor={p.governor as Address}
            proposalId={p.proposalId}
            state={p.state as ProposalState}
            kind={p.kind as ProposalKind}
            actionsArgs={actionsArgs}
            shim={shim}
            eta={p.eta}
            timelockMinDelay={governor?.timelockMinDelay}
          />

          <Card>
            <div className="ds-stack ds-stack-2">
              <div className="ds-text-sm ds-muted">Proposer</div>
              <AddressDisplay address={p.proposer} />
            </div>
          </Card>
        </div>

        {/* RIGHT — actions + description + voters */}
        <div className="ds-stack ds-stack-3">
          {p.kind === 'signaling' ? null : (
            <Card>
              <div className="ds-stack ds-stack-3">
                <div className="ds-text-sm ds-muted">Actions</div>
                {data.actions.map((a) => (
                  <ProposalActionRow
                    key={a.index}
                    index={a.index}
                    target={a.target}
                    value={BigInt(a.value)}
                    calldata={a.calldata}
                    kind={a.kind as ProposalKind}
                    decoded={a.decoded}
                  />
                ))}
              </div>
            </Card>
          )}

          <Card>
            <div className="ds-stack ds-stack-2">
              <div className="ds-text-sm ds-muted">Description</div>
              <pre
                className="ds-mono-num"
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  background: 'var(--surface-2)',
                  padding: 'var(--space-3)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  fontSize: 'var(--text-sm)',
                  margin: 0,
                }}
              >
                {p.description}
              </pre>
            </div>
          </Card>

          <Disclosure label={`${data.votes.length} votes`}>
            {data.votes.length === 0 ? (
              <EmptyState title="No votes yet" description="Cast a vote to be the first." />
            ) : (
              <DataTable
                columns={VOTE_COLUMNS}
                rows={data.votes}
                getRowKey={(v) => `${v.voter}-${v.txHash}`}
              />
            )}
          </Disclosure>
        </div>
      </div>
    </div>
  )
}

interface ProposalActionPanelProps {
  governor: Address
  proposalId: string
  state: ProposalState
  kind: ProposalKind
  actionsArgs: ProposalActionsArgs
  shim?: Hex
  /** UNIX seconds at which the timelock will release the queued action.
   *  `null` when the proposal hasn't been queued yet. */
  eta?: string | null
  /** Timelock minimum delay in seconds — used to size the countdown bar. */
  timelockMinDelay?: string
}

/**
 * Action surface — picks the right write button based on the proposal's
 * current state. `active` shows the cast-vote cluster; `succeeded` shows
 * Queue; `queued` shows Execute. Terminal states surface nothing.
 *
 * Signaling proposals are off-chain endorsements with no executable action,
 * so once they pass we surface a "passed" notice instead of Queue / Execute.
 * The on-chain queue + execute steps still work (the calldata is empty so
 * execution is a no-op) — they just aren't offered as user-facing actions.
 */
function ProposalActionPanel({
  governor,
  proposalId,
  state,
  kind,
  actionsArgs,
  shim,
  eta,
  timelockMinDelay,
}: ProposalActionPanelProps) {
  const queueFlow = useQueueProposal(governor)
  const executeFlow = useExecuteProposal(governor)
  const nowSec = useNowSeconds()

  if (state === 'active') {
    return (
      <Card>
        <div className="ds-stack ds-stack-2">
          <div className="ds-text-sm ds-muted">Cast vote</div>
          <CastVoteCluster governor={governor} proposalId={proposalId} shim={shim} />
        </div>
      </Card>
    )
  }

  if (kind === 'signaling' && (state === 'succeeded' || state === 'queued')) {
    return (
      <Card>
        <div className="ds-stack ds-stack-2">
          <div className="ds-text-sm ds-muted">Result</div>
          <Notice tone="success">
            Signal passed. Signaling proposals don't execute on-chain — the description
            is the outcome.
          </Notice>
        </div>
      </Card>
    )
  }

  if (state === 'succeeded') {
    const inFlight = queueFlow.step === 'signing' || queueFlow.step === 'confirming'
    return (
      <Card>
        <div className="ds-stack ds-stack-2">
          <div className="ds-text-sm ds-muted">Queue</div>
          <Button
            type="button"
            variant="primary"
            disabled={inFlight || queueFlow.step === 'confirmed'}
            onClick={() => queueFlow.queue(actionsArgs)}
          >
            {queueFlow.step === 'idle' ? 'Queue in Timelock' : humanizeStep(queueFlow.step)}
          </Button>
          {queueFlow.step === 'error' && queueFlow.error && (
            <Notice tone="danger">{humanizeError('queue', queueFlow.error)}</Notice>
          )}
          {queueFlow.step === 'confirmed' && <Notice tone="success">Proposal queued.</Notice>}
        </div>
      </Card>
    )
  }

  if (state === 'queued') {
    const etaSec = eta ? Number(eta) : null
    const totalDelay = timelockMinDelay ? Number(timelockMinDelay) : 0
    const elapsed = etaSec != null ? Math.max(0, Number(nowSec) - (etaSec - totalDelay)) : 0
    const ready = etaSec != null ? Number(nowSec) >= etaSec : false
    const inFlight = executeFlow.step === 'signing' || executeFlow.step === 'confirming'
    return (
      <Card>
        <div className="ds-stack ds-stack-2">
          <div className="ds-text-sm ds-muted">Execute</div>
          {etaSec != null && totalDelay > 0 && !ready && (
            <Countdown
              label="Timelock delay"
              elapsed={elapsed}
              total={totalDelay}
              tone={ready ? 'success' : 'warn'}
            />
          )}
          <Button
            type="button"
            variant="primary"
            disabled={inFlight || executeFlow.step === 'confirmed' || (!ready && etaSec != null)}
            onClick={() => executeFlow.execute(actionsArgs)}
          >
            {executeFlow.step === 'idle'
              ? ready || etaSec == null
                ? 'Execute'
                : 'Execute (waiting on timelock)'
              : humanizeStep(executeFlow.step)}
          </Button>
          {executeFlow.step === 'error' && executeFlow.error && (
            <Notice tone="danger">{humanizeError('execute', executeFlow.error)}</Notice>
          )}
          {executeFlow.step === 'confirmed' && <Notice tone="success">Proposal executed.</Notice>}
        </div>
      </Card>
    )
  }

  return null
}
