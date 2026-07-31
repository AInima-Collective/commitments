import { useState } from 'react'
import type { Address, Hex } from 'viem'

import { Button, Input, Notice } from '../../ui'
import { useCastVote } from '../../../hooks/useCastVote'
import { useVotingPower } from '../../../hooks/useVotingPower'

export interface CastVoteClusterProps {
  governor: Address
  proposalId: string
  /** Optional shim address — when provided, surface the connected user's
   *  current voting power directly above the For / Against / Abstain row. */
  shim?: Hex
  onSuccess?: () => void
}

function formatVotes(raw: bigint | undefined): string {
  if (raw === undefined) return '—'
  if (raw === 0n) return '0'
  const wholes = raw / 10n ** 18n
  if (wholes === 0n) return '<1'
  return wholes.toString()
}

/**
 * Three-button cluster (For / Against / Abstain) plus an optional reason
 * input. Posts via Governor.castVoteWithReason so the indexer logs the
 * reason alongside the vote weight. Disables once the user has cast a
 * vote in the same session — repeated castVote() reverts on chain anyway,
 * but the disabled state surfaces the rule cleanly without waiting for
 * the receipt.
 */
export function CastVoteCluster({ governor, proposalId, shim, onSuccess }: CastVoteClusterProps) {
  const [reason, setReason] = useState('')
  const flow = useCastVote(governor, proposalId)
  const votes = useVotingPower(shim)
  const inFlight = flow.step === 'signing' || flow.step === 'confirming'
  const noPower = votes.account !== undefined && votes.power === 0n

  if (flow.step === 'confirmed') {
    return (
      <div className="ds-stack ds-stack-2">
        <Notice tone="success">Vote recorded.</Notice>
        {onSuccess && (
          <Button type="button" variant="ghost" size="sm" onClick={onSuccess}>
            Refresh
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="ds-stack ds-stack-2">
      {shim && votes.account && (
        <div className="ds-row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="ds-text-sm ds-muted">Your power</span>
          <span className="ds-mono-num" style={{ fontSize: 'var(--text-sm)' }}>
            {votes.isLoading ? '—' : formatVotes(votes.power)}
          </span>
        </div>
      )}
      {noPower && (
        <Notice tone="info" size="sm">
          You hold no voting power at this proposal's snapshot. Casting will revert.
        </Notice>
      )}
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Optional reason for your vote"
      />
      <div className="ds-row" style={{ gap: 'var(--space-2)' }}>
        <Button
          type="button"
          variant="primary"
          disabled={inFlight}
          onClick={() => flow.castVote(1, reason)}
        >
          For
        </Button>
        <Button
          type="button"
          variant="default"
          disabled={inFlight}
          onClick={() => flow.castVote(0, reason)}
        >
          Against
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={inFlight}
          onClick={() => flow.castVote(2, reason)}
        >
          Abstain
        </Button>
      </div>
      {flow.step === 'error' && flow.error && <Notice tone="danger">{flow.error.message}</Notice>}
    </div>
  )
}
