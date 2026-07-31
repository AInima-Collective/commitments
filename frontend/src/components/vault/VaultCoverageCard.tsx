import { Link } from 'react-router-dom'
import { type Address } from 'viem'

import { useReadCommitmentsVaultConvertToAssets } from '../../generated'
import { useAgentIdentity } from '../../hooks/useAgentIdentities'
import { useVaultCoverage } from '../../hooks/useVaultCoverage'
import { formatDuration, formatPercent } from '../../lib/format'
import { AddressDisplay, Notice, StatBlock, TokenAmount } from '../ui'

interface VaultCoverageCardProps {
  vaultAddress: Address | undefined
  assetDecimals?: number
  assetSymbol?: string
}

/**
 * "Automatically covered" surface for underwritten vaults (agent-bonds
 * coverage-market pattern). Derived, not configured: the covering mutual is the
 * one whose `coveredVault` is THIS vault — see {@link useVaultCoverage}.
 * Renders nothing for ordinary vaults, so it mounts unconditionally on every
 * vault detail page.
 *
 * Deliberately link-only: all actions (underwrite, loss lifecycle) live on the
 * mutual detail page — this card describes the coverage and deep-links there,
 * so the modal machinery isn't duplicated.
 */
export function VaultCoverageCard({ vaultAddress, assetDecimals, assetSymbol }: VaultCoverageCardProps) {
  const { coverage } = useVaultCoverage(vaultAddress)
  const { identity } = useAgentIdentity(coverage?.operator)

  // Pool capacity is denominated in vault shares (the mutual numeraire);
  // present it in the underlying via the vault's own conversion.
  const { data: capacityAssets } = useReadCommitmentsVaultConvertToAssets({
    address: vaultAddress,
    args: coverage ? [coverage.mutual.liveCapacity] : undefined,
    query: { enabled: Boolean(coverage) },
  })

  if (!coverage) return null

  const { mutual, peril, isStreaming, secondsRemaining, skimBps, premiumAprBps } = coverage
  const mutualPath = `/app/marketplace/${mutual.mutualId.toString()}`
  const agentLabel =
    identity?.isAgent && identity.agentId !== undefined
      ? (identity.name ?? `Agent #${identity.agentId.toString()}`)
      : undefined

  return (
    <section className="ds-stack ds-stack-3" aria-label="Deposit coverage">
      <Notice
        tone={isStreaming ? 'info' : 'warn'}
        title={isStreaming ? 'Automatically covered' : 'Automatically covered — premium stream paused'}
      >
        Every deposit into this vault is covered by underwriting pool{' '}
        <Link to={mutualPath}>#{mutual.mutualId.toString()}</Link> — premium is paid from the
        vault&apos;s own yield, nothing to buy individually.
        {peril.trigger ? <> Trigger: {peril.trigger}.</> : null}
        {coverage.operator ? (
          <>
            {' '}
            Managed by{' '}
            {agentLabel && identity?.agentId !== undefined ? (
              <Link to={`/app/agents/${identity.agentId.toString()}`}>{agentLabel}</Link>
            ) : (
              <AddressDisplay address={coverage.operator} compact />
            )}{' '}
            (ERC-8004), who underwrites its own vault.
          </>
        ) : null}
        {!isStreaming ? (
          <>
            {' '}
            Underwriter pay resumes on the next yield skim; the cover itself is structural — a
            proven breach still marks the underwriters down.
          </>
        ) : null}
      </Notice>

      <div className="ds-stat-grid">
        <StatBlock
          label="cover capacity"
          value={
            capacityAssets !== undefined ? (
              <TokenAmount
                amount={capacityAssets}
                decimals={assetDecimals ?? 18}
                symbol={assetSymbol ?? ''}
                size="inline"
              />
            ) : (
              '—'
            )
          }
          meta={`${mutual.memberCount} underwriter${mutual.memberCount === 1 ? '' : 's'}, loss-adjusted`}
        />
        <StatBlock
          label="premium stream"
          tone={isStreaming ? 'positive' : 'negative'}
          value={isStreaming ? 'streaming' : 'paused'}
          meta={isStreaming ? `ends in ${formatDuration(secondsRemaining)}` : 'awaiting next skim'}
        />
        <StatBlock
          label="coverage cost"
          value={skimBps !== undefined ? `${formatPercent(skimBps)} of yield` : '—'}
          meta="net APY already reflects this"
        />
        <StatBlock
          label="earn · premium APR"
          tone={premiumAprBps !== undefined && premiumAprBps > 0 ? 'positive' : 'neutral'}
          value={premiumAprBps !== undefined ? formatPercent(premiumAprBps) : '—'}
          meta="to underwriters, on deployed cover"
        />
      </div>

      <div className="ds-row ds-row-2">
        <Link to={`${mutualPath}?action=underwrite`}>Underwrite this vault&apos;s risk →</Link>
        <Link to={mutualPath}>View coverage pool →</Link>
      </div>
    </section>
  )
}
