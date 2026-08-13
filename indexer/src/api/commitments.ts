import { Hono } from 'hono'
import { and, asc, desc, eq, gt, or, sql } from 'ponder'
import { db } from 'ponder:api'
import schema from 'ponder:schema'
import { isAddress } from 'viem'

import {
  ArbitrationInputError,
  deriveIndexedProposalStatus,
  finalizeArbitrationPage,
  parseArbitrationRequest,
  serializeArbitrationEvent,
} from './arbitration'

const app = new Hono()

/**
 * Indexer Improvements #3 — canonical urgency-ordered commitment list.
 *
 * Sort key (every UI on top of the indexer should match this expression):
 *
 *   ORDER BY
 *     CASE status
 *       WHEN 'forfeitPending' THEN 0
 *       WHEN 'active'       THEN 1
 *       ELSE 2
 *     END,
 *     COALESCE(forfeitChallengeEnd, 9e18) ASC, -- nominal ordering hint only
 *     id DESC
 *
 * Rationale:
 *   - FORFEIT_PENDING rows sit at the top so committers see manager enforcement first.
 *   - ACTIVE rows fall next; rows with imminent forfeitChallengeEnd float upward, so as more
 *     commitments enter forfeitPending the urgent ones surface naturally.
 *   - RELEASED / FORFEITED / EXPIRED end up at the bottom, newest first.
 *
 * Optional filters:
 *   ?address=0x... — committer OR counterparty matches (case-insensitive on the column).
 *   ?arbiter=0x... — arbiter matches (case-insensitive). Powers the arbitration
 *                    queue UI ("commitments where I am the arbiter"). Combinable
 *                    with the other filters (AND-ed together).
 *   ?status=active|forfeitPending|forfeited|released|expired — exact match.
 *   ?manager=0x... — restrict to commitments emitted by a specific CommitmentManager.
 *                    Useful for multi-manager deployments (e.g. USDC + WETH stacks).
 *   ?vault=0x... — restrict to commitments backed by a specific vault.
 *   ?limit=N (default 100, max 500).
 */
app.get('/urgent', async (c) => {
  const address = c.req.query('address')?.toLowerCase() as `0x${string}` | undefined
  const arbiterParam = c.req.query('arbiter')?.toLowerCase() as `0x${string}` | undefined
  const statusParam = c.req.query('status')
  const managerParam = c.req.query('manager')?.toLowerCase() as `0x${string}` | undefined
  const vaultParam = c.req.query('vault')?.toLowerCase() as `0x${string}` | undefined
  const rawLimit = Number(c.req.query('limit') ?? 100)
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 500)

  const filters = [] as Array<ReturnType<typeof eq>>
  if (address) {
    const expr = or(
      eq(schema.commitment.committer, address),
      eq(schema.commitment.counterparty, address),
    )
    if (expr) filters.push(expr as ReturnType<typeof eq>)
  }
  if (arbiterParam) {
    filters.push(eq(schema.commitment.arbiter, arbiterParam))
  }
  if (statusParam) {
    filters.push(eq(schema.commitment.status, statusParam))
  }
  if (managerParam) {
    filters.push(eq(schema.commitment.manager, managerParam))
  }
  if (vaultParam) {
    filters.push(eq(schema.commitment.vault, vaultParam))
  }

  // Drizzle composition: where() must precede orderBy()/limit() in the chain.
  const where =
    filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters)

  const rows = await db
    .select()
    .from(schema.commitment)
    .where(where)
    .orderBy(
      // status priority: forfeitPending → unbonding → active → everything else.
      // Unbonding sits above active because the depositor is mid-flow; the
      // matures-at countdown is the next thing they'll act on.
      sql`CASE ${schema.commitment.status}
            WHEN 'forfeitPending' THEN 0
            WHEN 'unbonding'    THEN 1
            WHEN 'active'       THEN 2
            ELSE 3
          END ASC`,
      // among rows of equal priority, soonest deadline first; nulls sink
      sql`COALESCE(${schema.commitment.forfeitChallengeEnd}, 9000000000000000000) ASC`,
      desc(schema.commitment.id),
    )
    .limit(limit)

  return c.json({
    rows: rows.map(serializeCommitment),
  })
})

/** Recent manager-forfeit transitions for the public arbiter profile page. */
app.get('/arbitration/activity', async (c) => {
  const rawArbiter = c.req.query('arbiter')
  if (!rawArbiter || !isAddress(rawArbiter)) {
    return c.json({ error: 'invalid arbiter' }, 400)
  }
  const rawLimit = c.req.query('limit') ?? '50'
  if (!/^[1-9]\d*$/.test(rawLimit)) return c.json({ error: 'invalid limit' }, 400)
  const limit = Number(rawLimit)
  if (!Number.isSafeInteger(limit) || limit > 100) {
    return c.json({ error: 'limit must be between 1 and 100' }, 400)
  }
  const arbiter = rawArbiter.toLowerCase() as `0x${string}`
  const rows = await db
    .select()
    .from(schema.forfeitEvent)
    .where(eq(schema.forfeitEvent.arbiter, arbiter))
    .orderBy(desc(schema.forfeitEvent.blockNumber), desc(schema.forfeitEvent.logIndex))
    .limit(limit)

  return c.json({
    arbiter,
    events: rows.map((row) => ({
      ...serializeArbitrationEvent(row),
      manager: row.manager,
      commitmentId: row.commitmentId.toString(),
    })),
  })
})

/**
 * GET /commitments/:id/arbitration?manager=0x...&limit=...&cursor=...
 *
 * Complete manager-side audit trail for exactly `(manager, commitmentId)`.
 * Results are oldest-first and cursor-paginated by `(blockNumber, logIndex)`;
 * no vault filter is involved, so raw ERC-20 backing and busy vaults behave
 * identically. `nominalExecutionAt` is event-time context only. The frontend
 * combines the live proposal with `pauseState.creditable` to calculate current
 * pause-adjusted readiness.
 */
app.get('/:id/arbitration', async (c) => {
  let request
  try {
    request = parseArbitrationRequest({
      id: c.req.param('id'),
      manager: c.req.query('manager'),
      limit: c.req.query('limit'),
      cursor: c.req.query('cursor'),
    })
  } catch (error) {
    if (error instanceof ArbitrationInputError) {
      return c.json({ error: error.message }, 400)
    }
    throw error
  }

  const identity = and(
    eq(schema.commitment.id, request.commitmentId),
    eq(schema.commitment.manager, request.manager),
  )
  const [commitmentRow] = await db.select().from(schema.commitment).where(identity).limit(1)
  if (!commitmentRow) return c.json({ error: 'not found' }, 404)

  const eventIdentity = and(
    eq(schema.forfeitEvent.commitmentId, request.commitmentId),
    eq(schema.forfeitEvent.manager, request.manager),
  )
  const afterCursor = request.cursor
    ? or(
        gt(schema.forfeitEvent.blockNumber, request.cursor.blockNumber),
        and(
          eq(schema.forfeitEvent.blockNumber, request.cursor.blockNumber),
          gt(schema.forfeitEvent.logIndex, request.cursor.logIndex),
        ),
      )
    : undefined
  const eventWhere = afterCursor ? and(eventIdentity, afterCursor) : eventIdentity

  const [pageRows, latestRows] = await Promise.all([
    db
      .select()
      .from(schema.forfeitEvent)
      .where(eventWhere)
      .orderBy(asc(schema.forfeitEvent.blockNumber), asc(schema.forfeitEvent.logIndex))
      .limit(request.limit + 1),
    db
      .select()
      .from(schema.forfeitEvent)
      .where(eventIdentity)
      .orderBy(desc(schema.forfeitEvent.blockNumber), desc(schema.forfeitEvent.logIndex))
      .limit(1),
  ])

  const page = finalizeArbitrationPage(pageRows, request.limit)
  const rows = page.rows
  const latest = latestRows[0]
  const latestTerminal =
    latest && ['executed', 'cancelled', 'cancelledStale'].includes(latest.kind)
      ? latest.kind
      : null
  const proposalStatus = deriveIndexedProposalStatus(commitmentRow.status, latest?.kind)

  return c.json({
    manager: request.manager,
    commitmentId: request.commitmentId.toString(),
    summary: {
      status: commitmentRow.status,
      proposalStatus,
      terminalOutcome: latestTerminal,
      currentPenaltyBps: commitmentRow.forfeitPenaltyBps,
      proposalInitiatedAt: commitmentRow.forfeitInitiatedAt?.toString() ?? null,
      nominalExecutionAt: commitmentRow.forfeitChallengeEnd?.toString() ?? null,
      pauseAdjustedExecutionAt: null,
      readiness: 'live-manager-state-required',
      amount: commitmentRow.amount.toString(),
      token: commitmentRow.token,
      committer: commitmentRow.committer,
      counterparty: commitmentRow.counterparty,
      arbiter: commitmentRow.arbiter,
    },
    events: rows.map(serializeArbitrationEvent),
    page: {
      nextCursor: page.nextCursor,
    },
  })
})

/**
 * GET /commitments/:id
 *
 * Single-commitment lookup for the per-commitment detail page. Joins the
 * matching agreement row (if any) so the detail surface can render the
 * paired-with linkage without a second round trip.
 *
 * 404 when the id doesn't decode as bigint or isn't found.
 */
app.get('/:id', async (c) => {
  const raw = c.req.param('id')
  const managerParam = c.req.query('manager')?.toLowerCase() as `0x${string}` | undefined
  let id: bigint
  try {
    id = BigInt(raw)
  } catch {
    return c.json({ error: 'invalid id' }, 400)
  }

  // Multi-manager: id is per-manager so the (id) alone is ambiguous. Accept
  // an optional ?manager= query param for exact lookup; without it, return
  // the first match (preserving backwards-compat for single-manager
  // deployments) and let the caller disambiguate via the row's `manager` field.
  const where = managerParam
    ? and(eq(schema.commitment.id, id), eq(schema.commitment.manager, managerParam))
    : eq(schema.commitment.id, id)

  const [row] = await db.select().from(schema.commitment).where(where).limit(1)
  if (!row) return c.json({ error: 'not found' }, 404)

  // Agreement lookup is scoped to the same manager — agreements are
  // per-manager (managers are vault-bound).
  const ent = await db
    .select()
    .from(schema.agreement)
    .where(
      and(
        eq(schema.agreement.manager, row.manager),
        or(
          eq(schema.agreement.commitmentIdA, id),
          eq(schema.agreement.commitmentIdB, id),
        ),
      ),
    )
    .limit(1)
    .then((rows) => rows[0])
  const agreementSide: 'A' | 'B' | null = ent
    ? ent.commitmentIdA === id
      ? 'A'
      : 'B'
    : null

  return c.json({
    row: serializeCommitment(row),
    agreement: ent
      ? {
          id: ent.id.toString(),
          commitmentIdA: ent.commitmentIdA.toString(),
          commitmentIdB: ent.commitmentIdB.toString(),
          status: ent.status,
          side: agreementSide,
        }
      : null,
  })
})

function serializeCommitment(c: typeof schema.commitment.$inferSelect) {
  return {
    ...c,
    id: c.id.toString(),
    amount: c.amount.toString(),
    forfeitChallengeEnd: c.forfeitChallengeEnd?.toString() ?? null,
    forfeitInitiatedAt: c.forfeitInitiatedAt?.toString() ?? null,
    forfeitSharesExecuted: c.forfeitSharesExecuted?.toString() ?? null,
    unbondInitiatedAt: c.unbondInitiatedAt?.toString() ?? null,
    unbondMaturesAt: c.unbondMaturesAt?.toString() ?? null,
    expiresAt: c.expiresAt?.toString() ?? null,
    createdBlock: c.createdBlock.toString(),
    createdAt: c.createdAt?.toString() ?? null,
    updatedBlock: c.updatedBlock.toString(),
  }
}

/**
 * GET /commitments/:id/contributions
 *
 * Per-EncumbranceContributed-event log for one commitment, newest first, capped at 500.
 * Use `?limit=N` to override the default of 100. v2.5 Part B.
 */
app.get('/:id/contributions', async (c) => {
  const id = BigInt(c.req.param('id'))
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 100), 1), 500)

  const rows = await db
    .select()
    .from(schema.contribution)
    .where(eq(schema.contribution.commitmentId, id))
    .orderBy(desc(schema.contribution.blockNumber))
    .limit(limit)

  return c.json(rows)
})

export default app
