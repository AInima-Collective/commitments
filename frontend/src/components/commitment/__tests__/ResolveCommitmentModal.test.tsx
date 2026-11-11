import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import type { CommitmentWithStatus } from '../../../lib/commitments'
import { ResolveCommitmentModal } from '../ResolveCommitmentModal'

const DAY = 86_400n
const REQUESTED = 1_700_000_000n
// The wall clock sits inside the release window; the chain (warped on anvil)
// is past twice the window, where the request has lapsed.
const WALL = REQUESTED + 4n * DAY
const CHAIN = REQUESTED + 7n * DAY

vi.mock('../../../hooks/useNow', () => ({ useNowSeconds: () => WALL }))
vi.mock('../../../hooks/useDisplayNow', () => ({ useDisplayNow: () => Number(CHAIN) }))
vi.mock('../../../hooks/useTokenMeta', () => ({ useTokenMeta: () => ({ decimals: 18, symbol: 'SHARE' }) }))
vi.mock('../../../hooks/useForfeitProposal', () => ({
  useForfeitProposal: () => ({
    state: 'NONE',
    proposal: undefined,
    deadline: 0n,
    enforcement: { executionAvailable: false, staleCancellationAvailable: false, staleCancelAt: 0n },
  }),
}))
vi.mock('../../../hooks/useUnbondStatus', () => ({
  useUnbondStatus: () => ({ unbondInitiatedAt: 0n, unbondingPeriod: 7n * DAY, isUnbonding: false }),
}))
vi.mock('../../../hooks/useCommitmentYield', () => ({
  useCommitmentYield: () => ({ totalPending: 0n, entries: [] }),
}))
vi.mock('../../../hooks/useMutualMembership', () => ({
  useMutualMembership: () => ({
    mutualId: 1n,
    isMember: true,
    lossPending: false,
    unsettled: false,
    owedUnits: 0n,
    exitRequestedAt: REQUESTED,
    deallocationWindow: 3n * DAY,
    refetch: vi.fn(),
  }),
}))
vi.mock('../actions/ResolveActionRow', () => ({
  ResolveActionRow: ({ action }: { action: { kind: string } }) => <span>{action.kind}</span>,
}))

const COMMITTER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address

const commitment = {
  id: 1n,
  committer: COMMITTER,
  counterparty: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  arbiter: '0xcccccccccccccccccccccccccccccccccccccccc',
  token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  adapter: '0xffffffffffffffffffffffffffffffffffffffff',
  amount: 10n ** 18n,
  maxPenaltyBps: 5000,
  challengeWindow: DAY,
  createdAt: REQUESTED - 10n * DAY,
  expiresAt: 0n,
  released: false,
  forfeited: false,
  status: 'ACTIVE',
} as CommitmentWithStatus

describe('ResolveCommitmentModal', () => {
  it('judges the exit lapse on the display clock, as the Mutual page does', () => {
    render(
      <MemoryRouter>
        <ResolveCommitmentModal
          open
          onClose={() => {}}
          commitment={commitment}
          managerAddress={'0x9999999999999999999999999999999999999999'}
          connectedAddress={COMMITTER}
          isConnected
        />
      </MemoryRouter>,
    )
    expect(screen.queryByText('release-mutual-member')).toBeNull()
    expect(screen.getByText('request-mutual-exit')).toBeTruthy()
  })
})
