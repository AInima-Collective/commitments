import {
  AllocationBar,
  Button,
  Card,
  Notice,
  StatBlock,
  TokenAmount,
} from "../ui";
import { MutualStatusBadge } from "../protocol";
import { type MutualListing } from "../../hooks/useMutualListings";
import { type MutualIndexed } from "../../hooks/useMutuals";
import { type TokenMeta } from "../../hooks/useTokenMeta";
import { useVaults } from "../../hooks/useVaults";
import { LAMBDA_SCALE, formatLambdaPercent, formatLambdaPercentFull, formatPercent } from "../../lib/format";
import { mutualLifecycle } from "../../lib/mutual";
import { parsePerilURI, perilLabel } from "../../lib/peril";

/** Deep-link target that preopens an action drawer on the coverage detail page. */
export type CoverageAction = "underwrite" | "buy-cover" | undefined;

interface CoveragePoolCardProps {
  listing: MutualListing;
  /** Indexer enrichment for this pool; `undefined` when the indexer is down. */
  mutual: MutualIndexed | undefined;
  meta: TokenMeta;
  onOpen: (action?: CoverageAction) => void;
  /**
   * Set only for vault-funded pools (`coveredVault != null`) — navigates to
   * the covered vault. Such pools have no individual buy-cover flow (the
   * conduit covers all deposits), so this replaces that action.
   */
  onOpenVault?: () => void;
}

export function CoveragePoolCard({ listing, mutual, meta, onOpen, onOpenVault }: CoveragePoolCardProps) {
  const { vaultName } = useVaults();
  const { decimals, symbol } = meta;
  const status = mutual ? mutualLifecycle(mutual) : undefined;
  const peril = parsePerilURI(listing.perilURI);
  const aprBps = mutual?.premiumAprBps;
  const live = listing.liveCapacity;
  const closed = status === "terminated";
  const vaultFunded = mutual?.coveredVault != null;
  // Name of the covered vault, for the View-vault action.
  const coveredVaultName = mutual?.coveredVault ? vaultName(mutual.coveredVault) : undefined;

  // Subscription meter: filled vs target. Fall back to filled as the total when
  // no target is set so the bar still renders a full segment rather than empty.
  const capTotal = listing.targetCapacity > 0n ? listing.targetCapacity : listing.filled;

  return (
    <Card
      className="ds-stack ds-stack-3"
      aria-label={`Coverage pool #${listing.mutualId.toString()} — ${perilLabel(listing.perilURI)}`}
    >
      <div
        className="ds-row"
        style={{ justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-2)" }}
      >
        <span className="ds-stack" style={{ gap: "var(--space-1)" }}>
          <span className="ds-text-xs ds-subtle" style={{ letterSpacing: "0.04em" }}>
            COVERAGE POOL
          </span>
          <button
            type="button"
            className="ds-text-sm"
            style={{
              fontWeight: 600,
              textAlign: "left",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--text)",
            }}
            onClick={() => onOpen()}
          >
            {perilLabel(listing.perilURI)}
          </button>
        </span>
        <span className="ds-row ds-row-2" style={{ alignItems: "center", flexShrink: 0 }}>
          {/* Offering-type badge — only the non-default type is badged; open
              pools are the unmarked case (the type filter still names both). */}
          {vaultFunded && (
            <span
              className="ds-badge ds-badge--accent"
              title={`Vault-funded cover: ${coveredVaultName} pays the premium from its own yield via a keyless conduit, so every deposit is covered automatically — no policy purchase`}
            >
              vault-funded
            </span>
          )}
          {status ? (
            <MutualStatusBadge status={status} />
          ) : (
            <span className="ds-badge ds-badge--muted" title="Indexer enrichment unavailable">
              unindexed
            </span>
          )}
        </span>
      </div>

      {/* High-level "what this covers" line — the first thing a user should read. */}
      <p className="ds-text-sm ds-subtle" style={{ margin: 0, minHeight: "2.4em" }}>
        {peril.description ?? "Shared-loss coverage pool. Open the pool for the full risk definition."}
      </p>

      {/* Two-sided market: what underwriters earn vs. what buyers can cover.
          Labels describe the numbers; the actions live in the buttons below. */}
      <div className="ds-row ds-row-3" style={{ alignItems: "stretch" }}>
        <StatBlock
          label="premium APR"
          tone="success"
          value={aprBps !== undefined ? formatPercent(aprBps) : "—"}
          meta={aprBps !== undefined ? "to underwriters" : "no active cover"}
        />
        <StatBlock
          label="cover available"
          value={
            <span style={{ whiteSpace: "nowrap" }}>
              <TokenAmount amount={live} decimals={decimals} symbol={symbol} size="inline" compact precision={2} />
            </span>
          }
          meta="loss-adjusted"
        />
      </div>

      <AllocationBar
        segments={[{ label: "subscribed", value: listing.filled, tone: "accent" }]}
        total={capTotal}
        decimals={decimals}
        symbol={symbol}
        compact
      />

      <div className="ds-row ds-text-xs ds-subtle" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="ds-mono-num">pool #{listing.mutualId.toString()}</span>
        <span className="ds-row ds-row-3" style={{ alignItems: "center" }}>
          <span>{mutual ? `${mutual.memberCount} underwriters` : "— underwriters"}</span>
          <span
            title={mutual ? formatLambdaPercentFull(mutual.cumulativeLoss) : undefined}
            style={mutual && mutual.cumulativeLoss >= LAMBDA_SCALE / 2n ? { color: "var(--error)" } : undefined}
          >
            {mutual ? formatLambdaPercent(mutual.cumulativeLoss) : "—"} loss
          </span>
        </span>
      </div>

      {/* Equal-weight two-sided actions — mirror the detail page's drawers.
          A vault-funded pool has no individual buy-cover flow (cover is
          ambient — the conduit pays for every depositor), so the second action
          links to the covered vault instead. */}
      {closed ? (
        <Notice tone="neutral" size="sm">
          This pool is closed — no new cover or underwriting.
        </Notice>
      ) : (
        <div className="ds-row ds-row-2" style={{ marginTop: "var(--space-1)" }}>
          <Button size="sm" variant="primary" onClick={() => onOpen("underwrite")} style={{ flex: 1 }}>
            Underwrite →
          </Button>
          {vaultFunded && onOpenVault ? (
            <Button
              size="sm"
              variant="default"
              onClick={onOpenVault}
              title={coveredVaultName ? `Open ${coveredVaultName}` : undefined}
              style={{ flex: 1 }}
            >
              View vault →
            </Button>
          ) : (
            <Button size="sm" variant="default" onClick={() => onOpen("buy-cover")} style={{ flex: 1 }}>
              Buy cover →
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
