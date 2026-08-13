import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { ArbiterProfile } from '../../lib/arbiterProfile'
import ArbiterDetail from '../ArbiterDetail'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  overview: vi.fn(),
  tokenMeta: vi.fn(),
  mechanism: vi.fn(),
  cases: vi.fn(),
}))

vi.mock('wagmi', () => ({ useChainId: () => 1 }))
vi.mock('../../hooks/useArbiterProfile', () => ({
  useArbiterProfile: (...args: unknown[]) => mocks.profile(...args),
}))
vi.mock('../../hooks/useArbiterOverview', () => ({
  useArbiterOverview: (...args: unknown[]) => mocks.overview(...args),
}))
vi.mock('../../hooks/useTokenMeta', () => ({
  useTokenMetaMap: (...args: unknown[]) => mocks.tokenMeta(...args),
}))
vi.mock('../../hooks/useMechanismArbitration', () => ({
  useMechanismArbitration: (...args: unknown[]) => mocks.mechanism(...args),
}))
vi.mock('../../hooks/useProtocolEntityList', () => ({
  useProtocolCasesList: (...args: unknown[]) => mocks.cases(...args),
}))

const ARBITER = '0x1000000000000000000000000000000000000001'
const MANAGER = '0x2000000000000000000000000000000000000002'
const TOKEN = '0x3000000000000000000000000000000000000003'
const COMMITTER = '0x4000000000000000000000000000000000000004'
const COUNTERPARTY = '0x5000000000000000000000000000000000000005'

const profile: ArbiterProfile = {
  address: ARBITER,
  addressForm: 'EOA',
  interfaceSupport: 'unsupported',
  expectedManager: MANAGER,
  declaredCapabilities: [],
  unknownCapabilityBits: 0n,
  metadataTrust: 'absent',
  mechanism: 'Direct-address arbitration',
  mechanismVerification: 'unrecognized',
  displayName: 'Community reviewer',
  decisionSummary: 'This account decides off chain.',
  contestKind: 'no-generic-action',
  contestSummary: 'No generic contest action.',
  configured: false,
  fieldStatus: {
    interfaceSupport: 'not-applicable',
    reportedManager: 'not-applicable',
    capabilities: 'not-applicable',
    metadataURI: 'not-applicable',
  },
  readFailures: [],
}

describe('ArbiterDetail', () => {
  it('renders a shareable read-only profile and token-labelled exposure without a wallet provider', () => {
    mocks.profile.mockReturnValue({ profile, isLoading: false, error: null, refetch: vi.fn() })
    mocks.overview.mockReturnValue({
      commitments: [{
        id: 7n,
        manager: MANAGER,
        token: TOKEN,
        amount: 1_500_000n,
        status: 'ACTIVE',
        committer: COMMITTER,
        counterparty: COUNTERPARTY,
      }],
      activity: [],
      isLoading: false,
      error: null,
      indexerOnline: true,
      counts: { needsAction: 0, openProposals: 0, active: 1, other: 0, total: 1 },
      page: { limit: 25, offset: 0, nextOffset: null },
    })
    mocks.mechanism.mockReturnValue(undefined)
    mocks.cases.mockReturnValue({
      rows: [],
      page: { limit: 25, offset: 0, total: 0, nextOffset: null },
      isLoading: false,
      error: null,
    })
    mocks.tokenMeta.mockReturnValue({
      metaFor: () => ({ decimals: 6, symbol: 'USDC' }),
      byAddress: {},
      isLoading: false,
    })

    render(
      <MemoryRouter initialEntries={[`/app/arbiters/${ARBITER}`]}>
        <Routes>
          <Route path="/app/arbiters/:address" element={<ArbiterDetail />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Community reviewer' })).toBeTruthy()
    expect(screen.getByText('Direct-address arbitration')).toBeTruthy()
    expect(screen.queryByText('Partial introspection')).toBeNull()
    expect(screen.getByText(/No wallet connection is required/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'USDC backing' })).toBeTruthy()
    expect(screen.getByTitle('1.5 USDC')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Commitment #7' }).getAttribute('href')).toBe(
      `/app/commitments/7?manager=${MANAGER}`,
    )
    expect(screen.queryByRole('button', { name: /connect|execute|cancel|resolve/i })).toBeNull()
  })
})
