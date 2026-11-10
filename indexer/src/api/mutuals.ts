import { Hono } from 'hono'
import { and, asc, desc, eq } from 'ponder'
import { db, publicClients } from 'ponder:api'
import schema from 'ponder:schema'
import type { Hex } from 'viem'

import { commitmentManagerAbi } from '../abis'
import { CHAIN_NAME } from '../env'
import { jsonBig, parseId, parseLimit } from './http'

// Loose typing — getMutualPremiumState returns a flat 9-tuple of named outputs.
interface MinimalManagerClient {
  readContract(args: {
    address: Hex
    abi: typeof commitmentManagerAbi
    functionName: 'getMutualPremiumState'
    args: [bigint]
  }): Promise<readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint]>
  readContract(args: {
    address: Hex
    abi: typeof commitmentManagerAbi
    functionName: 'getMutualJuniorPool'
    args: [bigint]
  }): Promise<bigint>
}

function getManagerClient(): MinimalManagerClient | null {
  const clients = publicClients as Record<string, MinimalManagerClient | undefined>
  return clients[CHAIN_NAME] ?? null
}

const app = new Hono()

/**
 * Mutual / Synthetic Mutual endpoints.
 *
 *   GET /mutuals                    — every mutual row + derived liveCapacity / memberCount.
 *   GET /mutuals/:id/members        — the mutual's member roster + derived owedUnits / unbondRequestedAt.
 *   GET /mutuals/:id/ledger?limit=N — mutual dossier: the mutual row, its members,
 *                                    and its event timeline (newest first).
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
 * One entry per Mutual row, ordered by mutualId. `liveCapacity` and
 * `memberCount` are aggregated from the mutual's `membership` rows:
 *
 *   memberCount  — active, non-exiting underwriters. On-chain this is
 *                  `unbondRequestedAt == 0 AND membership present`; in the
 *                  indexer that maps exactly to status === 'active' (a pending
 *                  exit flips status to 'exitRequested', release to 'released').
 *
 *   liveCapacity — loss-adjusted coverage still slashable, raw numeraire units:
 *                  Σ forfeitableUnits_i * (1e18 - lossSnapshot_i) / 1e18 over
 *                  members still in the pool. A line stays in `totalShares` and
 *                  mutual-slashable until releaseGroupMember (status 'released'):
 *                  merely *requesting* exit ('exitRequested') does NOT remove it,
 *                  so exitRequested members still contribute coverage and are
 *                  counted here; only 'released' members are excluded.
 */
app.get('/', async (c) => {
  const [mutuals, memberships] = await Promise.all([
    db.select().from(schema.mutual).orderBy(asc(schema.mutual.mutualId)),
    db.select().from(schema.membership),
  ])

  // Bucket memberships by their parent mutual PK (`${manager}-${mutualId}`).
  const byMutual = new Map<string, typeof memberships>()
  for (const m of memberships) {
    const key = `${m.manager.toLowerCase()}-${m.mutualId.toString()}`
    const arr = byMutual.get(key)
    if (arr) arr.push(m)
    else byMutual.set(key, [m])
  }

  const out = mutuals.map((g) => {
    const members = byMutual.get(g.id) ?? []
    let liveCapacity = 0n
    let memberCount = 0
    for (const m of members) {
      if (m.status === 'active') memberCount += 1
      if (m.status !== 'released') {
        liveCapacity += (m.forfeitableUnits * (ONE - m.lossSnapshot)) / ONE
      }
    }
    return {
      mutualId: g.mutualId.toString(),
      arbiter: g.arbiter,
      beneficiary: g.beneficiary,
      numeraire: g.numeraire,
      valuationAuthority: g.valuationAuthority,
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
      // Heterogeneous mode (§H §8 / M4) — `heterogeneous` is the canonical flag (bandAdapter set).
      heterogeneous: g.bandAdapter != null,
      bandAdapter: g.bandAdapter,
      valuationFloorBps: Number(g.valuationFloorBps),
      valuationCeilBps: Number(g.valuationCeilBps),
      juniorBps: Number(g.juniorBps),
      juniorPool: g.juniorPool.toString(),
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

  const [members, exitEvents, mutualRows] = await Promise.all([
    db
      .select()
      .from(schema.membership)
      .where(eq(schema.membership.mutualId, mutualId))
      .orderBy(asc(schema.membership.commitmentId)),
    // The on-chain `unbondRequestedAt` (uint64 block.timestamp set by
    // requestGroupExit) is not denormalized onto the membership row, but the
    // 'exitRequested' mutualEvent's blockTimestamp IS that exact value — derive
    // it (latest per commitment) rather than widening the schema.
    db
      .select()
      .from(schema.mutualEvent)
      .where(and(eq(schema.mutualEvent.mutualId, mutualId), eq(schema.mutualEvent.kind, 'exitRequested'))),
    db.select().from(schema.mutual).where(eq(schema.mutual.mutualId, mutualId)).limit(1),
  ])

  // Lambda — the parent mutual's cumulative loss fraction (1e18-scaled). Absent
  // mutual => 0, which yields owedUnits 0 for the (empty) member set anyway.
  const lambda = mutualRows[0]?.cumulativeLoss ?? 0n

  const exitAt = new Map<string, bigint>()
  for (const e of exitEvents) {
    if (e.commitmentId == null) continue
    const key = e.commitmentId.toString()
    const prev = exitAt.get(key)
    if (prev == null || e.blockTimestamp > prev) exitAt.set(key, e.blockTimestamp)
  }

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
    const unbond = m.status === 'active' ? 0n : (exitAt.get(m.commitmentId.toString()) ?? 0n)
    return {
      commitmentId: m.commitmentId.toString(),
      committer: m.committer,
      forfeitableUnits: m.forfeitableUnits.toString(),
      settledUnits: m.settledUnits.toString(),
      creditedValue: m.creditedValue.toString(),
      lossSnapshot: m.lossSnapshot.toString(),
      unbondRequestedAt: Number(unbond),
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
 * ordered by commitmentId; events newest-first. `?limit=N` caps each list (1..500,
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
      .orderBy(desc(schema.mutualEvent.blockNumber))
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
 * (`coverBinding`). Each list is newest-first (claims/funding) or active-first
 * (bindings) and capped by `?limit=N` (1..500, default 100).
 *
 * `premiumState` is the LIVE on-chain `getMutualPremiumState(mutualId)` snapshot
 * (read off the mutual's manager) — `null` if the mutual is unknown or the chain
 * read fails; the indexed `mutual` row carries the last-persisted copy regardless.
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
      .orderBy(desc(schema.premiumFunding.blockNumber))
      .limit(limit),
    db
      .select()
      .from(schema.premiumClaim)
      .where(eq(schema.premiumClaim.mutualId, mutualId))
      .orderBy(desc(schema.premiumClaim.blockNumber))
      .limit(limit),
    db
      .select()
      .from(schema.coverBinding)
      .where(eq(schema.coverBinding.mutualId, mutualId))
      .orderBy(desc(schema.coverBinding.active), desc(schema.coverBinding.createdBlock))
      .limit(limit),
  ])

  // Live premium snapshot off the mutual's manager (best-effort).
  let premiumState: Record<string, string | null> | null = null
  const mutual = mutualRows[0]
  const client = getManagerClient()
  if (mutual && client) {
    try {
      const [r, juniorPool] = await Promise.all([
        client.readContract({
          address: mutual.manager,
          abi: commitmentManagerAbi,
          functionName: 'getMutualPremiumState',
          args: [mutualId],
        }),
        // Live junior reserve (funded − drawn); 0 for homogeneous mutuals. Surfaced alongside the
        // premium snapshot so the underwriter view reads one consistent on-chain state.
        client
          .readContract({
            address: mutual.manager,
            abi: commitmentManagerAbi,
            functionName: 'getMutualJuniorPool',
            args: [mutualId],
          })
          .catch(() => null),
      ])
      premiumState = {
        premiumPerShareStored: r[0].toString(),
        activeCover: r[1].toString(),
        settledTotal: r[2].toString(),
        rewardRate: r[3].toString(),
        lastUpdate: r[4].toString(),
        periodFinish: r[5].toString(),
        premiumRemainder: r[6].toString(),
        bankedTotal: r[7].toString(),
        premiumPool: r[8].toString(),
        juniorPool: juniorPool == null ? null : juniorPool.toString(),
      }
    } catch {
      premiumState = null
    }
  }

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

export default app
