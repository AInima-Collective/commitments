import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark, ThemeToggle, Button } from '../ui'

const GITHUB_URL = 'https://github.com/AInima-Collective/commitments'

type LandingShellProps = {
  children: ReactNode
}

export function LandingShell({ children }: LandingShellProps) {
  return (
    <div className="lp-shell" data-section="landing">
      <a href="#lp-main" className="lp-skip">
        Skip to content
      </a>
      <header className="lp-nav" role="banner">
        <Link to="/" className="lp-nav-brand" aria-label="Commitments home">
          <BrandMark size="md" />
          <span>commitments</span>
        </Link>
        <nav className="lp-nav-actions" aria-label="Primary">
          <span className="lp-nav-secondary">
            <Button as={Link} to="/app/docs/protocol" variant="ghost" size="sm">
              Protocol
            </Button>
            <Button as={Link} to="/app/docs/standards" variant="ghost" size="sm">
              Standards
            </Button>
            <Button as={Link} to="/app/docs" variant="ghost" size="sm">
              Docs
            </Button>
            <Button
              as="a"
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              variant="ghost"
              size="sm"
              aria-label="GitHub repository (opens in new tab)"
            >
              GitHub
            </Button>
          </span>
          <ThemeToggle />
          <Button as={Link} to="/app" variant="primary" size="sm">
            Launch app
          </Button>
        </nav>
      </header>

      <main id="lp-main" className="lp-main">
        {children}
      </main>

      <footer className="lp-footer" role="contentinfo">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <BrandMark size="sm" />
            <span>commitments protocol</span>
          </div>
          <div className="lp-footer-links">
            <Link to="/app" className="lp-footer-link">Launch app</Link>
            <Link to="/app/docs" className="lp-footer-link">Docs</Link>
            <Link to="/app/docs/protocol" className="lp-footer-link">Protocol</Link>
            <Link to="/app/docs/standards" className="lp-footer-link">Standards</Link>
            <a
              href={GITHUB_URL}
              className="lp-footer-link"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository (opens in new tab)"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
