import { fireEvent, render, screen } from '@testing-library/react'
import { getAddress, type Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import type { VaultDescriptor } from '../../../config/contracts'
import { ToastProvider } from '../../ui'
import { CreateCommitmentForm } from '../CreateCommitmentForm'

const mocks = vi.hoisted(() => ({ vaults: [] as VaultDescriptor[], tokenMeta: vi.fn() }))

vi.mock('wagmi', () => ({ useChainId: () => 31337 }))
vi.mock('../../../hooks/useVaults', () => ({ useVaults: () => ({ vaults: mocks.vaults }) }))
vi.mock('../../../config/contracts', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getBackingOptions: (_chainId: number, vaults: VaultDescriptor[]) =>
    vaults.map((v) => ({ token: v.address, adapter: v.address, label: v.name, isVaultShare: true })),
}))
vi.mock('../../../hooks/useTokenMeta', () => ({
  useTokenMeta: (token?: Address) => mocks.tokenMeta(token),
}))
vi.mock('../../../hooks/useLedgerBalance', () => ({
  useLedgerBalance: () => ({ free: 0n, refetch: vi.fn() }),
}))
vi.mock('../../../hooks/useCreateCommitmentFlow', () => ({
  useCreateCommitmentFlow: () => ({ step: 'idle', error: null, submit: vi.fn(), reset: vi.fn() }),
}))
vi.mock('../../protocol', () => ({ DerivedLabelPreview: () => null }))
vi.mock('../../metadata/MetadataEditor', () => ({ MetadataEditor: () => null }))
vi.mock('../StrategyBindingPicker', () => ({ StrategyBindingPicker: () => null }))

const USDC_VAULT = '0x1000000000000000000000000000000000000abc'
const ETH_VAULT = '0x2000000000000000000000000000000000000def'

// The indexer lists addresses lowercase; the env list is checksummed.
const indexed = [
  { address: USDC_VAULT, name: 'USDC Vault', assetSymbol: 'USDC' },
  { address: ETH_VAULT, name: 'ETH Vault', assetSymbol: 'WETH' },
] as VaultDescriptor[]
const env = indexed.map((v) => ({ ...v, address: getAddress(v.address) }))

function form() {
  return (
    <ToastProvider>
      <CreateCommitmentForm managerAddress={undefined} isConnected={false} onCommitmentCreated={() => {}} />
    </ToastProvider>
  )
}

describe('CreateCommitmentForm backing selection', () => {
  it('keeps the chosen vault when the list switches between indexer and env spelling', () => {
    mocks.tokenMeta.mockReturnValue({ decimals: 18, symbol: 'SHARE', isLoading: false })
    mocks.vaults = indexed
    const view = render(form())
    fireEvent.change(screen.getByLabelText('BACKING TOKEN'), { target: { value: ETH_VAULT } })

    mocks.vaults = env
    view.rerender(form())
    expect(mocks.tokenMeta).toHaveBeenLastCalledWith(getAddress(ETH_VAULT))
    expect((screen.getByLabelText('BACKING TOKEN') as HTMLSelectElement).value).toBe(getAddress(ETH_VAULT))

    mocks.vaults = indexed
    view.rerender(form())
    expect(mocks.tokenMeta).toHaveBeenLastCalledWith(ETH_VAULT)
  })
})
