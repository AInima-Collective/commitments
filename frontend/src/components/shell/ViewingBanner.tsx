import { AddressDisplay } from '../ui'
import { useViewContext } from '../../hooks/useViewAddress'

/**
 * Persistent notice while the app is pointed at an address other than the
 * connected wallet.
 *
 * The pages already grey out their write actions in this mode, but a disabled
 * button explains nothing on its own — someone who pasted an address ten
 * minutes ago and scrolled has no way to know why "Deposit" stopped working,
 * and worse, someone who forgot could read a stranger's balances as their own.
 * The banner is the one thing on screen that cannot be scrolled past.
 */
export function ViewingBanner() {
  const { viewAddress, connectedAddress, isViewingOther, setViewAddress } = useViewContext()

  if (!isViewingOther || !viewAddress) return null

  return (
    <div className="ds-notice ds-viewing-banner" data-tone="info" role="status">
      <span>
        Viewing <AddressDisplay address={viewAddress} /> — read only.{' '}
        {connectedAddress
          ? 'Actions still belong to your own wallet, so they are turned off here.'
          : 'Connect a wallet to act on your own position.'}
      </span>
      <button type="button" className="ds-btn ds-btn--sm" onClick={() => setViewAddress(undefined)}>
        {connectedAddress ? 'back to my wallet' : 'clear'}
      </button>
    </div>
  )
}
