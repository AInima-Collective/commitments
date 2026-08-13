import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EntityBrowser } from '../EntityBrowser'

const mocks = vi.hoisted(() => ({
  commitments: vi.fn(),
  agreements: vi.fn(),
  arbiters: vi.fn(),
  cases: vi.fn(),
  profile: vi.fn(),
}))

vi.mock('../../../hooks/useProtocolEntityList', () => ({
  useProtocolCommitmentsList: (...args: unknown[]) => mocks.commitments(...args),
  useProtocolAgreementsList: (...args: unknown[]) => mocks.agreements(...args),
  useProtocolArbitersList: (...args: unknown[]) => mocks.arbiters(...args),
  useProtocolCasesList: (...args: unknown[]) => mocks.cases(...args),
}))
vi.mock('../../../hooks/useArbiterProfile', () => ({
  useArbiterProfile: (...args: unknown[]) => mocks.profile(...args),
}))
vi.mock('wagmi', () => ({ useChainId: () => 31337 }))
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

beforeEach(() => {
  mocks.commitments.mockReturnValue({ rows: [], isLoading: false, error: null })
  mocks.agreements.mockReturnValue({ rows: [], isLoading: false, error: null })
  mocks.arbiters.mockReturnValue({
    rows: [],
    page: { limit: 50, offset: 0, total: 0, nextOffset: null },
    isLoading: false,
    error: null,
  })
  mocks.cases.mockReturnValue({
    rows: [],
    page: { limit: 50, offset: 0, total: 0, nextOffset: null },
    isLoading: false,
    error: null,
  })
  mocks.profile.mockReturnValue({
    profile: {
      displayName: 'Configured arbiter',
      addressForm: 'contract',
      mechanism: 'Two-tier court',
      mechanismVerification: 'curated deployment',
      fieldStatus: { capabilities: 'success' },
      declaredCapabilities: [{ label: 'Initiate forfeit' }],
    },
    isLoading: false,
  })
})

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

  it('paginates and address-filters the complete arbiter directory with direct profile links', () => {
    mocks.arbiters.mockImplementation((options: { offset: number }) => ({
      rows: [{
        address: ARBITER,
        totalCommitments: 9,
        activeCommitments: 4,
        pendingManagerForfeits: 2,
        openMechanismCases: 1,
      }],
      page: { limit: 50, offset: options.offset, total: 75, nextOffset: options.offset === 0 ? 50 : null },
      isLoading: false,
      error: null,
    }))

    render(
      <MemoryRouter>
        <EntityBrowser defaultTab="arbiters" filterAddress={ARBITER} />
      </MemoryRouter>,
    )

    expect(mocks.arbiters).toHaveBeenCalledWith(expect.objectContaining({ address: ARBITER, limit: 50, offset: 0 }))
    expect(screen.getByRole('link', { name: `View arbiter ${ARBITER}` }).getAttribute('href')).toBe(
      `/app/arbiters/${ARBITER}`,
    )
    expect(screen.getByText('4 active / 9 total')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(mocks.arbiters).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 50 }))
  })

  it('shows case provenance, a next action, and terminal outcome separately', () => {
    mocks.cases.mockReturnValue({
      rows: [
        {
          source: 'arbiter mechanism',
          mechanismSource: 'arbiter mechanism',
          managerSource: 'CommitmentManager',
          mechanism: 'two-tier',
          caseId: '8',
          commitmentId: 7n,
          manager: MANAGER,
          arbiter: ARBITER,
          mechanismPhase: 'human-ruling',
          managerPhase: 'Execution delay',
          nextDeadline: null,
          nextAction: 'Await or execute the separate CommitmentManager enforcement step',
          terminalOutcome: null,
          penaltyBps: 500,
          proposalInitiatedAt: 1_000n,
          updatedAt: 1_100n,
          transactionHash: null,
        },
        {
          source: 'arbiter mechanism',
          mechanismSource: 'arbiter mechanism',
          managerSource: 'CommitmentManager',
          mechanism: 'two-tier',
          caseId: '6',
          commitmentId: 5n,
          manager: MANAGER,
          arbiter: ARBITER,
          mechanismPhase: 'executed',
          managerPhase: 'executed',
          nextDeadline: null,
          nextAction: null,
          terminalOutcome: '500 bps ruling executed',
          penaltyBps: 500,
          proposalInitiatedAt: 900n,
          updatedAt: 1_000n,
          transactionHash: null,
        },
      ],
      page: { limit: 50, offset: 0, total: 2, nextOffset: null },
      isLoading: false,
      error: null,
    })

    render(
      <MemoryRouter>
        <EntityBrowser defaultTab="cases" />
      </MemoryRouter>,
    )

    expect(screen.getAllByText('source: arbiter mechanism')).toHaveLength(2)
    expect(screen.getAllByText('source: CommitmentManager')).toHaveLength(2)
    expect(screen.getByText('Await or execute the separate CommitmentManager enforcement step')).toBeTruthy()
    expect(screen.getByText('500 bps ruling executed')).toBeTruthy()
  })
})
