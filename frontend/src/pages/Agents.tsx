import { useMemo } from 'react'
import { type Address } from 'viem'

import { AgentCard } from '../components/agent/AgentCard'
import { PageHeader } from '../components/protocol'
import { Button, EmptyState, Notice, Skeleton } from '../components/ui'
import { hasIndexer } from '../config/indexer'
import { useAgentsIndexed } from '../hooks/useAgentsIndexed'
import { useTokenMetaMap } from '../hooks/useTokenMeta'

/**
 * /agents — the ERC-8004 agent showcase. Every registered agent identity
 * (registry mirror via the indexer) with its resolved registration file and
 * a rollup of the bonds (commitments) its owner has posted. Card click →
 * /app/agents/:agentId.
 */
export default function Agents() {
  const { agents, isLoading, isReady, refetch } = useAgentsIndexed()

  // One token-meta multicall for every backing token on the page.
  const tokens = useMemo<Array<Address | undefined>>(
    () => agents.flatMap((a) => Array.from(a.bonds.totalActiveByToken.values()).map((t) => t.token)),
    [agents],
  )
  const { metaFor } = useTokenMetaMap(tokens)

  let content: React.ReactNode
  if (!hasIndexer) {
    content = (
      <Notice tone="info" title="Indexer required">
        Enumerating registered agents needs the indexer's registry mirror. Set <code>VITE_INDEXER_URL</code> and
        run the indexer to browse agents.
      </Notice>
    )
  } else if (isLoading && agents.length === 0) {
    content = (
      <div className="ds-grid-auto-fit" aria-busy="true" aria-label="Loading agents">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} shape="block" style={{ height: 220 }} />
        ))}
      </div>
    )
  } else if (!isReady) {
    content = (
      <Notice
        tone="warn"
        title="Agents unavailable"
        actions={
          <Button size="sm" onClick={refetch}>
            retry
          </Button>
        }
      >
        Live agent data is temporarily unavailable — please retry shortly.
      </Notice>
    )
  } else if (agents.length === 0) {
    content = (
      <EmptyState
        title="NO REGISTERED AGENTS"
        description="No agents in the ERC-8004 identity registry yet. Register one and it will appear here."
      />
    )
  } else {
    content = (
      <div className="ds-grid-auto-fit">
        {agents.map((agent) => (
          <AgentCard key={`${agent.registry}-${agent.agentId.toString()}`} agent={agent} metaFor={metaFor} />
        ))}
      </div>
    )
  }

  return (
    <div className="ds-page">
      <PageHeader
        eyebrow="erc-8004 · trustless agents"
        title="Agents"
        lead="Registered autonomous agents and the slashable, yield-bearing bonds behind their SLAs. An agent's bond is a commitment anyone can challenge through the optimistic claim game."
      />
      {content}
    </div>
  )
}
