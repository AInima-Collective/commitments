import { Hono } from 'hono'
import { and, desc, eq, inArray, or } from 'ponder'
import { db, publicClients } from 'ponder:api'
import schema from 'ponder:schema'
import type { Hex } from 'viem'

import { commitmentManagerAbi } from '../abis'
import { CHAIN_NAME } from '../env'
import { foldFlows } from './balanceHistoryMath'
import { jsonBig, parseLimit } from './http'

// Loose typing — Ponder shapes the runtime publicClient; the readContract
// overload we use (pendingMemberPremium) is stable across viem 2.x.
interface MinimalManagerClient {
  readContract(args: {
    address: Hex
    abi: typeof commitmentManagerAbi
    functionName: 'pendingMemberPremium'
    args: [bigint]
  }): Promise<bigint>
}

function getManagerClient(): MinimalManagerClient | null {
  const clients = publicClients as Record<string, MinimalManagerClient | undefined>
  return clients[CHAIN_NAME] ?? null
}

// Bounds for GET /:address/premium so a member of many mutuals cannot fan out
// unbounded eth_calls on this public endpoint (RPC amplification guard). Live
// pendingMemberPremium reads are restricted to still-accruing lines and capped;
// beyond the cap the client falls back to the indexed `rewardBank` lower bound.
const MAX_PREMIUM_MEMBERSHIPS = 500
const MAX_LIVE_PREMIUM_READS = 50

// Ceiling on rows returned by /balance-history. Rows are taken NEWEST-first and
// then reversed, so a hyperactive account loses its oldest history rather than
// its recent tail. That makes the fold's baseline incomplete — every point is
// then off by a constant — which is precisely the error the caller's live-balance
// anchoring already corrects. Losing the recent end instead would leave a chart
// that just stops, which anchoring cannot repair.
const MAX_FLOW_ROWS = 5000

const app = new Hono()

/**
 * GET /account/:address
 *
 * Returns everything the frontend needs to render a per-address dossier:
 *   - Aggregate stats
 *   - Active/forfeited/released commitments (both sides)
 *   - Operator status (if registered)
 *   - Ledger positions (per-token encumbered balance in the manager)
 */
app.get('/:address', async (c) => {
  const address = c.req.param('address').toLowerCase() as `0x${string}`
  const [stats] = await db.select().from(schema.accountStats).where(eq(schema.accountStats.address, address))
  const commitments = await db
    .select()
    .from(schema.commitment)
    .where(or(eq(schema.commitment.committer, address), eq(schema.commitment.counterparty, address)))
  const [op] = await db.select().from(schema.operator).where(eq(schema.operator.address, address))
  // Manager ledger positions are per (token, user); a single account may hold
  // encumbered balance across several backing tokens. The authoritative *free*
  // balance is read live from `manager.freeBalance(token, user)` on the frontend.
  const positions = await db
    .select()
    .from(schema.ledgerPosition)
    .where(eq(schema.ledgerPosition.user, address))
  // ERC-8004 agent identities the address is the token owner of (issue #33).
  // One account may control several agents; the bulk badge lookup lives on
  // GraphQL (`agents(where: { owner_in })`) — this is the dossier view.
  const agents = await db.select().from(schema.agent).where(eq(schema.agent.owner, address))

  return jsonBig(c, {
    address,
    stats: stats ?? null,
    commitments,
    operator: op ?? null,
    ledgerPositions: positions.map((p) => ({
      token: p.token,
      encumbered: p.encumbered.toString(),
      updatedBlock: p.updatedBlock.toString(),
    })),
    agents: agents.map((a) => {
      // Registration-file name, when the fetched metadata parsed as a JSON
      // object with a string `name` — best-effort, never load-bearing.
      const content = a.metadataContent as Record<string, unknown> | null
      const name =
        content && typeof content === 'object' && typeof content.name === 'string' ? content.name : null
      return {
        agentId: a.agentId.toString(),
        registry: a.registry,
        agentWallet: a.agentWallet,
        agentURI: a.agentURI,
        metadataStatus: a.metadataStatus,
        name,
        registeredAt: a.registeredAt.toString(),
      }
    }),
  })
})

/**
 * GET /account/:address/claimable-yield
 *
 * v2: there is no per-commitment yield accumulator on chain anymore — yield is
 * paid by distribution strategies. The claimable amount for a given recipient is
 * read LIVE via `manager.pending(commitmentId, strategy, claimData)`; this
 * endpoint supplies the inputs the frontend needs to make those reads plus the
 * realized-payout history.
 *
 * Returns:
 *   - `bindings`: strategy bindings on active commitments where :address is the
 *     counterparty (the potential yield recipient). Each carries the parent
 *     commitment so the caller can build `claimData` and call `pending` live.
 *   - `distributions`: realized DistributionPaid rows where recipient == :address
 *     (earned history), newest first.
 *
 * Forfeit proceeds are a separate claimable class — read live from
 * `manager.freeBalance(token, :address)`; not summarized here.
 */
app.get('/:address/claimable-yield', async (c) => {
  const address = c.req.param('address').toLowerCase() as `0x${string}`

  const activeAsCounterparty = await db
    .select()
    .from(schema.commitment)
    .where(and(eq(schema.commitment.counterparty, address), eq(schema.commitment.status, 'active')))

  const ids = activeAsCounterparty.map((r) => r.id)
  const bindings =
    ids.length > 0
      ? await db.select().from(schema.strategyBinding).where(inArray(schema.strategyBinding.commitmentId, ids))
      : []
  const byCommitment = new Map(activeAsCounterparty.map((r) => [`${r.manager.toLowerCase()}-${r.id}`, r]))

  const distributions = await db
    .select()
    .from(schema.distribution)
    .where(eq(schema.distribution.recipient, address))
    .orderBy(desc(schema.distribution.blockNumber))
    .limit(100)

  return jsonBig(c, {
    bindings: bindings
      .map((b) => {
        const parent = byCommitment.get(`${b.manager.toLowerCase()}-${b.commitmentId}`)
        if (!parent) return null
        return {
          manager: b.manager,
          commitmentId: b.commitmentId.toString(),
          strategy: b.strategy,
          strategyParams: b.strategyParams,
          commitment: parent,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    distributions,
  })
})

/**
 * GET /account/:address/premium
 *
 * The underwriter expected-return surface for the §G premium index. Returns the
 * address's mutual memberships (the lines it underwrites), each enriched with:
 *   - `rewardBank`     — accrued-but-unclaimed premium banked on the membership row
 *                        (indexed snapshot, refreshed on every value-moving event).
 *   - `pendingPremium` — premium claimable RIGHT NOW (banked + simulated accrual),
 *                        read LIVE via `manager.pendingMemberPremium(commitmentId)`.
 *                        `null` if the chain read fails (RPC blip) — the frontend
 *                        falls back to `rewardBank` as a lower bound.
 * plus the realized `claims` history (`MemberPremiumClaimed` rows where the
 * recipient is :address), newest first. Memberships are ordered active-first then
 * by commitmentId, mirroring the urgency-sort discipline of the other endpoints.
 */
app.get('/:address/premium', async (c) => {
  const address = c.req.param('address').toLowerCase() as Hex

  const memberships = await db
    .select()
    .from(schema.membership)
    .where(eq(schema.membership.committer, address))
    .limit(MAX_PREMIUM_MEMBERSHIPS)

  const claims = await db
    .select()
    .from(schema.premiumClaim)
    .where(eq(schema.premiumClaim.recipient, address))
    .orderBy(desc(schema.premiumClaim.blockNumber))
    .limit(200)

  // Active lines first (still accruing), then by commitmentId — stable ordering.
  const order = (s: string) => (s === 'active' ? 0 : s === 'exitRequested' ? 1 : 2)
  const sorted = [...memberships].sort((a, b) => {
    const d = order(a.status) - order(b.status)
    if (d !== 0) return d
    return a.commitmentId < b.commitmentId ? -1 : a.commitmentId > b.commitmentId ? 1 : 0
  })

  // BOUNDED live pendingMemberPremium reads: only still-accruing lines (released
  // lines earn nothing, so a live read is wasted) and at most MAX_LIVE_PREMIUM_READS
  // of them — so N mutual memberships cannot trigger N parallel eth_calls per request
  // (RPC amplification guard). Beyond the cap, `pendingPremium` is null and the
  // client falls back to the indexed `rewardBank` (a lower bound) or reads on demand,
  // matching the per-commitment-read discipline of /claimable-yield.
  const mgrKey = (m: { manager: Hex; commitmentId: bigint }) => `${m.manager.toLowerCase()}-${m.commitmentId}`
  const client = getManagerClient()
  const liveKeys = new Set(
    sorted
      .filter((m) => m.status === 'active' || m.status === 'exitRequested')
      .slice(0, MAX_LIVE_PREMIUM_READS)
      .map(mgrKey),
  )
  const pendingByKey = new Map<string, bigint>()
  if (client) {
    await Promise.all(
      sorted
        .filter((m) => liveKeys.has(mgrKey(m)))
        .map(async (m) => {
          try {
            const v = await client.readContract({
              address: m.manager,
              abi: commitmentManagerAbi,
              functionName: 'pendingMemberPremium',
              args: [m.commitmentId],
            })
            pendingByKey.set(mgrKey(m), v)
          } catch {
            // leave unset -> null; a single RPC blip never 500s the dossier
          }
        }),
    )
  }

  return c.json({
    address,
    liveReadCap: MAX_LIVE_PREMIUM_READS,
    memberships: sorted.map((m) => ({
      pendingPremium: pendingByKey.has(mgrKey(m)) ? pendingByKey.get(mgrKey(m))!.toString() : null,
      manager: m.manager,
      mutualId: m.mutualId.toString(),
      commitmentId: m.commitmentId.toString(),
      status: m.status,
      premiumSnapshot: m.premiumSnapshot.toString(),
      rewardBank: m.rewardBank.toString(),
    })),
    claims: claims.map((cl) => ({
      manager: cl.manager,
      mutualId: cl.mutualId.toString(),
      commitmentId: cl.commitmentId.toString(),
      recipient: cl.recipient,
      amount: cl.amount.toString(),
      blockNumber: cl.blockNumber.toString(),
      blockTimestamp: cl.blockTimestamp.toString(),
      txHash: cl.txHash,
    })),
  })
})

/**
 * GET /account/:address/activity
 *
 * Unified loss + yield activity feed for one address — powers the dashboard
 * activity timeline. Two event classes, merged and sorted by block timestamp
 * (unix seconds) DESC, capped at `?limit=N` (default 100, clamped 1..500):
 *
 *   - 'mutual-loss'   — a `lossExecuted` mutualEvent on a mutual the address is a
 *                       MEMBER of (membership.committer == :address). `amount` is
 *                       the loss numeraire amount; `token` is the mutual numeraire.
 *   - 'premium-yield' — premium the address claimed (`premiumClaim.recipient ==
 *                       :address`; `token` = mutual numeraire) AND strategy yield
 *                       distributed to it (`distribution.recipient == :address`;
 *                       `token` = the distribution's own token column).
 *
 * Wire shape (stable; the frontend is built against this exact contract):
 *   { events: Array<{
 *       kind: 'mutual-loss' | 'premium-yield',
 *       id: string,            // stable unique key (`loss-…` / `prem-…` / `dist-…`)
 *       timestamp: string,     // unix SECONDS, decimal string
 *       txHash: string | null,
 *       mutualId: string | null,
 *       token: string | null,  // ERC-20 the amount is denominated in (decimals lookup)
 *       amount: string,        // raw token units, decimal string
 *   }> }
 */
interface ActivityWire {
  kind: 'mutual-loss' | 'premium-yield'
  id: string
  timestamp: string
  txHash: string | null
  mutualId: string | null
  token: string | null
  amount: string
}

/**
 * GET /account/:address/balance-history?days=N&token=0x…
 *
 * Per-token cumulative free/encumbered balance over time, folded from the
 * `ledgerFlow` log. Points are CHRONOLOGICAL (oldest first) — the opposite of
 * the newest-first convention the other endpoints use, because a cumulative
 * fold only makes sense forwards and the chart consumes it in the same order.
 *
 * The fold always starts at the account's first-ever flow, never at the window
 * boundary: a `days=7` request on an account that deposited a year ago must
 * still report that deposit as the opening balance rather than starting from
 * zero. So the window is applied AFTER folding, and the last pre-window point
 * is carried in as the opening value.
 *
 * TWO CAVEATS the caller must respect, both documented at length on the
 * `ledgerFlow` schema:
 *   1. The FREE series is a shape, not an authority. `MovementKind.
 *      FromEscrowToFree` credits free but is indistinguishable on the event
 *      stream from `FromEscrowToExternal`, so strategy payouts into free are
 *      not folded. Anchor the tip to a live `manager.freeBalance` read.
 *   2. The ENCUMBERED series is exact — every path that moves it emits an
 *      attributable event.
 */
app.get('/:address/balance-history', async (c) => {
  const address = c.req.param('address').toLowerCase() as `0x${string}`
  const rawDays = Number(c.req.query('days') ?? 30)
  const days = Math.min(Math.max(Number.isFinite(rawDays) ? rawDays : 30, 1), 365)
  const tokenFilter = c.req.query('token')?.toLowerCase() as `0x${string}` | undefined

  // Newest-first from the DB (so truncation drops old history, not recent), then
  // reversed for the fold.
  //
  // Sort on (blockNumber, logIndex) — chain order — and NOT on blockTimestamp.
  // A deposit and the encumbrance it funds share a block routinely, and under
  // instant mining whole runs of blocks share a timestamp; sorting by time put
  // the encumber first and drove the folded free balance negative for the rest
  // of the series. `id` is the final tiebreak so the two legs of one log (a
  // transfer's debit and credit) fold in a stable order across requests.
  const newestFirst = await db
    .select()
    .from(schema.ledgerFlow)
    .where(
      tokenFilter
        ? and(eq(schema.ledgerFlow.user, address), eq(schema.ledgerFlow.token, tokenFilter))
        : eq(schema.ledgerFlow.user, address),
    )
    .orderBy(
      desc(schema.ledgerFlow.blockNumber),
      desc(schema.ledgerFlow.logIndex),
      desc(schema.ledgerFlow.id),
    )
    .limit(MAX_FLOW_ROWS)
  const flows = newestFirst.reverse()

  const cutoff = BigInt(Math.floor(Date.now() / 1000) - days * 86_400)

  // `latest` on each token is the fold over the rows actually returned. The
  // caller subtracts it from its live on-chain read to get the constant
  // correction that absorbs both truncated history and the FromEscrowToFree
  // gap, then applies that to every point.
  return c.json({
    address,
    days,
    truncated: newestFirst.length === MAX_FLOW_ROWS,
    tokens: foldFlows(flows, cutoff),
  })
})

app.get('/:address/activity', async (c) => {
  const address = c.req.param('address').toLowerCase() as `0x${string}`
  const limit = parseLimit(c, 100, 500)

  // Mutuals the address is a member of — the loss-attribution set. The (manager,
  // mutualId) pair is the real key; mutualId alone is ambiguous across managers.
  const memberships = await db
    .select()
    .from(schema.membership)
    .where(eq(schema.membership.committer, address))
  const mutualKey = (manager: string, mutualId: bigint) => `${manager.toLowerCase()}-${mutualId}`
  const memberMutualKeys = new Set(memberships.map((m) => mutualKey(m.manager, m.mutualId)))
  const memberMutualIds = [...new Set(memberships.map((m) => m.mutualId))]

  // Numeraire lookup for every mutual in scope (member mutuals + claimed mutuals).
  // mutual.id == `${manager-lowercased}-${mutualId}`, matching mutualKey().
  const numeraireByKey = new Map<string, `0x${string}`>()

  // Loss events on member mutuals (filter by the exact (manager, mutualId) key
  // in-memory after the cheap mutualId-set prefilter).
  const lossEvents =
    memberMutualIds.length > 0
      ? (
          await db
            .select()
            .from(schema.mutualEvent)
            .where(
              and(
                eq(schema.mutualEvent.kind, 'lossExecuted'),
                inArray(schema.mutualEvent.mutualId, memberMutualIds),
              ),
            )
        ).filter((e) => memberMutualKeys.has(mutualKey(e.manager, e.mutualId)))
      : []

  // Premium the address claimed (recipient == :address).
  const premiumClaims = await db
    .select()
    .from(schema.premiumClaim)
    .where(eq(schema.premiumClaim.recipient, address))

  // Strategy yield distributed to the address. The `distribution` table HAS a
  // per-account `recipient` column, so these are safely attributable as
  // 'premium-yield' with their own `token`. (If it lacked a recipient column we
  // would skip distributions rather than invent attribution.)
  const distributions = await db
    .select()
    .from(schema.distribution)
    .where(eq(schema.distribution.recipient, address))

  // Resolve numeraires for all mutuals referenced by loss + premium events.
  const wantNumeraireIds = [
    ...new Set([...lossEvents.map((e) => e.mutualId), ...premiumClaims.map((p) => p.mutualId)]),
  ]
  if (wantNumeraireIds.length > 0) {
    const mutuals = await db
      .select()
      .from(schema.mutual)
      .where(inArray(schema.mutual.mutualId, wantNumeraireIds))
    for (const m of mutuals) numeraireByKey.set(mutualKey(m.manager, m.mutualId), m.numeraire)
  }

  const events: ActivityWire[] = [
    ...lossEvents.map((e) => ({
      kind: 'mutual-loss' as const,
      id: `loss-${e.id}`,
      timestamp: e.blockTimestamp.toString(),
      txHash: e.txHash ?? null,
      mutualId: e.mutualId.toString(),
      token: numeraireByKey.get(mutualKey(e.manager, e.mutualId)) ?? null,
      amount: e.numeraireAmount?.toString() ?? '0',
    })),
    ...premiumClaims.map((p) => ({
      kind: 'premium-yield' as const,
      id: `prem-${p.id}`,
      timestamp: p.blockTimestamp.toString(),
      txHash: p.txHash ?? null,
      mutualId: p.mutualId.toString(),
      token: numeraireByKey.get(mutualKey(p.manager, p.mutualId)) ?? null,
      amount: p.amount.toString(),
    })),
    ...distributions.map((d) => ({
      kind: 'premium-yield' as const,
      id: `dist-${d.id}`,
      timestamp: d.blockTimestamp.toString(),
      txHash: d.txHash ?? null,
      mutualId: null,
      token: d.token ?? null,
      amount: d.amount.toString(),
    })),
  ]

  events.sort((a, b) => (BigInt(b.timestamp) < BigInt(a.timestamp) ? -1 : BigInt(b.timestamp) > BigInt(a.timestamp) ? 1 : 0))

  return c.json({ events: events.slice(0, limit) })
})

export default app
