import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { useChainId, useReadContracts } from "wagmi";
import { erc20Abi, type Abi, type Address } from "viem";
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
import { getContractAddresses, type VaultDescriptor } from "../config/contracts";
import { commitmentManagerAbi, commitmentsVaultAbi } from "../generated";
import { useAssetPrices, type PriceEntry } from "../hooks/useAssetPrices";
import { useVaultMetadata } from "../hooks/useIndexerMetadata";
import { IMMUTABLE, POLL } from "../hooks/polling";
import { useTokenMetaMap } from "../hooks/useTokenMeta";
import { vaultPeriodicQuery } from "../hooks/useVaultPeriodicHistory";
import { useVaults } from "../hooks/useVaults";
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
 * /vaults — multi-vault index page. Lists every vault from {@link useVaults}
 * in a sortable DataTable, one row per vault, read in one batch per source.
 * Click a row → /vaults/:address.
 */
export default function Vaults() {
  const viewAddress = useViewAddress();
  const navigate = useNavigate();
  const { vaults } = useVaults();
  const rows = useVaultRows(vaults, viewAddress);

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
            <VaultName row={r} />
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
                title={`Vault shares — in wallet: ${formatTokenAmount(r.shares ?? 0n, dec).full} · free in manager: ${
                  formatTokenAmount(r.free ?? 0n, dec).full
                } · backing commitments: ${formatTokenAmount(committed, dec).full}`}
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
        rows={rows}
        columns={columns}
        getPrice={getPrice}
        onRowClick={(r) => navigate(`/app/vaults/${r.descriptor.address}`)}
      />
    </div>
  );
}

interface VaultsTableProps {
  rows: VaultRowData[];
  columns: DataTableColumn<VaultRowData>[];
  getPrice: (symbol: string | undefined) => PriceEntry | undefined;
  onRowClick: (r: VaultRowData) => void;
}

function VaultsTable({ rows: unsorted, columns, getPrice, onRowClick }: VaultsTableProps) {
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

/** The vault's metadata name, else its indexed or configured name. */
function VaultName({ row }: { row: VaultRowData }) {
  const meta = useVaultMetadata(row.descriptor.address);
  const metaName = typeof meta.content?.name === "string" && meta.content.name.length > 0 ? meta.content.name : undefined;
  return <span>{metaName ?? row.descriptor.name ?? `${row.assetSymbol} Vault`}</span>;
}

// Wide element type (abi: Abi, functionName: string) so wagmi's per-element
// inference does not blow the instantiation depth on a mixed-ABI batch.
type Call = { abi: Abi; address: Address | undefined; functionName: string; args?: readonly unknown[] };

/**
 * Every vault's row: one batch for each vault's asset and share decimals, the
 * asset's metadata (cached per token), one polling batch for the live chain
 * state and the viewer's position, and one indexer query per vault for APY.
 */
function useVaultRows(vaults: VaultDescriptor[], viewAddress: Address | undefined): VaultRowData[] {
  const chainId = useChainId();
  const { commitmentManager: manager } = getContractAddresses(chainId);

  const { data: fixed } = useReadContracts({
    contracts: vaults.flatMap((v): Call[] => [
      { abi: commitmentsVaultAbi as Abi, address: v.address, functionName: "asset" },
      { abi: commitmentsVaultAbi as Abi, address: v.address, functionName: "decimals" },
    ]),
    query: { enabled: vaults.length > 0, ...IMMUTABLE },
  });
  const assets = vaults.map((_, i) => fixed?.[i * 2]?.result as Address | undefined);
  const assetMeta = useTokenMetaMap(assets);

  // Per vault: the three vault-wide reads, then the viewer's three holdings
  // when there is a viewer and a manager.
  const mine = viewAddress && manager ? viewAddress : undefined;
  const perVault = mine ? 6 : 3;
  const { data: live } = useReadContracts({
    contracts: vaults.flatMap((v): Call[] => [
      { abi: commitmentsVaultAbi as Abi, address: v.address, functionName: "totalAssets" },
      { abi: commitmentsVaultAbi as Abi, address: v.address, functionName: "convertToAssets", args: [SHARE_PROBE] },
      { abi: commitmentsVaultAbi as Abi, address: v.address, functionName: "depositsPaused" },
      ...(mine
        ? [
            { abi: erc20Abi as Abi, address: v.address, functionName: "balanceOf", args: [mine] },
            { abi: commitmentManagerAbi as Abi, address: manager, functionName: "freeBalance", args: [v.address, mine] },
            { abi: commitmentManagerAbi as Abi, address: manager, functionName: "encumberedBalance", args: [v.address, mine] },
          ]
        : []),
    ]),
    query: { enabled: vaults.length > 0, refetchInterval: POLL.fast },
  });

  // Each vault's realized rolling APY from the indexer's snapshots (7d, else
  // 30d) — no fabricated defaults; null until one exists ("accruing").
  const apy = useQueries({
    queries: vaults.map((v) => vaultPeriodicQuery({ vaultAddress: v.address, latest: true })),
  });

  return vaults.map((descriptor, i) => {
    const at = (k: number) => live?.[i * perVault + k]?.result;
    const meta = assets[i] ? assetMeta.byAddress[assets[i].toLowerCase()] : undefined;
    const latest = apy[i]?.data?.rows[0];
    return {
      descriptor,
      tvl: at(0) as bigint | undefined,
      netApyBps: latest?.apy7d ?? latest?.apy30d ?? null,
      shares: mine ? (at(3) as bigint | undefined) : undefined,
      free: mine ? (at(4) as bigint | undefined) : undefined,
      encumbered: mine ? (at(5) as bigint | undefined) : undefined,
      sharePrice: at(1) as bigint | undefined,
      assetDecimals: meta?.decimals,
      shareDecimals: fixed?.[i * 2 + 1]?.result as number | undefined,
      assetSymbol: meta?.symbol ?? descriptor.assetSymbol,
      paused: at(2) === true,
    };
  });
}
