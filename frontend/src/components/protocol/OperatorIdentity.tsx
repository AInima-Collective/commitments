import type { ReactNode } from 'react'
import { OperatorAvatar, type OperatorAvatarSize } from '../ui'
import { truncateAddress } from '../../lib/format'

export type OperatorIdentitySize = 'sm' | 'md' | 'lg'

const AVATAR_FOR_IDENTITY: Record<OperatorIdentitySize, OperatorAvatarSize> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
}

export type OperatorIdentityProps = {
  address: string
  /** Off-chain metadata.name; when set the address sinks into a sub-line. */
  name?: string
  /** Off-chain metadata.logoURI. */
  logoURI?: string
  size?: OperatorIdentitySize
  /** Slot for inline indicators — verified, YOU, featured, etc. */
  badge?: ReactNode
  /** Anchor on the address — wraps in an external explorer link when set. */
  explorerUrl?: string
  /** Stack the address under the name; suppress when the consumer has a tighter row. */
  hideAddress?: boolean
  /** Suppress the leading avatar — useful when the consumer (e.g. a row template)
   *  already renders an avatar in a leading slot and the inline copy would duplicate. */
  hideAvatar?: boolean
  className?: string
}

/**
 * Compact operator identity. Default rendering:
 *   [avatar] Name
 *           0x1234…abcd
 * When `name` is absent, the truncated address is promoted to the primary line —
 * matching every other staking UI's behavior for unnamed validators.
 */
export function OperatorIdentity({
  address,
  name,
  logoURI,
  size = 'md',
  badge,
  explorerUrl,
  hideAddress = false,
  hideAvatar = false,
  className,
}: OperatorIdentityProps) {
  const sizeClass =
    size === 'sm' ? 'ds-operator-identity--sm' : size === 'lg' ? 'ds-operator-identity--lg' : ''
  const root = ['ds-operator-identity', sizeClass, className].filter(Boolean).join(' ')
  const short = truncateAddress(address)

  const addressLine = hideAddress ? null : (
    <span className="ds-operator-identity-address">
      {explorerUrl ? (
        <a href={explorerUrl} target="_blank" rel="noreferrer" title={`View ${address} on explorer`}>
          {short}
        </a>
      ) : (
        short
      )}
    </span>
  )

  return (
    <span className={root}>
      {!hideAvatar && (
        <OperatorAvatar name={name} address={address} src={logoURI} size={AVATAR_FOR_IDENTITY[size]} />
      )}
      <span className="ds-operator-identity-text">
        <span className="ds-operator-identity-name">
          <span className="ds-operator-identity-name-text">{name ?? short}</span>
          {badge}
        </span>
        {name && addressLine}
        {!name && hideAddress === false && size === 'lg' && (
          <span className="ds-operator-identity-address ds-subtle">unnamed operator</span>
        )}
      </span>
    </span>
  )
}
