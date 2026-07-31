import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAccount, useChainId } from "wagmi";
import { CreateCommitmentForm } from "../components/commitment/CreateCommitmentForm";
import { AgreementProposalDrawer } from "../components/agreement/AgreementProposalDrawer";
import { OfferProposeMode } from "../components/agreement/OfferProposeMode";
import { ProposeAgreementForm } from "../components/agreement/ProposeAgreementForm";
import { CommitmentsGraph } from "../components/graph/CommitmentsGraph";
import { CommitmentsGraphProvider } from "../contexts/CommitmentsGraphContext";
import { useCommitmentsGraph } from "../contexts/useCommitmentsGraph";
import { EmptyState, FilterBar, Modal, Notice, StatBlock, type DataTableSort } from "../components/ui";
import { PageHeader } from "../components/protocol";
import { CommitmentsTable } from "../components/commitment/CommitmentsTable";
import { CommitmentCards } from "../components/commitment/CommitmentCards";
import { getContractAddresses } from "../config/contracts";
import { getMarketOffer, type MarketOffer } from "../config/marketOffers";
import { useClaimableYield } from "../hooks/useClaimableYield";
import { useTokenMetaMap } from "../hooks/useTokenMeta";
import { useUnifiedRows, type UnifiedProposalRowEntry, type UnifiedRow } from "../hooks/useUnifiedRows";
import { useViewAddress } from "../hooks/useViewAddress";
import { compareCommitmentUrgency } from "../lib/commitmentSort";
import {
  DIRECTION_FILTER_OPTIONS,
  ROLE_FILTER_OPTIONS,
  SORT_OPTIONS,
  UNIFIED_STATUS_FILTER_OPTIONS,
  applyCommitmentFilters,
  availableTags,
  parseSortValue,
  toSortValue,
  type DirectionFilter,
  type RoleFilter,
} from "../lib/commitmentFilters";
import { isSingleCommitOffer } from "../lib/offerCommitmentParams";
import { isAgreementOffer } from "../lib/offerProposeParams";

/**
 * Default sort for the unified commitments + proposals view. Mirrors the
 * canonical commitment urgency comparator (lib/commitmentSort) but inserts
 * pending proposals between FORFEIT_PENDING (must dispute) and ACTIVE — both
 * are user-actionable, with forfeit disputes taking precedence over offer
 * acceptance. Within the proposal tier, imminent expiry floats up.
 */
function compareUnifiedUrgency(a: UnifiedRow, b: UnifiedRow): number {
  const ta = unifiedTier(a);
  const tb = unifiedTier(b);
  if (ta !== tb) return ta - tb;
  if (a.kind === "proposal" && b.kind === "proposal") {
    if (a.expiresAt !== b.expiresAt) return a.expiresAt < b.expiresAt ? -1 : 1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  }
  return compareCommitmentUrgency(a, b);
}

function unifiedTier(row: UnifiedRow): number {
  if (row.kind === "commitment" && row.status === "FORFEIT_PENDING") return 0;
  if (row.kind === "proposal") return 1;
  if (row.kind === "commitment" && (row.status === "ACTIVE" || row.status === "UNBONDING")) return 2;
  return 3;
}

export default function Commitments() {
  const chainId = useChainId();
  const navigate = useNavigate();
  const viewAddress = useViewAddress();
  const { address: connectedAddress, isConnected } = useAccount();
  // Creating anything from this page acts as the CONNECTED wallet, so both
  // actions below gate on this rather than on `isConnected` — otherwise a
  // visitor inspecting a stranger's commitments gets live buttons that
  // silently make their own.
  const isOwnList =
    !!connectedAddress && !!viewAddress && viewAddress.toLowerCase() === connectedAddress.toLowerCase();
  const { commitmentManager: managerAddress } = getContractAddresses(chainId);

  const [createOpen, setCreateOpen] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);
  // Marketplace deep-links via ?offer=<id>; resolve to the live offer object so
  // CreateCommitmentForm renders the OfferMode branch with locked terms. The
  // modal opens whenever the offer is present (derived) — no useEffect.
  const [searchParams, setSearchParams] = useSearchParams();
  const offerParam = searchParams.get("offer");
  const offerFromParam = useMemo<MarketOffer | undefined>(() => {
    if (!offerParam) return undefined;
    const found = getMarketOffer(offerParam);
    if (!found) return undefined;
    return isSingleCommitOffer(found) || isAgreementOffer(found) ? found : undefined;
  }, [offerParam]);
  // Single-commit goes to the create modal; agreement-shape goes to the
  // propose modal. The dispatch lives here so both modals can stay focused.
  const offerIsAgreement = !!offerFromParam && isAgreementOffer(offerFromParam);
  const offerIsCommit = !!offerFromParam && isSingleCommitOffer(offerFromParam);
  // Drop a stale or unsupported `?offer=` so the URL doesn't lie about state.
  useEffect(() => {
    if (offerParam && !offerFromParam) {
      const next = new URLSearchParams(searchParams);
      next.delete("offer");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerParam, offerFromParam]);
  function clearOfferParam() {
    if (!offerParam) return;
    const next = new URLSearchParams(searchParams);
    next.delete("offer");
    setSearchParams(next, { replace: true });
  }
  // The create modal is "open" whenever the user explicitly opens it OR a
  // single-commit offer arrives via the URL. Agreement-shape offers route
  // to the propose modal instead. Closing either always clears both.
  const createModalOpen = createOpen || offerIsCommit;
  const proposeModalOpen = proposeOpen || offerIsAgreement;
  function closeCreate() {
    setCreateOpen(false);
    clearOfferParam();
  }
  function closePropose() {
    setProposeOpen(false);
    clearOfferParam();
  }
  // Drawer is now proposal-only — commitment rows navigate to /commitments/:id
  // for shareable per-commitment URLs. Proposals stay in the drawer because
  // they're transient pre-acceptance state with no stable surface to deep-link.
  const [detailRow, setDetailRow] = useState<UnifiedProposalRowEntry | null>(null);

  function handleRowClick(row: UnifiedRow) {
    if (row.kind === "commitment") {
      navigate(`/app/commitments/${row.id.toString()}`);
    } else {
      setDetailRow(row);
    }
  }
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [role, setRole] = useState<RoleFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<DataTableSort | undefined>(undefined);
  // Seeded from `?tag=` so a tag chip on a detail page can deep-link into a
  // filtered list. Comma-separated; the page mounts fresh on that navigation,
  // so reading the param once at init is enough.
  const [tags, setTags] = useState<string[]>(() =>
    (searchParams.get("tag") ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );

  // `?view=` is already taken by the view-as-address feature (useViewAddress),
  // so the layout switch is `?layout=`. Getting that wrong would silently
  // hijack viewing another address.
  const layout: "cards" | "table" = searchParams.get("layout") === "table" ? "table" : "cards";
  function setLayout(next: "cards" | "table") {
    const params = new URLSearchParams(searchParams);
    // Cards are the default, so the tidy URL is the default one.
    if (next === "cards") params.delete("layout");
    else params.set("layout", next);
    setSearchParams(params, { replace: true });
  }

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  const { rows, isLoading, error, indexerOnline, refetch } = useUnifiedRows({
    managerAddress,
    viewAddress,
  });
  // Per-row token metadata for the LIST: every commitment/proposal carries its
  // own backing token, so amounts are denominated in that token — not the vault
  // share. The create/propose forms below are token-aware too: each resolves the
  // selected backing's decimals/symbol and the user's per-(token) ledger free
  // balance internally, so the page no longer threads a vault position down.
  const tokenMeta = useTokenMetaMap(rows.map((r) => r.token));
  // Live per-commitment claimable yield feeds the table's Yield column (summed
  // per commitment id inside CommitmentsTable). Same source as the dashboard.
  const { entries: claimableEntries } = useClaimableYield({ managerAddress, viewAddress });

  const filtered = useMemo(
    () => applyCommitmentFilters(rows, { direction, statuses, role, search, tags }),
    [rows, direction, statuses, role, search, tags],
  );

  // Facet options come from the loaded rows, not a fixed vocabulary: tags are
  // free-form producer text, so the only honest list is the one on screen.
  const tagOptions = useMemo(
    () => availableTags(rows).map((t) => ({ value: t, label: t })),
    [rows],
  );

  const sortedRows = useMemo(() => {
    if (!sort) return [...filtered].sort(compareUnifiedUrgency);
    const copy = [...filtered];
    const dir = sort.direction === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      switch (sort.columnId) {
        case "id":
          return (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) * dir;
        case "amount":
          return (a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0) * dir;
        default:
          return 0;
      }
    });
    return copy;
  }, [filtered, sort]);

  const commitmentRows = useMemo(() => rows.filter((r) => r.kind === "commitment"), [rows]);
  const proposalRows = useMemo(() => rows.filter((r) => r.kind === "proposal"), [rows]);
  const totalCount = commitmentRows.length;
  const activeCount = commitmentRows.filter((r) => r.status === "ACTIVE").length;
  const unbondingCount = commitmentRows.filter((r) => r.status === "UNBONDING").length;
  const pendingCount = proposalRows.length;

  function clearFilters() {
    setDirection("all");
    setStatuses([]);
    setRole("all");
    setSearch("");
    setTags([]);
  }

  // Explicit active-filter count: the bar's default derivation treats the "all"
  // sentinel as a filled value, so direction/role would always read as active.
  // Count only non-default selections so the count chip + "clear" affordance
  // appear exactly when a filter is actually applied.
  const activeFilterCount =
    (direction !== "all" ? 1 : 0) +
    (statuses.length > 0 ? 1 : 0) +
    (role !== "all" ? 1 : 0) +
    (search.trim() ? 1 : 0) +
    (tags.length > 0 ? 1 : 0);

  const emptyState = (
    <EmptyState
      title="NO COMMITMENTS"
      description={
        rows.length === 0
          ? "You have no commitments yet. Create one to lock vault shares with a chosen counterparty."
          : "No commitments match the current filters."
      }
    />
  );

  if (!viewAddress) {
    return (
      <div className="ds-page">
        <PageHeader title="Commitments" />
        <Notice tone="info" title="No address selected">
          Connect a wallet or paste an Ethereum address above to view your commitments.
        </Notice>
      </div>
    );
  }

  if (!managerAddress) {
    return (
      <div className="ds-page">
        <PageHeader title="Commitments" />
        <Notice tone="danger" title="Commitment manager not configured">
          Set <code>VITE_COMMITMENT_MANAGER_ADDRESS</code> in your environment to enable commitments.
        </Notice>
      </div>
    );
  }

  return (
    <div className="ds-page">
      <PageHeader
        title="Commitments"
        lead="Pre-locked vault shares with a chosen arbiter and a two-phase forfeit window. Paired (↔) rows are bilateral agreements."
        actions={
          <div className="ds-row ds-row-3" style={{ alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="ds-btn"
              onClick={() => setProposeOpen(true)}
              disabled={!isOwnList}
              title={
                !isConnected
                  ? "Connect a wallet to propose agreements"
                  : !isOwnList
                    ? "You are viewing another address — switch back to your wallet"
                    : undefined
              }
            >
              Propose agreement
            </button>
            <button
              type="button"
              className="ds-btn ds-btn--primary"
              onClick={() => setCreateOpen(true)}
              disabled={!isOwnList}
              title={
                !isConnected
                  ? "Connect a wallet to create commitments"
                  : !isOwnList
                    ? "You are viewing another address — switch back to your wallet"
                    : undefined
              }
            >
              Create commitment
            </button>
          </div>
        }
      />

      <section className="ds-stat-grid" aria-label="Commitments summary">
        <StatBlock value={totalCount.toString()} label="Total commitments" />
        <StatBlock value={activeCount.toString()} label="Active" />
        <StatBlock value={unbondingCount.toString()} label="Unbonding" />
        <StatBlock value={pendingCount.toString()} label="Pending proposals" />
      </section>

      {!indexerOnline && (
        <Notice tone="warn" title="Commitments unavailable">
          Live commitment data is temporarily unavailable — please retry shortly.
        </Notice>
      )}

      {indexerOnline && error && (
        <Notice
          tone="danger"
          title="Failed to load commitments"
          actions={
            <button type="button" className="ds-btn ds-btn--sm" onClick={refetch}>
              retry
            </button>
          }
        >
          {error.message}
        </Notice>
      )}

      <CommitmentsGraphProvider address={viewAddress}>
        <section aria-labelledby="commitments-graph-heading" className="ds-stack ds-stack-3">
          <header className="ds-section-header">
            <h2 id="commitments-graph-heading" className="ds-section-title">
              Graph
            </h2>
            <span className="ds-section-eyebrow">
              agreement topology around {viewAddress.slice(0, 6)}…{viewAddress.slice(-4)}
            </span>
          </header>
          <CommitmentsGraphPanel />
        </section>
      </CommitmentsGraphProvider>

      <section aria-labelledby="commitments-table-heading" className="ds-stack ds-stack-3">
        <header className="ds-section-header">
          <h2 id="commitments-table-heading" className="ds-section-title">
            Commitments
          </h2>
          <span className="ds-row ds-row-3" style={{ alignItems: "center" }}>
            <span className="ds-section-eyebrow">
              your stake — {filtered.length} of {rows.length}
            </span>
            <span className="ds-layout-toggle" role="group" aria-label="Layout">
              <button type="button" aria-pressed={layout === "cards"} onClick={() => setLayout("cards")}>
                cards
              </button>
              <button type="button" aria-pressed={layout === "table"} onClick={() => setLayout("table")}>
                table
              </button>
            </span>
          </span>
        </header>

        <FilterBar size="sm" activeCount={activeFilterCount} onClearAll={clearFilters}>
          <FilterBar.Select
            label="direction"
            value={direction}
            onChange={(v) => setDirection(v as DirectionFilter)}
            options={DIRECTION_FILTER_OPTIONS}
          />
          <FilterBar.Multi
            label="status"
            value={statuses}
            onChange={setStatuses}
            options={UNIFIED_STATUS_FILTER_OPTIONS}
          />
          <FilterBar.Select
            label="role"
            value={role}
            onChange={(v) => setRole(v as RoleFilter)}
            options={ROLE_FILTER_OPTIONS}
          />
          {tagOptions.length > 0 && (
            <FilterBar.Multi label="tag" value={tags} onChange={setTags} options={tagOptions} />
          )}
          {/* Card mode has no column headers to click, so sort lives here and
              both layouts read and write the same state. */}
          <FilterBar.Select
            label="sort"
            value={toSortValue(sort)}
            onChange={(v) => setSort(parseSortValue(v) as DataTableSort | undefined)}
            options={SORT_OPTIONS}
          />
          <FilterBar.Search
            label="search"
            value={search}
            onChange={setSearch}
            placeholder="name, description, tag, or 0x… address"
          />
        </FilterBar>

        {layout === "cards" ? (
          <CommitmentCards
            aria-label="commitments"
            rows={sortedRows}
            onOpenRow={handleRowClick}
            tokenMeta={tokenMeta}
            showYield
            claimableEntries={claimableEntries}
            resolveContext={{ managerAddress, connectedAddress, isConnected, onActed: refetch }}
            onSelectTag={toggleTag}
            activeTags={tags}
            isLoading={isLoading && rows.length === 0}
            emptyState={emptyState}
          />
        ) : (
          <CommitmentsTable
            aria-label="commitments"
            rows={sortedRows}
            onOpenRow={handleRowClick}
            tokenMeta={tokenMeta}
            showYield
            claimableEntries={claimableEntries}
            resolveContext={{ managerAddress, connectedAddress, isConnected, onActed: refetch }}
            sort={sort}
            onSortChange={setSort}
            onSelectTag={toggleTag}
            activeTags={tags}
            isLoading={isLoading && rows.length === 0}
            emptyState={emptyState}
          />
        )}
      </section>

      <Modal
        open={createModalOpen}
        onClose={closeCreate}
        title={offerIsCommit && offerFromParam ? `Commit to ${offerFromParam.name}` : "Create commitment"}
        description={
          offerIsCommit && offerFromParam
            ? `${offerFromParam.whitepaperRef} — counterparty and arbiter are locked by the offer; you set the amount.`
            : "Pre-lock vault shares to an arbiter for a chosen counterparty. Two-phase forfeit window protects both sides."
        }
        size="lg"
      >
        <CreateCommitmentForm
          managerAddress={managerAddress}
          isConnected={isConnected}
          connectedAddress={connectedAddress}
          offer={offerIsCommit ? offerFromParam : undefined}
          onCancel={closeCreate}
          onCommitmentCreated={() => {
            refetch();
            closeCreate();
          }}
        />
      </Modal>

      <Modal
        open={proposeModalOpen}
        onClose={closePropose}
        title={offerIsAgreement && offerFromParam ? `Propose agreement: ${offerFromParam.name}` : "Propose agreement"}
        description={
          offerIsAgreement && offerFromParam
            ? `${offerFromParam.whitepaperRef} — counterparty, arbiter, forfeit terms, and (where applicable) settlement caps are locked by the offer.`
            : "Pair your stake with another party's. Both sides commit when they accept; a shared arbiter and challenge window govern the forfeit flow."
        }
        size="lg"
      >
        {offerIsAgreement && offerFromParam ? (
          <OfferProposeMode
            offer={offerFromParam}
            managerAddress={managerAddress}
            isConnected={isConnected}
            connectedAddress={connectedAddress}
            onCancel={closePropose}
            onProposalCreated={() => {
              refetch();
              closePropose();
            }}
          />
        ) : (
          <ProposeAgreementForm
            managerAddress={managerAddress}
            isConnected={isConnected}
            connectedAddress={connectedAddress}
            onProposalCreated={() => {
              refetch();
              closePropose();
            }}
          />
        )}
      </Modal>

      <AgreementProposalDrawer
        open={detailRow !== null}
        onClose={() => setDetailRow(null)}
        row={detailRow}
        managerAddress={managerAddress}
        isConnected={isConnected}
        onActed={() => {
          refetch();
        }}
      />
    </div>
  );
}

function CommitmentsGraphPanel() {
  const { agreements, hasIndexer } = useCommitmentsGraph();
  if (!hasIndexer) {
    return (
      <Notice tone="info" size="sm">
        Set <code>VITE_INDEXER_URL</code> and run the indexer to view the commitments graph.
      </Notice>
    );
  }
  return (
    <CommitmentsGraph
      mode="agreements"
      payload={agreements.data}
      isLoading={agreements.isLoading}
      error={agreements.error}
      emptyMessage="No commitments for this address yet."
    />
  );
}
