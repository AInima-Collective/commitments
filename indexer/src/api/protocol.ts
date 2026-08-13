import { Hono } from 'hono'
import { and, desc, eq, sql } from 'ponder'
import { db } from 'ponder:api'
import schema from 'ponder:schema'
import { isAddress } from 'viem'

const app = new Hono()

function pagination(query: { limit?: string; offset?: string }, max = 100) {
  const rawLimit = Number(query.limit ?? 50)
  const rawOffset = Number(query.offset ?? 0)
  return {
    limit: Math.min(Math.max(Number.isSafeInteger(rawLimit) ? rawLimit : 50, 1), max),
    offset: Math.max(Number.isSafeInteger(rawOffset) ? rawOffset : 0, 0),
  }
}

function nextCaseAction(
  mechanismPhase: string,
  managerPhase: string,
  terminalOutcome: string | null,
): string | null {
  if (terminalOutcome) return null
  switch (mechanismPhase) {
    case 'proposed':
    case 'disputed':
      return 'Dispute the assertion, or finalize it after the answer deadline'
    case 'primary-ruling':
      return 'Committer or counterparty may appeal before the appeal deadline'
    case 'appealed':
      return 'Appeal controller must rule before the human-response deadline'
    case 'loss-proposed':
      return 'The veto controller may veto before the mechanism deadline; otherwise settle afterward'
    case 'ruled':
    case 'manager-enforcement':
    case 'human-ruling':
      return 'Await or execute the separate CommitmentManager enforcement step'
    default:
      return managerPhase.includes('Execution delay') || managerPhase.includes('execution delay')
        ? 'Await the manager execution time; the arbiter may cancel before execution'
        : 'Await the next mechanism transition'
  }
}

/** Paginated mechanism-owned activity with explicit source attribution. */
app.get('/mechanism-activity', async (c) => {
  const { limit, offset } = pagination({ limit: c.req.query('limit'), offset: c.req.query('offset') })
  const rawArbiter = c.req.query('arbiter')
  const rawManager = c.req.query('manager')
  if (rawArbiter && !isAddress(rawArbiter)) return c.json({ error: 'invalid arbiter' }, 400)
  if (rawManager && !isAddress(rawManager)) return c.json({ error: 'invalid manager' }, 400)
  const arbiter = rawArbiter?.toLowerCase() as `0x${string}` | undefined
  const manager = rawManager?.toLowerCase() as `0x${string}` | undefined
  const rawCommitment = c.req.query('commitmentId')
  if (rawCommitment !== undefined && !/^(0|[1-9]\d*)$/.test(rawCommitment)) {
    return c.json({ error: 'invalid commitmentId' }, 400)
  }
  const commitmentId = rawCommitment && /^(0|[1-9]\d*)$/.test(rawCommitment)
    ? BigInt(rawCommitment)
    : undefined
  const filters = [
    arbiter ? eq(schema.arbitrationMechanismEvent.arbiter, arbiter) : undefined,
    manager ? eq(schema.arbitrationMechanismEvent.manager, manager) : undefined,
    commitmentId !== undefined ? eq(schema.arbitrationMechanismEvent.commitmentId, commitmentId) : undefined,
  ].filter(Boolean) as Array<ReturnType<typeof eq>>
  const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters)
  const [rows, countRows] = await Promise.all([
    db.select().from(schema.arbitrationMechanismEvent).where(where)
      .orderBy(desc(schema.arbitrationMechanismEvent.blockNumber), desc(schema.arbitrationMechanismEvent.logIndex))
      .limit(limit).offset(offset),
    db.select({ count: sql<string>`COUNT(*)::text` }).from(schema.arbitrationMechanismEvent).where(where),
  ])
  const total = Number(countRows[0]?.count ?? '0')
  return c.json({
    events: rows.map((row) => ({
      source: 'arbiter mechanism',
      mechanism: row.mechanism,
      arbiter: row.arbiter,
      caseId: row.caseId.toString(),
      commitmentId: row.commitmentId?.toString() ?? null,
      manager: row.manager,
      kind: row.kind,
      actor: row.actor,
      phase: row.phase,
      deadline: row.deadline?.toString() ?? null,
      outcome: row.outcome,
      timestamp: row.blockTimestamp.toString(),
      blockNumber: row.blockNumber.toString(),
      logIndex: row.logIndex,
      transactionHash: row.txHash,
    })),
    page: { limit, offset, total, nextOffset: offset + rows.length < total ? offset + rows.length : null },
  })
})

/** Complete, paginated directory of every address named as an arbiter. */
app.get('/arbiters', async (c) => {
  const { limit, offset } = pagination({
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  })
  const rawAddress = c.req.query('address')
  if (rawAddress && !isAddress(rawAddress)) return c.json({ error: 'invalid address' }, 400)
  const address = rawAddress?.toLowerCase() as `0x${string}` | undefined
  const where = address ? eq(schema.commitment.arbiter, address) : undefined

  const [rows, countRows, mechanismCounts] = await Promise.all([
    db
      .select({
        address: schema.commitment.arbiter,
        totalCommitments: sql<string>`COUNT(*)::text`,
        activeCommitments: sql<string>`COUNT(*) FILTER (WHERE ${schema.commitment.status} IN ('active', 'unbonding', 'forfeitPending'))::text`,
        pendingManagerForfeits: sql<string>`COUNT(*) FILTER (WHERE ${schema.commitment.status} = 'forfeitPending')::text`,
      })
      .from(schema.commitment)
      .where(where)
      .groupBy(schema.commitment.arbiter)
      .orderBy(sql`COUNT(*) DESC`, schema.commitment.arbiter)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<string>`COUNT(DISTINCT ${schema.commitment.arbiter})::text` })
      .from(schema.commitment)
      .where(where),
    db
      .select({
        arbiter: schema.arbitrationCase.arbiter,
        openCount: sql<string>`COUNT(*) FILTER (WHERE ${schema.arbitrationCase.terminalOutcome} IS NULL)::text`,
      })
      .from(schema.arbitrationCase)
      .groupBy(schema.arbitrationCase.arbiter),
  ])
  const casesByArbiter = new Map(mechanismCounts.map((row) => [row.arbiter.toLowerCase(), Number(row.openCount)]))
  const total = Number(countRows[0]?.count ?? '0')
  return c.json({
    rows: rows.map((row) => ({
      address: row.address,
      totalCommitments: Number(row.totalCommitments),
      activeCommitments: Number(row.activeCommitments),
      pendingManagerForfeits: Number(row.pendingManagerForfeits),
      openMechanismCases: casesByArbiter.get(row.address.toLowerCase()) ?? 0,
    })),
    page: {
      limit,
      offset,
      total,
      nextOffset: offset + rows.length < total ? offset + rows.length : null,
    },
  })
})

/**
 * Paginated manager-forfeit attempts. Each initiated proposal is one case row;
 * its latest matching transition supplies the current/terminal manager phase.
 * The explicit source label prevents this first view from masquerading as a
 * complete history for an arbiter-specific mechanism.
 */
app.get('/cases', async (c) => {
  const { limit, offset } = pagination({
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  })
  const rawArbiter = c.req.query('arbiter')
  if (rawArbiter && !isAddress(rawArbiter)) return c.json({ error: 'invalid arbiter' }, 400)
  const arbiter = rawArbiter?.toLowerCase() as `0x${string}` | undefined
  const openOnly = c.req.query('open') === 'true'
  const managerWhere = and(
    eq(schema.forfeitEvent.kind, 'initiated'),
    arbiter ? eq(schema.forfeitEvent.arbiter, arbiter) : undefined,
  )
  const mechanismWhere = arbiter ? eq(schema.arbitrationCase.arbiter, arbiter) : undefined
  const [initiated, allForfeitEvents, mechanismCases, mutualEvents] = await Promise.all([
    db
      .select()
      .from(schema.forfeitEvent)
      .where(managerWhere)
      .orderBy(desc(schema.forfeitEvent.blockNumber), desc(schema.forfeitEvent.logIndex)),
    db
      .select()
      .from(schema.forfeitEvent)
      .where(arbiter ? eq(schema.forfeitEvent.arbiter, arbiter) : undefined)
      .orderBy(desc(schema.forfeitEvent.blockNumber), desc(schema.forfeitEvent.logIndex)),
    db
      .select()
      .from(schema.arbitrationCase)
      .where(mechanismWhere)
      .orderBy(desc(schema.arbitrationCase.updatedBlock)),
    db
      .select()
      .from(schema.mutualEvent)
      .orderBy(desc(schema.mutualEvent.blockNumber)),
  ])

  const attemptLatest = new Map<string, (typeof allForfeitEvents)[number]>()
  const commitmentLatest = new Map<string, (typeof allForfeitEvents)[number]>()
  for (const event of allForfeitEvents) {
    const base = `${event.manager?.toLowerCase()}-${event.commitmentId}`
    const attempt = `${base}-${event.proposalInitiatedAt}`
    if (!attemptLatest.has(attempt)) attemptLatest.set(attempt, event)
    if (!commitmentLatest.has(base)) commitmentLatest.set(base, event)
  }
  const mutualLatest = new Map<string, (typeof mutualEvents)[number]>()
  for (const event of mutualEvents) {
    const key = `${event.manager.toLowerCase()}-${event.mutualId}`
    if (!mutualLatest.has(key)) mutualLatest.set(key, event)
  }
  const mechanismCommitments = new Set(
    mechanismCases
      .filter((row) => row.manager && row.commitmentId !== null)
      .map((row) => `${row.manager!.toLowerCase()}-${row.commitmentId}`),
  )

  const mechanismRows = mechanismCases.map((mechanismCase) => {
    const base = `${mechanismCase.manager?.toLowerCase()}-${mechanismCase.commitmentId}`
    const latestManager = commitmentLatest.get(base)
    const latestMutual = mechanismCase.manager && mechanismCase.mechanism === 'optimistic-mutual'
      ? mutualLatest.get(`${mechanismCase.manager.toLowerCase()}-${mechanismCase.caseId}`)
      : undefined
    const terminal = mechanismCase.terminalOutcome
    return {
      source: 'arbiter mechanism',
      mechanismSource: 'arbiter mechanism',
      managerSource: 'CommitmentManager',
      mechanism: mechanismCase.mechanism,
      caseId: mechanismCase.caseId.toString(),
      commitmentId: mechanismCase.commitmentId?.toString() ?? null,
      manager: mechanismCase.manager,
      arbiter: mechanismCase.arbiter,
      mechanismPhase: mechanismCase.phase,
      managerPhase: latestManager
        ? latestManager.kind === 'initiated' ? 'Execution delay' : latestManager.kind
        : latestMutual
          ? latestMutual.kind === 'lossInitiated' ? 'Mutual execution delay' : latestMutual.kind
          : 'No manager proposal indexed',
      nextDeadline: mechanismCase.nextDeadline?.toString() ?? null,
      nextAction: nextCaseAction(
        mechanismCase.phase,
        latestManager
          ? latestManager.kind === 'initiated' ? 'Execution delay' : latestManager.kind
          : latestMutual
            ? latestMutual.kind === 'lossInitiated' ? 'Mutual execution delay' : latestMutual.kind
            : 'No manager proposal indexed',
        terminal,
      ),
      terminalOutcome: terminal,
      penaltyBps: latestManager?.penaltyBps ?? null,
      proposalInitiatedAt: latestManager?.proposalInitiatedAt.toString() ?? null,
      updatedAt: mechanismCase.updatedAt.toString(),
      transactionHash: latestManager?.txHash ?? latestMutual?.txHash ?? null,
    }
  })

  const managerRows = initiated
    .filter((proposal) => !mechanismCommitments.has(`${proposal.manager?.toLowerCase()}-${proposal.commitmentId}`))
    .map((proposal) => {
      const base = `${proposal.manager?.toLowerCase()}-${proposal.commitmentId}`
      const latest = attemptLatest.get(`${base}-${proposal.proposalInitiatedAt}`) ?? proposal
      const terminalOutcome =
        latest.kind === 'executed'
          ? 'forfeited'
          : latest.kind === 'cancelled'
            ? 'cancelled by arbiter'
            : latest.kind === 'cancelledStale'
              ? 'stale-cancelled'
              : null
      return {
        source: 'CommitmentManager',
        mechanismSource: null,
        managerSource: 'CommitmentManager',
        mechanism: null,
        caseId: null,
        commitmentId: proposal.commitmentId.toString(),
        manager: proposal.manager,
        arbiter: proposal.arbiter,
        mechanismPhase: 'Mechanism state not indexed for this manager proposal',
        managerPhase:
          latest.kind === 'initiated' ? 'Execution delay' : latest.kind,
        nextDeadline:
          latest.kind === 'initiated' ? proposal.challengeEnd?.toString() ?? null : null,
        nextAction: latest.kind === 'initiated'
          ? 'Anyone may execute after the manager delay; the arbiter may cancel before execution'
          : null,
        terminalOutcome,
        penaltyBps: proposal.penaltyBps,
        proposalInitiatedAt: proposal.proposalInitiatedAt.toString(),
        updatedAt: latest.blockTimestamp.toString(),
        transactionHash: latest.txHash,
      }
    })
  const candidateRows = openOnly
    ? [...mechanismRows, ...managerRows].filter((row) => row.terminalOutcome === null)
    : [...mechanismRows, ...managerRows]
  const allRows = candidateRows.sort((a, b) => {
    const left = BigInt(a.updatedAt)
    const right = BigInt(b.updatedAt)
    return left === right ? 0 : left > right ? -1 : 1
  })
  const total = allRows.length
  const rows = allRows.slice(offset, offset + limit)
  return c.json({
    rows,
    page: {
      limit,
      offset,
      total,
      nextOffset: offset + rows.length < total ? offset + rows.length : null,
    },
  })
})

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
