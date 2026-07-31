import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useChainId } from "wagmi";
import { TopBar } from "./TopBar";
import { WrongNetworkBanner } from "./WrongNetworkBanner";
import { ViewingBanner } from "./ViewingBanner";
import { BrandMark, ErrorPanel, GitHubMark, SocialLink, ThemeToggle, XMark } from "../ui";

const ANVIL_CHAIN_ID = 31337;

const GITHUB_URL = "https://github.com/AInima-Collective/commitments";
const X_URL = "https://x.com/jakehartnell";

type Route = { label: string; to: string; meta?: string; end?: boolean };
type NavGroup = { label: string; to?: string; children: Route[] };

const PRIMARY: Route[] = [
  { label: "Dashboard", to: "/app", end: true },
  { label: "Marketplace", to: "/app/marketplace" },
  { label: "Services", to: "/app/services" },
  { label: "Agents", to: "/app/agents" },
  { label: "Vaults", to: "/app/vaults" },
];

// Docs is a disclosure group whose links mirror the current authority model.
// Historical archive pages remain direct-only and are not advertised here.
const DOCS_GROUP: NavGroup = {
  label: "Docs",
  to: "/app/docs",
  children: [
    { label: "Overview", to: "/app/docs", end: true },
    { label: "Standards", to: "/app/docs/standards", end: false },
    { label: "Protocol Documentation", to: "/app/docs/protocol", end: false },
    { label: "Design RFCs", to: "/app/docs/design", end: false },
    { label: "Design system", to: "/app/design", end: true },
    // Scaffolding — remove with the lab once a visual direction is chosen.
    { label: "Design lab", to: "/app/lab", end: true },
    { label: "Skill.md", to: "/app/resources", end: true },
  ],
};

function SideNavGroup({ group, onNavigate }: { group: NavGroup; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const childActive = group.children.some((c) =>
    c.end ? pathname === c.to : pathname === c.to || pathname.startsWith(`${c.to}/`),
  );
  // `userOpen` tracks the user's explicit toggle; `null` means "follow nav".
  // Active children always force the group open so the current page is visible.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? childActive;

  return (
    <div className="ds-sidenav-group" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="ds-sidenav-link ds-sidenav-group-toggle"
        aria-expanded={open}
        aria-current={childActive && !open ? "page" : undefined}
        onClick={() => setUserOpen(!open)}
      >
        <span className="ds-row" style={{ gap: "var(--space-2)" }}>
          <span className="ds-disclosure-caret" aria-hidden />
          <span>{group.label}</span>
        </span>
        <span className="ds-sidenav-link-meta">{group.children.length}</span>
      </button>
      <div className="ds-sidenav-group-children" role="group" aria-label={group.label}>
        {group.children.map((c) => (
          <NavLink
            key={c.to}
            to={c.to}
            end={c.end}
            onClick={onNavigate}
            className="ds-sidenav-link ds-sidenav-link--child"
          >
            <span>{c.label}</span>
            {c.meta && <span className="ds-sidenav-link-meta">{c.meta}</span>}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const chainId = useChainId();
  const showAdmin = chainId === ANVIL_CHAIN_ID;
  return (
    <nav className="ds-sidenav" aria-label="Sections">
      <div className="ds-sidenav-section">protocol</div>
      {PRIMARY.map((r) => (
        <NavLink key={r.to} to={r.to} end={r.end} onClick={onNavigate} className="ds-sidenav-link">
          <span>{r.label}</span>
          {r.meta && <span className="ds-sidenav-link-meta">{r.meta}</span>}
        </NavLink>
      ))}
      {showAdmin && (
        <>
          <div className="ds-sidenav-section">dev</div>
          <NavLink to="/app/admin" onClick={onNavigate} className="ds-sidenav-link">
            <span>Admin</span>
          </NavLink>
          <NavLink to="/app/arbitration" onClick={onNavigate} className="ds-sidenav-link">
            <span>Arbitration</span>
          </NavLink>
          <NavLink to="/app/explorer" onClick={onNavigate} className="ds-sidenav-link">
            <span>Explorer</span>
          </NavLink>
        </>
      )}
      <div className="ds-sidenav-section">resources</div>
      <SideNavGroup group={DOCS_GROUP} onNavigate={onNavigate} />
      <div className="ds-sidenav-footer">
        <span className="ds-row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
          <ThemeToggle />
          <SocialLink
            href={GITHUB_URL}
            label="GitHub"
            target="_blank"
            rel="noreferrer noopener"
            icon={<GitHubMark />}
          />
          <SocialLink href={X_URL} label="X (Twitter)" target="_blank" rel="noreferrer noopener" icon={<XMark />} />
        </span>
        <span className="ds-sidenav-footer-meta">
          <span className="ds-badge ds-badge--muted">alpha</span>
          <span className="ds-text-xs ds-subtle ds-mono-num">v0.1.0</span>
        </span>
      </div>
    </nav>
  );
}

function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <div className="ds-drawer" data-open={open ? "true" : "false"} aria-hidden={!open}>
      <button
        type="button"
        className="ds-drawer-overlay"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside className="ds-drawer-panel" role="dialog" aria-label="Navigation">
        <div className="ds-drawer-panel-header">
          {/* Mobile counterpart of the topbar brand — same destination, and it
           * dismisses the drawer on the way out. */}
          <Link to="/" className="ds-topnav-brand" aria-label="Commitments home" onClick={onClose}>
            <BrandMark size="md" />
            <span>commitments</span>
          </Link>
          <button type="button" className="ds-drawer-close" aria-label="Close menu" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="ds-drawer-panel-body">{children}</div>
      </aside>
    </div>
  );
}

export default function RootLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="ds-root ds-app-shell">
      <TopBar onOpenDrawer={() => setDrawerOpen(true)} />
      <WrongNetworkBanner />
      <ViewingBanner />
      <div className="ds-app-body">
        <aside className="ds-app-sidebar">
          <SideNav />
        </aside>
        <main className="ds-app-main">
          <ErrorPanel panelName="content">
            <Outlet />
          </ErrorPanel>
        </main>
      </div>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <SideNav onNavigate={() => setDrawerOpen(false)} />
      </Drawer>
    </div>
  );
}
