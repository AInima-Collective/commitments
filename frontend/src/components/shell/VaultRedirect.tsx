import { Navigate } from 'react-router-dom'
import { useChainId } from 'wagmi'
import { Notice } from '../ui'
import { PageHeader } from '../protocol'
import { getVaultRegistry } from '../../config/contracts'

/**
 * /vault → /vaults/:address redirect for the canonical vault. When the
 * registry is empty (no env-configured vault), renders an inline error
 * instead of redirecting to a broken URL.
 */
export function VaultRedirect() {
  const chainId = useChainId()
  const registry = getVaultRegistry(chainId)

  if (registry.length === 0) {
    return (
      <div className="ds-page">
        <PageHeader eyebrow="capital" title="Vault" />
        <Notice tone="warn" title="Vault not configured">
          Set <code>VITE_COMMITMENTS_VAULT_ADDRESS</code> in your environment, then add the vault to{' '}
          <code>config/contracts.ts</code>'s <code>getVaultRegistry()</code>.
        </Notice>
      </div>
    )
  }

  return <Navigate to={`/app/vaults/${registry[0].address}`} replace />
}
