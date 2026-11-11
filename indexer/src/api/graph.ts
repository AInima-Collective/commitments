import { Hono } from 'hono'
import { desc, eq, inArray, or, sql } from 'ponder'
import { db } from 'ponder:api'
import schema from 'ponder:schema'
import { pad } from 'viem'
import { parseLimit } from './http'

const app = new Hono()

/**
 * GET /graph/agreements?address=0x...&limit=N
 *
 * Returns nodes + edges for the Agreements/Commitments graph tab.
 *   - Nodes: every address appearing as committer/counterparty/arbiter on at
 *     least one commitment, with aggregate stats.
 *   - Edges: one per commitment (committer → counterparty); agreed pairs
 *     are annotated with `agreementId` + `agreementSide` ('A' | 'B') so
 *     the frontend can curve them together.
 *
 * When `address` is provided, restricts to commitments that touch that address
 * (for the per-user subgraph on `/commitments`).
 *
 * When `address` is omitted, returns the protocol-wide graph for the Explorer
 * page. `limit` (default 500, max 1000) caps the commitment count so
 * ForceAtlas2 stays interactive — preference goes to most-recent commitments
 * (highest id first) which keeps the graph fresh as the protocol grows.
 */
app.get('/agreements', async (c) => {
  const addr = c.req.query('address')?.toLowerCase() as `0x${string}` | undefined
  const limit = parseLimit(c, 500, 1000)

  const commitments = addr
    ? await db
        .select()
        .from(schema.commitment)
        .where(or(eq(schema.commitment.committer, addr), eq(schema.commitment.counterparty, addr)))
    : await db.select().from(schema.commitment).orderBy(desc(schema.commitment.id)).limit(limit)

  // Only the agreements and stats rows this page's commitments touch. The id
  // match is per manager, checked by the composite key below.
  const ids = [...new Set(commitments.map((cm) => cm.id))]
  const participants = new Set<string>()
  for (const cm of commitments) {
    participants.add(cm.committer.toLowerCase())
    participants.add(cm.counterparty.toLowerCase())
  }
  const [agreements, stats] =
    commitments.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select()
            .from(schema.agreement)
            .where(or(inArray(schema.agreement.commitmentIdA, ids), inArray(schema.agreement.commitmentIdB, ids))),
          db
            .select()
            .from(schema.accountStats)
            .where(inArray(schema.accountStats.address, [...participants] as `0x${string}`[])),
        ])

  // Commitment ids are per-manager — each CommitmentManager numbers its
  // commitments from 0, so a bare id collides across managers. Key every
  // cross-manager lookup by the (manager, id) pair, mirroring the composite
  // primary keys on the `commitment` / `agreement` tables.
  const commitmentKey = (manager: string, id: bigint) => `${manager.toLowerCase()}-${id}`
  const entByCommitment = new Map<string, { id: string; side: 'A' | 'B'; status: string }>()
  for (const e of agreements) {
    entByCommitment.set(commitmentKey(e.manager, e.commitmentIdA), {
      id: e.id.toString(),
      side: 'A',
      status: e.status,
    })
    entByCommitment.set(commitmentKey(e.manager, e.commitmentIdB), {
      id: e.id.toString(),
      side: 'B',
      status: e.status,
    })
  }

  const statsByAddr = new Map(stats.map((s) => [s.address.toLowerCase(), s]))

  const nodes = Array.from(participants).map((a) => {
    const s = statsByAddr.get(a)
    return {
      id: a,
      commitmentsOut: s?.commitmentsOut ?? 0,
      commitmentsIn: s?.commitmentsIn ?? 0,
      convictionOut: (s?.convictionOut ?? 0n).toString(),
      convictionIn: (s?.convictionIn ?? 0n).toString(),
      activeCount: s?.activeCount ?? 0,
      forfeitedCount: s?.forfeitedCount ?? 0,
      releasedCount: s?.releasedCount ?? 0,
    }
  })

  const edges = commitments.map((cm) => {
    const ent = entByCommitment.get(commitmentKey(cm.manager, cm.id))
    return {
      id: cm.id.toString(),
      // Source CommitmentManager. `id` alone is per-manager and not unique;
      // the Agreements graph builds its graphology edge key from
      // `${manager}-${id}` to keep two managers' id spaces distinct.
      manager: cm.manager.toLowerCase(),
      from: cm.committer.toLowerCase(),
      to: cm.counterparty.toLowerCase(),
      amount: cm.amount.toString(),
      maxPenaltyBps: cm.maxPenaltyBps,
      conviction: ((cm.amount * BigInt(cm.maxPenaltyBps)) / 10_000n).toString(),
      status: cm.status,
      forfeitPenaltyBps: cm.forfeitPenaltyBps,
      forfeitChallengeEnd: cm.forfeitChallengeEnd?.toString() ?? null,
      agreementId: ent?.id ?? null,
      agreementSide: ent?.side ?? null,
      agreementStatus: ent?.status ?? null,
      createdBlock: cm.createdBlock.toString(),
    }
  })

  return c.json({ nodes, edges })
})

/**
 * GET /graph/mesh
 *
 * Mesh DAG: nodes are mesh clones (fan_in/fan_out/token_weighting) plus any
 * address appearing as a stake source; edges are net stakeFlow rows per
 * (from, toNode, denom).
 */
app.get('/mesh', async (c) => {
  const meshNodes = await db.select().from(schema.meshNode)
  const flows = await db
    .select({
      from: schema.stakeFlow.from,
      toNode: schema.stakeFlow.toNode,
      denom: schema.stakeFlow.denom,
      total: sql<string>`SUM(${schema.stakeFlow.amount})::text`,
    })
    .from(schema.stakeFlow)
    .groupBy(schema.stakeFlow.from, schema.stakeFlow.toNode, schema.stakeFlow.denom)

  const addresses = new Set<string>()
  for (const n of meshNodes) addresses.add(n.address.toLowerCase())
  for (const f of flows) {
    addresses.add(f.from.toLowerCase())
    addresses.add(f.toNode.toLowerCase())
  }
  const meshByAddr = new Map(meshNodes.map((n) => [n.address.toLowerCase(), n]))

  const nodes = Array.from(addresses).map((a) => {
    const mn = meshByAddr.get(a)
    return {
      id: a,
      type: mn?.nodeType ?? 'address',
      impl: mn?.impl ?? null,
    }
  })

  const edges = flows
    .filter((f) => BigInt(f.total) !== 0n)
    .map((f) => ({
      from: f.from.toLowerCase(),
      to: f.toNode.toLowerCase(),
      denom: f.denom,
      amount: f.total,
    }))

  return c.json({ nodes, edges })
})

/**
 * GET /graph/mesh-security?address=0x...
 *
 * Per-(node, denom) security parameters, indexed from FanInNode
 * `ProviderRegistered` and TokenWeighting `WeightUpdated` events. Powers the
 * Mesh Explorer inspector panel — by issuing one indexer call instead of an
 * N+1 chain fan-out, we can show the forfeiture budget per denom for every
 * node in the topology.
 *
 * Response shape:
 *   {
 *     address: string,
 *     weights: [{ denom, weightBps, updatedBlock }, …],     // TokenWeighting
 *     providers: [{ provider, denomIn, denomOut,            // FanInNode
 *                   maxPenaltyBps, unbondingPeriod,
 *                   registeredBlock }, …]
 *   }
 *
 * For FanOutNode there is no table yet (the relevant `inputMaxPenaltyBps`
 * field isn't surfaced via events) so both arrays return empty.
 */
app.get('/mesh-security', async (c) => {
  const addr = c.req.query('address')?.toLowerCase() as `0x${string}` | undefined
  if (!addr) {
    return c.json({ error: 'address query param required' }, 400)
  }
  const weights = await db
    .select()
    .from(schema.meshDenomWeight)
    .where(eq(schema.meshDenomWeight.nodeAddress, addr))

  const providers = await db
    .select()
    .from(schema.fanInProvider)
    .where(eq(schema.fanInProvider.fanInNode, addr))

  return c.json({
    address: addr,
    weights: weights.map((w) => ({
      denom: w.denom,
      weightBps: w.weightBps.toString(),
      updatedBlock: w.updatedBlock.toString(),
    })),
    providers: providers.map((p) => ({
      provider: p.provider,
      denomIn: p.denomIn,
      denomOut: p.denomOut,
      maxPenaltyBps: p.maxPenaltyBps,
      unbondingPeriod: p.unbondingPeriod.toString(),
      registeredBlock: p.registeredBlock.toString(),
    })),
  })
})

/**
 * GET /graph/mesh-topology?service=0x...
 *
 * Contract-only topology graph for the Mesh Explorer. Unlike `/graph/mesh`
 * (which renders stake-flow edges and includes operator addresses), this
 * endpoint returns:
 *
 *   - Vault nodes (one per indexed CommitmentsVault) at the top — the
 *     ultimate origin of the encumbered shares being weighted as voting
 *     power.
 *   - Mesh nodes (TokenWeighting / FanOut / FanIn) plus an optional
 *     virtual `service` node for the services layer that consumes voting
 *     power from a TokenWeighting.
 *   - Configuration-time edges built from indexed wiring tables:
 *       Vault source      → for every TokenWeighting denom, an edge from
 *                           the vault whose underlying asset address, padded to
 *                           bytes32 (`bytes32(uint160(asset))`), equals the denom.
 *       FanIn-providers   → fanInProvider rows (provider → fanIn, with
 *                           denomIn/denomOut + maxPenaltyBps + unbondingPeriod)
 *       FanOut-outflows   → fanOutOutflow rows (fanOut → consumer, with
 *                           portionBps + maxPenaltyBps)
 *       Service binding   → if `service` is provided, an edge from each
 *                           TokenWeighting to that service ("reads voting
 *                           power"). Caller passes the StakeRegistry address
 *                           from env.
 *   - TokenWeighting denom weights inline on the node so the graph can show
 *     "1.00× / 0.80×" without a second fetch.
 *
 * "What is securing what" reads top-down: vaults → TokenWeighting → mesh
 * routing → service consumer.
 */
app.get('/mesh-topology', async (c) => {
  const service = c.req.query('service')?.toLowerCase() as `0x${string}` | undefined

  const meshNodes = await db.select().from(schema.meshNode)
  const fanInRows = await db.select().from(schema.fanInProvider)
  const fanOutRows = await db.select().from(schema.fanOutOutflow)
  const weightRows = await db.select().from(schema.meshDenomWeight)
  const vaultRows = await db.select().from(schema.vault)

  // Group weights by TokenWeighting node so we can attach them inline.
  const weightsByNode = new Map<
    string,
    Array<{ denom: string; weightBps: string }>
  >()
  for (const w of weightRows) {
    const key = w.nodeAddress.toLowerCase()
    const list = weightsByNode.get(key) ?? []
    list.push({ denom: w.denom, weightBps: w.weightBps.toString() })
    weightsByNode.set(key, list)
  }

  // Label each vault node with its asset symbol and derive the implied denom
  // hash. Denoms are TOKEN-ADDRESS-keyed (`bytes32(uint160(token))`, matching
  // OperatorRegistry._stakeDenom and the seed's `_denomFor`), not keccak of a
  // "<symbol>Shares" string. The denom the registry/TokenWeighting credits is
  // keyed by the requiredToken — the vault's underlying asset — so we left-pad
  // `v.asset` to bytes32. A missing asset symbol falls back to the vault's own.
  const vaultMeta = vaultRows.map((v) => {
    // Token-address-keyed denom: bytes32(uint160(asset)) === asset left-padded
    // to 32 bytes. Matches the bytes32 denom emitted in TokenWeighting weights.
    const denomHash = v.asset ? pad(v.asset, { size: 32 }) : null
    return {
      address: v.address.toLowerCase(),
      symbol: v.assetSymbol ?? v.symbol ?? null,
      denomHash: denomHash?.toLowerCase() ?? null,
    }
  })

  const nodes: Array<{
    id: string
    type: 'fan_in' | 'fan_out' | 'token_weighting' | 'service' | 'vault'
    impl: string | null
    weights?: Array<{ denom: string; weightBps: string }>
    /** Asset symbol for vault nodes (e.g. "USDC", "WETH"). */
    symbol?: string | null
  }> = meshNodes.map((n) => ({
    id: n.address.toLowerCase(),
    type: n.nodeType as 'fan_in' | 'fan_out' | 'token_weighting',
    impl: n.impl,
    weights: weightsByNode.get(n.address.toLowerCase()),
  }))

  // Vault nodes — appear at the very top of the topology, above the
  // TokenWeighting that consumes their shares as voting power.
  for (const v of vaultMeta) {
    nodes.push({ id: v.address, type: 'vault', impl: null, symbol: v.symbol })
  }

  // Append the service node when the caller knows about one (pass via env).
  if (service) {
    nodes.push({ id: service, type: 'service', impl: null })
  }

  type TopologyEdge = {
    from: string
    to: string
    /** What kind of wiring this edge represents. */
    kind:
      | 'fan_in_provider'
      | 'fan_out_outflow'
      | 'service_binding'
      | 'vault_source'
    /** Primary edge label rendered in the graph. */
    label: string
    /** Structured metadata for the inspector. */
    meta: Record<string, string | number>
  }

  const edges: TopologyEdge[] = []

  // Vault → TokenWeighting edges. For each TokenWeighting denom, find the
  // vault whose underlying asset address (padded to bytes32) matches the
  // token-address-keyed denom, and emit a single
  // edge labeled with the asset symbol + the weight multiplier so the
  // graph reads "USDC vault feeds 1.0× into the weighting node."
  const vaultByDenom = new Map<string, { address: string; symbol: string | null }>()
  for (const v of vaultMeta) {
    if (v.denomHash) vaultByDenom.set(v.denomHash, { address: v.address, symbol: v.symbol })
  }
  for (const w of weightRows) {
    const v = vaultByDenom.get(w.denom.toLowerCase())
    if (!v) continue
    const tw = meshNodes.find(
      (n) =>
        n.address.toLowerCase() === w.nodeAddress.toLowerCase() &&
        n.nodeType === 'token_weighting',
    )
    if (!tw) continue
    const weightX = (Number(w.weightBps) / 10_000).toFixed(2)
    const symLabel = v.symbol ?? 'asset'
    edges.push({
      from: v.address,
      to: w.nodeAddress.toLowerCase(),
      kind: 'vault_source',
      label: `${symLabel} · ${weightX}×`,
      meta: {
        symbol: symLabel,
        denom: w.denom,
        weightBps: w.weightBps.toString(),
      },
    })
  }

  // FanIn provider rows: provider → fanIn, edge labeled with denomOut +
  // maxPenaltyBps + unbondingPeriod. The denomIn → denomOut mapping lives
  // in the metadata for the inspector.
  for (const r of fanInRows) {
    edges.push({
      from: r.provider.toLowerCase(),
      to: r.fanInNode.toLowerCase(),
      kind: 'fan_in_provider',
      label: `${r.maxPenaltyBps / 100}% forfeitable`,
      meta: {
        denomIn: r.denomIn,
        denomOut: r.denomOut,
        maxPenaltyBps: r.maxPenaltyBps,
        unbondingPeriod: r.unbondingPeriod.toString(),
      },
    })
  }

  // FanOut outflow rows: fanOut → consumer with portion + max penalty.
  for (const r of fanOutRows) {
    edges.push({
      from: r.fanOutNode.toLowerCase(),
      to: r.consumer.toLowerCase(),
      kind: 'fan_out_outflow',
      label: `${r.portionBps / 100}% portion · ${r.maxPenaltyBps / 100}% forfeitable`,
      meta: {
        denom: r.denom,
        portionBps: r.portionBps,
        maxPenaltyBps: r.maxPenaltyBps,
      },
    })
  }

  // Service binding: every TokenWeighting reads into the service. We don't
  // have a per-pair on-chain link, so the caller's `service` query param is
  // assumed to consume from any TokenWeighting on the network.
  if (service) {
    for (const n of meshNodes) {
      if (n.nodeType === 'token_weighting') {
        edges.push({
          from: n.address.toLowerCase(),
          to: service,
          kind: 'service_binding',
          label: 'voting power',
          meta: { source: 'IVotingPowerSource' },
        })
      }
    }
  }

  return c.json({ nodes, edges })
})

export default app
