import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ArbiterProfile } from '../../../lib/arbiterProfile'
import type { ForfeitEnforcement, ForfeitEnforcementState } from '../../../lib/forfeitEnforcement'
import { ArbitrationPanel } from '../ArbitrationPanel'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  forfeit: vi.fn(),
  history: vi.fn(),
  mechanism: vi.fn(),
}))

vi.mock('wagmi', () => ({ useChainId: () => 1 }))
vi.mock('../../../hooks/useArbiterProfile', () => ({
  useArbiterProfile: (...args: unknown[]) => mocks.profile(...args),
}))
vi.mock('../../../hooks/useForfeitProposal', () => ({
  useForfeitProposal: (...args: unknown[]) => mocks.forfeit(...args),
}))
vi.mock('../../../hooks/useCommitmentArbitration', () => ({
  useCommitmentArbitration: (...args: unknown[]) => mocks.history(...args),
}))
vi.mock('../../../hooks/useMechanismArbitration', () => ({
  useMechanismArbitration: (...args: unknown[]) => mocks.mechanism(...args),
}))

const ARBITER = '0x1000000000000000000000000000000000000001'
const MANAGER = '0x2000000000000000000000000000000000000002'
const COMMITTER = '0x3000000000000000000000000000000000000003'

const profile: ArbiterProfile = {
  address: ARBITER,
  addressForm: 'contract',
  interfaceSupport: 'supported',
  reportedManager: MANAGER,
  expectedManager: MANAGER,
  managerMatches: true,
  declaredCapabilities: [{ bit: 0n, id: 'initiate-forfeit', label: 'Initiate forfeit' }],
  unknownCapabilityBits: 0n,
  metadataURI: 'ipfs://policy',
  metadataTrust: 'publisher-provided',
  mechanism: 'Configured court',
  mechanismVerification: 'curated deployment',
  displayName: 'Configured court',
  decisionSummary: 'A configured court decides cases.',
  contestKind: 'known-mechanism',
  contestSummary: 'Use the configured court process.',
  configured: true,
  fieldStatus: {
    interfaceSupport: 'success',
    reportedManager: 'success',
    capabilities: 'success',
    metadataURI: 'success',
  },
  readFailures: [],
}

const activeProposal = {
  initiatedAt: 1_000n,
  penaltyBps: 2_500,
  executed: false,
  cancelled: false,
  cumulativePausedAtStart: 0n,
}

function enforcement(state: ForfeitEnforcementState): ForfeitEnforcement {
  const terminalProposal = {
    ...activeProposal,
    executed: state === 'EXECUTED',
    cancelled: state === 'CANCELLED',
  }
  return {
    state,
    proposal: state === 'NONE' ? undefined : terminalProposal,
    pauseOverlap: state === 'NONE' ? undefined : 20n,
    effectiveExecutionAt: state === 'NONE' ? undefined : 1_120n,
    staleCancelAt: state === 'NONE' ? undefined : 2_120n,
    executionAvailable: state === 'EXECUTABLE' || state === 'STALE',
    staleCancellationAvailable: state === 'STALE',
    managerPaused: state === 'PAUSED',
  }
}

function setState(state: ForfeitEnforcementState) {
  const value = enforcement(state)
  mocks.forfeit.mockReturnValue({
    proposal: value.proposal,
    state,
    enforcement: value,
    pauseState: undefined,
    deadline: value.effectiveExecutionAt ?? 0n,
    staleCancelAt: value.staleCancelAt ?? 0n,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <ArbitrationPanel
        commitmentId={7n}
        arbiter={ARBITER}
        manager={MANAGER}
        amount={1_000_000n}
        challengeWindow={100n}
        decimals={6}
        symbol="USDC"
      />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mocks.profile.mockReturnValue({ profile, isLoading: false, error: null, refetch: vi.fn() })
  mocks.history.mockReturnValue({
    data: { manager: MANAGER, commitmentId: 7n, summary: {}, events: [] },
    isLoading: false,
    error: null,
    indexerOnline: true,
    refetch: vi.fn(),
  })
  mocks.mechanism.mockReturnValue(undefined)
  setState('NONE')
})

describe('ArbitrationPanel', () => {
  it.each([
    ['PENDING', 'Execution delay in progress'],
    ['PAUSED', 'Execution paused by the manager'],
    ['EXECUTABLE', 'Ready to execute'],
    ['STALE', 'Stale cancellation available'],
    ['EXECUTED', 'Executed'],
    ['CANCELLED', 'Cancelled'],
  ] as const)('renders the %s enforcement state', (state, label) => {
    setState(state)
    renderPanel()
    expect(screen.getByText(label)).toBeTruthy()
  })

  it('stays visible and read-only with no proposal or wallet provider', () => {
    renderPanel()
    expect(screen.getByRole('heading', { name: 'Arbiter and policy' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Mechanism case' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Manager enforcement' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Activity' })).toBeTruthy()
    expect(screen.getByText('No active arbitration or forfeit proposal')).toBeTruthy()
    expect(screen.getByText(/does not itself grant the committer a generic challenge method/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /execute|cancel|resolve/i })).toBeNull()

    const profileLinks = screen.getAllByRole('link', { name: /configured court|public arbiter/i })
    expect(profileLinks.every((link) => link.getAttribute('href') === `/app/arbiters/${ARBITER}`)).toBe(true)
  })

  it('does not present a failed proposal read as no active proposal', () => {
    mocks.forfeit.mockReturnValue({
      proposal: undefined,
      state: 'UNAVAILABLE',
      enforcement: enforcement('UNAVAILABLE'),
      pauseState: undefined,
      deadline: 0n,
      staleCancelAt: 0n,
      isLoading: false,
      error: new Error('proposal read reverted'),
      refetch: vi.fn(),
    })
    renderPanel()
    expect(screen.getByText('Execution timing unavailable')).toBeTruthy()
    expect(screen.getByText(/proposal read reverted/i)).toBeTruthy()
    expect(screen.queryByText('No active arbitration or forfeit proposal')).toBeNull()
  })

  it('keeps a reported manager mismatch prominent', () => {
    mocks.profile.mockReturnValue({
      profile: { ...profile, reportedManager: ARBITER, managerMatches: false },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    renderPanel()
    expect(screen.getByText('Reported manager mismatch')).toBeTruthy()
    expect(screen.getByText(/declared powers may target another deployment/i)).toBeTruthy()
  })

  it('renders stale-cancelled history using the frontend wire field names', () => {
    mocks.history.mockReturnValue({
      data: {
        manager: MANAGER,
        commitmentId: 7n,
        summary: {},
        events: [{
          kind: 'cancelledStale',
          timestamp: 2_000n,
          blockNumber: 99n,
          logIndex: 4,
          transactionHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          penaltyBps: 2_500,
          challengeWindow: 100n,
          nominalExecutionAt: 1_100n,
          proposalInitiatedAt: 1_000n,
          unitsForfeited: null,
          counterparty: null,
          committer: COMMITTER,
          arbiter: ARBITER,
        }],
      },
      isLoading: false,
      error: null,
      indexerOnline: true,
      refetch: vi.fn(),
    })
    renderPanel()
    expect(screen.getByText('Stale-cancelled')).toBeTruthy()
    expect(screen.getByText(/1 events · complete for this manager \+ id/)).toBeTruthy()
  })
})
