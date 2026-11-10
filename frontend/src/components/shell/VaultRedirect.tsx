import { Navigate } from 'react-router-dom'
import { Notice } from '../ui'
import { PageHeader } from '../protocol'
import { useVaults } from '../../hooks/useVaults'

/**
 * /vault → /vaults/:address redirect for the first vault (the oldest indexed,
 * or the env canonical one). When there is none, renders an inline error
 * instead of redirecting to a broken URL.
 */
export function VaultRedirect() {
  const { vaults, isLoading } = useVaults()

  if (isLoading) return null
  if (vaults.length === 0) {
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

  return <Navigate to={`/app/vaults/${vaults[0].address}`} replace />
}
