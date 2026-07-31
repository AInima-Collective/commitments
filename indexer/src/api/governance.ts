/**
 * Governance HTTP endpoints.
 *
 * Mounted at /governors from src/api/index.ts.
 *
 *   GET /governors[?canonical=1]              - list governors with derived counts
 *   GET /governors/:address                   - single governor + recent proposals
 *   GET /governors/:address/proposals         - paged proposals (filter: state, kind)
 *   GET /governors/:address/proposals/:id     - proposal detail (actions + last 100 votes)
 *   GET /governors/:address/proposals/:id/votes - paged votes
 *
 * The `state` column is updated by event handlers, but Pending → Active and
 * Active → Succeeded/Defeated transitions don't fire events. Endpoint reads
 * therefore re-derive `state` from voteStart/voteEnd + tallies + quorum on
 * the way out.
 */
import { Hono } from 'hono'
import { and, asc, desc, eq, gte, lte, sql } from 'ponder'
import { db, publicClients } from 'ponder:api'
import schema from 'ponder:schema'
import type { Hex } from 'viem'

import { CHAIN_NAME } from '../env'

interface MinimalBlockClient {
  getBlockNumber(): Promise<bigint>
}

const app = new Hono()

// ---------- helpers ----------

interface ProposalRow {
  id: string
  governor: Hex
  proposalId: bigint
  proposer: Hex
  description: string
  descriptionHash: Hex
  voteStart: bigint
  voteEnd: bigint
  eta: bigint | null
  forVotes: bigint
  againstVotes: bigint
  abstainVotes: bigint
  quorumAtSnapshot: bigint | null
  state: string
  kind: string
  createdBlock: bigint
  createdTx: Hex
  canceledBlock: bigint | null
  canceledTx: Hex | null
  queuedBlock: bigint | null
  queuedTx: Hex | null
  executedBlock: bigint | null
  executedTx: Hex | null
}

type DerivedState =
  | 'pending'
  | 'active'
  | 'canceled'
  | 'defeated'
  | 'succeeded'
  | 'queued'
  | 'expired'
  | 'executed'

/**
 * Re-derive the live state for a proposal row based on the current block.
 * The handler's persisted state is authoritative for terminal transitions
 * (canceled/queued/executed) but lags for Pending→Active and
 * Active→Succeeded/Defeated, which are time-based.
 */
function deriveState(row: ProposalRow, currentBlock: bigint): DerivedState {
  const persisted = row.state as DerivedState
  if (
    persisted === 'canceled'
    || persisted === 'executed'
    || persisted === 'queued'
    || persisted === 'expired'
  ) {
    return persisted
  }

  if (currentBlock < row.voteStart) return 'pending'
  if (currentBlock <= row.voteEnd) return 'active'

  // Past voteEnd. Determine succeeded vs defeated.
  const quorumMet = row.quorumAtSnapshot
    ? row.forVotes + row.abstainVotes >= row.quorumAtSnapshot
    : true
  const forWins = row.forVotes > row.againstVotes
  return quorumMet && forWins ? 'succeeded' : 'defeated'
}

/**
 * BigInt → string with null pass-through. JSON-safe shape for the client.
 */
function s(b: bigint | null | undefined): string | null {
  return b == null ? null : b.toString()
}

function serializeProposal(row: ProposalRow, currentBlock: bigint) {
  const live = deriveState(row, currentBlock)
  return {
    id: row.id,
    governor: row.governor,
    proposalId: row.proposalId.toString(),
    proposer: row.proposer,
    description: row.description,
    descriptionHash: row.descriptionHash,
    voteStart: row.voteStart.toString(),
    voteEnd: row.voteEnd.toString(),
    eta: s(row.eta),
    forVotes: row.forVotes.toString(),
    againstVotes: row.againstVotes.toString(),
    abstainVotes: row.abstainVotes.toString(),
    quorumAtSnapshot: s(row.quorumAtSnapshot),
    state: live,
    persistedState: row.state,
    kind: row.kind,
    createdBlock: row.createdBlock.toString(),
    createdTx: row.createdTx,
    canceledBlock: s(row.canceledBlock),
    canceledTx: row.canceledTx,
    queuedBlock: s(row.queuedBlock),
    queuedTx: row.queuedTx,
    executedBlock: s(row.executedBlock),
    executedTx: row.executedTx,
  }
}

async function currentBlock(): Promise<bigint> {
  // Read live chain head via Ponder's publicClient. State derivation uses
  // this against the persisted voteStart/voteEnd to flip Pending→Active and
  // Active→Succeeded/Defeated without waiting for a fresh ProposalCreated to
  // advance the indexed-max. Falls back to MAX(createdBlock) if the client
  // isn't available (e.g. test runner).
  const clients = publicClients as Record<string, MinimalBlockClient | undefined>
  const client = clients[CHAIN_NAME]
  if (client) {
    try {
      return await client.getBlockNumber()
    } catch (err) {
      console.warn(
        `[governance] getBlockNumber failed; falling back to indexed max: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }
  const rows = (await db
    .select({ b: sql<string>`COALESCE(MAX(${schema.proposal.createdBlock}), 0)::text` })
    .from(schema.proposal)) as Array<{ b: string }>
  return BigInt(rows[0]?.b ?? '0')
}

// ============================================================
// ENDPOINTS
// ============================================================

/**
 * GET /governors
 *   ?canonical=1  - return only the canonical governor (or [])
 */
app.get('/', async (c) => {
  const canonicalOnly = c.req.query('canonical') === '1'

  const rows = canonicalOnly
    ? await db.select().from(schema.governor).where(eq(schema.governor.isCanonical, true))
    : await db.select().from(schema.governor).orderBy(desc(schema.governor.createdBlock))

  // Derived counts per (governor, state).
  const countRows = (await db
    .select({
      governor: schema.proposal.governor,
      state: schema.proposal.state,
      count: sql<string>`COUNT(*)::text`.as('count'),
    })
    .from(schema.proposal)
    .groupBy(schema.proposal.governor, schema.proposal.state)) as Array<{
    governor: Hex
    state: string
    count: string
  }>

  const countByGovernor = new Map<string, Record<string, number>>()
  for (const r of countRows) {
    const key = r.governor.toLowerCase()
    const existing = countByGovernor.get(key) ?? {}
    existing[r.state] = Number(r.count)
    countByGovernor.set(key, existing)
  }

  return c.json(
    rows.map((g) => ({
      address: g.address,
      timelock: g.timelock,
      shim: g.shim,
      votingPowerSource: g.votingPowerSource,
      name: g.name,
      isCanonical: g.isCanonical,
      factory: g.factory,
      deployer: g.deployer,
      createdBlock: g.createdBlock.toString(),
      createdTx: g.createdTx,
      votingDelay: g.votingDelay.toString(),
      votingPeriod: g.votingPeriod.toString(),
      proposalThreshold: g.proposalThreshold.toString(),
      quorumNumerator: g.quorumNumerator.toString(),
      quorumDenominator: g.quorumDenominator.toString(),
      timelockMinDelay: g.timelockMinDelay.toString(),
      proposalCounts: countByGovernor.get(g.address.toLowerCase()) ?? {},
    })),
  )
})

/**
 * GET /governors/:address  - instance + 5 most recent proposals + counts
 */
app.get('/:address', async (c) => {
  const address = c.req.param('address').toLowerCase() as Hex
  const govRows = await db.select().from(schema.governor).where(eq(schema.governor.address, address))
  const g = govRows[0]
  if (!g) return c.json({ error: 'unknown governor' }, 404)

  const recent = (await db
    .select()
    .from(schema.proposal)
    .where(eq(schema.proposal.governor, address))
    .orderBy(desc(schema.proposal.createdBlock))
    .limit(5)) as ProposalRow[]

  const block = await currentBlock()

  return c.json({
    address: g.address,
    timelock: g.timelock,
    shim: g.shim,
    votingPowerSource: g.votingPowerSource,
    name: g.name,
    isCanonical: g.isCanonical,
    factory: g.factory,
    deployer: g.deployer,
    createdBlock: g.createdBlock.toString(),
    createdTx: g.createdTx,
    votingDelay: g.votingDelay.toString(),
    votingPeriod: g.votingPeriod.toString(),
    proposalThreshold: g.proposalThreshold.toString(),
    quorumNumerator: g.quorumNumerator.toString(),
    quorumDenominator: g.quorumDenominator.toString(),
    timelockMinDelay: g.timelockMinDelay.toString(),
    recentProposals: recent.map((p) => serializeProposal(p, block)),
  })
})

/**
 * GET /governors/:address/proposals?state=&kind=&proposer=&limit=&cursor=
 */
app.get('/:address/proposals', async (c) => {
  const address = c.req.param('address').toLowerCase() as Hex
  const stateFilter = c.req.query('state') ?? undefined
  const kindFilter = c.req.query('kind') ?? undefined
  const proposerFilter = c.req.query('proposer')?.toLowerCase() as Hex | undefined
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 50), 1), 200)
  const cursor = c.req.query('cursor')

  const conditions = [eq(schema.proposal.governor, address)]
  if (stateFilter) conditions.push(eq(schema.proposal.state, stateFilter))
  if (kindFilter) conditions.push(eq(schema.proposal.kind, kindFilter))
  if (proposerFilter) conditions.push(eq(schema.proposal.proposer, proposerFilter))
  if (cursor) conditions.push(lte(schema.proposal.createdBlock, BigInt(cursor)))

  const rows = (await db
    .select()
    .from(schema.proposal)
    .where(and(...conditions))
    .orderBy(desc(schema.proposal.createdBlock))
    .limit(limit + 1)) as ProposalRow[]

  const hasNext = rows.length > limit
  const slice = hasNext ? rows.slice(0, limit) : rows
  const nextCursor = hasNext ? slice[slice.length - 1].createdBlock.toString() : null

  const block = await currentBlock()

  return c.json({
    rows: slice.map((p) => serializeProposal(p, block)),
    hasNext,
    nextCursor,
  })
})

/**
 * GET /governors/:address/proposals/:id  - detail with actions + last 100 votes
 */
app.get('/:address/proposals/:id', async (c) => {
  const address = c.req.param('address').toLowerCase() as Hex
  const id = c.req.param('id')
  const proposalIdBig = BigInt(id)

  const proposalRows = (await db
    .select()
    .from(schema.proposal)
    .where(
      and(eq(schema.proposal.governor, address), eq(schema.proposal.proposalId, proposalIdBig)),
    )
    .limit(1)) as ProposalRow[]

  const p = proposalRows[0]
  if (!p) return c.json({ error: 'unknown proposal' }, 404)

  const [actions, votes] = await Promise.all([
    db
      .select()
      .from(schema.proposalAction)
      .where(
        and(
          eq(schema.proposalAction.governor, address),
          eq(schema.proposalAction.proposalId, proposalIdBig),
        ),
      )
      .orderBy(asc(schema.proposalAction.actionIndex)),
    db
      .select()
      .from(schema.vote)
      .where(and(eq(schema.vote.governor, address), eq(schema.vote.proposalId, proposalIdBig)))
      .orderBy(desc(schema.vote.blockNumber))
      .limit(100),
  ])

  const block = await currentBlock()

  return c.json({
    proposal: serializeProposal(p, block),
    actions: actions.map((a) => ({
      index: a.actionIndex,
      target: a.target,
      value: a.value.toString(),
      calldata: a.calldata,
      kind: a.kind,
      selector: a.selector,
      decoded: a.decoded,
    })),
    votes: votes.map((v) => ({
      voter: v.voter,
      support: v.support,
      weight: v.weight.toString(),
      reason: v.reason,
      blockNumber: v.blockNumber.toString(),
      blockTimestamp: v.blockTimestamp.toString(),
      txHash: v.txHash,
    })),
  })
})

/**
 * GET /governors/:address/proposals/:id/votes?support=&limit=&cursor=
 */
app.get('/:address/proposals/:id/votes', async (c) => {
  const address = c.req.param('address').toLowerCase() as Hex
  const id = c.req.param('id')
  const proposalIdBig = BigInt(id)
  const supportFilter = c.req.query('support')
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 100), 1), 500)
  const cursor = c.req.query('cursor')

  const conditions = [eq(schema.vote.governor, address), eq(schema.vote.proposalId, proposalIdBig)]
  if (supportFilter !== undefined) conditions.push(eq(schema.vote.support, Number(supportFilter)))
  if (cursor) conditions.push(lte(schema.vote.blockNumber, BigInt(cursor)))

  const rows = await db
    .select()
    .from(schema.vote)
    .where(and(...conditions))
    .orderBy(desc(schema.vote.blockNumber))
    .limit(limit + 1)

  const hasNext = rows.length > limit
  const slice = hasNext ? rows.slice(0, limit) : rows
  const nextCursor = hasNext ? slice[slice.length - 1].blockNumber.toString() : null

  return c.json({
    rows: slice.map((v) => ({
      voter: v.voter,
      support: v.support,
      weight: v.weight.toString(),
      reason: v.reason,
      blockNumber: v.blockNumber.toString(),
      blockTimestamp: v.blockTimestamp.toString(),
      txHash: v.txHash,
    })),
    hasNext,
    nextCursor,
  })
})

// `gte` is imported above for future range filters; reference it here so the
// typecheck doesn't complain about unused imports while the surface evolves.
void gte

export default app
