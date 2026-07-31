import { useMemo } from 'react'
import { type Address } from 'viem'
import {
  useReadCommitmentManagerGetCommitment,
  useReadCommitmentManagerGetForfeitProposal,
  useReadCommitmentManagerStrategiesOf,
  useReadCommitmentManagerUnbondInitiatedAt,
} from '../generated'
import { type CommitmentWithStatus } from '../utils/commitments'
import {
  buildCommitmentWithStatus,
  type CommitmentStruct,
  type ForfeitProposalStruct,
} from './commitmentReads'

interface UseFullCommitmentParams {
  managerAddress: Address | undefined
  id: bigint | undefined
  /** Override the committer/arbiter/counterparty/amount fields when the
   *  caller already has them indexed (drawer / detail page from indexer row). */
  hints?: {
    committer?: Address
    arbiter?: Address
    counterparty?: Address
    amount?: bigint
  }
  enabled?: boolean
}

interface UseFullCommitmentReturn {
  full: CommitmentWithStatus | null
  isLoading: boolean
  refetch: () => void
}

/**
 * Reads `getCommitment(id)` + `getForfeitProposal(id)` from the contract and
 * derives the full `CommitmentWithStatus` shape needed by the resolve flow.
 *
 * Both the in-context drawer and the standalone detail page use this — the
 * derivation logic (forfeit proposal precedence, forfeitChallengeEnd, status
 * derivation) is identical in both surfaces and shouldn't drift.
 */
export function useFullCommitment({
  managerAddress,
  id,
  hints,
  enabled = true,
}: UseFullCommitmentParams): UseFullCommitmentReturn {
  const queryEnabled = enabled && !!managerAddress && id !== undefined

  const { data: commitmentRaw, refetch: refetchCommitment, isLoading: isLoadingCommitment } =
    useReadCommitmentManagerGetCommitment({
      address: managerAddress,
      args: id !== undefined ? [id] : undefined,
      query: { enabled: queryEnabled, refetchInterval: 15_000 },
    })
  const { data: forfeitRaw, refetch: refetchForfeit } = useReadCommitmentManagerGetForfeitProposal({
    address: managerAddress,
    args: id !== undefined ? [id] : undefined,
    query: { enabled: queryEnabled, refetchInterval: 15_000 },
  })
  const { data: unbondRaw, refetch: refetchUnbond } = useReadCommitmentManagerUnbondInitiatedAt({
    address: managerAddress,
    args: id !== undefined ? [id] : undefined,
    query: { enabled: queryEnabled, refetchInterval: 15_000 },
  })
  const { data: strategiesRaw, refetch: refetchStrategies } = useReadCommitmentManagerStrategiesOf({
    address: managerAddress,
    args: id !== undefined ? [id] : undefined,
    query: { enabled: queryEnabled, refetchInterval: 15_000 },
  })

  const full = useMemo<CommitmentWithStatus | null>(() => {
    if (!commitmentRaw || id === undefined) return null
    return buildCommitmentWithStatus({
      id,
      commitment: commitmentRaw as CommitmentStruct,
      forfeit: forfeitRaw as ForfeitProposalStruct | undefined,
      unbondInitiatedAt: unbondRaw as bigint | undefined,
      strategies: strategiesRaw ? (strategiesRaw as readonly Address[]).slice() : undefined,
      hints,
    })
    // hints destructured to primitive deps so a fresh `hints` object literal
    // from the caller does not bust this memo every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, commitmentRaw, forfeitRaw, unbondRaw, strategiesRaw, hints?.committer, hints?.arbiter, hints?.counterparty, hints?.amount])

  const refetch = () => {
    void refetchCommitment()
    void refetchForfeit()
    void refetchUnbond()
    void refetchStrategies()
  }

  return { full, isLoading: isLoadingCommitment, refetch }
}
