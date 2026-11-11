import { type ReactNode } from 'react'
import { useChainId } from 'wagmi'
import { type Address } from 'viem'

import { getBlockExplorer } from '../../lib/blockExplorer'
import { AddressDisplay, Notice, TokenAmount } from '../ui'
import { useRegistryPolicy } from '../../hooks/useRegistryPolicy'
import { formatBps } from '../../lib/commitments'

interface ServiceDetailsPanelProps {
  /** OperatorRegistry address — also drives the policy/params read. */
  registryAddress: Address | undefined
  /** Service handler / StakeRegistry address. */
  stakeRegistryAddress: Address | undefined
  /** Root custody contract backing every delegation commitment. */
  commitmentManager: Address | undefined
}

const DASH = '—'

/**
 * `ServiceDetailsPanel` — the Details tab on the service page. A definition-list
 * of the static "what is this service wired to" facts a visitor needs to audit
 * it: the on-chain contract addresses (full, copyable, explorer-linked) plus
 * the registry policy/params (required arbiter, min stake, penalty floor,
 * delegation cap) read from {@link useRegistryPolicy}.
 *
 * Deliberately *not* the stat-grid layout the rest of the page uses — these are
 * reference facts, not headline metrics, so they read as labelled rows with the
 * value carried at full precision (no truncated addresses).
 */
export function ServiceDetailsPanel({
  registryAddress,
  stakeRegistryAddress,
  commitmentManager,
}: ServiceDetailsPanelProps) {
  const chainId = useChainId()
  const blockExplorer = getBlockExplorer(chainId)
  const {
    requiredArbiter,
    minOperatorStake,
    minMaxPenaltyBps,
    maxDelegationsPerOperator,
    error,
  } = useRegistryPolicy(registryAddress)

  // Full address (no `compact`) with an explorer link where the chain has one;
  // on anvil the link is omitted but the copy affordance + full hex remain.
  const addr = (address: Address | undefined): ReactNode => {
    if (!address) return <span className="ds-muted">{DASH}</span>
    return (
      <AddressDisplay
        address={address}
        explorerUrl={blockExplorer === '' ? undefined : `${blockExplorer}/address/${address}`}
      />
    )
  }

  return (
    <div className="ds-stack ds-stack-4">
      <section className="ds-card">
        <h3 style={{ marginTop: 0 }}>CONTRACTS</h3>
        <dl style={{ margin: 0 }}>
          <DetailRow label="Service / stake registry">{addr(stakeRegistryAddress)}</DetailRow>
          <DetailRow label="Operator registry">{addr(registryAddress)}</DetailRow>
          <DetailRow label="Commitment manager">{addr(commitmentManager)}</DetailRow>
        </dl>
      </section>

      <section className="ds-card">
        <h3 style={{ marginTop: 0 }}>POLICY &amp; PARAMETERS</h3>
        {error !== null && (
          <Notice tone="danger" size="sm" title="REGISTRY READ FAILED">
            Could not read the registry policy. Refresh to retry.
          </Notice>
        )}
        <dl style={{ margin: 0 }}>
          <DetailRow label="Required arbiter">
            {requiredArbiter === undefined ? <span className="ds-muted">{DASH}</span> : addr(requiredArbiter)}
          </DetailRow>
          <DetailRow label="Min operator stake">
            {minOperatorStake === undefined ? (
              <span className="ds-muted">{DASH}</span>
            ) : (
              <>
                <TokenAmount amount={minOperatorStake} decimals={18} /> SHARES
              </>
            )}
          </DetailRow>
          <DetailRow label="Min max penalty">
            {minMaxPenaltyBps === undefined ? (
              <span className="ds-muted">{DASH}</span>
            ) : (
              formatBps(minMaxPenaltyBps)
            )}
          </DetailRow>
          <DetailRow label="Max delegations per operator">
            {maxDelegationsPerOperator === undefined ? (
              <span className="ds-muted">{DASH}</span>
            ) : (
              String(maxDelegationsPerOperator)
            )}
          </DetailRow>
        </dl>
      </section>
    </div>
  )
}

/**
 * One labelled row in the details definition list: muted uppercase term on the
 * left, full-precision value on the right, hairline divider above. Wraps the
 * value onto its own line on narrow viewports rather than truncating it.
 */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
        padding: 'var(--space-3) 0',
        borderTop: '1px solid var(--border)',
      }}
    >
      <dt
        className="ds-muted"
        style={{
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-wide)',
          fontSize: 'var(--text-xs)',
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: 0, textAlign: 'right' }}>{children}</dd>
    </div>
  )
}
