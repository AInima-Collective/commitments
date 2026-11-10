import { type Address } from 'viem'
import { useAccount, useChainId } from 'wagmi'
import { type OperatorInfo, type ServiceOperatorInfo } from '../../utils/mesh'
import { Notice, StatBlock, TokenAmount } from '../ui'
import { CommitmentStatusBadge, OperatorStatusBadge } from '../protocol'
import { DelegateToOperatorForm } from './DelegateToOperatorForm'
import { ResolveCommitmentButton } from '../commitment/ResolveCommitmentButton'
import { getContractAddresses } from '../../config/contracts'
import { useVaultPosition } from '../../hooks/useVaultPosition'
import { useOperatorMetadata } from '../../hooks/useIndexerMetadata'
import { type CommitmentWithStatus } from '../../utils/commitments'
import { OperatorProfileCard } from './OperatorProfileCard'
import { OperatorProfileEditor } from './OperatorProfileEditor'

interface OperatorDetailProps {
  operator: OperatorInfo
  serviceInfo?: ServiceOperatorInfo
  decimals?: number
  /** The connected account's active delegations to this operator, if any. */
  myDelegations?: CommitmentWithStatus[]
  /** Called after an undelegate/unbond action so the parent can refetch. */
  onDelegationActed?: () => void
}

export function OperatorDetail({
  operator,
  serviceInfo,
  decimals = 18,
  myDelegations,
  onDelegationActed,
}: OperatorDetailProps) {
  const chainId = useChainId()
  const { address: account, isConnected } = useAccount()
  const { commitmentsVault, commitmentManager, operatorRegistry } = getContractAddresses(chainId)
  const position = useVaultPosition({
    vaultAddress: commitmentsVault,
    viewAddress: account,
    managerAddress: commitmentManager,
  })

  const metadata = useOperatorMetadata(operator.address as Address)
  const isConnectedOperator =
    !!account &&
    account.toLowerCase() === operator.address.toLowerCase() &&
    operator.active

  const registeredDate = new Date(Number(operator.registeredAt) * 1000)
    .toISOString()
    .slice(0, 10)

  const canDelegate = isConnected && operator.active && account !== operator.address

  const signingKey = serviceInfo?.signingKey ? (serviceInfo.signingKey as Address) : undefined
  // A profile card already renders for `ok` metadata and for the
  // connected-operator empty state; both now carry the signing key. When
  // neither path renders (no metadata, mismatch, unreachable) we still want
  // the on-chain signing key visible, so fall back to a bare card.
  const profileCardShown =
    metadata.status === 'ok' || (metadata.status === 'empty' && isConnectedOperator)

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {serviceInfo && (
        <div
          className="ds-row ds-row-2"
          style={{ justifyContent: 'flex-end', alignItems: 'center' }}
        >
          <span className="ds-muted">SERVICE</span>
          <OperatorStatusBadge
            status={serviceInfo.registeredInService ? 'ACTIVE' : 'INACTIVE'}
          />
        </div>
      )}
      {profileCardShown ? (
        <OperatorProfileCard
          profile={metadata.status === 'ok' ? metadata.content : null}
          emptyHint={metadata.status === 'empty' ? 'NO PROFILE SET' : undefined}
          signingKey={signingKey}
        />
      ) : (
        signingKey && <OperatorProfileCard profile={null} signingKey={signingKey} />
      )}
      {(metadata.status === 'mismatch' || metadata.status === 'unreachable') && (
        <Notice tone="warn" size="sm">
          {metadata.status === 'mismatch'
            ? '\u26a0 OPERATOR METADATA HASH MISMATCH'
            : '\u2717 OPERATOR METADATA UNREACHABLE'}
        </Notice>
      )}

      {isConnectedOperator && (
        <OperatorProfileEditor
          operatorAddress={operator.address as Address}
          registryAddress={operatorRegistry}
          metadata={metadata}
        />
      )}

      <div className="ds-stat-grid">
        <StatBlock
          label="TOTAL STAKE"
          value={
            <>
              <TokenAmount
                amount={operator.totalDelegatedStake}
                decimals={decimals}
              />{' '}
              (incl. self)
            </>
          }
        />
        <StatBlock
          label="DELEGATIONS"
          value={String(operator.activeDelegationCount)}
        />
        <StatBlock label="REGISTERED" value={registeredDate} />
      </div>
      {serviceInfo?.registeredInService && (
        <div className="ds-stat-grid">
          <StatBlock
            label="VOTING POWER"
            value={
              <TokenAmount
                amount={serviceInfo.votingPower}
                decimals={decimals}
              />
            }
          />
        </div>
      )}
      {commitmentManager && myDelegations && myDelegations.length > 0 && (
        <div className="ds-card">
          <h3>YOUR DELEGATION</h3>
          <div className="ds-stack ds-stack-2">
            {myDelegations.map((c) => (
              <div
                key={c.id.toString()}
                className="ds-row ds-row-2"
                style={{
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                }}
              >
                <span className="ds-row ds-row-2" style={{ alignItems: 'center' }}>
                  <TokenAmount amount={c.amount} decimals={decimals} />
                  <CommitmentStatusBadge status={c.status} />
                </span>
                <ResolveCommitmentButton
                  commitment={c}
                  managerAddress={commitmentManager}
                  connectedAddress={account}
                  isConnected={isConnected}
                  onActed={onDelegationActed}
                  label={c.status === 'UNBONDING' ? 'Manage unbond' : 'Undelegate'}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {canDelegate && (
        <DelegateToOperatorForm
          operatorAddress={operator.address as Address}
          commitmentManagerAddress={commitmentManager}
          operatorRegistryAddress={operatorRegistry}
          freeShares={position.free}
          shareDecimals={position.shareDecimals}
        />
      )}
    </section>
  )
}
