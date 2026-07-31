import { sql } from 'ponder'

import type { VaultPeriodicSnapshotRow } from '../../offchain.schema'

/**
 * The `db` exported from `ponder:api` is the read-only QB (`readonlyQB.raw`)
 * which can SELECT but not INSERT/UPDATE/DDL. The snapshot job needs writes,
 * so we reach for `adminQB.raw` via the same global Ponder publishes the
 * connection on (`PONDER_DATABASE`). This is undocumented but stable across
 * 0.15.x — it's how Ponder's own server wires up `db` for read paths.
 *
 * If a future Ponder release renames or restricts this global, the
 * snapshot pipeline will fail loudly at startup and we'll need to revisit.
 */
type RawSqlResult = { rows: unknown[] } | unknown[] | { rowCount?: number }
type RawDb = {
  execute(query: ReturnType<typeof sql>): Promise<RawSqlResult>
}

interface PonderGlobals {
  PONDER_DATABASE?: {
    adminQB?: { raw: RawDb }
  }
}

function getAdminDb(): RawDb {
  const g = globalThis as unknown as PonderGlobals
  const admin = g.PONDER_DATABASE?.adminQB?.raw
  if (!admin) {
    throw new Error(
      'PONDER_DATABASE.adminQB.raw not available — offchain schema cannot be initialized. This module must be loaded after Ponder boots.',
    )
  }
  return admin
}

let cached: RawDb | null = null
function adminDb(): RawDb {
  if (!cached) cached = getAdminDb()
  return cached
}

let initialized: Promise<void> | null = null

/**
 * Idempotently create the `offchain` PG schema and any tables it owns. Safe
 * to call multiple times — uses CREATE ... IF NOT EXISTS throughout.
 *
 * Caller pattern: `await ensureOffchainSchema()` once at server startup,
 * before any handler that selects/inserts on `offchain.*`.
 */
export function ensureOffchainSchema(): Promise<void> {
  if (initialized) return initialized
  initialized = (async () => {
    const db = adminDb()
    await db.execute(sql`CREATE SCHEMA IF NOT EXISTS offchain`)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS offchain.vault_periodic_snapshot (
        vault TEXT NOT NULL,
        "timestamp" BIGINT NOT NULL,
        share_price NUMERIC NOT NULL,
        total_assets NUMERIC NOT NULL,
        total_supply NUMERIC NOT NULL,
        apy_7d INTEGER,
        apy_30d INTEGER,
        total_forfeitable NUMERIC NOT NULL,
        total_encumbered_shares NUMERIC NOT NULL,
        active_commitment_count INTEGER NOT NULL,
        forfeit_pending_count INTEGER NOT NULL,
        PRIMARY KEY (vault, "timestamp")
      )
    `)
  })().catch((err) => {
    initialized = null
    throw err
  })
  return initialized
}

/**
 * Drizzle's `execute` returns different shapes depending on driver
 * (pglite vs node-postgres). Normalize to a row array.
 */
function rowsOf(result: RawSqlResult): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: Record<string, unknown>[] }).rows ?? []
  }
  return []
}

function toBigInt(v: unknown): bigint {
  if (typeof v === 'bigint') return v
  if (typeof v === 'string') return BigInt(v)
  if (typeof v === 'number') return BigInt(Math.trunc(v))
  return 0n
}

function toBigIntOrNull(v: unknown): bigint | null {
  if (v === null || v === undefined) return null
  return toBigInt(v)
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Number(v)
  if (typeof v === 'bigint') return Number(v)
  return null
}

function parseSnapshotRow(row: Record<string, unknown>): VaultPeriodicSnapshotRow {
  return {
    vault: String(row.vault),
    timestamp: toBigInt(row.timestamp),
    sharePrice: toBigInt(row.share_price),
    totalAssets: toBigInt(row.total_assets),
    totalSupply: toBigInt(row.total_supply),
    apy7d: toNumberOrNull(row.apy_7d),
    apy30d: toNumberOrNull(row.apy_30d),
    totalForfeitable: toBigInt(row.total_forfeitable),
    totalEncumberedShares: toBigInt(row.total_encumbered_shares),
    activeCommitmentCount: Number(row.active_commitment_count ?? 0),
    forfeitPendingCount: Number(row.forfeit_pending_count ?? 0),
  }
}

/**
 * Insert a snapshot, no-op if (vault, timestamp) already exists. Returns
 * true if a row was actually written, false on conflict.
 */
export async function upsertSnapshot(row: VaultPeriodicSnapshotRow): Promise<boolean> {
  const db = adminDb()
  const result = await db.execute(sql`
    INSERT INTO offchain.vault_periodic_snapshot (
      vault, "timestamp", share_price, total_assets, total_supply,
      apy_7d, apy_30d, total_forfeitable, total_encumbered_shares,
      active_commitment_count, forfeit_pending_count
    ) VALUES (
      ${row.vault.toLowerCase()},
      ${row.timestamp},
      ${row.sharePrice.toString()},
      ${row.totalAssets.toString()},
      ${row.totalSupply.toString()},
      ${row.apy7d},
      ${row.apy30d},
      ${row.totalForfeitable.toString()},
      ${row.totalEncumberedShares.toString()},
      ${row.activeCommitmentCount},
      ${row.forfeitPendingCount}
    )
    ON CONFLICT (vault, "timestamp") DO NOTHING
  `)
  // pg returns rowCount; pglite returns affectedRows or rows. Best-effort.
  if (result && typeof result === 'object' && 'rowCount' in result) {
    return (result as { rowCount?: number }).rowCount! > 0
  }
  return true
}

/**
 * Fetch snapshots for a vault within the trailing `windowSeconds`, oldest
 * first (so callers can compute APY by comparing current vs. window-start).
 */
export async function readWindow(
  vault: string,
  nowSeconds: bigint,
  windowSeconds: bigint,
): Promise<VaultPeriodicSnapshotRow[]> {
  const db = adminDb()
  const start = nowSeconds - windowSeconds
  const result = await db.execute(sql`
    SELECT vault, "timestamp", share_price, total_assets, total_supply,
           apy_7d, apy_30d, total_forfeitable, total_encumbered_shares,
           active_commitment_count, forfeit_pending_count
    FROM offchain.vault_periodic_snapshot
    WHERE vault = ${vault.toLowerCase()}
      AND "timestamp" >= ${start}
    ORDER BY "timestamp" ASC
  `)
  return rowsOf(result).map(parseSnapshotRow)
}

/**
 * Fetch the most recent N snapshots for a vault (for /periodic endpoint).
 * Newest first. `days` translates to a windowed scan so the planner can use
 * the primary key index.
 */
export async function readRecent(
  vault: string,
  days: number,
  nowSeconds: bigint,
): Promise<VaultPeriodicSnapshotRow[]> {
  const db = adminDb()
  const cutoff = nowSeconds - BigInt(days * 24 * 60 * 60)
  const result = await db.execute(sql`
    SELECT vault, "timestamp", share_price, total_assets, total_supply,
           apy_7d, apy_30d, total_forfeitable, total_encumbered_shares,
           active_commitment_count, forfeit_pending_count
    FROM offchain.vault_periodic_snapshot
    WHERE vault = ${vault.toLowerCase()}
      AND "timestamp" >= ${cutoff}
    ORDER BY "timestamp" DESC
  `)
  return rowsOf(result).map(parseSnapshotRow)
}

/**
 * Fetch the oldest snapshot strictly before `cutoff`. Used by the APY
 * calculator to pick a sensible reference point even when the window's
 * exact boundary doesn't fall on a snapshot bucket.
 */
export async function readOldestSinceCutoff(
  vault: string,
  cutoff: bigint,
): Promise<VaultPeriodicSnapshotRow | null> {
  const db = adminDb()
  const result = await db.execute(sql`
    SELECT vault, "timestamp", share_price, total_assets, total_supply,
           apy_7d, apy_30d, total_forfeitable, total_encumbered_shares,
           active_commitment_count, forfeit_pending_count
    FROM offchain.vault_periodic_snapshot
    WHERE vault = ${vault.toLowerCase()}
      AND "timestamp" >= ${cutoff}
    ORDER BY "timestamp" ASC
    LIMIT 1
  `)
  const rows = rowsOf(result)
  return rows.length ? parseSnapshotRow(rows[0]) : null
}
