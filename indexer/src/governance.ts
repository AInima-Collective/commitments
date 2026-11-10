/**
 * Governance event handlers.
 *
 * Wired into Ponder's runtime via this module's `import` side-effect from
 * `src/index.ts`. Handlers consume the OZ Governor + GovernorFactory event
 * surface, decode each proposal's actions, and persist a snapshot of the
 * lifecycle state into `governor`, `proposal`, `proposalAction`, and `vote`.
 *
 * `state` flips through Pending → Active → Succeeded/Defeated → Queued →
 * Executed in handler order. Pending → Active and Active → Succeeded/Defeated
 * transitions don't have their own events on OZ Governor — they're derived
 * from block.number vs. voteStart/voteEnd at read time. We therefore set
 * `state = 'pending'` on ProposalCreated and let endpoints/handlers refine
 * it as later events fire (see `decideTallyState` in api/governance.ts).
 */
import { ponder as typedPonder } from 'ponder:registry'
import {
  governor as governorTable,
  meshNode,
  proposal as proposalTable,
  proposalAction as proposalActionTable,
  vote as voteTable,
} from 'ponder:schema'
import { keccak256, toHex } from 'viem'

import { decodeProposalAction, rollupProposalKind, type RawAction } from './decode/governanceActions'
import { commitmentsGovernorAbi, commitmentsTimelockAbi } from './abis'

// Governance contracts are configured only when a deployment is present.
// Keep registration permissive across configs with and without governance;
// Ponder validates event names against the live config at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ponder = typedPonder as unknown as { on: (name: string, fn: (ctx: any) => Promise<void> | void) => void }

const proposalRowId = (governor: `0x${string}`, proposalId: bigint): string =>
  `${governor.toLowerCase()}-${proposalId.toString(16)}`

const voteRowId = (governor: `0x${string}`, proposalId: bigint, voter: `0x${string}`): string =>
  `${governor.toLowerCase()}-${proposalId.toString(16)}-${voter.toLowerCase()}`

const proposalActionRowId = (governor: `0x${string}`, proposalId: bigint, idx: number): string =>
  `${governor.toLowerCase()}-${proposalId.toString(16)}-${idx}`

// ============================================================
// GovernorFactory
// ============================================================

ponder.on('GovernorFactory:GovernorDeployed', async ({ event, context }) => {
  const { governor, timelock, shim, source, name } = event.args

  // Read live Governor config so the row carries the snapshot the frontend
  // needs without per-page chain reads. These are immutable except via
  // self-proposals through the same Governor — refresh-on-update is a
  // future-self problem we'll handle when GovernorSettings events fire.
  const govAddr = governor as `0x${string}`
  const cfg = await readGovernorConfig(context, govAddr)
  const tlAddr = timelock as `0x${string}`
  const tlMinDelay = await safeReadBigInt(context, commitmentsTimelockAbi, tlAddr, 'getMinDelay', [], 0n)

  await context.db.insert(governorTable).values({
    address: govAddr,
    timelock: tlAddr,
    shim: shim as `0x${string}`,
    votingPowerSource: source as `0x${string}`,
    name,
    isCanonical: false,
    factory: event.log.address,
    deployer: event.transaction.from,
    createdBlock: event.block.number,
    createdTx: event.transaction.hash,
    votingDelay: cfg.votingDelay,
    votingPeriod: cfg.votingPeriod,
    proposalThreshold: cfg.proposalThreshold,
    quorumNumerator: cfg.quorumNumerator,
    quorumDenominator: cfg.quorumDenominator,
    timelockMinDelay: tlMinDelay,
  })
})

ponder.on('GovernorFactory:CanonicalGovernorSet', async ({ event, context }) => {
  await context.db
    .update(governorTable, { address: event.args.governor as `0x${string}` })
    .set({ isCanonical: true })
})

// ============================================================
// CommitmentsGovernor — proposal lifecycle
// ============================================================

ponder.on('CommitmentsGovernor:ProposalCreated', async ({ event, context }) => {
  const governorAddr = event.log.address
  const { proposalId, proposer, targets, values, calldatas, voteStart, voteEnd, description } =
    event.args

  // Decode each action.
  const rawActions: RawAction[] = (targets as readonly `0x${string}`[]).map((t, i) => ({
    target: t,
    value: (values as readonly bigint[])[i],
    calldata: (calldatas as readonly `0x${string}`[])[i],
  }))
  const decoded = rawActions.map(decodeProposalAction)
  const kind = rollupProposalKind(decoded)
  const descriptionHash = hashDescription(description)

  // Snapshot the quorum requirement at voteStart (best effort — read live;
  // OK to be approximate, the frontend uses it as a target indicator).
  const quorum = await safeReadBigInt(
    context,
    commitmentsGovernorAbi,
    governorAddr,
    'quorum',
    [voteStart as bigint],
    0n,
  )

  await context.db.insert(proposalTable).values({
    id: proposalRowId(governorAddr, proposalId as bigint),
    governor: governorAddr,
    proposalId: proposalId as bigint,
    proposer: proposer as `0x${string}`,
    description,
    descriptionHash,
    voteStart: voteStart as bigint,
    voteEnd: voteEnd as bigint,
    eta: null,
    forVotes: 0n,
    againstVotes: 0n,
    abstainVotes: 0n,
    quorumAtSnapshot: quorum,
    state: 'pending',
    kind,
    createdBlock: event.block.number,
    createdTx: event.transaction.hash,
    canceledBlock: null,
    canceledTx: null,
    queuedBlock: null,
    queuedTx: null,
    executedBlock: null,
    executedTx: null,
  })

  for (let i = 0; i < decoded.length; i++) {
    const a = decoded[i]
    await context.db.insert(proposalActionTable).values({
      id: proposalActionRowId(governorAddr, proposalId as bigint, i),
      governor: governorAddr,
      proposalId: proposalId as bigint,
      actionIndex: i,
      target: rawActions[i].target,
      value: rawActions[i].value,
      calldata: rawActions[i].calldata,
      kind: a.kind,
      selector: a.selector,
      decoded: a.decoded as object | null,
    })
  }
})

ponder.on('CommitmentsGovernor:ProposalCanceled', async ({ event, context }) => {
  const governorAddr = event.log.address
  await context.db
    .update(proposalTable, { id: proposalRowId(governorAddr, event.args.proposalId as bigint) })
    .set({
      state: 'canceled',
      canceledBlock: event.block.number,
      canceledTx: event.transaction.hash,
    })
})

ponder.on('CommitmentsGovernor:ProposalQueued', async ({ event, context }) => {
  const governorAddr = event.log.address
  await context.db
    .update(proposalTable, { id: proposalRowId(governorAddr, event.args.proposalId as bigint) })
    .set({
      state: 'queued',
      eta: event.args.etaSeconds as bigint,
      queuedBlock: event.block.number,
      queuedTx: event.transaction.hash,
    })
})

ponder.on('CommitmentsGovernor:ProposalExecuted', async ({ event, context }) => {
  const governorAddr = event.log.address
  const proposalId = event.args.proposalId as bigint
  await context.db
    .update(proposalTable, { id: proposalRowId(governorAddr, proposalId) })
    .set({
      state: 'executed',
      executedBlock: event.block.number,
      executedTx: event.transaction.hash,
    })

  // Side-effect: stamp meshNode.governor for every weight_update action.
  // Lets the GovernorDetail page show "controlled mesh nodes" without joining.
  const actions = await fetchProposalActions(context, governorAddr, proposalId)
  for (const a of actions) {
    if (a.kind === 'weight_update') {
      const tw = a.target as `0x${string}`
      try {
        await context.db.update(meshNode, { address: tw }).set({ governor: governorAddr })
      } catch {
        // meshNode row may not exist yet (e.g. external TokenWeighting not
        // deployed via MeshFactory) — silently ignore.
      }
    }
  }
})

ponder.on('CommitmentsGovernor:VoteCast', async ({ event, context }) => {
  await persistVote(context, event, event.args, '')
})

ponder.on('CommitmentsGovernor:VoteCastWithParams', async ({ event, context }) => {
  await persistVote(context, event, event.args, event.args.params as `0x${string}`)
})

// ============================================================
// HELPERS
// ============================================================

interface VoteCastArgs {
  voter: `0x${string}`
  proposalId: bigint
  support: number
  weight: bigint
  reason: string
  params?: `0x${string}`
}

async function persistVote(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  args: VoteCastArgs,
  _params: string,
): Promise<void> {
  const governorAddr = event.log.address
  const proposalId = args.proposalId

  await context.db.insert(voteTable).values({
    id: voteRowId(governorAddr, proposalId, args.voter),
    governor: governorAddr,
    proposalId,
    voter: args.voter,
    support: args.support,
    weight: args.weight,
    reason: args.reason ?? '',
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })

  // Bump tally on the proposal row.
  const row = await context.db.find(proposalTable, {
    id: proposalRowId(governorAddr, proposalId),
  })
  if (!row) return

  const update: Record<string, bigint | string> = {}
  if (args.support === 0) update.againstVotes = row.againstVotes + args.weight
  else if (args.support === 1) update.forVotes = row.forVotes + args.weight
  else if (args.support === 2) update.abstainVotes = row.abstainVotes + args.weight

  // Flip pending → active on first vote (no separate event for this transition).
  if (row.state === 'pending') update.state = 'active'

  await context.db
    .update(proposalTable, { id: proposalRowId(governorAddr, proposalId) })
    .set(update)
}

function hashDescription(description: string): `0x${string}` {
  // OZ Governor uses keccak256(bytes(description)) as descriptionHash for
  // hashProposal. Compute via viem so the indexer's stored value matches.
  return keccak256(toHex(description))
}

interface GovernorConfig {
  votingDelay: bigint
  votingPeriod: bigint
  proposalThreshold: bigint
  quorumNumerator: bigint
  quorumDenominator: bigint
}

async function readGovernorConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  governorAddr: `0x${string}`,
): Promise<GovernorConfig> {
  const abi = commitmentsGovernorAbi
  const [votingDelay, votingPeriod, proposalThreshold, quorumNumerator, quorumDenominator] =
    await Promise.all([
      safeReadBigInt(context, abi, governorAddr, 'votingDelay', [], 0n),
      safeReadBigInt(context, abi, governorAddr, 'votingPeriod', [], 0n),
      safeReadBigInt(context, abi, governorAddr, 'proposalThreshold', [], 0n),
      safeReadBigInt(context, abi, governorAddr, 'quorumNumerator', [], 0n),
      // OZ default 100 if the read fails.
      safeReadBigInt(context, abi, governorAddr, 'quorumDenominator', [], 100n),
    ])
  return { votingDelay, votingPeriod, proposalThreshold, quorumNumerator, quorumDenominator }
}

async function safeReadBigInt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  abi: readonly unknown[],
  address: `0x${string}`,
  functionName: string,
  args: unknown[],
  fallback: bigint,
): Promise<bigint> {
  try {
    const result = (await context.client.readContract({
      address,
      abi,
      functionName,
      args,
    })) as bigint | number
    return typeof result === 'bigint' ? result : BigInt(result)
  } catch {
    return fallback
  }
}

async function fetchProposalActions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  governorAddr: `0x${string}`,
  proposalId: bigint,
): Promise<Array<{ kind: string; target: `0x${string}` }>> {
  // Walk the schema rows we wrote on ProposalCreated. Cap at 16 actions
  // — proposals with more are vanishingly rare in practice.
  const rows: Array<{ kind: string; target: `0x${string}` }> = []
  for (let i = 0; i < 16; i++) {
    const row = await context.db.find(proposalActionTable, {
      id: proposalActionRowId(governorAddr, proposalId, i),
    })
    if (!row) break
    rows.push({ kind: row.kind, target: row.target })
  }
  return rows
}
