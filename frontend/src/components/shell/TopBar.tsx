import { Link } from 'react-router-dom'
import { BrandMark } from '../ui'
import { WalletWidget } from './WalletWidget'

export function TopBar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  return (
    <header className="ds-topnav ds-app-topnav" role="banner">
      {/* The brand leaves the app and returns to the marketing site — the
       * dashboard is reachable from the sidebar, so pointing the logo at /app
       * gave it no destination the nav didn't already have. */}
      {/* size="md" matches .lp-nav-brand's mark on the landing page. The
        * default is "xs", which left the app lockup at half the size of the
        * marketing one even though the wordmark beside it already matched. */}
      <Link to="/" className="ds-topnav-brand" aria-label="Commitments home">
        <BrandMark size="md" />
        <span>commitments</span>
      </Link>
      <div className="ds-topnav-actions">
        <WalletWidget />
        <button
          type="button"
          className="ds-mobile-trigger"
          aria-label="Open menu"
          onClick={onOpenDrawer}
        >
          <span className="ds-mobile-trigger-bars" aria-hidden>
            <span /><span /><span />
          </span>
        </button>
      </div>
    </header>
  )
}
