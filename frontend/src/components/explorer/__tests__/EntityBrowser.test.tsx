import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { EntityBrowser } from '../EntityBrowser'

const mocks = vi.hoisted(() => ({
  commitments: vi.fn(),
  agreements: vi.fn(),
}))

vi.mock('../../../hooks/useProtocolEntityList', () => ({
  useProtocolCommitmentsList: (...args: unknown[]) => mocks.commitments(...args),
  useProtocolAgreementsList: (...args: unknown[]) => mocks.agreements(...args),
}))
vi.mock('../../../hooks/useOperatorNames', () => ({
  useOperatorNames: () => ({ get: () => undefined, isLoading: false }),
}))
vi.mock('../../../hooks/useAgentIdentities', () => ({
  useAgentIdentities: () => ({ get: () => undefined, isLoading: false }),
}))
vi.mock('../../../hooks/useBlockTimestamps', () => ({
  useBlockTimestamps: () => new Map([[10n, 1_000n]]),
}))
vi.mock('../../../hooks/useDisplayNow', () => ({ useDisplayNow: () => 2_000 }))
vi.mock('../../../hooks/useTokenMeta', () => ({
  useTokenMetaMap: () => ({
    metaFor: () => ({ decimals: 6, symbol: 'USDC' }),
    byAddress: {},
    isLoading: false,
  }),
}))

const MANAGER = '0x1000000000000000000000000000000000000001'
const COMMITTER = '0x2000000000000000000000000000000000000002'
const ARBITER = '0x3000000000000000000000000000000000000003'
const COUNTERPARTY = '0x4000000000000000000000000000000000000004'
const TOKEN = '0x5000000000000000000000000000000000000005'

describe('EntityBrowser', () => {
  it('links an Explorer arbiter entry to its public profile', () => {
    mocks.commitments.mockReturnValue({
      rows: [{
        id: 7n,
        manager: MANAGER,
        committer: COMMITTER,
        arbiter: ARBITER,
        counterparty: COUNTERPARTY,
        token: TOKEN,
        amount: 1_000_000n,
        maxPenaltyBps: 2_500,
        status: 'ACTIVE',
        forfeitChallengeEnd: null,
        unbondMaturesAt: null,
        createdBlock: 10n,
      }],
      isLoading: false,
      error: null,
    })
    mocks.agreements.mockReturnValue({ rows: [], isLoading: false, error: null })

    render(
      <MemoryRouter>
        <EntityBrowser />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: `View arbiter ${ARBITER}` }).getAttribute('href')).toBe(
      `/app/arbiters/${ARBITER}`,
    )
  })
})
