import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { type Abi, type Address, type Hex } from "viem";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import { ClaimableYieldPanel } from "../components/commitment/ClaimableYieldPanel";
import { CommitmentsTable } from "../components/commitment/CommitmentsTable";
import { type CommitmentsResolveContext } from "../components/commitment/commitmentCells";
import { CreateCommitmentForm } from "../components/commitment/CreateCommitmentForm";
import { AgreementProposalDrawer } from "../components/agreement/AgreementProposalDrawer";
import { BackingFlow } from "../components/backing/BackingFlow";
import { BackingWithdrawForm } from "../components/backing/BackingWithdrawForm";
import { PortfolioChart } from "../components/dashboard/PortfolioChart";
import { PortfolioSankey } from "../components/dashboard/PortfolioSankey";
import {
  ActivityFeed,
  CommitmentTitle,
  EncumbranceBar,
  PageHeader,
  PortfolioHero,
  type ActivityEvent,
} from "../components/protocol";
import { useCommitmentLabelContext } from "../hooks/useCommitmentLabelContext";
import { commitmentLabel, type CommitmentLabelContext } from "../lib/commitmentLabel";
import {
  AddressDisplay,
  EmptyState,
  FilterBar,
  MediaRow,
  Modal,
  Notice,
  SectionNav,
  TokenAmount,
  TokenIcon,
  UsdAmount,
  useToasts,
  type SectionNavItem,
} from "../components/ui";
import {
  getBackingOptions,
  getContractAddresses,
  getVaultDescriptor,
  getVaultRegistry,
  type BackingOption,
} from "../config/contracts";
import {
  commitmentManagerAbi,
  useReadCommitmentsVaultAsset,
  useReadCommitmentsVaultConvertToAssets,
} from "../generated";
import { useAccountActivity } from "../hooks/useAccountActivity";
import { useAssetPrices, type PriceEntry } from "../hooks/useAssetPrices";
import { useClaimableUsd } from "../hooks/useClaimableUsd";
import { useClaimableYield, type ClaimableYieldEntry } from "../hooks/useClaimableYield";
import { useClaimAllQueue } from "../hooks/useClaimAllQueue";
import { useClaimAllPremium } from "../hooks/useClaimAllPremium";
import { useLedgerPositions } from "../hooks/useLedgerPositions";
import { useMyMutualLosses, useMyMutualPremium } from "../hooks/useMyMemberships";
import { useTokenMeta, useTokenMetaMap } from "../hooks/useTokenMeta";
import { POLL } from "../hooks/polling";
import { commitmentDetailPath } from "../lib/arbitrationRoutes";
import {
  useUnifiedRows,
  type UnifiedCommitmentRowEntry,
  type UnifiedProposalRowEntry,
  type UnifiedRow,
} from "../hooks/useUnifiedRows";
import { useVaultActivity } from "../hooks/useVaultActivity";
import { useVaultPosition } from "../hooks/useVaultPosition";
import { useViewAddress } from "../hooks/useViewAddress";
import { sortByCommitmentUrgency } from "../lib/commitmentSort";
import { sumUsd } from "../lib/claimableYield";
import {
  COMMITMENT_STATUS_FILTER_OPTIONS,
  DIRECTION_FILTER_OPTIONS,
  ROLE_FILTER_OPTIONS,
  applyCommitmentFilters,
  type DirectionFilter,
  type RoleFilter,
} from "../lib/commitmentFilters";
import { bigintToUsd } from "../lib/format";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const EMPTY_CLAIM_DATA = "0x" as Hex;

// Per-(backing token) priced snapshot reported up by AssetRow → Dashboard. The
// `*Priced` quantities are denominated in `priceSymbol`'s units (`priceDecimals`
// places): for a raw ERC-20 they equal the token amounts; for a vault share they
// are the convertToAssets-valued underlying. The PortfolioHero USD aggregator
// multiplies each by that asset's USD price.
interface AssetSnapshot {
  symbol: string;
  decimals: number;
  priceSymbol: string;
  priceDecimals: number;
  totalPriced: bigint;
  freePriced: bigint;
  encumberedPriced: bigint;
}

interface TokenLedger {
  free: bigint;
  encumbered: bigint;
}

export default function Dashboard() {
  const chainId = useChainId();
  const navigate = useNavigate();
  const viewAddress = useViewAddress();
  const { isConnected, address: connectedAddress } = useAccount();
  const { commitmentManager: managerAddress, commitmentsVault: vaultAddress } = getContractAddresses(chainId);
  const vaults = useMemo(() => getVaultRegistry(chainId), [chainId]);
  const position = useVaultPosition({ vaultAddress, viewAddress });
  const { push } = useToasts();

  const { rows, isLoading, refetch } = useUnifiedRows({
    managerAddress,
    viewAddress,
  });
  const {
    entries: rawClaimable,
    isLoading: claimableLoading,
    error: claimableError,
    indexerOnline,
    refetch: refetchClaimable,
  } = useClaimableYield({
    managerAddress,
    viewAddress,
  });
  const vaultActivity = useVaultActivity({ vaultAddress, userAddress: viewAddress });
  // Loss + premium-yield value flows (indexer-only) folded into the feed below.
  const accountActivity = useAccountActivity(viewAddress);
  // Decimals/symbol for the tokens those loss/yield events are denominated in.
  const activityTokenMeta = useTokenMetaMap(
    useMemo(() => accountActivity.events.map((e) => e.token), [accountActivity.events]),
  );

  // Optimistic CLAIM removal — lifted from ClaimableYieldPanel so per-row claims
  // and the queue-driven "Claim all" share the same set.
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());
  const claimableEntries = useMemo(
    () => rawClaimable.filter((e) => !claimedIds.has(e.commitmentId.toString())),
    [rawClaimable, claimedIds],
  );

  const assetDecimals = position.assetDecimals;
  const assetSymbol = position.assetSymbol;

  // Drawer is proposal-only; commitment rows deep-link to /commitments/:id so
  // the URL is shareable. The route state lets the detail page return here.
  const [detailRow, setDetailRow] = useState<UnifiedProposalRowEntry | null>(null);
  const openRow = useCallback(
    (r: UnifiedRow) => {
      if (r.kind === "commitment") {
        navigate(commitmentDetailPath(r.id), {
          state: { commitmentOrigin: "dashboard" },
        });
      } else {
        setDetailRow(r);
      }
    },
    [navigate],
  );

  // ── Aggregates ──────────────────────────────────────────────────────────
  const commitmentRows = useMemo(() => rows.filter((r) => r.kind === "commitment"), [rows]);
  // Stable (id, token, vault) projection threaded into the mutual-loss read so
  // we don't re-fetch commitments — useMyMutualLosses batches membership reads.
  const memberCommitments = useMemo(
    () => commitmentRows.map((r) => ({ id: r.id, token: r.token, vault: r.vault })),
    [commitmentRows],
  );
  // Canonical-vault underlyingValue feeds the hero's loading state below.
  const totalUnderlying = position.underlyingValue ?? 0n;

  // ── Asset-centric backing model ──────────────────────────────────────────
  // The dashboard is organized per (backing token), not per vault. A vault
  // share is one token among others. Candidate tokens are the union of the
  // configured backing options and any token the indexer reports an encumbered
  // position in (forward-compat for arbitrary ERC-20/4626 backing).
  const backingOptions = useMemo(() => getBackingOptions(chainId), [chainId]);
  const { positions: indexedPositions, refetch: refetchLedgerPositions } = useLedgerPositions({
    address: viewAddress,
  });
  const candidates = useMemo<BackingOption[]>(() => {
    const byAddr = new Map<string, BackingOption>();
    for (const o of backingOptions) byAddr.set(o.token.toLowerCase(), o);
    for (const p of indexedPositions) {
      const k = p.token.toLowerCase();
      if (!byAddr.has(k)) {
        byAddr.set(k, { token: p.token, adapter: ZERO_ADDRESS, label: "Backing token", isVaultShare: false });
      }
    }
    return [...byAddr.values()];
  }, [backingOptions, indexedPositions]);

  // Batched free/encumbered read across every candidate token in one multicall.
  // Element type is widened (abi: Abi, functionName: string) to keep wagmi's
  // per-element inference from blowing the instantiation depth on this ABI.
  type LedgerCall = {
    abi: Abi;
    address: Address;
    functionName: string;
    args: readonly [Address, Address];
  };
  const ledgerContracts = useMemo<LedgerCall[]>(() => {
    if (!viewAddress || !managerAddress) return [];
    return candidates.flatMap((o) => [
      {
        abi: commitmentManagerAbi as Abi,
        address: managerAddress,
        functionName: "freeBalance",
        args: [o.token, viewAddress] as const,
      },
      {
        abi: commitmentManagerAbi as Abi,
        address: managerAddress,
        functionName: "encumberedBalance",
        args: [o.token, viewAddress] as const,
      },
    ]);
  }, [candidates, viewAddress, managerAddress]);
  const { data: ledgerData, refetch: refetchLedger } = useReadContracts({
    contracts: ledgerContracts,
    query: { enabled: ledgerContracts.length > 0, refetchInterval: POLL.fast },
  });
  const ledgerByToken = useMemo(() => {
    const map = new Map<string, TokenLedger>();
    candidates.forEach((o, i) => {
      const free = (ledgerData?.[i * 2]?.result as bigint | undefined) ?? 0n;
      const encumbered = (ledgerData?.[i * 2 + 1]?.result as bigint | undefined) ?? 0n;
      map.set(o.token.toLowerCase(), { free, encumbered });
    });
    return map;
  }, [candidates, ledgerData]);

  // "Your assets" lists only positions actually held in the manager (non-zero
  // free OR encumbered balance — encumbered capital is still in the manager,
  // just locked). Zero-balance backing options aren't shown as rows; they stay
  // depositable via the "Add assets" chooser, which sources the full configured
  // `backingOptions` set. Held positions also gate the new-user welcome card.
  const heldCandidates = useMemo(
    () =>
      candidates.filter((o) => {
        const l = ledgerByToken.get(o.token.toLowerCase());
        return !!l && (l.free > 0n || l.encumbered > 0n);
      }),
    [candidates, ledgerByToken],
  );

  // ── In-place deposit / backing flow ──────────────────────────────────────
  // Mounts the reusable BackingFlow in a Modal (matching Backing.tsx's house
  // style) so a connected user funds a position without navigating away. Opened
  // from the hero (no preselected token → chooser) or from a specific asset row.
  // Create-commitment modal — opened from the page header so users can lock new
  // stake without leaving the dashboard.
  const [createOpen, setCreateOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositOption, setDepositOption] = useState<BackingOption | null>(null);
  const openDeposit = useCallback(
    (option?: BackingOption) => {
      // From a row: target that token. From the hero: preselect only when there
      // is a single configured backing option, else show the chooser.
      setDepositOption(option ?? (backingOptions.length === 1 ? backingOptions[0] : null));
      setDepositOpen(true);
    },
    [backingOptions],
  );
  const closeDeposit = useCallback(() => {
    setDepositOpen(false);
    setDepositOption(null);
  }, []);

  // ── In-place withdraw flow ───────────────────────────────────────────────
  // Withdraw is always token-specific (you can only pull a token's own free
  // balance), so it opens straight onto a row's token — no chooser.
  const [withdrawOption, setWithdrawOption] = useState<BackingOption | null>(null);
  const openWithdraw = useCallback((option: BackingOption) => {
    setWithdrawOption(option);
  }, []);
  const closeWithdraw = useCallback(() => setWithdrawOption(null), []);

  // Refetch every dashboard read after an in-place deposit confirms — mirrors
  // the AgreementProposalDrawer.onActed pattern (refetch + position.refetch).
  const refetchDashboard = useCallback(() => {
    refetch();
    position.refetch();
    refetchLedger();
    refetchLedgerPositions();
    void vaultActivity.refetch();
    refetchClaimable();
    accountActivity.refetch();
  }, [refetch, position, refetchLedger, refetchLedgerPositions, vaultActivity, refetchClaimable, accountActivity]);

  // ── Per-token snapshots — lifted up from AssetRow so the hero can compute a
  //    single USD figure across tokens of different decimals/underlyings. ─────
  const [assetSnapshots, setAssetSnapshots] = useState<Record<string, AssetSnapshot>>({});
  const reportAssetSnapshot = useCallback((token: string, snap: AssetSnapshot) => {
    const key = token.toLowerCase();
    setAssetSnapshots((prev) => {
      const existing = prev[key];
      if (
        existing &&
        existing.symbol === snap.symbol &&
        existing.decimals === snap.decimals &&
        existing.priceSymbol === snap.priceSymbol &&
        existing.priceDecimals === snap.priceDecimals &&
        existing.totalPriced === snap.totalPriced &&
        existing.freePriced === snap.freePriced &&
        existing.encumberedPriced === snap.encumberedPriced
      ) {
        return prev;
      }
      return { ...prev, [key]: snap };
    });
  }, []);

  // ── USD prices via the indexer's /prices endpoint ───────────────────────
  // Seed with the vault-registry asset symbols (so prices load before the
  // on-chain symbol reads resolve), then fold in every priced snapshot symbol.
  const requestedSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const v of vaults) if (v.assetSymbol) set.add(v.assetSymbol);
    for (const snap of Object.values(assetSnapshots)) if (snap.priceSymbol) set.add(snap.priceSymbol);
    return [...set];
  }, [vaults, assetSnapshots]);
  const { getPrice, indexerOffline: pricesIndexerOffline } = useAssetPrices({
    symbols: requestedSymbols,
  });

  // ── USD aggregates ──────────────────────────────────────────────────────
  // Sum each token's priced quantity × that asset's USD price. Returns null for
  // a field if any visible position is in an asset whose price isn't available —
  // partial pricing renders as "PRICE UNAVAILABLE" rather than a misleadingly
  // small number. Snapshots not yet reported (reads in flight) are skipped
  // WITHOUT flagging missing, so loading doesn't masquerade as unavailable.
  const portfolioUsd = useMemo(() => {
    let total = 0n;
    let free = 0n;
    let encumbered = 0n;
    let priceMissing = false;
    for (const o of heldCandidates) {
      const snap = assetSnapshots[o.token.toLowerCase()];
      if (!snap || snap.totalPriced === 0n) continue;
      const price = getPrice(snap.priceSymbol);
      if (!price) {
        priceMissing = true;
        continue;
      }
      const totalUsd = bigintToUsd(snap.totalPriced, snap.priceDecimals, price.usd);
      const freeUsd = bigintToUsd(snap.freePriced, snap.priceDecimals, price.usd);
      const encUsd = bigintToUsd(snap.encumberedPriced, snap.priceDecimals, price.usd);
      if (totalUsd === null || freeUsd === null || encUsd === null) {
        priceMissing = true;
        continue;
      }
      total += totalUsd;
      free += freeUsd;
      encumbered += encUsd;
    }
    return {
      total: priceMissing ? null : total,
      free: priceMissing ? null : free,
      encumbered: priceMissing ? null : encumbered,
    };
  }, [heldCandidates, assetSnapshots, getPrice]);

  // Token-aware USD valuation for the claimable-yield panel. Each entry can be
  // backed by a different token (raw ERC-20 or vault share), so the panel
  // headline must sum per-row USD — never a raw cross-decimal share sum. The
  // hook owns its own per-token pricing (share→asset conversion + price feed).
  const { usdFor: claimableUsdFor } = useClaimableUsd(claimableEntries);

  // ── Mutual yield (premium) + losses, folded into the portfolio hero ───────
  // Earn-side premium and accrued markdown across the viewer's mutual
  // memberships, lifted from the (now-removed) Yield & Losses section so the
  // hero's "Claimable yield" includes premium and a "Losses" stat sits beside
  // it. Both reuse the same per-token USD machinery as strategy yield.
  const { totalByToken: lossByToken, entries: lossEntries } = useMyMutualLosses({
    managerAddress,
    commitments: memberCommitments,
  });
  const {
    totalByToken: premiumByToken,
    entries: premiumEntries,
    refetch: refetchPremium,
  } = useMyMutualPremium({ managerAddress, commitments: memberCommitments });

  // Shape loss/premium tokens as claimable entries so useClaimableUsd can value
  // them (only token/vault/amount matter to it).
  const lossPricingEntries = useMemo<ClaimableYieldEntry[]>(
    () =>
      lossEntries.map((e) => ({
        commitmentId: e.commitmentId,
        committer: ZERO_ADDRESS,
        amount: e.owed,
        token: e.token,
        vault: e.vault,
        strategy: ZERO_ADDRESS,
        claimData: EMPTY_CLAIM_DATA,
      })),
    [lossEntries],
  );
  const { usdFor: lossUsdFor } = useClaimableUsd(lossPricingEntries);
  const premiumPricingEntries = useMemo<ClaimableYieldEntry[]>(
    () =>
      premiumEntries.map((e) => ({
        commitmentId: e.commitmentId,
        committer: ZERO_ADDRESS,
        amount: e.claimable,
        token: e.token,
        vault: e.vault,
        strategy: ZERO_ADDRESS,
        claimData: EMPTY_CLAIM_DATA,
      })),
    [premiumEntries],
  );
  const { usdFor: premiumUsdFor } = useClaimableUsd(premiumPricingEntries);

  // Combined claimable yield = strategy yield + underwriting premium, summed in
  // USD across every backing token. sumUsd degrades the whole headline to null
  // if any single price is unavailable (partial totals read as misleadingly
  // complete).
  const claimableUsd = useMemo(
    () =>
      sumUsd([
        ...claimableEntries.map((e) => claimableUsdFor(e.token, e.amount)),
        ...[...premiumByToken].map(([token, amt]) => premiumUsdFor(token, amt)),
      ]),
    [claimableEntries, claimableUsdFor, premiumByToken, premiumUsdFor],
  );
  const lossesUsd = useMemo(
    () => sumUsd([...lossByToken].map(([token, owed]) => lossUsdFor(token, owed))),
    [lossByToken, lossUsdFor],
  );
  // Member commitments with a non-zero claimable premium balance — the ids the
  // premium queue claims as part of the combined "Claim yield" action.
  const claimablePremiumIds = useMemo(
    () => premiumEntries.filter((e) => e.claimable > 0n).map((e) => e.commitmentId),
    [premiumEntries],
  );

  // Tag the headline with the price source when any value came from the
  // fallback table — the user knows the number isn't a live feed.
  const priceFallbackInUse = useMemo(() => {
    for (const o of heldCandidates) {
      const snap = assetSnapshots[o.token.toLowerCase()];
      if (!snap || snap.totalPriced === 0n) continue;
      const price = getPrice(snap.priceSymbol);
      if (price?.source === "fallback") return true;
    }
    return false;
  }, [heldCandidates, assetSnapshots, getPrice]);

  // ── Claim-all queue ─────────────────────────────────────────────────────
  const markClaimed = useCallback((commitmentId: bigint) => {
    setClaimedIds((prev) => {
      const next = new Set(prev);
      next.add(commitmentId.toString());
      return next;
    });
  }, []);

  const claimQueue = useClaimAllQueue({
    managerAddress,
    onRowClaimed: (id) => {
      markClaimed(id);
      push({
        tone: "success",
        title: "CLAIM CONFIRMED",
        body: <>Claim #{id.toString()} settled.</>,
      });
    },
  });

  // Earn-side premium claim queue — claimMemberPremium per membership. The
  // member commitment ids come from `claimablePremiumIds` (computed above).
  const premiumQueue = useClaimAllPremium({
    managerAddress,
    onRowClaimed: (id) =>
      push({
        tone: "success",
        title: "PREMIUM CLAIMED",
        body: <>Premium for #{id.toString()} credited to your free balance.</>,
      }),
  });

  // Re-read claimable premium when its queue finishes (running → idle) so the
  // hero figure drops promptly rather than waiting on the 15s poll.
  const wasClaimingPremiumRef = useRef(false);
  useEffect(() => {
    if (wasClaimingPremiumRef.current && !premiumQueue.isRunning) refetchPremium();
    wasClaimingPremiumRef.current = premiumQueue.isRunning;
  }, [premiumQueue.isRunning, refetchPremium]);

  // Combined "Claim yield" — claims strategy yield first, then underwriting
  // premium. The two live on different manager entry points (claim vs
  // claimMemberPremium) and can't share a queue, so we sequence them: kick off
  // the yield queue, and once it drains fire the deferred premium queue. This
  // avoids two wallets prompting at once. A ref (not state) flags the deferral
  // — the running→idle transition of the yield queue is the trigger, so no
  // re-render is needed and we keep the effect free of cascading setState.
  const premiumDeferredRef = useRef(false);
  const handleClaimYield = useCallback(() => {
    const hasYield = claimableEntries.length > 0;
    const hasPremium = claimablePremiumIds.length > 0;
    if (hasYield) {
      claimQueue.run(
        claimableEntries.map((e) => ({
          commitmentId: e.commitmentId,
          strategy: e.strategy,
          claimData: e.claimData,
        })),
      );
      premiumDeferredRef.current = hasPremium;
    } else if (hasPremium) {
      premiumQueue.run(claimablePremiumIds);
    }
  }, [claimQueue, premiumQueue, claimableEntries, claimablePremiumIds]);

  useEffect(() => {
    if (premiumDeferredRef.current && !claimQueue.isRunning) {
      premiumDeferredRef.current = false;
      if (claimablePremiumIds.length > 0) premiumQueue.run(claimablePremiumIds);
    }
  }, [claimQueue.isRunning, claimablePremiumIds, premiumQueue]);

  const isOwnDashboard =
    !!connectedAddress && !!viewAddress && viewAddress.toLowerCase() === connectedAddress.toLowerCase();

  // Pricing facts for the allocation Sankey. The per-asset snapshots already
  // carry the holding valued in the PRICED asset's units (for a vault share:
  // the underlying, via convertToAssets), so pairing each with its raw ledger
  // total gives the diagram an exact conversion without a further chain read.
  // Without it the Sankey priced `cvUSDC` by its own symbol, found no quote,
  // and fell back to raw token units — which is what made it disclaim that its
  // widths were not comparable.
  const sankeyAssetInfo = useMemo(() => {
    const map = new Map<
      string,
      { priceSymbol: string; priceDecimals: number; pricedTotal: bigint; rawTotal: bigint }
    >();
    for (const [token, ledger] of ledgerByToken) {
      const snap = assetSnapshots[token];
      if (!snap) continue;
      const rawTotal = ledger.free + ledger.encumbered;
      if (rawTotal === 0n) continue;
      map.set(token, {
        priceSymbol: snap.priceSymbol,
        priceDecimals: snap.priceDecimals,
        pricedTotal: snap.totalPriced,
        rawTotal,
      });
    }
    return map;
  }, [ledgerByToken, assetSnapshots]);

  // ── Section: needs attention ────────────────────────────────────────────
  const pending = useMemo(() => rows.filter((r) => r.status === "PENDING" || r.status === "FORFEIT_PENDING"), [rows]);

  // ── Section: activity feed ──────────────────────────────────────────────
  // Feed lines name the commitment they are about. "Weekly market-data
  // delivery released" is a sentence someone can act on; "Commitment #12
  // released" makes them open the row to find out whether they care.
  const labelContext = useCommitmentLabelContext(commitmentRows, activityTokenMeta);
  // Built every render, not memoized: `labelContext` is a fresh object each
  // render, so a memo here could never hold.
  const events = ((): ActivityEvent[] => {
    const out: ActivityEvent[] = [];

    for (const a of vaultActivity.data ?? []) {
      // No block timestamp means no time to show: 0 renders "—" and sorts last.
      const ts = a.timestamp !== undefined ? Number(a.timestamp) : 0;
      if (a.kind === "deposit") {
        out.push({
          id: `dep-${a.txHash}`,
          type: "deposit",
          timestamp: ts,
          txHash: a.txHash,
          title: "Deposit",
          meta: (
            <span>
              <TokenAmount amount={a.assets} decimals={assetDecimals ?? 6} symbol={assetSymbol ?? ""} />
              {" deposited"}
            </span>
          ),
        });
      } else {
        out.push({
          id: `wd-${a.txHash}`,
          type: "withdrawal",
          timestamp: ts,
          txHash: a.txHash,
          title: "Withdrawal",
          meta: <TokenAmount amount={a.assets} decimals={assetDecimals ?? 6} symbol={assetSymbol ?? ""} />,
        });
      }
    }

    for (const r of commitmentRows) {
      // `createdAt` is unix seconds. Older indexer rows predate the column —
      // fall back to 0 so the event sorts last and renders "—" rather than the
      // 1970 epoch a block NUMBER would have produced.
      const baseTs = r.commitment.createdAt !== undefined ? Number(r.commitment.createdAt) : 0;
      if (r.status === "RELEASED") {
        out.push({
          id: `crl-${r.id.toString()}`,
          type: "commitment-released",
          timestamp: baseTs,
          title: <ActivityName row={r} ctx={labelContext} suffix=" released" />,
          meta: <ActivityMeta row={r} />,
          onClick: () => openRow(r),
          actionLabel: `Open released commitment #${r.id.toString()}`,
        });
      } else if (r.status === "FORFEITED") {
        out.push({
          id: `csl-${r.id.toString()}`,
          type: "forfeit-finalized",
          timestamp: baseTs,
          title: <ActivityName row={r} ctx={labelContext} suffix=" forfeited" />,
          meta: <ActivityMeta row={r} />,
          onClick: () => openRow(r),
          actionLabel: `Open forfeited commitment #${r.id.toString()}`,
        });
      } else if (r.status === "FORFEIT_PENDING") {
        out.push({
          id: `csp-${r.id.toString()}`,
          type: "forfeit-proposed",
          timestamp: baseTs,
          title: <ActivityName row={r} ctx={labelContext} prefix="Forfeit proposed on " />,
          meta: <ActivityMeta row={r} />,
          onClick: () => openRow(r),
          actionLabel: `Review forfeit proposed on commitment #${r.id.toString()}`,
        });
      } else {
        out.push({
          id: `cmt-${r.id.toString()}`,
          type: "commitment-created",
          timestamp: baseTs,
          title: <ActivityName row={r} ctx={labelContext} suffix=" created" />,
          meta: <ActivityMeta row={r} />,
          onClick: () => openRow(r),
          actionLabel: `Open commitment #${r.id.toString()}`,
        });
      }
    }

    for (const r of rows.filter((row) => row.kind === "proposal")) {
      out.push({
        id: `prop-${r.id.toString()}`,
        type: r.role === "acceptor" ? "proposal-received" : "proposal-sent",
        timestamp: Number(r.expiresAt),
        title:
          r.role === "acceptor" ? (
            <>
              Proposal <code className="ds-mono-num">#p{r.id.toString()}</code> received
            </>
          ) : (
            <>
              Proposal <code className="ds-mono-num">#p{r.id.toString()}</code> sent
            </>
          ),
        meta: <AddressDisplay address={r.role === "acceptor" ? r.committer : r.counterparty} />,
        onClick: () => setDetailRow(r),
      });
    }

    // Loss + premium-yield value flows (indexer-only). Each carries its own
    // backing token, so resolve decimals from `activityTokenMeta`; unknown
    // tokens degrade to the resolver's sensible fallback.
    for (const e of accountActivity.events) {
      const meta = e.token ? activityTokenMeta.metaFor(e.token) : undefined;
      const mutualSuffix = e.mutualId ? ` · mutual #${e.mutualId}` : "";
      const value = (
        <TokenAmount amount={e.amount} decimals={meta?.decimals ?? 6} symbol={meta?.symbol ?? ""} size="inline" />
      );
      if (e.kind === "mutual-loss") {
        out.push({
          id: `loss-${e.id}`,
          type: "mutual-loss",
          timestamp: e.timestamp,
          txHash: e.txHash ?? undefined,
          tone: "danger",
          title: <>Loss applied{mutualSuffix}</>,
          trailing: value,
        });
      } else {
        out.push({
          id: `yld-${e.id}`,
          type: "premium-yield",
          timestamp: e.timestamp,
          txHash: e.txHash ?? undefined,
          tone: "success",
          title: <>Premium claimed{mutualSuffix}</>,
          trailing: value,
        });
      }
    }

    out.sort((a, b) => b.timestamp - a.timestamp);
    return out;
  })();

  // ── Render: empty / welcome / dashboard ────────────────────────────────
  if (!viewAddress) {
    return (
      <div className="ds-page">
        <PageHeader eyebrow="overview" title="Dashboard" />
        <EmptyState
          title="NO ADDRESS SELECTED"
          description="Connect a wallet or paste an Ethereum address above to view protocol state."
        />
      </div>
    );
  }

  const noShares = !position.shares || position.shares === 0n;
  const showWelcome =
    isOwnDashboard && noShares && heldCandidates.length === 0 && rows.length === 0 && !position.isLoading && !isLoading;

  if (showWelcome) {
    return (
      <div className="ds-page">
        <PageHeader eyebrow="overview" title="Dashboard" />
        <WelcomeCard assetSymbol={assetSymbol} />
      </div>
    );
  }

  const heroIsLoading = position.isLoading && totalUnderlying === 0n;

  // Build the section nav from whichever sub-sections will render below.
  // Sections that aren't applicable for this viewer (no commitments, nothing
  // claimable) are omitted so the nav doesn't advertise empty anchors.
  const navItems: SectionNavItem[] = [{ id: "portfolio", label: "portfolio" }];
  if (pending.length > 0) {
    navItems.push({ id: "attention", label: "attention", count: pending.length });
  }
  navItems.push({ id: "assets", label: "assets", count: heldCandidates.length || undefined });
  if (heldCandidates.length > 0) {
    navItems.push({ id: "flow", label: "flow" });
  }
  if (commitmentRows.length > 0) {
    navItems.push({
      id: "commitments",
      label: "commitments",
      count: commitmentRows.length,
    });
  }
  if (claimableEntries.length > 0) {
    navItems.push({
      id: "yield",
      label: "yield",
      count: claimableEntries.length,
    });
  }
  navItems.push({ id: "activity", label: "activity" });

  return (
    <div className="ds-page ds-dashboard">
      <PageHeader
        eyebrow="Commitments"
        title="Dashboard"
        lead="Your window into the world of commitments."
        actions={
          <button
            type="button"
            className="ds-btn ds-btn--primary"
            onClick={() => setCreateOpen(true)}
            // `isOwnDashboard`, not `isConnected`: while viewing someone
            // else's address a commitment created here would be the visitor's
            // own, on a page showing a stranger's numbers.
            disabled={!isOwnDashboard || !managerAddress}
            title={
              !isConnected
                ? "Connect a wallet to create commitments"
                : !isOwnDashboard
                  ? "You are viewing another address — switch back to your wallet to create commitments"
                  : undefined
            }
          >
            Create commitment
          </button>
        }
      />
      <SectionNav items={navItems} aria-label="Dashboard sections" />

      <section id="portfolio" className="ds-dashboard-section ds-stack ds-stack-4">
        {/* One portfolio card: headline number, then the chart that explains
          * it, then the stat breakdown — the DeFi-standard order. A single
          * title avoids the old "your portfolio" / "Portfolio" doubling; the
          * chart's right edge is anchored to the headline figure by
          * construction (see PortfolioChart's anchoring note). */}
        <PortfolioHero
          title={isOwnDashboard ? "Portfolio" : "Viewing portfolio"}
          totalUsd={portfolioUsd.total}
          freeUsd={portfolioUsd.free}
          encumberedUsd={portfolioUsd.encumbered}
          claimableUsd={claimableUsd}
          lossesUsd={lossesUsd}
          isLoading={heroIsLoading}
          notice={
            position.depositsPaused ? (
              <Notice tone="warn" size="sm">
                Vault deposits are paused.
              </Notice>
            ) : undefined
          }
          priceNote={
            pricesIndexerOffline ? (
              <span>Prices unavailable — indexer offline.</span>
            ) : priceFallbackInUse ? (
              <span>Showing fallback prices — live feed unavailable.</span>
            ) : undefined
          }
          chart={
            <PortfolioChart
              address={viewAddress}
              ledgerByToken={ledgerByToken}
              candidates={candidates}
              getPrice={getPrice}
            />
          }
          primaryAction={
            <button
              type="button"
              className="ds-btn ds-btn--sm"
              onClick={() => openDeposit()}
              disabled={!isOwnDashboard || !managerAddress}
            >
              Deposit →
            </button>
          }
          claimAllAction={
            claimableEntries.length > 0 || claimablePremiumIds.length > 0
              ? {
                  label: "Claim yield",
                  onClick: handleClaimYield,
                  disabled: !isOwnDashboard || !managerAddress,
                  progress: claimQueue.progress ?? premiumQueue.progress,
                }
              : undefined
          }
        />
      </section>

      {pending.length > 0 && (
        <section id="attention" className="ds-dashboard-section">
          <NeedsAttention rows={pending} onOpenRow={openRow} />
        </section>
      )}

      <section id="assets" className="ds-dashboard-section">
        <YourAssets
          candidates={heldCandidates}
          ledgerByToken={ledgerByToken}
          reportSnapshot={reportAssetSnapshot}
          getPrice={getPrice}
          onDeposit={openDeposit}
          onWithdraw={openWithdraw}
          canDeposit={isOwnDashboard && !!managerAddress}
        />
      </section>

      {heldCandidates.length > 0 && (
        <section id="flow" className="ds-section ds-dashboard-section">
          <div className="ds-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 className="ds-section-title">Where your capital sits</h2>
            <span className="ds-text-xs ds-subtle">USD-NORMALIZED</span>
          </div>
          <PortfolioSankey
            rows={commitmentRows}
            ledgerByToken={ledgerByToken}
            assetInfoByToken={sankeyAssetInfo}
            getPrice={getPrice}
            viewAddress={viewAddress}
            isLoading={isLoading}
          />
        </section>
      )}

      {commitmentRows.length > 0 && (
        <section id="commitments" className="ds-dashboard-section">
          <YourCommitments
            rows={commitmentRows}
            onOpenRow={openRow}
            claimableEntries={claimableEntries}
            resolveContext={
              managerAddress
                ? { managerAddress, connectedAddress, isConnected, onActed: refetchDashboard }
                : undefined
            }
          />
        </section>
      )}

      {claimableEntries.length > 0 && (
        <section id="yield" className="ds-dashboard-section">
          <ClaimableYieldPanel
            entries={claimableEntries}
            managerAddress={managerAddress}
            connectedAddress={connectedAddress}
            viewAddress={viewAddress}
            usdFor={claimableUsdFor}
            isConnected={isConnected}
            isLoading={claimableLoading}
            error={claimableError}
            indexerOnline={indexerOnline}
            refetch={refetchClaimable}
            onClaimed={(id) => {
              markClaimed(id);
              push({
                tone: "success",
                title: "CLAIM CONFIRMED",
                body: <>Claim #{id.toString()} settled.</>,
              });
            }}
          />
        </section>
      )}

      <section id="activity" className="ds-section ds-dashboard-section">
        <div className="ds-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 className="ds-section-title">Activity</h2>
          <span className="ds-text-xs ds-subtle">{events.length} events</span>
        </div>
        <ActivityFeed
          events={events}
          isLoading={isLoading && events.length === 0}
          emptyState={
            <EmptyState
              title="NO ACTIVITY"
              description="Your recent commitments, proposals, and vault movements will appear here."
            />
          }
        />
      </section>

      <AgreementProposalDrawer
        open={detailRow !== null}
        onClose={() => setDetailRow(null)}
        row={detailRow}
        managerAddress={(managerAddress as `0x${string}` | undefined) ?? "0x0000000000000000000000000000000000000000"}
        isConnected={isConnected}
        onActed={() => {
          refetch();
          position.refetch();
        }}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create commitment"
        description="Encumber part of your deposited backing for a chosen counterparty, under an arbiter. Two-phase manager enforcement prevents instant forfeiture."
        size="lg"
      >
        {managerAddress ? (
          <CreateCommitmentForm
            managerAddress={managerAddress}
            isConnected={isConnected}
            connectedAddress={connectedAddress}
            onCommitmentCreated={() => {
              refetchDashboard();
              setCreateOpen(false);
            }}
          />
        ) : (
          <Notice tone="warn" size="md" title="MANAGER NOT CONFIGURED">
            The commitment manager address is unset on this chain.
          </Notice>
        )}
      </Modal>

      <Modal
        open={depositOpen}
        onClose={closeDeposit}
        title="Deposit backing"
        description="Fund your free balance in the commitment manager — the capital that backs new commitments."
        size="md"
      >
        {position.depositsPaused && (
          <Notice tone="warn" size="sm" title="VAULT DEPOSITS PAUSED">
            Minting new vault shares is paused. You can still deposit shares you already hold or raw ERC-20 backing into
            the manager.
          </Notice>
        )}
        {!managerAddress ? (
          <Notice tone="warn" size="md" title="MANAGER NOT CONFIGURED">
            The commitment manager address is unset on this chain.
          </Notice>
        ) : depositOption ? (
          <BackingFlow
            managerAddress={managerAddress}
            option={depositOption}
            userAddress={connectedAddress}
            isConnected={isConnected}
            onDeposited={() => {
              refetchDashboard();
              closeDeposit();
            }}
          />
        ) : backingOptions.length === 0 ? (
          <EmptyState
            title="NO BACKING OPTIONS"
            description="No (token, adapter) backing pairs are configured on this chain yet."
          />
        ) : (
          <div className="ds-stack ds-stack-2">
            <p className="ds-text-sm ds-muted" style={{ margin: 0 }}>
              Choose a backing token to deposit.
            </p>
            {backingOptions.map((o) => (
              <MediaRow
                key={o.token}
                density="compact"
                action={{ label: `Deposit ${o.label}`, onClick: () => setDepositOption(o) }}
                leading={<TokenIcon symbol={o.label} size="sm" />}
                title={o.label}
                meta={o.isVaultShare ? "vault share backing" : "ERC-20 backing"}
                trailing={<span className="ds-text-xs ds-subtle">Deposit →</span>}
              />
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={!!withdrawOption}
        onClose={closeWithdraw}
        title="Withdraw backing"
        description="Move free balance out of the manager back to your wallet. Encumbered balance stays locked until its commitments resolve."
        size="md"
      >
        {managerAddress && withdrawOption && (
          <BackingWithdrawForm
            managerAddress={managerAddress}
            option={withdrawOption}
            userAddress={connectedAddress}
            isConnected={isConnected}
            onWithdrawn={() => {
              refetchDashboard();
              closeWithdraw();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

// ─── Section: Your assets / backing ──────────────────────────────────────
//
// Asset-centric replacement for the old per-vault table. One row per backing
// token (free/encumbered in the manager ledger); a vault share is just one row,
// deep-linking to its per-vault charts. Raw ERC-20 backing is first-class.

function YourAssets({
  candidates,
  ledgerByToken,
  reportSnapshot,
  getPrice,
  onDeposit,
  onWithdraw,
  canDeposit,
}: {
  candidates: BackingOption[];
  ledgerByToken: Map<string, TokenLedger>;
  reportSnapshot: (token: string, snap: AssetSnapshot) => void;
  getPrice: (symbol: string | undefined) => PriceEntry | undefined;
  onDeposit: (option?: BackingOption) => void;
  onWithdraw: (option: BackingOption) => void;
  canDeposit: boolean;
}) {
  return (
    <div className="ds-stack ds-stack-3">
      <div className="ds-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 className="ds-section-title">Your assets</h2>
        {canDeposit && (
          <button type="button" className="ds-btn ds-btn--sm ds-btn--ghost" onClick={() => onDeposit()}>
            Add assets →
          </button>
        )}
      </div>
      {candidates.length === 0 ? (
        <EmptyState
          title="NO BACKING POSITIONS"
          description="Deposit a vault share or any supported ERC-20 into the manager to back commitments. Free balance backs new commitments and receives forfeit proceeds."
          action={
            canDeposit ? (
              <button type="button" className="ds-btn ds-btn--sm" onClick={() => onDeposit()}>
                Add assets →
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="ds-data-table-wrap" data-density="regular" data-size="md">
          <table className="ds-table" aria-label="Your assets">
            <thead>
              <tr>
                <th>asset</th>
                <th data-align="right">your position</th>
                <th data-align="right">free</th>
                <th data-align="right">encumbered</th>
                <th>allocation</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {candidates.map((option) => {
                const ledger = ledgerByToken.get(option.token.toLowerCase()) ?? {
                  free: 0n,
                  encumbered: 0n,
                };
                return (
                  <AssetRow
                    key={option.token}
                    option={option}
                    free={ledger.free}
                    encumbered={ledger.encumbered}
                    onSnapshot={reportSnapshot}
                    getPrice={getPrice}
                    onDeposit={onDeposit}
                    onWithdraw={onWithdraw}
                    canDeposit={canDeposit}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AssetRow({
  option,
  free,
  encumbered,
  onSnapshot,
  getPrice,
  onDeposit,
  onWithdraw,
  canDeposit,
}: {
  option: BackingOption;
  free: bigint;
  encumbered: bigint;
  onSnapshot: (token: string, snap: AssetSnapshot) => void;
  getPrice: (symbol: string | undefined) => PriceEntry | undefined;
  onDeposit: (option?: BackingOption) => void;
  onWithdraw: (option: BackingOption) => void;
  canDeposit: boolean;
}) {
  const navigate = useNavigate();
  const chainId = useChainId();
  const descriptor = useMemo(
    () => (option.isVaultShare ? getVaultDescriptor(chainId, option.token) : undefined),
    [option.isVaultShare, option.token, chainId],
  );

  // Backing-token metadata (the share or raw ERC-20 the position is held in).
  const tokenMeta = useTokenMeta(option.token);
  const decimals = tokenMeta.decimals;
  const symbol = tokenMeta.symbol;
  const total = free + encumbered;

  // Vault-share underlying valuation: read the vault's asset + convertToAssets
  // so we can price the position in the underlying's USD feed. Raw ERC-20s price
  // directly by their own symbol (factor 1).
  const { data: assetAddress } = useReadCommitmentsVaultAsset({
    address: option.token,
    query: { enabled: option.isVaultShare },
  });
  const assetMeta = useTokenMeta(option.isVaultShare ? (assetAddress as Address | undefined) : undefined);
  const { data: underlyingTotalRaw } = useReadCommitmentsVaultConvertToAssets({
    address: option.token,
    args: total > 0n ? [total] : undefined,
    query: { enabled: option.isVaultShare && total > 0n, refetchInterval: POLL.slow },
  });
  const underlyingTotal = (underlyingTotalRaw as bigint | undefined) ?? 0n;

  // Prefer the registry's asset symbol (known synchronously) over the in-flight
  // on-chain read so pricing seeds correctly before the multicall resolves.
  const priceSymbol = option.isVaultShare
    ? assetMeta.symbol !== "TOKEN"
      ? assetMeta.symbol
      : (descriptor?.assetSymbol ?? assetMeta.symbol)
    : symbol;
  const priceDecimals = option.isVaultShare ? assetMeta.decimals : decimals;
  const totalPriced = option.isVaultShare ? underlyingTotal : total;
  const freePriced = option.isVaultShare ? (total > 0n ? (free * underlyingTotal) / total : 0n) : free;
  const encumberedPriced = option.isVaultShare ? totalPriced - freePriced : encumbered;

  useEffect(() => {
    onSnapshot(option.token, {
      symbol,
      decimals,
      priceSymbol,
      priceDecimals,
      totalPriced,
      freePriced,
      encumberedPriced,
    });
  }, [
    option.token,
    symbol,
    decimals,
    priceSymbol,
    priceDecimals,
    totalPriced,
    freePriced,
    encumberedPriced,
    onSnapshot,
  ]);

  const usdPosition = useMemo(() => {
    const price = getPrice(priceSymbol);
    if (!price || totalPriced === 0n) return null;
    return bigintToUsd(totalPriced, priceDecimals, price.usd);
  }, [getPrice, priceSymbol, totalPriced, priceDecimals]);

  const name = descriptor?.name ?? (option.isVaultShare ? `${symbol}` : symbol);
  const subtitle = option.isVaultShare ? "vault share · view charts" : "ERC-20 backing";
  // Vault shares deep-link to their per-vault charts; raw ERC-20 backing has no
  // charts page, so its row opens the deposit modal for that token.
  const open = () => {
    if (option.isVaultShare) navigate(`/app/vaults/${option.token}`);
    else if (canDeposit) onDeposit(option);
  };

  return (
    <tr
      data-tone={encumbered > 0n ? "info" : undefined}
      data-interactive="true"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
    >
      <td>
        <span className="ds-row ds-row-2" style={{ alignItems: "center" }}>
          {/* Icon resolves off the underlying asset (priceSymbol) so a USDC/ETH
              vault shows the real token logo rather than the share-symbol monogram. */}
          <TokenIcon symbol={priceSymbol} size="md" />
          <span className="ds-stack ds-stack-1">
            <span className="ds-text-base">{name}</span>
            <span className="ds-text-xs ds-subtle">{subtitle}</span>
          </span>
        </span>
      </td>
      <td data-align="right">
        {total > 0n ? (
          <span className="ds-stack ds-stack-1" style={{ alignItems: "flex-end" }}>
            <UsdAmount amount={usdPosition} compact size="inline" />
            <span className="ds-text-xs ds-subtle">
              <TokenAmount amount={totalPriced} decimals={priceDecimals} symbol={priceSymbol} compact size="inline" />
            </span>
          </span>
        ) : (
          <span className="ds-mono-num ds-muted">—</span>
        )}
      </td>
      <td data-align="right">
        <TokenAmount amount={free} decimals={decimals} symbol={symbol} compact size="inline" />
      </td>
      <td data-align="right">
        <span data-tone={encumbered > 0n ? "warn" : undefined}>
          <TokenAmount amount={encumbered} decimals={decimals} symbol={symbol} compact size="inline" />
        </span>
      </td>
      <td>
        <EncumbranceBar encumbered={encumbered} total={total} size="sm" />
      </td>
      <td data-align="right">
        {canDeposit && (
          <span className="ds-row ds-row-2" style={{ justifyContent: "flex-end" }}>
            {free > 0n && (
              <button
                type="button"
                className="ds-btn ds-btn--sm ds-btn--ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onWithdraw(option);
                }}
              >
                Withdraw
              </button>
            )}
            <button
              type="button"
              className="ds-btn ds-btn--sm ds-btn--ghost"
              onClick={(e) => {
                e.stopPropagation();
                onDeposit(option);
              }}
            >
              {total > 0n ? "Add" : "Deposit"}
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

// ─── Section: Your commitments ───────────────────────────────────────────

function YourCommitments({
  rows,
  onOpenRow,
  claimableEntries,
  resolveContext,
}: {
  rows: UnifiedCommitmentRowEntry[];
  onOpenRow: (r: UnifiedRow) => void;
  claimableEntries: ClaimableYieldEntry[];
  resolveContext?: CommitmentsResolveContext;
}) {
  // v2: each row's amount is denominated in its own backing token.
  const tokenMeta = useTokenMetaMap(rows.map((r) => r.token));
  // Direction / Status / Role filters use the shared commitment vocabulary.
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [role, setRole] = useState<RoleFilter>("all");

  const filtered = useMemo(
    () => applyCommitmentFilters(rows, { direction, statuses, role }),
    [rows, direction, statuses, role],
  );
  const sortedRows = useMemo(() => sortByCommitmentUrgency(filtered), [filtered]);
  // Explicit active-filter count: the bar's default derivation treats the "all"
  // sentinel as a filled value (non-empty string), so direction/role would
  // always read as active. Count only non-default selections so the count
  // chip + "clear" affordance appear exactly when a filter is actually applied.
  const activeFilterCount =
    (direction !== "all" ? 1 : 0) + (statuses.length > 0 ? 1 : 0) + (role !== "all" ? 1 : 0);

  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="ds-section">
      <div className="ds-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 className="ds-section-title">Your commitments</h2>
        <Link to="/app/explorer" className="ds-btn ds-btn--sm ds-btn--ghost">
          open full view →
        </Link>
      </div>
      <FilterBar
        size="sm"
        activeCount={activeFilterCount}
        onClearAll={() => {
          setDirection("all");
          setStatuses([]);
          setRole("all");
        }}
      >
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
          options={COMMITMENT_STATUS_FILTER_OPTIONS}
        />
        <FilterBar.Select
          label="role"
          value={role}
          onChange={(v) => setRole(v as RoleFilter)}
          options={ROLE_FILTER_OPTIONS}
        />
      </FilterBar>
      <CommitmentsTable
        aria-label="Your commitments"
        rows={sortedRows}
        onOpenRow={onOpenRow}
        tokenMeta={tokenMeta}
        showYield
        claimableEntries={claimableEntries}
        resolveContext={resolveContext}
        emptyState={<EmptyState title="NO COMMITMENTS" description="No commitments match the current filters." />}
      />
    </section>
  );
}

// ─── Section: Needs attention ────────────────────────────────────────────

function NeedsAttention({ rows, onOpenRow }: { rows: UnifiedRow[]; onOpenRow: (r: UnifiedRow) => void }) {
  if (rows.length === 0) return null;
  return (
    <section className="ds-section">
      <h2 className="ds-section-title">Needs your attention</h2>
      <div className="ds-stack ds-stack-2">
        {rows.map((r) => {
          const tone = r.status === "FORFEIT_PENDING" ? "warn" : "info";
          const titleText =
            r.status === "FORFEIT_PENDING"
              ? `Forfeit proposed on commitment #${r.id.toString()}`
              : r.role === "acceptor"
                ? `Incoming agreement proposal #p${r.id.toString()}`
                : `Pending proposal #p${r.id.toString()}`;
          const otherParty = r.role === "committer" || r.role === "proposer" ? r.counterparty : r.committer;
          return (
            <MediaRow
              key={`${r.kind}-${r.id.toString()}`}
              tone={tone}
              density="compact"
              action={{ label: `Review ${titleText}`, onClick: () => onOpenRow(r) }}
              leading={<span aria-hidden>{r.status === "FORFEIT_PENDING" ? "!" : "·"}</span>}
              title={titleText}
              meta={
                <span>
                  with <AddressDisplay address={otherParty} />
                </span>
              }
              trailing={<span className="ds-text-xs ds-subtle">Review →</span>}
            />
          );
        })}
      </div>
    </section>
  );
}

// ─── Welcome card (kept from prior version) ──────────────────────────────

interface WelcomeStep {
  status: "done" | "next" | "later";
  title: string;
  body: string;
  cta?: { label: string; to: string };
}

/**
 * A feed line's headline: the commitment's name, wrapped in the sentence that
 * says what happened to it.
 *
 * Runs the same `commitmentLabel` tiers as every list row, so a tampered title
 * cannot get here either — the label falls back to the derived tier before it
 * reaches this component.
 */
function ActivityName({
  row,
  ctx,
  prefix,
  suffix,
}: {
  row: UnifiedRow;
  ctx: CommitmentLabelContext;
  prefix?: string;
  suffix?: string;
}) {
  const label = commitmentLabel(row, ctx);
  return (
    <>
      {prefix}
      <CommitmentTitle label={label} as="span" size="sm" />
      {suffix}
    </>
  );
}

/** The id, then the other party. The id keeps its place; it just stops leading. */
function ActivityMeta({ row }: { row: UnifiedRow }) {
  return (
    <span className="ds-row ds-row-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
      <span className="ds-mono-num ds-subtle">
        #{row.kind === "proposal" ? "p" : ""}
        {row.id.toString()}
      </span>
      <AddressDisplay address={row.role === "committer" || row.role === "proposer" ? row.counterparty : row.committer} />
    </span>
  );
}

function WelcomeCard({ assetSymbol }: { assetSymbol: string | undefined }) {
  const symbol = assetSymbol ?? "USDC";
  const steps: WelcomeStep[] = [
    {
      status: "done",
      title: "Connect a wallet",
      body: "Done — you can already browse protocol state.",
    },
    {
      status: "next",
      title: `Deposit ${symbol}`,
      body: `Put ${symbol} into a vault, then deposit the shares into the commitment manager as backing. Vault exits are instant.`,
      cta: { label: "Open vault", to: "/app/vaults" },
    },
    {
      status: "later",
      title: "Create your first commitment",
      body: "Encumber backing for a counterparty under terms you set, with an arbiter you choose. The Resolve modal handles release, forfeit, and yield distribution.",
      cta: { label: "Explore commitments", to: "/app/explorer" },
    },
  ];
  return (
    <section className="ds-card ds-stack ds-stack-4" aria-label="Welcome">
      <header className="ds-stack ds-stack-1">
        <h2 className="ds-section-title">Welcome to Commitments</h2>
        <p className="ds-text-sm ds-subtle">
          Composable enforceable agreements backed by yield-bearing shares. Three steps to get started.
        </p>
      </header>
      <ol className="ds-stack ds-stack-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {steps.map((step, idx) => (
          <li key={step.title} className="ds-row ds-row-3" style={{ alignItems: "flex-start" }}>
            <span
              className="ds-text-base"
              aria-hidden
              style={{ minWidth: 32, color: "var(--text-subtle)", fontVariantNumeric: "tabular-nums" }}
            >
              {step.status === "done" ? "[✓]" : `[${idx + 1}]`}
            </span>
            <div className="ds-stack ds-stack-1" style={{ flex: 1 }}>
              <span className="ds-text-base" style={{ fontWeight: 500 }}>
                {step.title}
              </span>
              <span className="ds-text-sm ds-subtle">{step.body}</span>
              {step.cta && (
                <Link to={step.cta.to} className="ds-btn ds-btn--sm" style={{ alignSelf: "flex-start" }}>
                  {step.cta.label} →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
      <footer className="ds-text-sm ds-subtle">
        New to the protocol? Read the <Link to="/app/docs/protocol/architecture">architecture overview</Link> or jump
        straight to <Link to="/app/docs/protocol/guides">guides</Link>.
      </footer>
    </section>
  );
}
