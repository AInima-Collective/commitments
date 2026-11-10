import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChainId } from "wagmi";
import type { Address } from "viem";
import {
  DataTable,
  EmptyState,
  Notice,
  StatBlock,
  TokenAmount,
  TokenIcon,
  UsdAmount,
  type DataTableColumn,
  type DataTableSort,
} from "../components/ui";
import { PageHeader } from "../components/protocol";
import { getContractAddresses, getVaultRegistry, type VaultDescriptor } from "../config/contracts";
import {
  useReadCommitmentsVaultConvertToAssets,
  useReadCommitmentsVaultTotalAssets,
} from "../generated";
import { useAssetPrices, type PriceEntry } from "../hooks/useAssetPrices";
import { useVaultApy } from "../hooks/useVaultApy";
import { useVaultMetadata } from "../hooks/useIndexerMetadata";
import { useVaultPosition } from "../hooks/useVaultPosition";
import { useViewAddress } from "../hooks/useViewAddress";
import { bigintToUsd, formatPercent, formatTokenAmount } from "../lib/format";

/**
 * Probe size for the per-vault share price. `convertToAssets` is linear, so
 * `amount * convertToAssets(P) / P` is the underlying value of `amount` for
 * ANY non-zero P — the probe cancels. That matters because share decimals are
 * asset decimals plus the vault's 9-place offset and differ per vault, so
 * there is no single correct "one share" constant to ask about.
 */
const SHARE_PROBE = 10n ** 18n;

interface VaultRowData {
  descriptor: VaultDescriptor;
  tvl: bigint | undefined;
  /** Realized rolling-window APY (bps), or null while still accruing. */
  netApyBps: number | null;
  /**
   * The three places a holding can sit. `shares` is the ERC-4626 balance in
   * the WALLET; `free` and `encumbered` are the manager ledger's two sides.
   * The page used to show only `shares`, which is why a depositor whose whole
   * position was committed read "—" here while the dashboard showed it in
   * full — the same holding, from two places, disagreeing.
   */
  shares: bigint | undefined;
  free: bigint | undefined;
  encumbered: bigint | undefined;
  /** `convertToAssets(SHARE_PROBE)` — converts share counts to underlying. */
  sharePrice: bigint | undefined;
  /** Asset decimals (e.g. 6 for USDC) — used for TVL rendering. */
  assetDecimals: number | undefined;
  /** Vault share decimals (asset + ERC-4626 offset) — used for position rendering. */
  shareDecimals: number | undefined;
  assetSymbol: string;
  paused: boolean;
  /** Off-chain metadata fields surfaced from indexer (vault.v1). */
  metaName: string | undefined;
}

/** Everything the holder owns in this vault, wherever it currently sits. */
function totalShares(r: VaultRowData): bigint {
  return (r.shares ?? 0n) + (r.free ?? 0n) + (r.encumbered ?? 0n);
}

/**
 * A share count expressed in the vault's UNDERLYING asset.
 *
 * Shares are not assets, and the gap is not cosmetic: this page was rendering
 * share counts under the asset's symbol and pricing them with the asset's
 * price, so a vault whose share had appreciated 5% under-reported the holding
 * by 5% and the page total with it. Undefined until the share price lands —
 * an unconverted number here is a wrong number, not a rounder one.
 */
function toUnderlying(r: VaultRowData, shares: bigint): bigint | undefined {
  if (r.sharePrice === undefined) return undefined;
  return (shares * r.sharePrice) / SHARE_PROBE;
}

/** Full-precision share count for the position breakdown tooltip. */
function fmtShares(raw: bigint, decimals: number): string {
  return formatTokenAmount(raw, decimals).full;
}

/** `part` as a whole-number percentage of `total`, for the row's sub-label. */
function percentOf(part: bigint, total: bigint): number {
  if (total === 0n) return 0;
  return Number((part * 100n) / total);
}

/**
 * USD value of a raw amount as a 6-decimal bigint, or null when the asset has
 * no quote. Null propagates to `UsdAmount`, which renders an explicit "price
 * unavailable" — a vault valued at $0 because the price feed is down would
 * otherwise sort to the bottom and read as empty.
 */
function usdOf(
  raw: bigint | undefined,
  decimals: number | undefined,
  symbol: string,
  getPrice: (symbol: string | undefined) => PriceEntry | undefined,
): bigint | null {
  if (raw === undefined || decimals === undefined) return null;
  const price = getPrice(symbol)?.usd;
  if (price === undefined) return null;
  return bigintToUsd(raw, decimals, price);
}

/**
 * /vaults — multi-vault index page. Reads the vault registry and renders a
 * sortable DataTable with one row per vault. Click a row → /vaults/:address.
 *
 * The page mounts a hidden <VaultRowFetcher> per registry entry; each
 * fetcher calls the read hooks for its vault and lifts the resulting row
 * data into the parent's state map. The rendered DataTable consumes the
 * collected rows. This swaps the old fixed-5-vault hook unroll for an
 * unbounded N — the registry can grow without further code changes.
 */
export default function Vaults() {
  const chainId = useChainId();
  const viewAddress = useViewAddress();
  const navigate = useNavigate();

  const vaults = useMemo(() => getVaultRegistry(chainId), [chainId]);

  // Prices for every asset in the registry, so TVL and positions can be
  // compared across vaults at all. Requested once here rather than per row.
  const priceSymbols = useMemo(() => [...new Set(vaults.map((v) => v.assetSymbol))], [vaults]);
  const { getPrice } = useAssetPrices({ symbols: priceSymbols });

  const columns = useMemo<DataTableColumn<VaultRowData>[]>(() => {
    return [
      {
        id: "asset",
        header: "asset",
        render: (r) => (
          <span className="ds-row ds-row-2" style={{ alignItems: "center" }}>
            <TokenIcon symbol={r.assetSymbol} size="sm" />
            <span>{r.metaName ?? r.descriptor.name ?? `${r.assetSymbol} Vault`}</span>
          </span>
        ),
      },
      {
        // USD leads and the native amount sits underneath. Native-only made the
        // sort arrow on this column a lie: ranking 66.38K USDC against 20.606
        // WETH compares two different units, so the largest vault could land
        // anywhere. USD is the only figure this column can honestly order by.
        id: "tvl",
        header: "TVL",
        align: "right",
        sortable: true,
        render: (r) => {
          if (r.tvl === undefined) return <span className="ds-subtle">…</span>;
          return (
            <span className="ds-stack ds-stack-0" style={{ alignItems: "flex-end" }}>
              <UsdAmount amount={usdOf(r.tvl, r.assetDecimals, r.assetSymbol, getPrice)} compact />
              <span className="ds-text-xs ds-subtle">
                <TokenAmount amount={r.tvl} decimals={r.assetDecimals ?? 18} symbol={r.assetSymbol} compact />
              </span>
            </span>
          );
        },
      },
      {
        id: "apy",
        header: "net APY",
        align: "right",
        sortable: true,
        render: (r) =>
          r.netApyBps !== null ? (
            <span className="ds-mono-num">{formatPercent(r.netApyBps)}</span>
          ) : (
            <span className="ds-row ds-row-2" style={{ display: "inline-flex", justifyContent: "flex-end" }}>
              <span className="ds-subtle">—</span>
              <span
                className="ds-badge ds-badge--muted"
                title="APY accrues after the first snapshot interval with share-price movement."
              >
                accruing
              </span>
            </span>
          ),
      },
      {
        id: "position",
        header: "your position",
        align: "right",
        sortable: true,
        render: (r) => {
          const total = totalShares(r);
          if (total === 0n) return <span className="ds-subtle">—</span>;
          const underlying = toUnderlying(r, total);
          if (underlying === undefined) return <span className="ds-subtle">…</span>;
          const dec = r.shareDecimals ?? 18;
          // Committed capital is still yours, so it counts toward the total,
          // but it is the part you cannot withdraw today. That belongs on the
          // row, not only in a tooltip.
          const committed = r.encumbered ?? 0n;
          return (
            <span className="ds-stack ds-stack-0" style={{ alignItems: "flex-end" }}>
              <TokenAmount
                amount={underlying}
                decimals={r.assetDecimals ?? 18}
                symbol={r.assetSymbol}
                compact
              />
              <span
                className="ds-text-xs ds-subtle"
                // Vault shares, not the asset amount above it — this is the
                // breakdown of WHERE the position sits, and the ledger holds
                // shares. Spelled out so the two numbers don't read as a
                // contradiction.
                title={`Vault shares — in wallet: ${fmtShares(
                  r.shares ?? 0n,
                  dec,
                )} · free in manager: ${fmtShares(r.free ?? 0n, dec)} · backing commitments: ${fmtShares(
                  committed,
                  dec,
                )}`}
              >
                {committed > 0n ? `${percentOf(committed, total)}% committed` : "all withdrawable"}
              </span>
            </span>
          );
        },
      },
      {
        id: "status",
        header: "status",
        render: (r) => (
          <span className={`ds-badge ${r.paused ? "ds-badge--warn" : "ds-badge--success"}`}>
            {r.paused ? "paused" : "open"}
          </span>
        ),
      },
    ];
  }, [getPrice]);

  if (vaults.length === 0) {
    return (
      <div className="ds-page">
        <PageHeader eyebrow="capital" title="Vaults" lead="Earn yield by depositing assets into vaults." />
        <Notice tone="warn" title="No vaults configured">
          Set <code>VITE_COMMITMENTS_VAULT_ADDRESS</code> in your environment, then add the vault to{" "}
          <code>config/contracts.ts</code>'s <code>getVaultRegistry()</code>.
        </Notice>
      </div>
    );
  }

  return (
    <div className="ds-page">
      <PageHeader eyebrow="capital" title="Vaults" lead="Earn yield by depositing assets into vaults." />

      <VaultsTable
        vaults={vaults}
        viewAddress={viewAddress}
        columns={columns}
        getPrice={getPrice}
        onRowClick={(r) => navigate(`/app/vaults/${r.descriptor.address}`)}
      />
    </div>
  );
}

interface VaultsTableProps {
  vaults: VaultDescriptor[];
  viewAddress: ReturnType<typeof useViewAddress>;
  columns: DataTableColumn<VaultRowData>[];
  getPrice: (symbol: string | undefined) => PriceEntry | undefined;
  onRowClick: (r: VaultRowData) => void;
}

/**
 * Mounts one <VaultRowFetcher> per descriptor to call the read hooks per
 * vault, collects their results into a Map keyed by address, and renders the
 * DataTable from the assembled rows. Unbounded N — the registry is small
 * (1–5 today) and per-vault hook calls are cheap; if the registry ever grows
 * past ~50 we'd want to chunk into a smaller number of useReadContracts
 * calls to stay under RPC batch limits.
 */
function VaultsTable({ vaults, viewAddress, columns, getPrice, onRowClick }: VaultsTableProps) {
  const [rowMap, setRowMap] = useState<Map<Address, VaultRowData>>(() => new Map());

  const handleRowData = useCallback((address: Address, row: VaultRowData | null) => {
    setRowMap((prev) => {
      if (row === null) {
        if (!prev.has(address)) return prev;
        const next = new Map(prev);
        next.delete(address);
        return next;
      }
      const existing = prev.get(address);
      if (existing && rowDataEqual(existing, row)) return prev;
      const next = new Map(prev);
      next.set(address, row);
      return next;
    });
  }, []);

  const unsorted = useMemo(
    () => vaults.map((v) => rowMap.get(v.address)).filter((r): r is VaultRowData => Boolean(r)),
    [vaults, rowMap],
  );

  // DataTable renders the sort affordance but explicitly does not sort ("pass
  // already-prepared data"). Nobody was, so clicking a header only flipped an
  // arrow while the rows stayed in registry order. Sorting happens here now,
  // and every column marked sortable has a comparator in `sortRows`.
  const [sort, setSort] = useState<DataTableSort>({ columnId: "tvl", direction: "desc" });
  const rows = useMemo(() => sortRows(unsorted, sort, getPrice), [unsorted, sort, getPrice]);

  const totals = useMemo(() => {
    let tvlUsd = 0n;
    let mineUsd = 0n;
    // One unpriced asset makes both sums incomplete rather than merely
    // smaller, so report nothing instead of a confident wrong total.
    let priced = true;
    for (const r of unsorted) {
      const t = usdOf(r.tvl, r.assetDecimals, r.assetSymbol, getPrice);
      const m = usdOf(toUnderlying(r, totalShares(r)), r.assetDecimals, r.assetSymbol, getPrice);
      if (t === null || m === null) priced = false;
      tvlUsd += t ?? 0n;
      mineUsd += m ?? 0n;
    }
    return { tvlUsd: priced ? tvlUsd : null, mineUsd: priced ? mineUsd : null };
  }, [unsorted, getPrice]);

  const held = unsorted.filter((r) => totalShares(r) > 0n).length;
  const open = unsorted.filter((r) => !r.paused).length;

  return (
    <>
      {vaults.map((descriptor) => (
        <VaultRowFetcher
          key={descriptor.address}
          descriptor={descriptor}
          viewAddress={viewAddress}
          onRowData={handleRowData}
        />
      ))}
      {/* Totals first. Four rows under a bare heading gave the page no answer
        * to "how big is this, and how much of it is mine" without reading and
        * adding up every row by hand. */}
      <div className="ds-grid ds-grid-3">
        <StatBlock label="total value locked" value={<UsdAmount amount={totals.tvlUsd} compact />} />
        <StatBlock
          label="your position"
          value={<UsdAmount amount={totals.mineUsd} compact />}
          meta={held > 0 ? `across ${held} of ${unsorted.length} vaults` : "no deposits yet"}
        />
        <StatBlock label="vaults open" value={`${open} / ${unsorted.length}`} />
      </div>
      <DataTable<VaultRowData>
        aria-label="vaults"
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.descriptor.address}
        sort={sort}
        onSortChange={setSort}
        onRowClick={onRowClick}
        emptyState={<EmptyState title="NO VAULTS" description="No vaults are configured for this network." />}
      />
    </>
  );
}

/**
 * Order rows by the active column.
 *
 * TVL and position sort on USD, not on the native amount — which is the whole
 * reason the USD figure leads those columns. Rows whose key cannot be computed
 * (no price, read still in flight) go last in BOTH directions, so a pending
 * value never displaces a known one from the top.
 */
function sortRows(
  rows: VaultRowData[],
  sort: DataTableSort,
  getPrice: (symbol: string | undefined) => PriceEntry | undefined,
): VaultRowData[] {
  const keyOf = (r: VaultRowData): number | null => {
    switch (sort.columnId) {
      case "tvl": {
        const usd = usdOf(r.tvl, r.assetDecimals, r.assetSymbol, getPrice);
        return usd === null ? null : Number(usd);
      }
      case "apy":
        return r.netApyBps;
      case "position": {
        const usd = usdOf(toUnderlying(r, totalShares(r)), r.assetDecimals, r.assetSymbol, getPrice);
        return usd === null ? null : Number(usd);
      }
      default:
        return null;
    }
  };
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    if (ka === null && kb === null) return 0;
    if (ka === null) return 1;
    if (kb === null) return -1;
    return (ka - kb) * dir;
  });
}

/** Field-by-field equality check so we don't re-render the table on identical
 *  hook-result re-fetches. Compares only the fields rendered in columns. */
function rowDataEqual(a: VaultRowData, b: VaultRowData): boolean {
  return (
    a.descriptor.address === b.descriptor.address &&
    a.tvl === b.tvl &&
    a.netApyBps === b.netApyBps &&
    a.shares === b.shares &&
    a.free === b.free &&
    a.encumbered === b.encumbered &&
    a.sharePrice === b.sharePrice &&
    a.assetDecimals === b.assetDecimals &&
    a.shareDecimals === b.shareDecimals &&
    a.assetSymbol === b.assetSymbol &&
    a.paused === b.paused &&
    a.metaName === b.metaName
  );
}

interface VaultRowFetcherProps {
  descriptor: VaultDescriptor;
  viewAddress: ReturnType<typeof useViewAddress>;
  onRowData: (address: Address, row: VaultRowData | null) => void;
}

/**
 * Hidden per-vault component that calls the read hooks and lifts the
 * resulting row data into the parent. Renders nothing — purely a
 * hook-host so the parent can call hooks per registry entry without
 * violating the rules of hooks.
 */
function VaultRowFetcher({ descriptor, viewAddress, onRowData }: VaultRowFetcherProps) {
  const chainId = useChainId();
  const { commitmentManager: managerAddress } = getContractAddresses(chainId);
  const position = useVaultPosition({
    vaultAddress: descriptor.address,
    viewAddress,
    managerAddress,
  });
  const { data: tvlData } = useReadCommitmentsVaultTotalAssets({
    address: descriptor.address,
    query: { enabled: true, refetchInterval: 30_000 },
  });
  // Share price, for turning the holder's share counts into asset amounts.
  const { data: sharePrice } = useReadCommitmentsVaultConvertToAssets({
    address: descriptor.address,
    args: [SHARE_PROBE],
    query: { refetchInterval: 30_000 },
  });
  // Each row fetches its OWN realized APY from the indexer snapshot pipeline —
  // no fabricated defaults, no descriptor overrides. `netBps` is null until a
  // real rolling-window rate exists, which the table renders as "accruing".
  const apy = useVaultApy(descriptor.address);
  const meta = useVaultMetadata(descriptor.address);

  const metaName =
    typeof meta.content?.name === "string" && meta.content.name.length > 0 ? meta.content.name : undefined;

  const row: VaultRowData = useMemo(
    () => ({
      descriptor,
      tvl: (tvlData as bigint | undefined) ?? undefined,
      // Real per-vault realized APY (bps), or null while still accruing.
      netApyBps: apy.netBps,
      shares: position.shares,
      free: position.free,
      encumbered: position.encumbered,
      sharePrice: sharePrice as bigint | undefined,
      assetDecimals: position.assetDecimals,
      shareDecimals: position.shareDecimals,
      assetSymbol: position.assetSymbol ?? descriptor.assetSymbol,
      paused: position.depositsPaused,
      metaName,
    }),
    [
      descriptor,
      tvlData,
      apy.netBps,
      position.shares,
      position.free,
      position.encumbered,
      sharePrice,
      position.assetDecimals,
      position.shareDecimals,
      position.assetSymbol,
      position.depositsPaused,
      metaName,
    ],
  );

  // Lift the assembled row into the parent's row map. The parent's setState
  // is gated by a field-by-field equality check, so identical re-fetches
  // don't trigger a table re-render.
  useEffect(() => {
    onRowData(descriptor.address, row);
  }, [descriptor.address, row, onRowData]);

  return null;
}
