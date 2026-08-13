import { Hono } from 'hono'
import { desc, eq, sql } from 'ponder'
import { db } from 'ponder:api'
import schema from 'ponder:schema'

const app = new Hono()

/**
 * GET /protocol/stats
 *
 * Single round-trip protocol-wide KPIs for the Explorer page. All counts are
 * derived from existing tables — no new schema. Heavy-ish (one full scan per
 * entity type) but at current scale (<1k commitments per seed) it's
 * negligible. If this becomes a hotspot, materialize into a `protocolStats`
 * row maintained in event handlers — but don't pre-optimize.
 *
 * TVL is intentionally NOT included here: live TVL is read on-chain
 * (vault.totalAssets() via wagmi, or manager ledger totals per token). This
 * payload exposes a `ledger.totalEncumbered` proxy for "how much is locked up"
 * and the frontend combines it for the KPI strip.
 *
 * BigInt fields are serialized as strings; numeric counts as JS numbers.
 */
app.get('/stats', async (c) => {
  // Commitment status histogram + totalForfeitable across active rows.
  const commitmentStatusRows = await db
    .select({
      status: schema.commitment.status,
      count: sql<string>`COUNT(*)::text`,
      forfeitableSum: sql<string>`COALESCE(FLOOR(SUM(${schema.commitment.amount} * ${schema.commitment.maxPenaltyBps}) / 10000), 0)::text`,
    })
    .from(schema.commitment)
    .groupBy(schema.commitment.status)

  const commitmentStatuses: Record<string, number> = {
    active: 0,
    unbonding: 0,
    forfeitPending: 0,
    forfeited: 0,
    released: 0,
    expired: 0,
  }
  let totalForfeitable = 0n
  for (const row of commitmentStatusRows) {
    commitmentStatuses[row.status] = Number(row.count)
    if (row.status === 'active' || row.status === 'unbonding' || row.status === 'forfeitPending') {
      totalForfeitable += BigInt(row.forfeitableSum)
    }
  }

  // Distinct arbiter count.
  const [{ count: arbitersCountRaw }] = await db
    .select({ count: sql<string>`COUNT(DISTINCT ${schema.commitment.arbiter})::text` })
    .from(schema.commitment)

  // Agreement status histogram.
  const agreementStatusRows = await db
    .select({
      status: schema.agreement.status,
      count: sql<string>`COUNT(*)::text`,
    })
    .from(schema.agreement)
    .groupBy(schema.agreement.status)

  const agreementStatuses: Record<string, number> = {
    active: 0,
    forfeited: 0,
    released: 0,
    partialForfeitA: 0,
    partialForfeitB: 0,
  }
  for (const row of agreementStatusRows) {
    agreementStatuses[row.status] = Number(row.count)
  }

  // Operator counts + total delegated stake (registered only).
  const operatorRows = await db
    .select({
      status: schema.operator.status,
      count: sql<string>`COUNT(*)::text`,
      totalDelegatedSum: sql<string>`COALESCE(SUM(${schema.operator.totalDelegatedStake}), 0)::text`,
    })
    .from(schema.operator)
    .groupBy(schema.operator.status)

  let operatorsRegistered = 0
  let operatorsDeregistered = 0
  let totalDelegatedStake = 0n
  for (const row of operatorRows) {
    if (row.status === 'registered') {
      operatorsRegistered = Number(row.count)
      totalDelegatedStake = BigInt(row.totalDelegatedSum)
    } else if (row.status === 'deregistered') {
      operatorsDeregistered = Number(row.count)
    }
  }

  // Mesh node counts by type.
  const meshNodeRows = await db
    .select({
      nodeType: schema.meshNode.nodeType,
      count: sql<string>`COUNT(*)::text`,
    })
    .from(schema.meshNode)
    .groupBy(schema.meshNode.nodeType)

  const meshNodes = { fanIn: 0, fanOut: 0, tokenWeighting: 0, total: 0 }
  for (const row of meshNodeRows) {
    const n = Number(row.count)
    if (row.nodeType === 'fan_in') meshNodes.fanIn = n
    else if (row.nodeType === 'fan_out') meshNodes.fanOut = n
    else if (row.nodeType === 'token_weighting') meshNodes.tokenWeighting = n
    meshNodes.total += n
  }

  // Encumbrance proxy — sum of the per-(token, user) encumbered balances in the
  // manager ledger. Not the same as Σ vault.totalAssets but a useful "how much
  // is locked up" metric the indexer can answer without on-chain reads. (There
  // is no withdrawal queue in v2, so queued shares/assets are gone.)
  const [ledgerAgg] = await db
    .select({
      totalEncumbered: sql<string>`COALESCE(SUM(${schema.ledgerPosition.encumbered}), 0)::text`,
      positionCount: sql<string>`COUNT(*)::text`,
    })
    .from(schema.ledgerPosition)

  return c.json({
    commitments: commitmentStatuses,
    totalForfeitable: totalForfeitable.toString(),
    arbiterCount: Number(arbitersCountRaw),
    agreements: agreementStatuses,
    operators: {
      registered: operatorsRegistered,
      deregistered: operatorsDeregistered,
      totalDelegatedStake: totalDelegatedStake.toString(),
    },
    meshNodes,
    ledger: {
      totalEncumbered: ledgerAgg?.totalEncumbered ?? '0',
      positionCount: Number(ledgerAgg?.positionCount ?? '0'),
    },
    updatedAt: Math.floor(Date.now() / 1000),
  })
})

/**
 * GET /protocol/leaderboard?metric=arbiter|operator|counterparty&limit=N
 *
 * Top-N ranking for the Explorer leaderboards card. Each metric returns rows
 * sorted by the natural "size" measure for that role:
 *
 *   arbiter      → commitment count. Raw backing units are intentionally not
 *                  summed across heterogeneous tokens.
 *   counterparty → commitment count for the same reason.
 *   operator     → totalDelegatedStake from the operator dossier. Tie-break by
 *                  activeDelegationCount.
 *
 * `limit` defaults to 10, max 50. Each row carries the bigint sum as a string
 * so the frontend doesn't have to deal with serialization quirks.
 */
app.get('/leaderboard', async (c) => {
  const metric = c.req.query('metric') ?? 'arbiter'
  const rawLimit = Number(c.req.query('limit') ?? 10)
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 10, 1), 50)

  if (metric === 'arbiter') {
    const rows = await db
      .select({
        address: schema.commitment.arbiter,
        commitmentCount: sql<string>`COUNT(*)::text`,
        activeCount: sql<string>`COUNT(*) FILTER (WHERE ${schema.commitment.status} = 'active')::text`,
      })
      .from(schema.commitment)
      .groupBy(schema.commitment.arbiter)
      .orderBy(
        sql`COUNT(*) DESC`,
        schema.commitment.arbiter,
      )
      .limit(limit)

    return c.json({
      metric,
      rows: rows.map((r) => ({
        address: r.address.toLowerCase(),
        commitmentCount: Number(r.commitmentCount),
        activeCount: Number(r.activeCount),
      })),
    })
  }

  if (metric === 'counterparty') {
    const rows = await db
      .select({
        address: schema.commitment.counterparty,
        commitmentCount: sql<string>`COUNT(*)::text`,
        activeCount: sql<string>`COUNT(*) FILTER (WHERE ${schema.commitment.status} = 'active')::text`,
      })
      .from(schema.commitment)
      .groupBy(schema.commitment.counterparty)
      .orderBy(
        sql`COUNT(*) DESC`,
        schema.commitment.counterparty,
      )
      .limit(limit)

    return c.json({
      metric,
      rows: rows.map((r) => ({
        address: r.address.toLowerCase(),
        commitmentCount: Number(r.commitmentCount),
        activeCount: Number(r.activeCount),
      })),
    })
  }

  if (metric === 'operator') {
    const rows = await db
      .select()
      .from(schema.operator)
      .where(eq(schema.operator.status, 'registered'))
      .orderBy(desc(schema.operator.totalDelegatedStake), desc(schema.operator.activeDelegationCount))
      .limit(limit)

    return c.json({
      metric,
      rows: rows.map((r) => ({
        address: r.address.toLowerCase(),
        totalDelegatedStake: r.totalDelegatedStake.toString(),
        activeDelegationCount: r.activeDelegationCount,
        services: r.services ?? [],
      })),
    })
  }

  return c.json({ error: `unknown metric: ${metric}` }, 400)
})

export default app
