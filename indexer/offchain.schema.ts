/**
 * Offchain (indexer-managed, non-onchain-event-derived) tables live in a
 * dedicated `offchain` PG schema so they survive Ponder's namespace
 * versioning. Ponder owns the rolling `<buildId>` schemas where its onchain
 * tables live; we own `offchain.*`.
 *
 * Defined as raw-SQL DDL + TypeScript row types instead of a Drizzle pgTable
 * binding because `drizzle-orm/pg-core` isn't a direct dep of @commitments/
 * indexer (it's a transitive of `ponder` and pnpm strict-resolution blocks
 * the import). All reads/writes use `db.execute(sql`…`)` against the
 * `offchain` schema — see `src/api/offchainDb.ts`.
 *
 * Created at server startup via `ensureOffchainSchema()` in
 * `src/api/offchainDb.ts` — keep schema/table SQL in sync there.
 */

/**
 * Periodic per-vault snapshot, keyed by 5-minute timestamp bucket. Populated
 * by the background snapshot job (see `src/snapshot.ts`). APY columns are
 * null until enough history exists to compute a rolling rate.
 *
 * Numeric vs. bigint:
 *   - PG bigint is int64 (max ~9.2e18). Vault values denominated in 18-decimal
 *     wei can exceed this. Use NUMERIC (arbitrary precision) for share
 *     prices, totals, forfeitable. `timestamp` is unix seconds; bigint is fine
 *     (well below int64 limits even centuries from now).
 *
 * Time anchor: `timestamp` is unix seconds, floored to a 5-minute bucket.
 */
export interface VaultPeriodicSnapshotRow {
  vault: string
  timestamp: bigint
  /** (totalAssets * 1e18) / totalSupply, unitless 18-dec scale. */
  sharePrice: bigint
  /** Total assets in vault, asset-decimal units. */
  totalAssets: bigint
  /** Total shares outstanding, share-decimal units. */
  totalSupply: bigint
  /** APY 7d in basis points. Null until 7d of history exists. */
  apy7d: number | null
  /** APY 30d in basis points. Null until 30d of history exists. */
  apy30d: number | null
  /** Sum of (amount * maxPenaltyBps / 10000) across active+unbonding+forfeitPending commitments. */
  totalForfeitable: bigint
  /** Sum of `vaultPosition.encumberedShares` across all rows. */
  totalEncumberedShares: bigint
  /** Count of commitments with status='active'. */
  activeCommitmentCount: number
  /** Count of commitments with status='forfeitPending'. */
  forfeitPendingCount: number
}

export const SNAPSHOT_INTERVAL_SECONDS = 5 * 60
export const APY_7D_SECONDS = 7 * 24 * 60 * 60
export const APY_30D_SECONDS = 30 * 24 * 60 * 60
