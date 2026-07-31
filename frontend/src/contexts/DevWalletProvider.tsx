import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { mnemonicToAccount } from 'viem/accounts'
import type { Address } from 'viem'
import {
  DevWalletContext,
  type DevActor,
  type DevActorId,
  type DevWalletContextValue,
} from './devWallet'

// Anvil's well-known default test mnemonic. Public information; this provider
// is only mounted on chainId 31337, so these keys never see a non-test chain.
const ANVIL_MNEMONIC =
  'test test test test test test test test test test test junk'

const STORAGE_KEY = 'commitments.admin.actorId'

const DEV_ACTORS: { id: DevActorId; label: string; accountIndex: number }[] = [
  { id: 'admin', label: 'Admin', accountIndex: 0 },
  { id: 'arbiter', label: 'Arbiter', accountIndex: 1 },
  { id: 'depositor-0', label: 'Depositor 0', accountIndex: 2 },
  { id: 'depositor-1', label: 'Depositor 1', accountIndex: 3 },
  { id: 'depositor-2', label: 'Depositor 2', accountIndex: 4 },
  { id: 'depositor-3', label: 'Depositor 3', accountIndex: 5 },
  { id: 'depositor-4', label: 'Depositor 4', accountIndex: 6 },
]

function deriveActor(meta: { id: DevActorId; label: string; accountIndex: number }): DevActor {
  const account = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: meta.accountIndex })
  return {
    id: meta.id,
    label: meta.label,
    accountIndex: meta.accountIndex,
    account,
    address: account.address as Address,
  }
}

function readStoredActorId(): DevActorId | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return DEV_ACTORS.some((a) => a.id === raw) ? (raw as DevActorId) : null
  } catch {
    return null
  }
}

export function DevWalletProvider({ children }: { children: ReactNode }) {
  const actors = useMemo(() => DEV_ACTORS.map(deriveActor), [])
  const [currentId, setCurrentId] = useState<DevActorId>(
    () => readStoredActorId() ?? 'admin',
  )

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, currentId)
    } catch {
      // sessionStorage may be unavailable (private mode, etc.) — non-fatal.
    }
  }, [currentId])

  const selectActor = useCallback((id: DevActorId) => {
    setCurrentId(id)
  }, [])

  const current = actors.find((a) => a.id === currentId) ?? actors[0]!

  const value = useMemo<DevWalletContextValue>(
    () => ({ actors, current, selectActor }),
    [actors, current, selectActor],
  )

  return <DevWalletContext.Provider value={value}>{children}</DevWalletContext.Provider>
}
