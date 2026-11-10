import { Hono } from 'hono'
import { and, desc, eq, sql } from 'ponder'
import { db } from 'ponder:api'
import schema from 'ponder:schema'

import { jsonBig, parseLimit } from './http'
import { periodicStepSeconds } from './snapshotMath'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

const app = new Hono()

/**
 * Vault endpoints. Currently the v2.5 donations log + the unified ledger
 * (forfeit + settlement + contribution + donation). Expand here when more
 * vault-scoped views are needed.
 */

/**
 * GET /vaults/:vault/donations
 *
 * Per-Donation-event log for one vault, newest first, capped at 500.
 * Use `?limit=N` to override the default of 100.
 */
app.get('/:vault/donations', async (c) => {
  const vault = c.req.param('vault').toLowerCase() as `0x${string}`
  const limit = parseLimit(c, 100, 500)

  const rows = await db
    .select()
    .from(schema.donation)
    .where(eq(schema.donation.vault, vault))
    .orderBy(desc(schema.donation.blockNumber))
    .limit(limit)

  return jsonBig(c, rows)
})

/**
 * GET /vaults/:vault/coverage
 *
 * The underwritten-vault coverage surface: which mutual ambient-covers this
 * vault (via the keyless VaultCoverConduit), the running totals of the yield
 * skim pipeline, and the recent fee/funding events. `mutualId: null` (200, not
 * 404) when the vault has no coverage market — ordinary vaults are the common
 * case.
 *
 * Denominations: `skimmed` / `operatorFee` / `premiumRouted` /
 * `settlementDonated` are in the vault's UNDERLYING asset; `premiumFunded` is
 * in vault SHARES (the mutual numeraire). Bigints serialize as strings.
 */
app.get('/:vault/coverage', async (c) => {
  const vault = c.req.param('vault').toLowerCase() as `0x${string}`
  if (!ADDRESS_RE.test(vault)) return c.json({ error: 'invalid vault address' }, 400)
  const limit = parseLimit(c, 100, 500)

  const [mutualRows, feeRows, kindSums] = await Promise.all([
    db.select().from(schema.mutual).where(eq(schema.mutual.coveredVault, vault)),
    db
      .select()
      .from(schema.vaultYieldFee)
      .where(eq(schema.vaultYieldFee.vault, vault))
      .orderBy(desc(schema.vaultYieldFee.blockNumber))
      .limit(limit),
    // Running totals over every row, not the limit-capped page above.
    db
      .select({
        kind: schema.vaultYieldFee.kind,
        total: sql<string>`coalesce(sum(${schema.vaultYieldFee.amount}), 0)`,
      })
      .from(schema.vaultYieldFee)
      .where(eq(schema.vaultYieldFee.vault, vault))
      .groupBy(schema.vaultYieldFee.kind),
  ])
  const coveringMutual = mutualRows[0]

  const totals = { skimmed: 0n, operatorFee: 0n, premiumRouted: 0n, premiumFunded: 0n, settlementDonated: 0n }
  for (const row of kindSums) {
    const total = BigInt(row.total)
    if (row.kind === 'skim') totals.skimmed = total
    else if (row.kind === 'operatorFee') totals.operatorFee = total
    else if (row.kind === 'premiumRouted') totals.premiumRouted = total
    else if (row.kind === 'premiumFunded') totals.premiumFunded = total
  }
  // Settlement restitution = donations from the mutual's beneficiary (the
  // ForfeitDonationBeneficiary's sweep) — labelled here, no dedicated rows.
  if (coveringMutual) {
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${schema.donation.assets}), 0)` })
      .from(schema.donation)
      .where(
        and(
          eq(schema.donation.vault, vault),
          eq(schema.donation.donor, coveringMutual.beneficiary.toLowerCase() as `0x${string}`),
        ),
      )
    totals.settlementDonated = BigInt(row?.total ?? 0)
  }

  return c.json({
    mutualId: coveringMutual ? coveringMutual.mutualId.toString() : null,
    conduit: coveringMutual?.conduit ?? null,
    beneficiary: coveringMutual?.beneficiary ?? null,
    totals: {
      skimmed: totals.skimmed.toString(),
      operatorFee: totals.operatorFee.toString(),
      premiumRouted: totals.premiumRouted.toString(),
      premiumFunded: totals.premiumFunded.toString(),
      settlementDonated: totals.settlementDonated.toString(),
    },
    events: feeRows.map((row) => ({
      kind: row.kind,
      source: row.source,
      amount: row.amount.toString(),
      recipient: row.recipient,
      mutualId: row.mutualId?.toString() ?? null,
      streamDuration: row.streamDuration?.toString() ?? null,
      blockTimestamp: row.blockTimestamp.toString(),
      txHash: row.txHash,
    })),
  })
})

/**
 * GET /vaults/:vault/forfeit-ledger?limit=100
 *
 * Unified chronological ledger of "events that move stake": forfeit lifecycle
 * transitions (initiated → executed | cancelled | cancelledStale), bilateral
 * settlements, encumbrance contributions, and vault donations. Newest first.
 *
 * Vault-filter scope: all four kinds are filtered by the path `:vault`
 * parameter via the denormalized `vault` column on each event table. Rows
 * with NULL `vault` are plain ERC-20 backing and belong to no vault's ledger.
 *
 * Time anchors:
 *   - All four kinds use blockTimestamp from the event row. Forfeit events get
 *     a precise timestamp now that the forfeitEvent log table exists; the
 *     `forfeitChallengeEnd` field is included in the payload for UIs that
 *     want to render the matures-at countdown alongside the proposed-at
 *     timestamp.
 *
 * Bigint fields are serialized as strings.
 */
app.get('/:vault/forfeit-ledger', async (c) => {
  const vault = c.req.param('vault').toLowerCase() as `0x${string}`
  const limit = parseLimit(c, 100, 500)

  const [forfeitRows, settleRows, contribRows, donationRows] = await Promise.all([
    db
      .select()
      .from(schema.forfeitEvent)
      .where(eq(schema.forfeitEvent.vault, vault))
      .orderBy(desc(schema.forfeitEvent.blockNumber))
      .limit(limit),
    db
      .select()
      .from(schema.agreementSettlement)
      .where(eq(schema.agreementSettlement.vault, vault))
      .orderBy(desc(schema.agreementSettlement.blockNumber))
      .limit(limit),
    db
      .select()
      .from(schema.contribution)
      .where(eq(schema.contribution.vault, vault))
      .orderBy(desc(schema.contribution.blockNumber))
      .limit(limit),
    db
      .select()
      .from(schema.donation)
      .where(eq(schema.donation.vault, vault))
      .orderBy(desc(schema.donation.blockNumber))
      .limit(limit),
  ])

  type LedgerEvent = {
    kind: 'forfeit' | 'settlement' | 'contribution' | 'donation'
    timestamp: string
    blockNumber: string
    txHash: string
    payload: Record<string, string | number | boolean | null>
  }

  const events: LedgerEvent[] = []

  for (const r of forfeitRows) {
    events.push({
      kind: 'forfeit',
      timestamp: r.blockTimestamp.toString(),
      blockNumber: r.blockNumber.toString(),
      txHash: r.txHash,
      payload: {
        commitmentId: r.commitmentId.toString(),
        forfeitKind: r.kind,
        committer: r.committer,
        arbiter: r.arbiter,
        counterparty: r.counterparty,
        penaltyBps: r.penaltyBps,
        challengeWindow: r.challengeWindow?.toString() ?? null,
        challengeEnd: r.challengeEnd?.toString() ?? null,
        sharesToForfeit: r.sharesToForfeit?.toString() ?? null,
      },
    })
  }
  for (const r of settleRows) {
    events.push({
      kind: 'settlement',
      timestamp: r.blockTimestamp.toString(),
      blockNumber: r.blockNumber.toString(),
      txHash: r.txHash,
      payload: {
        agreementId: r.agreementId.toString(),
        fromProposer: r.fromProposer,
        shares: r.shares.toString(),
        evidenceHash: r.evidenceHash,
      },
    })
  }
  for (const r of contribRows) {
    events.push({
      kind: 'contribution',
      timestamp: r.blockTimestamp.toString(),
      blockNumber: r.blockNumber.toString(),
      txHash: r.txHash,
      payload: {
        commitmentId: r.commitmentId.toString(),
        contributor: r.contributor,
        receiver: r.receiver,
        shares: r.shares.toString(),
      },
    })
  }
  for (const r of donationRows) {
    events.push({
      kind: 'donation',
      timestamp: r.blockTimestamp.toString(),
      blockNumber: r.blockNumber.toString(),
      txHash: r.txHash,
      payload: {
        vault: r.vault,
        donor: r.donor,
        assets: r.assets.toString(),
      },
    })
  }

  events.sort((a, b) => {
    const diff = BigInt(b.timestamp) - BigInt(a.timestamp)
    if (diff !== 0n) return diff > 0n ? 1 : -1
    const bn = BigInt(b.blockNumber) - BigInt(a.blockNumber)
    return bn === 0n ? 0 : bn > 0n ? 1 : -1
  })

  return c.json({
    vault,
    events: events.slice(0, limit),
    counts: {
      forfeit: forfeitRows.length,
      settlement: settleRows.length,
      contribution: contribRows.length,
      donation: donationRows.length,
    },
  })
})

/**
 * GET /vaults/:vault/periodic?days=N
 * GET /vaults/:vault/periodic?latest=1
 *
 * Vault snapshots written by the `VaultSnapshot` block handler, newest first.
 * `days` (default 7, max 90) is counted back from the newest snapshot, so it
 * follows the chain clock. The series is downsampled to the newest snapshot
 * per hour for up to 7 days and per day beyond, so at most ~170 rows.
 * `latest=1` returns only the newest snapshot (the APY headline).
 *
 * APY columns are null until half the window of history exists. Bigints
 * serialize as strings.
 */
app.get('/:vault/periodic', async (c) => {
  const vault = c.req.param('vault').toLowerCase() as `0x${string}`
  if (!ADDRESS_RE.test(vault)) return c.json({ error: 'invalid vault address' }, 400)
  const t = schema.vaultSnapshot
  const rawDays = Number(c.req.query('days') ?? 7)
  const days = Math.min(Math.max(Number.isFinite(rawDays) ? Math.trunc(rawDays) : 7, 1), 90)

  if (c.req.query('latest') === '1') {
    const rows = await db.select().from(t).where(eq(t.vault, vault)).orderBy(desc(t.timestamp)).limit(1)
    return jsonBig(c, { vault, days, rows })
  }

  // DISTINCT ON needs the same expression in ORDER BY; the step is a constant
  // we chose, so it is inlined rather than bound twice as two parameters.
  const bucket = sql`div(${t.timestamp}, ${sql.raw(String(periodicStepSeconds(days)))})`
  const rows = await db
    .selectDistinctOn([bucket])
    .from(t)
    .where(
      and(
        eq(t.vault, vault),
        sql`${t.timestamp} >= (select max(${t.timestamp}) from ${t} where ${t.vault} = ${vault}) - ${days * 86_400}`,
      ),
    )
    .orderBy(desc(bucket), desc(t.timestamp))

  return jsonBig(c, { vault, days, rows })
})

export default app
