import { Hono } from 'hono'
import { and, asc, desc, eq, gt, gte, isNull, lt, lte, or, sql } from 'ponder'
import { db } from 'ponder:api'
import schema from 'ponder:schema'

import { jsonBig, parseId, parseLimit } from './http'
import { DAY, foldMutualHistory } from './mutualHistoryMath'

const app = new Hono()

/**
 * Mutual / Synthetic Mutual endpoints.
 *
 *   GET /mutuals                    — every mutual row + derived liveCapacity / memberCount.
 *   GET /mutuals/:id/members        — the mutual's member roster + derived owedUnits / unbondRequestedAt.
 *   GET /mutuals/:id/ledger?limit=N — mutual dossier: the mutual row, its members,
 *                                    and its event timeline (newest first).
 *   GET /mutuals/:id/premium        — premium funding, claims and cover bindings.
 *   GET /mutuals/:id/history?days=N — one point per UTC day: premium APR, capital, cover sold.
 *
 * The `:id` path parameter is the numeric mutualId. A single-manager deployment
 * (the v2 norm) has one mutual per id; if multiple managers ever share an id
 * space the first match wins for the `mutual` field while members/events span
 * all managers' rows for that id. All bigint fields are serialized as DECIMAL
 * STRINGS (JSON can't carry bigint; the frontend parses with BigInt()).
 */

// 1e18 — the fixed-point scale of the cumulative-loss fraction (Lambda) and
// every per-member loss snapshot. See MutualLib.LAMBDA_ONE.
const ONE = 1_000_000_000_000_000_000n

/**
 * GET /mutuals
 *
 * One entry per Mutual row, ordered by mutualId.
 *
 *   memberCount  — active, non-exiting underwriters. On-chain this is
 *                  `unbondRequestedAt == 0 AND membership present`; in the
 *                  indexer that maps exactly to status === 'active' (a pending
 *                  exit flips status to 'exitRequested', release to 'released').
 *
 *   liveCapacity — loss headroom, numeraire units:
 *                  totalShares × (1e18 − cumulativeLoss) / 1e18, the contract's
 *                  own formula in MutualLib.executeMutualLoss. It moves the moment
 *                  a loss executes, not when each member is lazily settled.
 */
app.get('/', async (c) => {
  const [mutuals, counts] = await Promise.all([
    db.select().from(schema.mutual).orderBy(asc(schema.mutual.mutualId)),
    db
      .select({
        manager: schema.membership.manager,
        mutualId: schema.membership.mutualId,
        active: sql<string>`COUNT(*) FILTER (WHERE ${schema.membership.status} = 'active')::text`,
      })
      .from(schema.membership)
      .groupBy(schema.membership.manager, schema.membership.mutualId),
  ])
  const memberCounts = new Map(counts.map((r) => [`${r.manager.toLowerCase()}-${r.mutualId}`, Number(r.active)]))

  const out = mutuals.map((g) => {
    const liveCapacity = (g.totalShares * (ONE - g.cumulativeLoss)) / ONE
    const memberCount = memberCounts.get(g.id) ?? 0
    return {
      mutualId: g.mutualId.toString(),
      arbiter: g.arbiter,
      beneficiary: g.beneficiary,
      numeraire: g.numeraire,
      challengeWindow: Number(g.challengeWindow),
      deallocationWindow: Number(g.deallocationWindow),
      totalShares: g.totalShares.toString(),
      cumulativeLoss: g.cumulativeLoss.toString(),
      liveCapacity: liveCapacity.toString(),
      memberCount,
      // §G premium stream — the underwriter-yield surface. Surfaced on the list
      // so the /mutuals index can sort/badge by premium APR without an extra
      // per-row on-chain read; APR is derived client-side as
      // rewardRate·secondsPerYear·1e4 / activeCover (see useMutuals).
      rewardRate: g.rewardRate.toString(),
      activeCover: g.activeCover.toString(),
      periodFinish: Number(g.periodFinish),
      premiumPool: g.premiumPool.toString(),
      active: g.active,
      terminal: g.terminal,
      // Underwritten-vault association (NULL for ordinary mutuals): the vault
      // this pool ambient-covers and the keyless conduit paying its premium
      // from the vault's own yield (stamped by the conduit's PremiumFunded).
      coveredVault: g.coveredVault,
      conduit: g.conduit,
    }
  })

  return c.json(out)
})

/**
 * GET /mutuals/:id/members
 *
 * The mutual's member commitments, ordered by commitmentId. Unknown mutual id ->
 * 200 with `[]` (matching the /mutuals/:id/ledger convention, which also 200s
 * with empty lists rather than 404ing). `owedUnits` is the PENDING unsettled
 * markdown at the mutual's current Lambda, mirroring MutualLib.pendingMemberLoss.
 */
app.get('/:id/members', async (c) => {
  const mutualId = parseId(c.req.param('id'))
  if (mutualId === null) return c.json({ error: 'invalid mutual id' }, 400)

  const [members, mutualRows] = await Promise.all([
    db
      .select()
      .from(schema.membership)
      .where(eq(schema.membership.mutualId, mutualId))
      .orderBy(asc(schema.membership.commitmentId)),
    db.select().from(schema.mutual).where(eq(schema.mutual.mutualId, mutualId)).limit(1),
  ])

  // Lambda — the parent mutual's cumulative loss fraction (1e18-scaled). Absent
  // mutual => 0, which yields owedUnits 0 for the (empty) member set anyway.
  const lambda = mutualRows[0]?.cumulativeLoss ?? 0n

  const out = members.map((m) => {
    // owed = forfeitableUnits*(Lambda - lossSnapshot)/1e18, clamped to
    // [0, forfeitableUnits - settledUnits]. Exactly MutualLib.pendingMemberLoss;
    // its third clamp to the live commitment `amount` is non-binding here because
    // forfeitableUnits = amount*maxPenaltyBps/10000 <= amount, so the remaining
    // liability is always <= amount.
    let owed = 0n
    if (lambda > m.lossSnapshot) {
      owed = (m.forfeitableUnits * (lambda - m.lossSnapshot)) / ONE
      const remaining = m.forfeitableUnits - m.settledUnits
      if (owed > remaining) owed = remaining
      if (owed < 0n) owed = 0n
    }
    // status 'active' <=> on-chain unbondRequestedAt == 0.
    const unbond = m.status === 'active' ? 0n : (m.exitRequestedAt ?? 0n)
    return {
      commitmentId: m.commitmentId.toString(),
      committer: m.committer,
      forfeitableUnits: m.forfeitableUnits.toString(),
      settledUnits: m.settledUnits.toString(),
      creditedValue: m.creditedValue.toString(),
      lossSnapshot: m.lossSnapshot.toString(),
      unbondRequestedAt: Number(unbond),
      slashableUntil: m.slashableUntil === null ? null : Number(m.slashableUntil),
      owedUnits: owed.toString(),
    }
  })

  return c.json(out)
})

/**
 * GET /mutuals/:id/ledger
 *
 * Mirrors the vaults forfeit-ledger style: a single read assembling the mutual,
 * its membership roster, and the chronological mutual-event timeline. Members are
 * ordered by commitmentId; events newest-first by (blockNumber, logIndex). `?limit=N` caps each list (1..500,
 * default 100).
 */
app.get('/:id/ledger', async (c) => {
  const mutualId = parseId(c.req.param('id'))
  if (mutualId === null) return c.json({ error: 'invalid mutual id' }, 400)
  const limit = parseLimit(c, 100, 500)

  const [mutualRows, members, events] = await Promise.all([
    db.select().from(schema.mutual).where(eq(schema.mutual.mutualId, mutualId)).limit(1),
    db
      .select()
      .from(schema.membership)
      .where(eq(schema.membership.mutualId, mutualId))
      .orderBy(asc(schema.membership.commitmentId))
      .limit(limit),
    db
      .select()
      .from(schema.mutualEvent)
      .where(eq(schema.mutualEvent.mutualId, mutualId))
      .orderBy(desc(schema.mutualEvent.blockNumber), desc(schema.mutualEvent.logIndex))
      .limit(limit),
  ])

  return jsonBig(c, {
    mutualId: mutualId.toString(),
    mutual: mutualRows[0] ?? null,
    members,
    events,
    counts: {
      members: members.length,
      events: events.length,
    },
  })
})

/**
 * GET /mutuals/:id/premium
 *
 * The mutual's §G premium feed: the premium funding/outflow ledger
 * (`premiumFunding` — funded / reclaimed / swept), the member claim
 * history (`premiumClaim`), and the cover bindings sold against it
 * (`coverBinding`). Each list is newest-first by (blockNumber, logIndex)
 * (claims/funding) or active-first (bindings) and capped by `?limit=N`
 * (1..500, default 100).
 *
 * `premiumState` carries the `getMutualPremiumState` fields as the indexer last
 * read them (on the mutual's latest value-moving event); `null` for an unknown
 * mutual. Values between events (accrual since `lastUpdate`) are not included.
 */
app.get('/:id/premium', async (c) => {
  const mutualId = parseId(c.req.param('id'))
  if (mutualId === null) return c.json({ error: 'invalid mutual id' }, 400)
  const limit = parseLimit(c, 100, 500)

  const [mutualRows, funding, claims, bindings] = await Promise.all([
    db.select().from(schema.mutual).where(eq(schema.mutual.mutualId, mutualId)).limit(1),
    db
      .select()
      .from(schema.premiumFunding)
      .where(eq(schema.premiumFunding.mutualId, mutualId))
      .orderBy(desc(schema.premiumFunding.blockNumber), desc(schema.premiumFunding.logIndex))
      .limit(limit),
    db
      .select()
      .from(schema.premiumClaim)
      .where(eq(schema.premiumClaim.mutualId, mutualId))
      .orderBy(desc(schema.premiumClaim.blockNumber), desc(schema.premiumClaim.logIndex))
      .limit(limit),
    db
      .select()
      .from(schema.coverBinding)
      .where(eq(schema.coverBinding.mutualId, mutualId))
      .orderBy(desc(schema.coverBinding.active), desc(schema.coverBinding.createdBlock))
      .limit(limit),
  ])

  const mutual = mutualRows[0]
  const premiumState = mutual
    ? {
        premiumPerShareStored: mutual.premiumPerShareStored,
        activeCover: mutual.activeCover,
        settledTotal: mutual.settledTotal,
        rewardRate: mutual.rewardRate,
        lastUpdate: mutual.lastUpdate,
        periodFinish: mutual.periodFinish,
        premiumRemainder: mutual.premiumRemainder,
        bankedTotal: mutual.bankedTotal,
        premiumPool: mutual.premiumPool,
      }
    : null

  return jsonBig(c, {
    mutualId: mutualId.toString(),
    mutual: mutual ?? null,
    premiumState,
    funding,
    claims,
    bindings,
    counts: {
      funding: funding.length,
      claims: claims.length,
      bindings: bindings.length,
    },
  })
})

const HISTORY_DAYS = new Set(['7', '30', '90'])

/**
 * GET /mutuals/:id/history?days=7|30|90   (default 30)
 *
 * One point per UTC day, oldest first, today last. Each day is sampled at its
 * last second (today: now) from the last `mutualState` row at or before that
 * instant, so values step exactly where the chain moved. A day before the
 * mutual's first value-moving event has every value `null`.
 *
 *   {
 *     mutualId: string,                 // decimal
 *     days: 7 | 30 | 90,
 *     points: Array<{
 *       date: string,                   // 'YYYY-MM-DD' (UTC)
 *       t: string,                      // unix seconds sampled
 *       premiumAprBps: string | null,   // rewardRate × 31_536_000 × 1e4 / activeCover, basis
 *                                       //   points; rewardRate is 0 from periodFinish on;
 *                                       //   null when activeCover is 0
 *       capital: string | null,         // totalShares × (1e18 − cumulativeLoss) / 1e18,
 *                                       //   numeraire base units
 *       coverSold: string | null,       // Σ notional of bindings with createdAt ≤ t < expiry
 *                                       //   and not expired by t, numeraire base units
 *     }>
 *   }
 *
 * Unknown mutual id: 200 with every point null.
 */
app.get('/:id/history', async (c) => {
  const mutualId = parseId(c.req.param('id'))
  if (mutualId === null) return c.json({ error: 'invalid mutual id' }, 400)
  const rawDays = c.req.query('days') ?? '30'
  if (!HISTORY_DAYS.has(rawDays)) return c.json({ error: 'days must be 7, 30 or 90' }, 400)
  const days = Number(rawDays)
  const now = BigInt(Math.floor(Date.now() / 1000))
  const windowStart = now - (now % DAY) - BigInt(days - 1) * DAY

  const [mutual] = await db.select().from(schema.mutual).where(eq(schema.mutual.mutualId, mutualId)).limit(1)
  let rows: (typeof schema.mutualState.$inferSelect)[] = []
  let bindings: (typeof schema.coverBinding.$inferSelect)[] = []
  if (mutual) {
    const st = schema.mutualState
    const ofMutual = and(eq(st.manager, mutual.manager), eq(st.mutualId, mutualId))
    const [before, inWindow, bound] = await Promise.all([
      // The state carried into the window's first day.
      db
        .select()
        .from(st)
        .where(and(ofMutual, lt(st.blockTimestamp, windowStart)))
        .orderBy(desc(st.blockTimestamp), desc(st.blockNumber))
        .limit(1),
      db
        .select()
        .from(st)
        .where(and(ofMutual, gte(st.blockTimestamp, windowStart), lte(st.blockTimestamp, now)))
        .orderBy(asc(st.blockNumber)),
      // Bindings that can be in force at some sample in the window.
      db
        .select()
        .from(schema.coverBinding)
        .where(
          and(
            eq(schema.coverBinding.mutualId, mutualId),
            lte(schema.coverBinding.createdAt, now),
            gt(schema.coverBinding.expiry, windowStart),
            or(isNull(schema.coverBinding.expiredAt), gt(schema.coverBinding.expiredAt, windowStart)),
          ),
        ),
    ])
    rows = [...before, ...inWindow]
    bindings = bound
  }

  return c.json({ mutualId: mutualId.toString(), days, points: foldMutualHistory(rows, bindings, now, days) })
})

export default app
