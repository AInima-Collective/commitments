import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useChainId } from 'wagmi'
import { isAddress, type Address } from 'viem'

import { CommitmentsGraph } from '../components/graph/CommitmentsGraph'
import { CommitmentsSankey } from '../components/graph/CommitmentsSankey'
import { EntityBrowser } from '../components/explorer/EntityBrowser'
import {
  AddressDisplay,
  Button,
  EmptyState,
  EntityCard,
  Input,
  MediaRow,
  Notice,
  StatBlock,
  TokenAmount,
  ViewToggle,
} from '../components/ui'
import { PageHeader } from '../components/protocol'
import { ActivityFeed, type ActivityEvent } from '../components/protocol/ActivityFeed'
import { getContractAddresses, getVaultRegistry } from '../config/contracts'
import { useNowSeconds } from '../hooks/useNow'
import { useVaultStats } from '../hooks/useVaultStats'
import { useOperatorsIndexed } from '../hooks/useOperatorsIndexed'
import { useServiceOperators } from '../hooks/useServiceOperators'
import { useProtocolStats } from '../hooks/useProtocolStats'
import { useProtocolAgreements } from '../hooks/useProtocolAgreements'
import {
  useProtocolLeaderboards,
  type OperatorLeaderboardRow,
  type PartyLeaderboardRow,
} from '../hooks/useProtocolLeaderboards'
import { useProtocolArbitersList, useProtocolCommitmentsList } from '../hooks/useProtocolEntityList'
import { useTokenMetaMap } from '../hooks/useTokenMeta'
import { deriveOperatorStatus } from '../utils/mesh'
import type { OperatorsGraphPayload } from '../lib/graph/types'
import { arbiterProfilePath } from '../lib/arbitrationRoutes'

type GraphMode = 'agreements' | 'operators' | 'flow'

const VIEW_OPTIONS = [
  { id: 'agreements', label: 'commitments' },
  { id: 'operators', label: 'operators' },
  { id: 'flow', label: 'flow' },
] as const

/**
 * /explorer — protocol-wide overview. Hero is the existing CommitmentsGraph
 * fed unscoped data via four ViewToggle modes. Below the graph: an
 * Etherscan-style EntityBrowser with sortable tables for vaults, commitments,
 * agreements, and operators. KPI strip up top is sourced from the
 * /protocol/stats endpoint plus on-chain TVL via useVaultStats.
 *
 * Search bar accepts:
 *   - 0x-address → highlights node in the active graph
 *   - numeric id → navigates to /commitments/:id
 */
export default function Explorer() {
  const chainId = useChainId()
  const navigate = useNavigate()

  const { stakeRegistry: stakeRegistryAddress } = getContractAddresses(chainId)
  const vaults = useMemo(() => getVaultRegistry(chainId), [chainId])
  const primaryVault = vaults[0]?.address

  const stats = useProtocolStats()
  const agreementsPayload = useProtocolAgreements({ limit: 500 })

  // Operators graph mirrors the Mesh page's Operators tab so the visual is
  // identical regardless of where the user lands first.
  const indexed = useOperatorsIndexed()
  const operatorAddresses = indexed.operators.map((op) => op.address as Address)
  const service = useServiceOperators({
    stakeRegistryAddress,
    operatorAddresses,
  })

  const operatorsPayload = useMemo<OperatorsGraphPayload | undefined>(() => {
    if (!stakeRegistryAddress || indexed.operators.length === 0) return undefined
    const serviceByAddr = new Map(
      service.serviceOperators.map((w) => [w.address.toLowerCase(), w]),
    )
    return {
      service: { address: stakeRegistryAddress, totalPower: service.totalPower },
      operators: indexed.operators.map((op) => {
        const w = serviceByAddr.get(op.address.toLowerCase())
        return {
          address: op.address,
          registeredInService: w?.registeredInService ?? false,
          votingPower: w?.votingPower ?? 0n,
          status: deriveOperatorStatus(op),
        }
      }),
    }
  }, [stakeRegistryAddress, indexed.operators, service.serviceOperators, service.totalPower])

  const vaultStats = useVaultStats(primaryVault)

  // Flow (Sankey) view aggregates the protocol-wide commitment list client-side.
  const flowCommitments = useProtocolCommitmentsList({ limit: 500 })

  const [mode, setMode] = useState<GraphMode>('agreements')
  const [search, setSearch] = useState('')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)
  const [searchedAddress, setSearchedAddress] = useState<string | null>(null)
  const arbiterSearch = useProtocolArbitersList({
    address: searchedAddress ?? undefined,
    limit: 1,
    enabled: searchedAddress !== null,
  })

  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = search.trim()
    if (!trimmed) return
    if (/^\d+$/.test(trimmed)) {
      navigate(`/app/commitments/${trimmed}`, {
        state: { commitmentOrigin: 'explorer' },
      })
      setSearchError(null)
      return
    }
    if (isAddress(trimmed)) {
      setSelectedAddress(trimmed.toLowerCase())
      setSearchedAddress(trimmed.toLowerCase())
      setSearchError(null)
      return
    }
    setSearchError('Enter a 0x-address or numeric commitment id.')
  }

  const activePayload = useMemo(() => {
    if (mode === 'operators') return operatorsPayload
    return agreementsPayload.data
  }, [mode, agreementsPayload.data, operatorsPayload])

  const activeIsLoading = useMemo(() => {
    if (mode === 'operators') return indexed.isLoading || service.isLoading
    return agreementsPayload.isLoading
  }, [mode, agreementsPayload.isLoading, indexed.isLoading, service.isLoading])

  const activeError = useMemo(() => {
    if (mode === 'operators') return undefined
    return agreementsPayload.error
  }, [mode, agreementsPayload.error])

  return (
    <div className="ds-page">
      <PageHeader
        eyebrow="protocol"
        title="Explorer"
        lead="Live view of every vault, commitment, agreement, and mesh node. Search any address or id, drill into the graph, and browse entity tables below."
        actions={
          <form onSubmit={handleSearch} className="ds-row ds-row-2" role="search">
            <Input
              size="sm"
              placeholder="0x… or commitment id"
              aria-label="Search address or commitment id"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                if (searchError) setSearchError(null)
              }}
              error={searchError ?? undefined}
              prefix={<span aria-hidden>⌕</span>}
            />
            <Button type="submit" variant="primary" size="sm">
              Search
            </Button>
          </form>
        }
      />

      {searchedAddress && !arbiterSearch.isLoading && arbiterSearch.rows.length > 0 && (
        <Notice
          tone="info"
          title="Address is used as an arbiter"
          actions={
            <Link className="ds-btn ds-btn--sm" to={arbiterProfilePath(searchedAddress as Address)}>
              View arbiter profile
            </Link>
          }
        >
          This result comes from the protocol-wide arbiter directory and does not depend on the address being a node in the selected graph mode.
        </Notice>
      )}

      <section className="ds-stat-grid" aria-label="Protocol summary">
        <StatBlock
          label="TVL"
          value={
            primaryVault && vaultStats.totalAssets !== undefined ? (
              <TokenAmount amount={vaultStats.totalAssets} decimals={6} symbol="USDC" compact />
            ) : (
              '—'
            )
          }
        />
        <StatBlock
          label="Active commitments"
          value={stats.data ? String(stats.data.commitments.active) : '—'}
        />
        <StatBlock
          label="Operators"
          value={stats.data ? String(stats.data.operators.registered) : '—'}
        />
      </section>

      {!stats.data && stats.error !== null && (
        <Notice tone="warn" size="sm">
          Live data is temporarily unavailable — KPIs and graph will populate once the connection is restored. Please retry shortly.
        </Notice>
      )}

      <section className="ds-stack ds-stack-3">
        <header className="ds-section-header">
          <h2 className="ds-section-title">Network</h2>
          <span className="ds-section-eyebrow">protocol-wide graph · click a node to filter the browser below</span>
        </header>

        <ViewToggle
          aria-label="Graph mode"
          value={mode}
          onChange={(next) => {
            setMode(next as GraphMode)
            setSelectedAddress(null)
          }}
          options={VIEW_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
          size="sm"
        />

        <div
          className="ds-row ds-row-3"
          style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}
        >
          <div style={{ flex: '2 1 480px', minWidth: 0 }}>
            {mode === 'flow' ? (
              <CommitmentsSankey
                commitments={flowCommitments.rows}
                isLoading={flowCommitments.isLoading}
                error={flowCommitments.error}
              />
            ) : (
              <CommitmentsGraph
                mode={mode}
                payload={activePayload}
                isLoading={activeIsLoading}
                error={activeError}
                selectedNodeId={selectedAddress}
                onNodeSelect={setSelectedAddress}
              />
            )}
          </div>
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <Leaderboards selectedAddress={selectedAddress} mode={mode} />
          </div>
        </div>
      </section>

      <EntityBrowser
        filterAddress={selectedAddress}
        onClearFilter={() => setSelectedAddress(null)}
      />

      <RecentActivity />
    </div>
  )
}

/**
 * Right-rail leaderboards. When a node is selected, the graph's built-in
 * `NodeDetailPanel` covers the detail role and we just show a hint here.
 * Otherwise: three EntityCards (one per metric) with `MediaRow`s inside.
 */
function Leaderboards({
  selectedAddress,
  mode,
}: {
  selectedAddress: string | null
  mode: GraphMode
}) {
  const counterparties = useProtocolLeaderboards('counterparty', 5)
  const operators = useProtocolLeaderboards('operator', 5)
  const arbiters = useProtocolLeaderboards('arbiter', 5)

  if (selectedAddress) {
    return (
      <Notice tone="info" size="sm">
        Selected{' '}
        <AddressDisplay address={selectedAddress as `0x${string}`} compact /> · click empty stage to
        clear and see leaderboards.
      </Notice>
    )
  }

  return (
    <div className="ds-stack ds-stack-3">
      {mode === 'operators' ? (
        <EntityCard
          tone="success"
          label="Top operators"
          description="Ranked by totalDelegatedStake on the operator registry."
          meta={operators.data ? `${operators.data.length} of ${operators.data.length}` : undefined}
        >
          <OperatorLeaderboardList rows={operators.data} />
        </EntityCard>
      ) : mode === 'flow' ? (
        <EntityCard
          tone="info"
          label="Top arbiters"
          description="Ranked by commitment count. Open an arbiter profile for token-grouped exposure."
          meta={arbiters.data ? `${arbiters.data.length} of ${arbiters.data.length}` : undefined}
        >
          <PartyLeaderboardList rows={arbiters.data} arbiterLinks />
        </EntityCard>
      ) : (
        <EntityCard
          tone="neutral"
          label="Top counterparties"
          description="Most-frequent counterparties — addresses that receive the most committed exposure."
          meta={
            counterparties.data
              ? `${counterparties.data.length} of ${counterparties.data.length}`
              : undefined
          }
        >
          <PartyLeaderboardList rows={counterparties.data} />
        </EntityCard>
      )}
    </div>
  )
}

function PartyLeaderboardList({
  rows,
  arbiterLinks = false,
}: {
  rows: PartyLeaderboardRow[] | undefined
  arbiterLinks?: boolean
}) {
  if (!rows || rows.length === 0) {
    return <EmptyState title="NO DATA" description="Indexer is loading or empty." />
  }
  return (
    <ol className="ds-stack ds-stack-1" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {rows.map((r) => (
        <MediaRow
          as="li"
          key={r.address}
          density="compact"
          title={
            arbiterLinks ? (
              <Link to={arbiterProfilePath(r.address)}>
                <AddressDisplay address={r.address} compact />
              </Link>
            ) : (
              <AddressDisplay address={r.address} compact />
            )
          }
          meta={
            <span className="ds-text-xs ds-subtle">
              {r.commitmentCount} commitment{r.commitmentCount === 1 ? '' : 's'}
            </span>
          }
          trailing={
            <span className="ds-text-xs ds-subtle">{r.activeCount} active</span>
          }
        />
      ))}
    </ol>
  )
}

function OperatorLeaderboardList({ rows }: { rows: OperatorLeaderboardRow[] | undefined }) {
  if (!rows || rows.length === 0) {
    return <EmptyState title="NO DATA" description="No registered operators yet." />
  }
  return (
    <ol className="ds-stack ds-stack-1" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {rows.map((r) => (
        <MediaRow
          as="li"
          key={r.address}
          density="compact"
          title={<AddressDisplay address={r.address} compact />}
          meta={
            <span className="ds-text-xs ds-subtle">
              {r.activeDelegationCount} delegation{r.activeDelegationCount === 1 ? '' : 's'}
              {r.services.length > 0 ? ` · ${r.services.join(', ')}` : ''}
            </span>
          }
          trailing={
            <TokenAmount amount={r.totalDelegatedStake} decimals={6} symbol="USDC" compact />
          }
        />
      ))}
    </ol>
  )
}

/**
 * Lightweight activity feed derived from recent commitments. v1 shows the
 * latest 20 commitment-created events; v2 should fan out across forfeites,
 * settlements, donations, etc. once those streams are surfaced by the indexer.
 *
 * The indexer schema doesn't expose `createdTimestamp` on the commitment
 * table today (only `createdBlock`). We approximate with the current wall
 * clock so the relative-time formatter doesn't render "55 years ago" — order
 * is preserved by the urgency sort, only the per-row stamp is fuzzy.
 */
function RecentActivity() {
  const { rows, isLoading } = useProtocolCommitmentsList({ limit: 20 })
  const tokenMeta = useTokenMetaMap(rows.map((row) => row.token))
  // useNowSeconds returns bigint; ActivityEvent.timestamp is number.
  const nowSecs = Number(useNowSeconds())

  const events = useMemo<ActivityEvent[]>(
    () =>
      rows.map((r, i) => ({
        id: `${r.manager}-${r.id.toString()}`,
        type: 'commitment-created',
        timestamp: nowSecs - i * 60,
        title: (
          <span>
            Commitment <code>#{r.id.toString()}</code>{' '}
            <span className="ds-subtle">· {(r.maxPenaltyBps / 100).toFixed(0)}% forfeitable</span>
          </span>
        ),
        meta: (
          <span className="ds-row ds-row-2">
            <AddressDisplay address={r.committer} compact />
            <span aria-hidden>→</span>
            <AddressDisplay address={r.counterparty} compact />
          </span>
        ),
        trailing: (() => {
          const meta = tokenMeta.metaFor(r.token)
          return <TokenAmount amount={r.amount} decimals={meta.decimals} symbol={meta.symbol} compact />
        })(),
      })),
    [rows, nowSecs, tokenMeta],
  )

  return (
    <section className="ds-stack ds-stack-3">
      <header className="ds-section-header">
        <h2 className="ds-section-title">Recent activity</h2>
        <span className="ds-section-eyebrow">latest commitments — newest first</span>
      </header>
      <ActivityFeed
        events={events}
        groupBy="none"
        isLoading={isLoading}
        emptyState={<EmptyState title="NO ACTIVITY" description="No commitments indexed yet." />}
      />
    </section>
  )
}
