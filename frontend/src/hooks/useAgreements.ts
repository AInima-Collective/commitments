import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'
import { useChainId } from 'wagmi'

import { hasIndexer, indexerGraphqlData } from '../config/indexer'
import { type AgreementProposalWithStatus, deriveAgreementStatus } from '../utils/agreements'
import { POLL } from './polling'

interface UseAgreementsParams {
  managerAddress: Address | undefined
  viewAddress: Address | undefined
}

interface UseAgreementsReturn {
  agreements: AgreementProposalWithStatus[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

const PROPOSAL_FIELDS = `
  id proposer acceptor status agreementId proposedBlock arbiter
  proposerToken proposerAdapter proposerAmount proposerMaxPenaltyBps
  acceptorToken acceptorAdapter acceptorAmount acceptorMaxPenaltyBps
  challengeWindow expiresAt maxFlowProposerToAcceptor maxFlowAcceptorToProposer
`

// Both sides of the viewer's inbox, as two aliased lists (deduped below).
const PROPOSALS_QUERY = /* GraphQL */ `
  query ViewerProposals($manager: String!, $viewer: String!) {
    asProposer: agreementProposals(where: { manager: $manager, proposer: $viewer }, limit: 1000) {
      items { ${PROPOSAL_FIELDS} }
    }
    asAcceptor: agreementProposals(where: { manager: $manager, acceptor: $viewer }, limit: 1000) {
      items { ${PROPOSAL_FIELDS} }
    }
  }
`

const AGREEMENTS_QUERY = /* GraphQL */ `
  query ProposalAgreements($manager: String!, $ids: [BigInt!]!) {
    agreements(where: { manager: $manager, id_in: $ids }, limit: 1000) {
      items { id status }
    }
  }
`

/** Indexer `agreementProposal` row; bigints as decimal strings, terms null until the terms event lands. */
interface ProposalWire {
  id: string
  proposer: string
  acceptor: string
  status: 'open' | 'accepted' | 'cancelled' | 'expired'
  agreementId: string | null
  proposedBlock: string
  arbiter: string | null
  proposerToken: string | null
  proposerAdapter: string | null
  proposerAmount: string | null
  proposerMaxPenaltyBps: number | null
  acceptorToken: string | null
  acceptorAdapter: string | null
  acceptorAmount: string | null
  acceptorMaxPenaltyBps: number | null
  challengeWindow: string | null
  expiresAt: string | null
  maxFlowProposerToAcceptor: string | null
  maxFlowAcceptorToProposer: string | null
}

const NONE: AgreementProposalWithStatus[] = []

async function fetchAgreements(manager: Address, viewer: Address): Promise<AgreementProposalWithStatus[]> {
  const vars = { manager: manager.toLowerCase(), viewer: viewer.toLowerCase() }
  const { asProposer, asAcceptor } = await indexerGraphqlData<{
    asProposer: { items: ProposalWire[] }
    asAcceptor: { items: ProposalWire[] }
  }>(PROPOSALS_QUERY, vars)
  const byId = new Map<string, ProposalWire>()
  // A proposal without its terms is malformed (both events land in one tx): skip it.
  for (const p of [...asProposer.items, ...asAcceptor.items]) if (p.arbiter !== null) byId.set(p.id, p)
  const proposals = [...byId.values()]

  // Terminal lifecycle of accepted agreements: forfeited or released.
  const ids = proposals.flatMap((p) => (p.agreementId !== null ? [p.agreementId] : []))
  const agreementStatus = new Map<string, string>()
  if (ids.length > 0) {
    const { agreements } = await indexerGraphqlData<{ agreements: { items: { id: string; status: string }[] } }>(
      AGREEMENTS_QUERY,
      { manager: vars.manager, ids },
    )
    for (const a of agreements.items) agreementStatus.set(a.id, a.status)
  }

  return proposals
    .map((p) => {
      const accepted = p.agreementId !== null
      const cancelled = p.status === 'cancelled' || p.status === 'expired'
      const expiresAt = BigInt(p.expiresAt ?? 0)
      const terminal = accepted ? agreementStatus.get(p.agreementId!) : undefined
      const resolved = terminal === 'forfeited' ? 'FORFEITED' : terminal === 'released' ? 'RESOLVED' : undefined
      const proposerToken = p.proposerToken as Address
      const proposerAdapter = p.proposerAdapter as Address
      return {
        proposalId: BigInt(p.id),
        proposer: p.proposer as Address,
        acceptor: p.acceptor as Address,
        arbiter: p.arbiter as Address,
        // Headline token/adapter = proposer leg (see AgreementProposalWithStatus).
        token: proposerToken,
        adapter: proposerAdapter,
        proposerAmount: BigInt(p.proposerAmount ?? 0),
        acceptorAmount: BigInt(p.acceptorAmount ?? 0),
        maxPenaltyBps: p.proposerMaxPenaltyBps ?? 0,
        challengeWindow: BigInt(p.challengeWindow ?? 0),
        expiresAt,
        accepted,
        cancelled,
        status: deriveAgreementStatus({ accepted, cancelled, expiresAt }, resolved),
        proposerToken,
        proposerAdapter,
        acceptorToken: p.acceptorToken as Address,
        acceptorAdapter: p.acceptorAdapter as Address,
        acceptorMaxPenaltyBps: p.acceptorMaxPenaltyBps ?? 0,
        maxFlowProposerToAcceptor: BigInt(p.maxFlowProposerToAcceptor ?? 0),
        maxFlowAcceptorToProposer: BigInt(p.maxFlowAcceptorToProposer ?? 0),
        agreementId: accepted ? BigInt(p.agreementId!) : undefined,
        viewerIsProposer: p.proposer.toLowerCase() === vars.viewer,
        createdAtBlock: BigInt(p.proposedBlock),
      }
    })
    .sort((a, b) => (a.createdAtBlock > b.createdAtBlock ? -1 : a.createdAtBlock < b.createdAtBlock ? 1 : 0))
}

/**
 * The viewer's agreement proposals (either side), newest first, from the
 * indexer's `agreementProposal` rows joined with `agreement.status` for
 * accepted ones. Empty without an indexer; trails the chain by the indexing
 * delay.
 */
export function useAgreements({ managerAddress, viewAddress }: UseAgreementsParams): UseAgreementsReturn {
  const chainId = useChainId()
  const query = useQuery({
    enabled: hasIndexer && !!managerAddress && !!viewAddress,
    queryKey: ['agreement-proposals', chainId, managerAddress, viewAddress],
    queryFn: () => fetchAgreements(managerAddress!, viewAddress!),
    refetchInterval: POLL.fast,
    retry: false,
  })

  return {
    agreements: query.data ?? NONE,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  }
}
