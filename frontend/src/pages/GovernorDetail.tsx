import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Hex } from 'viem'

import {
  AddressDisplay,
  Button,
  Card,
  DataTable,
  Disclosure,
  EmptyState,
  Notice,
  StatBlock,
  Tabs,
  type DataTableColumn,
} from '../components/ui'
import {
  PageHeader,
  ProposalKindBadge,
  ProposalStateBadge,
} from '../components/protocol'
import { hasIndexer } from '../config/indexer'
import { useGovernor, type ProposalRow } from '../hooks/useGovernor'
import { useVotingPower } from '../hooks/useVotingPower'
import {
  compareProposalsForDisplay,
  proposalTitle,
} from '../lib/governance'

const COLUMNS: DataTableColumn<ProposalRow>[] = [
  {
    id: 'state',
    header: 'State',
    render: (row) => <ProposalStateBadge state={row.state} />,
    width: '120px',
  },
  {
    id: 'kind',
    header: 'Kind',
    render: (row) => <ProposalKindBadge kind={row.kind} />,
    width: '120px',
  },
  {
    id: 'title',
    header: 'Title',
    render: (row) => (
      <span className="ds-link">{proposalTitle(row.description) || `#${row.proposalId}`}</span>
    ),
  },
  {
    id: 'proposer',
    header: 'Proposer',
    render: (row) => <AddressDisplay address={row.proposer} compact />,
  },
  {
    id: 'tally',
    header: 'For / Against / Abstain',
    align: 'right',
    render: (row) => (
      <span className="ds-mono-num">
        {summariseVotes(row.forVotes)} / {summariseVotes(row.againstVotes)} /{' '}
        {summariseVotes(row.abstainVotes)}
      </span>
    ),
  },
]

function summariseVotes(weight: string): string {
  // Voting power is denominated in the underlying TokenWeighting units (1e18
  // for the canonical setup). Round to 2 sig figs for the table; the detail
  // page shows the canonical value via VoteTallyBar.
  const big = BigInt(weight)
  if (big === 0n) return '0'
  const wholes = big / 10n ** 18n
  if (wholes === 0n) return '<1'
  return wholes.toString()
}

function formatVotes(raw: bigint | undefined): string {
  if (raw === undefined) return '—'
  if (raw === 0n) return '0'
  const wholes = raw / 10n ** 18n
  if (wholes === 0n) return '<1'
  return wholes.toString()
}

export default function GovernorDetail() {
  const params = useParams<{ governor: string }>()
  const govAddress = params.governor as Hex | undefined
  const navigate = useNavigate()
  const { data, isLoading, error } = useGovernor(govAddress)
  const votes = useVotingPower(data?.shim)

  const openProposal = (row: ProposalRow) => {
    navigate(`/app/governance/${row.governor}/${row.proposalId}`)
  }

  const recent = useMemo(() => {
    const rows = data?.recentProposals ?? []
    return [...rows].sort(compareProposalsForDisplay)
  }, [data])

  const proposalCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of recent) counts[p.state] = (counts[p.state] ?? 0) + 1
    return counts
  }, [recent])

  if (!hasIndexer) {
    return (
      <div className="ds-page">
        <PageHeader eyebrow="governance" title="DAO" />
        <Notice tone="info">
          Indexer not configured. Set <code>VITE_INDEXER_URL</code> to see live data.
        </Notice>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="ds-page">
        <PageHeader eyebrow="governance" title="DAO" />
        <Card>
          <div className="ds-subtle">Loading governor…</div>
        </Card>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="ds-page">
        <PageHeader eyebrow="governance" title="DAO" />
        <EmptyState
          title="Governor not found"
          description={error ? String((error as Error).message) : 'No governor at that address.'}
        />
      </div>
    )
  }

  return (
    <div className="ds-page">
      <PageHeader
        eyebrow={data.isCanonical ? 'governance · canonical DAO' : 'governance · governor'}
        title={data.name || 'Unnamed DAO'}
        lead={<AddressDisplay address={data.address} />}
        actions={
          <Button as={Link} to={`/app/governance/${data.address}/new`}>
            Propose
          </Button>
        }
      />

      <Card>
        <div className="ds-stat-grid">
          <StatBlock
            label="Your voting power"
            value={
              votes.account === undefined
                ? <span className="ds-subtle">connect wallet</span>
                : votes.isLoading
                  ? '—'
                  : formatVotes(votes.power)
            }
            tone={votes.power && votes.power > 0n ? 'accent' : 'neutral'}
            meta={
              votes.account
                ? <AddressDisplay address={votes.account} compact />
                : undefined
            }
          />
          <StatBlock
            label="Active proposals"
            value={String((proposalCounts.active ?? 0) + (proposalCounts.pending ?? 0) + (proposalCounts.queued ?? 0))}
          />
          <StatBlock label="Quorum" value={`${data.quorumNumerator} / ${data.quorumDenominator}`} />
          <StatBlock label="Voting period" value={`${data.votingPeriod} blocks`} />
          <StatBlock label="Voting delay" value={`${data.votingDelay} blocks`} />
          <StatBlock label="Proposal threshold" value={data.proposalThreshold} />
          <StatBlock label="Timelock delay" value={`${data.timelockMinDelay}s`} />
          <StatBlock
            label="Voting power source"
            value={<AddressDisplay address={data.votingPowerSource} compact />}
          />
        </div>
      </Card>

      <Tabs defaultValue="active">
        <Tabs.List>
          <Tabs.Trigger value="active">Active</Tabs.Trigger>
          <Tabs.Trigger value="all">All</Tabs.Trigger>
          <Tabs.Trigger value="parameters">Parameters</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Panel value="active">
          {recent.filter((p) => p.state === 'active' || p.state === 'pending' || p.state === 'queued').length === 0 ? (
            <EmptyState title="No active proposals" description="Be the first to propose." />
          ) : (
            <Card>
              <DataTable
                columns={COLUMNS}
                rows={recent.filter(
                  (p) => p.state === 'active' || p.state === 'pending' || p.state === 'queued',
                )}
                getRowKey={(r) => r.id}
                onRowClick={openProposal}
              />
            </Card>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="all">
          {recent.length === 0 ? (
            <EmptyState title="No proposals yet" description="Be the first to propose." />
          ) : (
            <Card>
              <DataTable
                columns={COLUMNS}
                rows={recent}
                getRowKey={(r) => r.id}
                onRowClick={openProposal}
              />
            </Card>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="parameters">
          <div className="ds-stack ds-stack-3">
            <Disclosure label="Voting math">
              <div className="ds-stack ds-stack-2">
                <div>
                  Quorum is computed as <code>quorumNumerator / quorumDenominator</code> of the
                  total voting power at the proposal's snapshot block.
                </div>
                <div>
                  Counting follows OZ Governor's <code>CountingSimple</code>: For / Against /
                  Abstain. For + Abstain count toward quorum; majority requires For &gt; Against.
                </div>
              </div>
            </Disclosure>
            <Disclosure label="Linked contracts">
              <div className="ds-stack ds-stack-2">
                <div>
                  <span className="ds-subtle">Timelock: </span>
                  <AddressDisplay address={data.timelock} compact />
                </div>
                <div>
                  <span className="ds-subtle">Votes shim: </span>
                  <AddressDisplay address={data.shim} compact />
                </div>
                <div>
                  <span className="ds-subtle">Voting power source: </span>
                  <AddressDisplay address={data.votingPowerSource} compact />
                </div>
                <div>
                  <span className="ds-subtle">Factory: </span>
                  <AddressDisplay address={data.factory} compact />
                </div>
              </div>
            </Disclosure>
          </div>
        </Tabs.Panel>
      </Tabs>
    </div>
  )
}
