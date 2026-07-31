import { Hono } from 'hono'
import { desc, eq, isNull, or } from 'ponder'
import { db, publicClients } from 'ponder:api'
import schema from 'ponder:schema'
import type { Hex } from 'viem'

import { commitmentsVaultAbi } from '../abis'
import { ensureOffchainSchema, readRecent } from './offchainDb'
import { takeSnapshot } from './snapshot'
import { clientKey, createRateLimiter } from './rateLimit'
import { CHAIN_NAME, CHAIN_ID } from '../env'

// Manual snapshot triggers chain reads + a DB upsert; guard it like the sibling
// /metadata/pin write endpoint. 10 / minute / IP is plenty for dev + tests.
const snapshotLimiter = createRateLimiter({ windowMs: 60_000, maxPerWindow: 10 })
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

interface MinimalPublicClient {
  readContract(args: {
    address: Hex
    abi: typeof commitmentsVaultAbi
    functionName: 'totalAssets' | 'totalSupply'
  }): Promise<bigint>
  // Snapshot's default "now" reads the chain clock; the real viem client has this.
  getBlock(): Promise<{ timestamp: bigint }>
}

function getPublicClient(): MinimalPublicClient {
  const clients = publicClients as Record<string, MinimalPublicClient | undefined>
  const client = clients[CHAIN_NAME]
  if (!client) {
    throw new Error(`publicClient not found for chain "${CHAIN_NAME}"`)
  }
  return client
}

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
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 100), 1), 500)

  const rows = await db
    .select()
    .from(schema.donation)
    .where(eq(schema.donation.vault, vault))
    .orderBy(desc(schema.donation.blockNumber))
    .limit(limit)

  return c.json(rows)
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
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 100), 1), 500)

  const [mutualRows, feeRows] = await Promise.all([
    db.select().from(schema.mutual).where(eq(schema.mutual.coveredVault, vault)),
    db
      .select()
      .from(schema.vaultYieldFee)
      .where(eq(schema.vaultYieldFee.vault, vault))
      .orderBy(desc(schema.vaultYieldFee.blockNumber))
      .limit(limit),
  ])
  const coveringMutual = mutualRows[0]

  const totals = { skimmed: 0n, operatorFee: 0n, premiumRouted: 0n, premiumFunded: 0n, settlementDonated: 0n }
  for (const row of feeRows) {
    if (row.kind === 'skim') totals.skimmed += row.amount
    else if (row.kind === 'operatorFee') totals.operatorFee += row.amount
    else if (row.kind === 'premiumRouted') totals.premiumRouted += row.amount
    else if (row.kind === 'premiumFunded') totals.premiumFunded += row.amount
  }
  // Settlement restitution = donations from the mutual's beneficiary (the
  // ForfeitDonationBeneficiary's sweep) — labelled here, no dedicated rows.
  if (coveringMutual) {
    const donations = await db
      .select()
      .from(schema.donation)
      .where(eq(schema.donation.vault, vault))
    for (const d of donations) {
      if (d.donor.toLowerCase() === coveringMutual.beneficiary.toLowerCase()) {
        totals.settlementDonated += d.assets
      }
    }
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
 * GET /vaults/:vault/forfeit-ledger?limit=100&allVaults=0|1
 *
 * Unified chronological ledger of "events that move stake": forfeit lifecycle
 * transitions (initiated → executed | cancelled | cancelledStale), bilateral
 * settlements, encumbrance contributions, and vault donations. Newest first.
 *
 * Vault-filter scope:
 *   - All four kinds are filtered by the path `:vault` parameter via the
 *     denormalized `vault` column on each event table.
 *   - Rows with NULL `vault` (pre-backfill on a live indexer) are skipped
 *     unless `allVaults=1` is passed; the dev fixture re-syncs from genesis
 *     so this only matters in prod.
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
  const rawLimit = Number(c.req.query('limit') ?? 100)
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 500)
  const allVaults = c.req.query('allVaults') === '1'

  // Vault filter that also accepts NULL when the caller opts into the
  // unfiltered fallback. In normal operation NULL rows are skipped — the
  // path-encoded vault is authoritative.
  const forfeitWhere = allVaults
    ? undefined
    : or(eq(schema.forfeitEvent.vault, vault), isNull(schema.forfeitEvent.vault))
  const settleWhere = allVaults
    ? undefined
    : or(eq(schema.agreementSettlement.vault, vault), isNull(schema.agreementSettlement.vault))
  const contribWhere = allVaults
    ? undefined
    : or(eq(schema.contribution.vault, vault), isNull(schema.contribution.vault))

  const [forfeitRows, settleRows, contribRows, donationRows] = await Promise.all([
    db
      .select()
      .from(schema.forfeitEvent)
      .where(forfeitWhere)
      .orderBy(desc(schema.forfeitEvent.blockNumber))
      .limit(limit),
    db
      .select()
      .from(schema.agreementSettlement)
      .where(settleWhere)
      .orderBy(desc(schema.agreementSettlement.blockNumber))
      .limit(limit),
    db
      .select()
      .from(schema.contribution)
      .where(contribWhere)
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
 *
 * Time-series snapshots for the vault, newest first. Default 7 days, max 90.
 * Returns rows from `offchain.vault_periodic_snapshot`. APY columns are null
 * until the relevant window of history accumulates.
 *
 * BigInt fields are serialized as strings for JSON.
 */
app.get('/:vault/periodic', async (c) => {
  await ensureOffchainSchema()
  const vault = c.req.param('vault').toLowerCase() as `0x${string}`
  const rawDays = Number(c.req.query('days') ?? 7)
  const days = Math.min(Math.max(Number.isFinite(rawDays) ? rawDays : 7, 1), 90)
  const now = BigInt(Math.floor(Date.now() / 1000))
  const rows = await readRecent(vault, days, now)

  return c.json({
    vault,
    days,
    rows: rows.map((r) => ({
      vault: r.vault,
      timestamp: r.timestamp.toString(),
      sharePrice: r.sharePrice.toString(),
      totalAssets: r.totalAssets.toString(),
      totalSupply: r.totalSupply.toString(),
      apy7d: r.apy7d,
      apy30d: r.apy30d,
      totalForfeitable: r.totalForfeitable.toString(),
      totalEncumberedShares: r.totalEncumberedShares.toString(),
      activeCommitmentCount: r.activeCommitmentCount,
      forfeitPendingCount: r.forfeitPendingCount,
    })),
  })
})

/**
 * POST /vaults/:vault/periodic/snapshot
 *
 * Manual trigger for the snapshot job. Useful in dev (no need to wait for the
 * next interval tick) and for tests. Returns the result envelope including
 * the row that would have been written when status='created'.
 *
 * The :vault param selects which VaultFactory child to snapshot (v2 deploys one
 * vault per backing asset).
 */
app.post('/:vault/periodic/snapshot', async (c) => {
  const key = clientKey(c.req.header('x-forwarded-for'), c.req.header('x-real-ip'))
  if (snapshotLimiter.limited(key)) {
    return c.json({ error: 'rate_limited', message: 'Too many snapshot requests; slow down.' }, 429)
  }

  const raw = c.req.param('vault')
  if (!ADDRESS_RE.test(raw)) {
    return c.json({ error: 'invalid_vault', message: 'vault must be a 0x-prefixed 20-byte address.' }, 400)
  }
  const vault = raw.toLowerCase() as `0x${string}`

  // Optionally pin the clock from the body. Default is on-chain block time, so
  // the manual trigger naturally captures a warped price without a body; this
  // is only for callers that want to anchor "now" explicitly (e.g. backfills).
  let nowSeconds: bigint | undefined
  try {
    const body = (await c.req.json().catch(() => null)) as { nowSeconds?: string | number } | null
    if (body?.nowSeconds !== undefined && body.nowSeconds !== null) {
      nowSeconds = BigInt(body.nowSeconds)
    }
  } catch {
    return c.json({ error: 'invalid_now', message: 'nowSeconds must be an integer.' }, 400)
  }

  const result = await takeSnapshot({
    vault,
    ...(nowSeconds !== undefined ? { nowSeconds } : {}),
    publicClient: getPublicClient(),
    chainId: CHAIN_ID,
  })
  return c.json({
    ...result,
    vault: result.vault,
    timestamp: result.timestamp.toString(),
    data: result.data
      ? {
          ...result.data,
          timestamp: result.data.timestamp.toString(),
          sharePrice: result.data.sharePrice.toString(),
          totalAssets: result.data.totalAssets.toString(),
          totalSupply: result.data.totalSupply.toString(),
          totalForfeitable: result.data.totalForfeitable.toString(),
          totalEncumberedShares: result.data.totalEncumberedShares.toString(),
        }
      : undefined,
  })
})

export default app
