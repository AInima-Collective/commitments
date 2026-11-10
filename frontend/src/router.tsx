import { lazy, type ComponentType } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import RootLayout from './components/shell/RootLayout'
import { ErrorPanel } from './components/ui'
import { VaultRedirect } from './components/shell/VaultRedirect'
import { MutualsRedirect } from './components/shell/MutualsRedirect'
import Landing from './pages/Landing'

/**
 * A lazily loaded page in its own chunk, behind its own error panel. The
 * shell's `<Suspense>` (RootLayout) covers the load, so the landing page and
 * the shell no longer download every page.
 */
export function page(panelName: string, load: () => Promise<{ default: ComponentType }>) {
  const Page = lazy(() =>
    load().catch((error: unknown) => {
      // A redeploy renames the chunks under an open tab, and `lazy` keeps the
      // rejection: reload once per path for the new build, then show the error.
      const key = `reloaded:${location.pathname}`
      try {
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1')
          location.reload()
          return new Promise<never>(() => {})
        }
      } catch {
        // Storage blocked: no guard, so no reload.
      }
      throw error
    }),
  )
  return (
    <ErrorPanel panelName={panelName}>
      <Page />
    </ErrorPanel>
  )
}

export const router = createBrowserRouter([
  // Landing is the index route. It intentionally lives OUTSIDE RootLayout —
  // it's the marketing surface and must not inherit the app shell (sidebar,
  // topbar, wallet widget). The dapp itself is mounted under '/app'.
  {
    path: '/',
    element: <ErrorPanel panelName="Landing"><Landing /></ErrorPanel>,
  },
  {
    path: '/app',
    element: <RootLayout />,
    children: [
      { index: true, element: page('Dashboard', () => import('./pages/Dashboard')) },
      // Legacy /vault redirects to /vaults/:address for the canonical vault.
      { path: 'vault', element: <VaultRedirect /> },
      { path: 'vaults', element: page('Vaults', () => import('./pages/Vaults')) },
      { path: 'vaults/:address', element: page('Vault', () => import('./pages/Vault')) },
      // Backing was folded into the dashboard's "Your assets" section (deposit +
      // withdraw modals). Redirect old links/bookmarks to the dashboard.
      { path: 'backing', element: <Navigate to="/app" replace /> },
      // The protocol-wide Explorer supersedes the former commitments list.
      // Keep the exact route as a redirect for bookmarks while preserving the
      // shareable /commitments/:id detail URLs below.
      { path: 'commitments', element: <Navigate to="/app/explorer" replace /> },
      { path: 'commitments/:id', element: page('Commitment', () => import('./pages/CommitmentDetail')) },
      { path: 'arbiters/:address', element: page('Arbiter', () => import('./pages/ArbiterDetail')) },
      { path: 'arbitration', element: page('Arbitration', () => import('./pages/Arbitration')) },
      { path: 'arbitration/two-tier/:id', element: page('Two-tier case', () => import('./pages/TwoTierCaseDetail')) },
      { path: 'claims/:id', element: page('Claim', () => import('./pages/ClaimDetail')) },
      // /marketplace is the risk-coverage marketplace (the former /mutuals list,
      // redesigned). Mutual is its detail surface.
      { path: 'marketplace', element: page('Marketplace', () => import('./pages/Marketplace')) },
      { path: 'marketplace/:mutualId', element: page('Coverage', () => import('./pages/Mutual')) },
      // Legacy /mutuals* → /marketplace* (the mutuals list became the marketplace).
      { path: 'mutuals', element: <MutualsRedirect /> },
      { path: 'mutuals/:mutualId', element: <MutualsRedirect /> },
      { path: 'services', element: page('Services', () => import('./pages/Services')) },
      { path: 'services/:slug', element: page('Service', () => import('./pages/Service')) },
      // ERC-8004 agent showcase: registered identities + their SLA bonds.
      { path: 'agents', element: page('Agents', () => import('./pages/Agents')) },
      { path: 'agents/:agentId', element: page('Agent', () => import('./pages/AgentDetail')) },
      { path: 'governance', element: page('Governance', () => import('./pages/Governance')) },
      { path: 'governance/:governor', element: page('Governor', () => import('./pages/GovernorDetail')) },
      { path: 'governance/:governor/new', element: page('New proposal', () => import('./pages/CreateProposal')) },
      { path: 'governance/:governor/:id', element: page('Proposal', () => import('./pages/ProposalDetail')) },
      // Legacy /mesh entry — redirect to /services.
      { path: 'mesh', element: <Navigate to="/app/services" replace /> },
      { path: 'mesh/*', element: <Navigate to="/app/services" replace /> },
      { path: 'explorer', element: page('Explorer', () => import('./pages/Explorer')) },
      { path: 'design', element: page('Design', () => import('./pages/Design')) },
      { path: 'design/recipes', element: page('Design Recipes', () => import('./pages/DesignRecipes')) },
      { path: 'design/value', element: page('Value Design Exploration', () => import('./pages/ValueDesignExploration')) },
      // Scaffolding: the palette / type / brand-mark experiment surface.
      // Remove along with components/ui/labTheme.ts once a direction lands.
      { path: 'lab', element: page('Design Lab', () => import('./pages/Lab')) },
      { path: 'docs/*', element: page('Docs', () => import('./pages/Docs')) },
      { path: 'resources', element: page('Resources', () => import('./pages/Resources')) },
      { path: 'admin', element: page('Admin', () => import('./pages/Admin')) },
      // Unknown paths under /app fall back to the dashboard.
      { path: '*', element: <Navigate to="/app" replace /> },
    ],
  },
  // Unknown top-level paths fall back to the landing page.
  { path: '*', element: <Navigate to="/" replace /> },
])
