import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useVaults } from '../useVaults'

const mocks = vi.hoisted(() => ({ graphql: vi.fn() }))

vi.mock('wagmi', () => ({ useChainId: () => 31337 }))
vi.mock('../../config/indexer', () => ({ hasIndexer: true, indexerGraphqlData: mocks.graphql }))
vi.mock('../../config/contracts', () => ({
  getVaultRegistry: () => [{ address: '0x1000000000000000000000000000000000000ABC', assetSymbol: 'USDC' }],
}))

const ETH_VAULT = '0x2000000000000000000000000000000000000def'

describe('useVaults', () => {
  it('keeps the last indexed list through a failed refetch', async () => {
    const client = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    mocks.graphql.mockResolvedValueOnce({
      vaults: {
        items: [{ address: ETH_VAULT, asset: null, name: 'ETH Vault', symbol: null, assetSymbol: 'WETH', assetDecimals: 18 }],
      },
    })
    const { result } = renderHook(() => useVaults(), { wrapper })
    await waitFor(() => expect(result.current.vaults[0]?.address).toBe(ETH_VAULT))

    mocks.graphql.mockRejectedValueOnce(new Error('indexer down'))
    await act(() => client.refetchQueries({ queryKey: ['vaults'] }))
    // Let the observer's batched notification re-render the hook.
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(client.getQueryState(['vaults', 31337])?.status).toBe('error')
    expect(result.current.vaults.map((v) => v.address)).toEqual([ETH_VAULT])
  })
})
