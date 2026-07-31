import type { ReactNode } from 'react'
import { useChainId } from 'wagmi'
import { type Address } from 'viem'
import { AddressDisplay } from '../ui'
import {
  useReadCommitmentManagerDefaultAdminRole,
  useReadCommitmentManagerMinChallengeWindow,
  useReadCommitmentManagerUnbondingPeriod,
  useReadCommitmentsVaultDefaultAdminRole,
  useReadOperatorRegistryDefaultAdminRole,
} from '../../generated'
import { getBlockExplorer } from '../../lib/blockExplorer'
import { useRoleHolders } from '../../hooks/useRoleHolders'

interface VaultStrategyRiskProps {
  vaultAddress: Address
  managerAddress: Address | undefined
  registryAddress: Address | undefined
  meshFactoryAddress: Address | undefined
}

function formatDuration(secs: number): string {
  if (secs <= 0) return 'instant'
  if (secs < 3600) return `${Math.max(1, Math.round(secs / 60))} min`
  if (secs < 86400) return `${Math.round(secs / 3600)} hr`
  return `${Math.round(secs / 86400)} days`
}

interface RiskRowProps {
  label: string
  value: ReactNode
  detail: ReactNode
}
function RiskRow({ label, value, detail }: RiskRowProps) {
  return (
    <tr>
      <td>
        <span className="ds-vault-risk__row-label">{label}</span>
      </td>
      <td>
        <span className="ds-vault-risk__row-value">{value}</span>
      </td>
      <td>
        <span className="ds-text-sm ds-muted">{detail}</span>
      </td>
    </tr>
  )
}

interface ContractRowProps {
  label: string
  address: Address | undefined
  explorer: string
  detail?: string
}
function ContractRow({ label, address, explorer, detail }: ContractRowProps) {
  return (
    <div className="ds-vault-contract">
      <span className="ds-vault-contract__label">{label}</span>
      <span className="ds-vault-contract__addr">
        {address ? (
          <AddressDisplay
            address={address}
            explorerUrl={`${explorer}/address/${address}`}
          />
        ) : (
          <span className="ds-subtle">—</span>
        )}
      </span>
      {detail && <span className="ds-vault-contract__detail">{detail}</span>}
    </div>
  )
}

interface RoleRowProps {
  label: string
  contract: Address | undefined
  /** Bytes32 role hash from generated.ts; undefined while reading. */
  role: `0x${string}` | undefined
  explorer: string
  detail?: string
}
function RoleRow({ label, contract, role, explorer, detail }: RoleRowProps) {
  const { holders, isLoading, isExhaustive } = useRoleHolders({ contract, role })
  return (
    <div className="ds-vault-role">
      <div className="ds-vault-role__head">
        <span className="ds-vault-role__label">{label}</span>
        {detail && <span className="ds-vault-role__detail">{detail}</span>}
        {!isExhaustive && holders.length > 0 && (
          <span className="ds-text-xs ds-subtle" title="Scan window bounded by RPC budget">
            (recent grants only)
          </span>
        )}
      </div>
      <div className="ds-vault-role__holders">
        {isLoading ? (
          <span className="ds-skeleton ds-skeleton--text" style={{ width: 180 }} />
        ) : holders.length === 0 ? (
          <span className="ds-subtle ds-text-sm">No active holders found.</span>
        ) : (
          holders.map((holder) => (
            <AddressDisplay
              key={holder}
              address={holder}
              explorerUrl={`${explorer}/address/${holder}`}
            />
          ))
        )}
      </div>
    </div>
  )
}

/**
 * Strategy-level risk content for the Overview tab. Mirrors a Morpho-style
 * risk surface: how the vault works, the underlying parameters, smart-contract
 * addresses + admin roles, and audits.
 */
export function VaultStrategyRisk({
  vaultAddress,
  managerAddress,
  registryAddress,
  meshFactoryAddress,
}: VaultStrategyRiskProps) {
  const chainId = useChainId()
  // Always provide an explorer host so contract/role addresses are clickable
  // even on anvil (chainId 31337) — the helper returns `''` for unknown
  // chains, which would otherwise drop the ↗ link entirely.
  const explorer = getBlockExplorer(chainId) || 'https://etherscan.io'

  const { data: minChallengeWindow } = useReadCommitmentManagerMinChallengeWindow({
    address: managerAddress,
    query: { enabled: !!managerAddress },
  })

  const { data: vaultAdminRole } = useReadCommitmentsVaultDefaultAdminRole({
    address: vaultAddress,
    query: { enabled: !!vaultAddress },
  })
  const { data: managerAdminRole } = useReadCommitmentManagerDefaultAdminRole({
    address: managerAddress,
    query: { enabled: !!managerAddress },
  })
  const { data: registryAdminRole } = useReadOperatorRegistryDefaultAdminRole({
    address: registryAddress,
    query: { enabled: !!registryAddress },
  })
  const { data: unbondingPeriod } = useReadCommitmentManagerUnbondingPeriod({
    address: managerAddress,
    query: { enabled: !!managerAddress },
  })

  const unbondingLabel =
    unbondingPeriod !== undefined ? formatDuration(Number(unbondingPeriod)) : '—'
  const challengeLabel =
    minChallengeWindow !== undefined ? formatDuration(Number(minChallengeWindow)) : '—'

  return (
    <div className="ds-stack ds-stack-8">
      {/* === Strategy parameters =========================================== */}
      <section className="ds-stack ds-stack-3">
        <header className="ds-section-header">
          <h2 className="ds-section-title">Strategy parameters</h2>
        </header>
        <div className="ds-vault-risk__table-wrap">
          <table className="ds-table ds-vault-risk__table">
            <tbody>
              <RiskRow
                label="Unbonding period"
                value={unbondingLabel}
                detail="Per-commitment delay between requesting an unbond and being able to finalize it, releasing the encumbered backing back to free balance."
              />
              <RiskRow
                label="Forfeit challenge window"
                value={`≥ ${challengeLabel}`}
                detail="Minimum delay between a forfeit proposal and execution. Gives the depositor and arbiter time to challenge or finalise a forfeiture event."
              />
              <RiskRow
                label="Inflation guard"
                value="ERC-4626 virtual"
                detail="The vault uses OpenZeppelin's virtual-shares / virtual-assets pattern, blunting first-depositor donation attacks."
              />
              <RiskRow
                label="Reentrancy"
                value="EIP-1153"
                detail="State-mutating entry points are protected by ReentrancyGuardTransient (Cancun transient storage)."
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* === Smart contracts =============================================== */}
      <section className="ds-stack ds-stack-3">
        <header className="ds-section-header">
          <h2 className="ds-section-title">Smart contracts</h2>
        </header>
        <div className="ds-vault-contract-list">
          <ContractRow
            label="Vault"
            address={vaultAddress}
            explorer={explorer}
            detail="ERC-1967 proxy · UUPS upgradable · ERC-4626 share token"
          />
          <ContractRow
            label="Commitment manager"
            address={managerAddress}
            explorer={explorer}
            detail="UUPS proxy · two-phase forfeit · agreement settlement"
          />
          <ContractRow
            label="Operator registry"
            address={registryAddress}
            explorer={explorer}
            detail="UUPS proxy · operator delegation tracking"
          />
          <ContractRow
            label="Mesh factory"
            address={meshFactoryAddress}
            explorer={explorer}
            detail="EIP-1167 minimal-clone factory for mesh topology nodes"
          />
        </div>
      </section>

      {/* === Roles ========================================================= */}
      <section className="ds-stack ds-stack-3">
        <header className="ds-section-header">
          <h2 className="ds-section-title">Roles</h2>
        </header>
        <div className="ds-vault-role-list">
          <RoleRow
            label="Vault admin"
            contract={vaultAddress}
            role={vaultAdminRole as `0x${string}` | undefined}
            explorer={explorer}
            detail="Pauses deposits and withdrawals; authorises UUPS upgrades."
          />
          <RoleRow
            label="Manager admin"
            contract={managerAddress}
            role={managerAdminRole as `0x${string}` | undefined}
            explorer={explorer}
            detail="Pauses forfeiture; authorises UUPS upgrades on the manager."
          />
          <RoleRow
            label="Registry admin"
            contract={registryAddress}
            role={registryAdminRole as `0x${string}` | undefined}
            explorer={explorer}
            detail="Manages operator registry policy parameters."
          />
        </div>
      </section>

      {/* === Audits ======================================================== */}
      <section className="ds-stack ds-stack-3">
        <header className="ds-section-header">
          <h2 className="ds-section-title">Audits &amp; reviews</h2>
        </header>
        <ul className="ds-vault-risk__audit-list">
          <li>
            <span className="ds-vault-risk__audit-firm">Hashlock</span>
            <span className="ds-text-sm ds-muted">
              POA middleware v1.0.1 · September 2025
            </span>
          </li>
          <li>
            <span className="ds-vault-risk__audit-firm">Ethereum Foundation</span>
            <span className="ds-text-sm ds-muted">
              Internal review of v1.1 — storage slots, COR-05, blast-radius sequencing
            </span>
          </li>
          <li>
            <span className="ds-vault-risk__audit-firm">Pashov Audit Group</span>
            <span className="ds-text-sm ds-muted">
              Multi-agent audit of v1.2 / v2.0 — full report in <code>audits/</code>
            </span>
          </li>
          <li>
            <span className="ds-vault-risk__audit-firm">Internal v2.5 review</span>
            <span className="ds-text-sm ds-muted">
              May 2026 · 9-agent parallel audit · 7 highs landed and verified
            </span>
          </li>
        </ul>
        <p className="ds-text-sm ds-subtle">
          Audits cover the protocol implementation only. No audit eliminates economic risk
          from forfeiture decisions, oracle failures of integrated yield strategies, or
          governance compromise.
        </p>
      </section>
    </div>
  )
}
