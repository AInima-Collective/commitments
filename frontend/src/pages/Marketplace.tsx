import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button, EmptyState, ErrorBlock, FilterBar, Notice, Skeleton } from "../components/ui";
import { PageHeader, type MutualLifecycle } from "../components/protocol";
import { CoveragePoolCard } from "../components/mutual/CoveragePoolCard";
import { useMutualListings, type MutualListing } from "../hooks/useMutualListings";
import { useMutuals, type MutualIndexed } from "../hooks/useMutuals";
import { useTokenMetaMap } from "../hooks/useTokenMeta";
import { truncateAddress } from "../lib/format";
import { mutualLifecycle } from "../lib/mutual";
import { parsePerilURI, perilLabel } from "../lib/peril";

/**
 * The offering's distribution model — the marketplace's type axis. What a pool
 * *covers* (a vault's NAV, a peg, operator slashing) is the peril, not the
 * type: several perils reference a vault. The type is how depositors GET the
 * cover:
 *
 * - `open`: anyone buys an individual policy against the pool.
 * - `vault-funded`: the covered vault pays the premium itself (keyless conduit
 *   skimming realized yield), so every deposit is covered automatically and
 *   there is no buy-cover side — visitors only underwrite.
 *
 * Derived from indexer enrichment (`coveredVault`); `undefined` when the
 * indexer is down, in which case type-filtered views exclude the row (the
 * page-level warn notice explains the degradation).
 */
type OfferingType = "open" | "vault-funded";

function offeringTypeOf(mutual: MutualIndexed | undefined): OfferingType | undefined {
  if (!mutual) return undefined;
  return mutual.coveredVault != null ? "vault-funded" : "open";
}

type TypeFilter = "all" | OfferingType;
type StatusFilter = "all" | MutualLifecycle;

const TYPE_FILTER_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "all types" },
  { value: "open", label: "open cover — buy a policy" },
  { value: "vault-funded", label: "vault-funded — automatic" },
];

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "all statuses" },
  { value: "active", label: "active" },
  { value: "pending", label: "pending" },
  { value: "terminated", label: "terminated" },
];

/** Sort dimensions exposed in the toolbar. */
type SortKey = "apr" | "cover" | "id";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "apr", label: "premium APR (high → low)" },
  { value: "cover", label: "cover available (high → low)" },
  { value: "id", label: "pool ID" },
];

/** Available cover for ranking — loss-adjusted live capacity. */
function coverOf(listing: MutualListing): bigint {
  return listing.liveCapacity;
}

/**
 * /marketplace — the risk-coverage marketplace (formerly the /mutuals list).
 *
 * Each listing is a **coverage pool**: a two-sided market where underwriters
 * post forfeitable backing to earn premium. The buyer side differs by offering
 * type ({@link OfferingType}): open pools sell individual policies, while
 * vault-funded pools cover every depositor of a vault automatically. All pools
 * render in ONE grid, differentiated by badge + filterable by type — a
 * vault-funded pool is still a coverage pool, not a separate product.
 *
 * Listings, loss-adjusted `liveCapacity`, member count, cumulative markdown Λ,
 * premium APR, lifecycle status and the offering type all come from the
 * indexer's `/mutuals` ({@link useMutualListings} is a projection of
 * {@link useMutuals}, deduped by react-query). Without an indexer the grid is
 * empty.
 */
export default function Marketplace() {
  const navigate = useNavigate();
  const { listings, isLoading, refetch } = useMutualListings();
  // Same `/mutuals` query useMutualListings wraps — react-query dedupes by key, so
  // this is free. It carries the indexed enrichment + the fetch error state
  // useMutualListings doesn't re-expose.
  const indexed = useMutuals();
  const [sortKey, setSortKey] = useState<SortKey>("apr");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [assetFilter, setAssetFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const numeraires = useMemo(() => listings.map((s) => s.numeraire), [listings]);
  const { metaFor } = useTokenMetaMap(numeraires);

  // Asset filter options — the distinct numeraire tokens across all listings,
  // labelled by on-chain symbol (placeholder while the meta multicall is in
  // flight). Values are lowercased addresses, so pools stay distinguishable
  // even when two tokens share a symbol — the label disambiguates with a
  // truncated address in that case.
  const assetOptions = useMemo<{ value: string; label: string }[]>(() => {
    const symbolByAddr = new Map<string, string>();
    const symbolCounts = new Map<string, number>();
    for (const s of listings) {
      const k = s.numeraire.toLowerCase();
      if (symbolByAddr.has(k)) continue;
      const sym = metaFor(s.numeraire).symbol;
      symbolByAddr.set(k, sym);
      symbolCounts.set(sym, (symbolCounts.get(sym) ?? 0) + 1);
    }
    const opts = [...symbolByAddr.entries()].map(([value, sym]) => ({
      value,
      label: (symbolCounts.get(sym) ?? 0) > 1 ? `${sym} (${truncateAddress(value)})` : sym,
    }));
    opts.sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: "all", label: "all assets" }, ...opts];
  }, [listings, metaFor]);

  const activeFilterCount =
    (typeFilter !== "all" ? 1 : 0) +
    (assetFilter !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (search.trim().length > 0 ? 1 : 0);

  function clearFilters() {
    setTypeFilter("all");
    setAssetFilter("all");
    setStatusFilter("all");
    setSearch("");
  }

  // Filter, then sort by the selected dimension. Premium APR / cover available
  // sort descending (best first); rows missing the metric sink to the bottom.
  // ID is the stable ascending fallback.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const next = listings.filter((s) => {
      const row = indexed.byId.get(s.mutualId);
      if (typeFilter !== "all" && offeringTypeOf(row) !== typeFilter) return false;
      if (assetFilter !== "all" && s.numeraire.toLowerCase() !== assetFilter) return false;
      if (statusFilter !== "all" && (row === undefined || mutualLifecycle(row) !== statusFilter)) return false;
      if (q.length > 0) {
        const peril = parsePerilURI(s.perilURI);
        const hay = `${perilLabel(s.perilURI)} ${peril.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const aprOf = (id: bigint) => indexed.byId.get(id)?.premiumAprBps;
    next.sort((a, b) => {
      if (sortKey === "apr") {
        const av = aprOf(a.mutualId);
        const bv = aprOf(b.mutualId);
        if (av === undefined && bv === undefined) return cmpId(a, b);
        if (av === undefined) return 1;
        if (bv === undefined) return -1;
        if (av !== bv) return bv - av;
        return cmpId(a, b);
      }
      if (sortKey === "cover") {
        const av = coverOf(a);
        const bv = coverOf(b);
        if (av !== bv) return av > bv ? -1 : 1;
        return cmpId(a, b);
      }
      return cmpId(a, b);
    });
    return next;
  }, [listings, indexed.byId, sortKey, typeFilter, assetFilter, statusFilter, search]);

  let content: React.ReactNode;

  if (isLoading && listings.length === 0) {
    content = (
      <div className="ds-grid-auto-fit" aria-busy="true" aria-label="Loading coverage pools">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} shape="block" style={{ height: 280 }} />
        ))}
      </div>
    );
  } else if (listings.length === 0) {
    content = indexed.isError ? (
      <ErrorBlock
        title="Could not load coverage pools"
        message="Live data is temporarily unavailable — please retry shortly."
        detail={indexed.error?.message}
        actions={
          <Button size="sm" variant="ghost" onClick={() => refetch()}>
            Retry
          </Button>
        }
      />
    ) : (
      <EmptyState
        title="NO COVERAGE POOLS"
        description="No coverage pools yet — check back soon."
      />
    );
  } else {
    content = (
      <div className="ds-stack ds-stack-4">
        {indexed.isError && (
          <Notice tone="warn" size="sm" title="Live coverage unavailable">
            The indexer is unreachable, so loss-adjusted cover, premium APR, underwriter counts, offering type, and
            lifecycle status can't be shown. Figures below are nominal subscribed amounts from chain, and type/status
            filters will not match.
          </Notice>
        )}
        <FilterBar size="sm" activeCount={activeFilterCount} onClearAll={clearFilters}>
          <FilterBar.Select
            label="type"
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as TypeFilter)}
            options={TYPE_FILTER_OPTIONS}
          />
          <FilterBar.Select
            label="asset"
            value={assetFilter}
            onChange={setAssetFilter}
            options={assetOptions}
          />
          <FilterBar.Select
            label="status"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={STATUS_FILTER_OPTIONS}
          />
          <FilterBar.Search
            label="search"
            value={search}
            onChange={setSearch}
            placeholder="name or description"
          />
          {/* Sort rides in the same toolbar strip but is not a filter — it is
              excluded from activeCount and untouched by "clear". */}
          <FilterBar.Select
            label="sort"
            value={sortKey}
            onChange={(v) => setSortKey(v as SortKey)}
            options={SORT_OPTIONS}
          />
        </FilterBar>
        {rows.length === 0 ? (
          <EmptyState
            title="NO MATCHING POOLS"
            description="No coverage pools match the current filters — clear them to see every listing."
          />
        ) : (
          <div className="ds-grid-auto-fit">
            {rows.map((s) => {
              const row = indexed.byId.get(s.mutualId);
              return (
                <CoveragePoolCard
                  key={s.mutualId.toString()}
                  listing={s}
                  mutual={row}
                  meta={metaFor(s.numeraire)}
                  onOpen={(action) =>
                    navigate(`/app/marketplace/${s.mutualId.toString()}${action ? `?action=${action}` : ""}`)
                  }
                  onOpenVault={
                    row?.coveredVault != null
                      ? () => navigate(`/app/vaults/${row.coveredVault}`)
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ds-page">
      <PageHeader
        eyebrow="risk coverage"
        title="Marketplace"
        lead="A marketplace for on-chain risk coverage. Each listing is a coverage pool: underwrite a risk to earn premium, and get covered by buying a policy — or automatically, when a vault funds cover for all of its depositors."
      />
      {content}
    </div>
  );
}

/** Stable id comparator (ascending) used as the tiebreaker for every sort. */
function cmpId(a: MutualListing, b: MutualListing): number {
  return a.mutualId < b.mutualId ? -1 : a.mutualId > b.mutualId ? 1 : 0;
}
