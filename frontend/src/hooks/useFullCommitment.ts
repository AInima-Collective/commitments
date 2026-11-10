import { useMemo } from 'react'
import { type Address } from 'viem'
import { useReadContracts } from 'wagmi'
import { type CommitmentWithStatus } from '../lib/commitments'
import { commitmentReadContracts, mapCommitmentWindow } from '../lib/commitmentReads'
import { POLL } from './polling'

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

  const { data, isLoading, refetch } = useReadContracts({
    contracts: managerAddress && id !== undefined ? commitmentReadContracts(managerAddress, id) : [],
    query: { enabled: queryEnabled, refetchInterval: POLL.fast },
  })

  const full = useMemo<CommitmentWithStatus | null>(
    () => (data && id !== undefined ? mapCommitmentWindow(id, data, 0, hints) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hints by field, so a fresh `hints` literal does not bust the memo
    [id, data, hints?.committer, hints?.arbiter, hints?.counterparty, hints?.amount],
  )

  return { full, isLoading, refetch: () => void refetch() }
}
