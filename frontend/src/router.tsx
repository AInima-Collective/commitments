import { createBrowserRouter, Navigate } from 'react-router-dom'
import RootLayout from './components/shell/RootLayout'
import { ErrorPanel } from './components/ui'
import { VaultRedirect } from './components/shell/VaultRedirect'
import { MutualsRedirect } from './components/shell/MutualsRedirect'
import Dashboard from './pages/Dashboard'
import Vault from './pages/Vault'
import Vaults from './pages/Vaults'
import ClaimDetail from './pages/ClaimDetail'
import CommitmentDetail from './pages/CommitmentDetail'
import Arbitration from './pages/Arbitration'
// /marketplace is the risk-coverage marketplace (the former /mutuals list,
// redesigned). Mutual is its detail surface.
import Marketplace from './pages/Marketplace'
import Mutual from './pages/Mutual'
import Service from './pages/Service'
import Services from './pages/Services'
import Agents from './pages/Agents'
import AgentDetail from './pages/AgentDetail'
import Explorer from './pages/Explorer'
import Governance from './pages/Governance'
import GovernorDetail from './pages/GovernorDetail'
import ProposalDetail from './pages/ProposalDetail'
import CreateProposal from './pages/CreateProposal'
import Design from './pages/Design'
import DesignRecipes from './pages/DesignRecipes'
import Lab from './pages/Lab'
import Docs from './pages/Docs'
import Resources from './pages/Resources'
import Admin from './pages/Admin'
import Landing from './pages/Landing'

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
      { index: true, element: <ErrorPanel panelName="Dashboard"><Dashboard /></ErrorPanel> },
      // Legacy /vault redirects to /vaults/:address for the canonical vault.
      { path: 'vault', element: <VaultRedirect /> },
      { path: 'vaults', element: <ErrorPanel panelName="Vaults"><Vaults /></ErrorPanel> },
      { path: 'vaults/:address', element: <ErrorPanel panelName="Vault"><Vault /></ErrorPanel> },
      // Backing was folded into the dashboard's "Your assets" section (deposit +
      // withdraw modals). Redirect old links/bookmarks to the dashboard.
      { path: 'backing', element: <Navigate to="/app" replace /> },
      // The protocol-wide Explorer supersedes the former commitments list.
      // Keep the exact route as a redirect for bookmarks while preserving the
      // shareable /commitments/:id detail URLs below.
      { path: 'commitments', element: <Navigate to="/app/explorer" replace /> },
      { path: 'commitments/:id', element: <ErrorPanel panelName="Commitment"><CommitmentDetail /></ErrorPanel> },
      { path: 'arbitration', element: <ErrorPanel panelName="Arbitration"><Arbitration /></ErrorPanel> },
      { path: 'claims/:id', element: <ErrorPanel panelName="Claim"><ClaimDetail /></ErrorPanel> },
      { path: 'marketplace', element: <ErrorPanel panelName="Marketplace"><Marketplace /></ErrorPanel> },
      { path: 'marketplace/:mutualId', element: <ErrorPanel panelName="Coverage"><Mutual /></ErrorPanel> },
      // Legacy /mutuals* → /marketplace* (the mutuals list became the marketplace).
      { path: 'mutuals', element: <MutualsRedirect /> },
      { path: 'mutuals/:mutualId', element: <MutualsRedirect /> },
      { path: 'services', element: <ErrorPanel panelName="Services"><Services /></ErrorPanel> },
      { path: 'services/:slug', element: <ErrorPanel panelName="Service"><Service /></ErrorPanel> },
      // ERC-8004 agent showcase: registered identities + their SLA bonds.
      { path: 'agents', element: <ErrorPanel panelName="Agents"><Agents /></ErrorPanel> },
      { path: 'agents/:agentId', element: <ErrorPanel panelName="Agent"><AgentDetail /></ErrorPanel> },
      { path: 'governance', element: <ErrorPanel panelName="Governance"><Governance /></ErrorPanel> },
      { path: 'governance/:governor', element: <ErrorPanel panelName="Governor"><GovernorDetail /></ErrorPanel> },
      { path: 'governance/:governor/new', element: <ErrorPanel panelName="New proposal"><CreateProposal /></ErrorPanel> },
      { path: 'governance/:governor/:id', element: <ErrorPanel panelName="Proposal"><ProposalDetail /></ErrorPanel> },
      // Legacy /mesh entry — redirect to /services.
      { path: 'mesh', element: <Navigate to="/app/services" replace /> },
      { path: 'mesh/*', element: <Navigate to="/app/services" replace /> },
      { path: 'explorer', element: <ErrorPanel panelName="Explorer"><Explorer /></ErrorPanel> },
      { path: 'design', element: <ErrorPanel panelName="Design"><Design /></ErrorPanel> },
      { path: 'design/recipes', element: <ErrorPanel panelName="Design Recipes"><DesignRecipes /></ErrorPanel> },
      // Scaffolding: the palette / type / brand-mark experiment surface.
      // Remove along with components/ui/labTheme.ts once a direction lands.
      { path: 'lab', element: <ErrorPanel panelName="Design Lab"><Lab /></ErrorPanel> },
      { path: 'docs/*', element: <ErrorPanel panelName="Docs"><Docs /></ErrorPanel> },
      { path: 'resources', element: <ErrorPanel panelName="Resources"><Resources /></ErrorPanel> },
      { path: 'admin', element: <ErrorPanel panelName="Admin"><Admin /></ErrorPanel> },
      // Unknown paths under /app fall back to the dashboard.
      { path: '*', element: <Navigate to="/app" replace /> },
    ],
  },
  // Unknown top-level paths fall back to the landing page.
  { path: '*', element: <Navigate to="/" replace /> },
])
