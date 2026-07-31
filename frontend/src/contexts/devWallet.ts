import { createContext, useContext } from 'react'
import type { Address } from 'viem'
import type { HDAccount } from 'viem/accounts'

export type DevActorId =
  | 'admin'
  | 'arbiter'
  | 'depositor-0'
  | 'depositor-1'
  | 'depositor-2'
  | 'depositor-3'
  | 'depositor-4'

export interface DevActor {
  id: DevActorId
  label: string
  /** Anvil HD account index — matches Simulate.s.sol's `vm.deriveKey(mnemonic, N)`. */
  accountIndex: number
  account: HDAccount
  address: Address
}

export interface DevWalletContextValue {
  actors: DevActor[]
  current: DevActor
  selectActor: (id: DevActorId) => void
}

export const DevWalletContext = createContext<DevWalletContextValue | null>(null)

export function useDevWallet(): DevWalletContextValue {
  const ctx = useContext(DevWalletContext)
  if (!ctx) {
    throw new Error(
      'useDevWallet must be used inside <DevWalletProvider> (admin-only). ' +
        'Did you mount it outside the /admin tree?',
    )
  }
  return ctx
}

/** Read-only helper for components that may render outside the provider. */
export function useOptionalDevWallet(): DevWalletContextValue | null {
  return useContext(DevWalletContext)
}
