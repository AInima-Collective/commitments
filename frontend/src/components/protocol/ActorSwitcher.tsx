import { AddressDisplay, Select } from '../ui'
import { useDevWallet, type DevActor } from '../../contexts/devWallet'

export interface ActorSwitcherProps {
  /** Visual size — passed through to the underlying `<Select>`. */
  size?: 'sm' | 'md' | 'lg'
  /** Optional override of the actor list (useful for /design demos). */
  actors?: DevActor[]
}

/**
 * Anvil-only actor picker. Wraps `<Select>` with the seven preset accounts
 * (Admin, Arbiter, Depositor 0–4) derived from the standard Anvil mnemonic.
 *
 * Selecting an actor updates the shared {@link DevWalletProvider} context;
 * downstream `useDevWalletClient()` consumers immediately see the new signer.
 */
export function ActorSwitcher({ size = 'md', actors: actorsOverride }: ActorSwitcherProps) {
  const wallet = useDevWallet()
  const actors = actorsOverride ?? wallet.actors
  const current = actors.find((a) => a.id === wallet.current.id) ?? actors[0]

  if (!current) return null

  return (
    <div
      className="ds-row"
      data-actor-switcher
      style={{ gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'nowrap' }}
    >
      <span className="ds-text-xs ds-subtle" style={{ whiteSpace: 'nowrap' }}>
        acting as
      </span>
      <Select
        size={size}
        value={wallet.current.id}
        onChange={(e) => wallet.selectActor(e.target.value as typeof wallet.current.id)}
        aria-label="Select active actor"
      >
        {actors.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </Select>
      <AddressDisplay address={current.address} compact />
    </div>
  )
}
