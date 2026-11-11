import { ponder } from 'ponder:registry'
import { arbitrationCase, arbitrationMechanismEvent, mutual } from 'ponder:schema'

import {
  attestationArbiterAbi,
  optimisticInsuranceArbiterAbi,
  optimisticMutualArbiterAbi,
  twoTierArbiterAbi,
} from './abis'
import { mutualKey } from './mutual'

function caseKey(arbiter: string, caseId: bigint, scope = 'case') {
  return `${arbiter.toLowerCase()}-${scope}-${caseId}`
}

function eventKey(address: string, block: bigint, logIndex: number) {
  return `${address.toLowerCase()}-${block}-${logIndex}`
}

// Every arbiter's `commitmentManager()` is immutable.
async function arbiterManager(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  address: `0x${string}`,
  abi:
    | typeof optimisticInsuranceArbiterAbi
    | typeof twoTierArbiterAbi
    | typeof attestationArbiterAbi
    | typeof optimisticMutualArbiterAbi,
): Promise<`0x${string}`> {
  return context.client.readContract({ address, abi, functionName: 'commitmentManager', cache: 'immutable' })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertEvent(context: any, event: any, values: {
  mechanism: string
  caseId: bigint
  commitmentId?: bigint | null
  manager?: `0x${string}` | null
  kind: string
  actor?: `0x${string}` | null
  phase: string
  deadline?: bigint | null
  outcome?: string | null
}) {
  await context.db.insert(arbitrationMechanismEvent).values({
    id: eventKey(event.log.address, event.block.number, event.log.logIndex),
    mechanism: values.mechanism,
    arbiter: event.log.address,
    caseId: values.caseId,
    commitmentId: values.commitmentId ?? null,
    manager: values.manager ?? null,
    kind: values.kind,
    actor: values.actor ?? null,
    phase: values.phase,
    deadline: values.deadline ?? null,
    outcome: values.outcome ?? null,
    blockNumber: event.block.number,
    logIndex: event.log.logIndex,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })
}

ponder.on('OptimisticInsuranceArbiter:ClaimProposed', async ({ event, context }) => {
  const { claimId, commitmentId, proposer, amountBps } = event.args
  const [manager, answerTimeout] = await Promise.all([
    arbiterManager(context, event.log.address, optimisticInsuranceArbiterAbi),
    context.client.readContract({
      address: event.log.address,
      abi: optimisticInsuranceArbiterAbi,
      functionName: 'answerTimeout',
      cache: 'immutable',
    }),
  ])
  const deadline = event.block.timestamp + answerTimeout
  await context.db.insert(arbitrationCase).values({
    id: caseKey(event.log.address, claimId),
    mechanism: 'optimistic-insurance',
    arbiter: event.log.address,
    caseId: claimId,
    commitmentId,
    manager,
    phase: 'proposed',
    terminalOutcome: null,
    nextDeadline: deadline,
    openedAt: event.block.timestamp,
    updatedAt: event.block.timestamp,
    updatedBlock: event.block.number,
  })
  await insertEvent(context, event, {
    mechanism: 'optimistic-insurance', caseId: claimId, commitmentId, manager,
    kind: 'claim-proposed', actor: proposer, phase: 'proposed', deadline,
    outcome: `${Number(amountBps)} bps assertion`,
  })
})

ponder.on('OptimisticInsuranceArbiter:ClaimDisputed', async ({ event, context }) => {
  const { claimId, disputer, amountBps } = event.args
  const key = caseKey(event.log.address, claimId)
  const current = await context.db.find(arbitrationCase, { id: key })
  if (!current) return
  const answerTimeout = await context.client.readContract({
    address: event.log.address,
    abi: optimisticInsuranceArbiterAbi,
    functionName: 'answerTimeout',
    cache: 'immutable',
  })
  const deadline = event.block.timestamp + answerTimeout
  await context.db.update(arbitrationCase, { id: key }).set({
    phase: 'disputed', nextDeadline: deadline, updatedAt: event.block.timestamp, updatedBlock: event.block.number,
  })
  await insertEvent(context, event, {
    mechanism: current.mechanism, caseId: claimId, commitmentId: current.commitmentId,
    manager: current.manager, kind: 'claim-disputed', actor: disputer, phase: 'disputed', deadline,
    outcome: `${Number(amountBps)} bps counter-assertion`,
  })
})

async function updateOptimisticTerminal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  phase: string,
  outcome: string,
  kind: string,
) {
  const claimId = event.args.claimId as bigint
  const key = caseKey(event.log.address, claimId)
  const current = await context.db.find(arbitrationCase, { id: key })
  if (!current) return
  await context.db.update(arbitrationCase, { id: key }).set({
    phase, terminalOutcome: outcome, nextDeadline: null,
    updatedAt: event.block.timestamp, updatedBlock: event.block.number,
  })
  await insertEvent(context, event, {
    mechanism: current.mechanism, caseId: claimId, commitmentId: current.commitmentId,
    manager: current.manager, kind, phase, outcome,
  })
}

ponder.on('OptimisticInsuranceArbiter:ClaimCancelled', ({ event, context }) =>
  updateOptimisticTerminal(event, context, 'cancelled', 'cancelled by proposer', 'claim-cancelled'))
ponder.on('OptimisticInsuranceArbiter:ClaimSettled', ({ event, context }) =>
  updateOptimisticTerminal(event, context, 'settled', 'bond game settled', 'claim-settled'))
ponder.on('OptimisticInsuranceArbiter:ClaimStaleCancelled', ({ event, context }) =>
  updateOptimisticTerminal(event, context, 'stale-cancelled', 'stale claim cancelled', 'claim-stale-cancelled'))
ponder.on('OptimisticInsuranceArbiter:ClaimUnwound', ({ event, context }) =>
  updateOptimisticTerminal(event, context, 'unwound', 'manager enforcement unavailable; bonds refunded', 'claim-unwound'))

// ClaimRuled is followed in the same transaction by ClaimSettled and
// ClaimFinalized whenever the bond game settles at once (no payout, an
// already-executed hold, or a committer that has exited). Otherwise the claim
// waits in Forfeiture for `executeClaim`, so the case sits at
// manager-enforcement until ClaimFinalized fires.
ponder.on('OptimisticInsuranceArbiter:ClaimRuled', async ({ event, context }) => {
  const { claimId, winningAmtBps } = event.args
  const key = caseKey(event.log.address, claimId)
  const current = await context.db.find(arbitrationCase, { id: key })
  if (!current) return
  await context.db.update(arbitrationCase, { id: key }).set({
    phase: 'manager-enforcement', nextDeadline: null, updatedAt: event.block.timestamp, updatedBlock: event.block.number,
  })
  await insertEvent(context, event, {
    mechanism: current.mechanism, caseId: claimId, commitmentId: current.commitmentId,
    manager: current.manager, kind: 'claim-ruled', phase: 'manager-enforcement',
    outcome: `${Number(winningAmtBps)} bps ruling`,
  })
})

// ClaimFinalized fires once, from `_settle`, after the claim reaches Settled.
ponder.on('OptimisticInsuranceArbiter:ClaimFinalized', async ({ event, context }) => {
  const { claimId, winningAmtBps } = event.args
  const key = caseKey(event.log.address, claimId)
  const current = await context.db.find(arbitrationCase, { id: key })
  if (!current) return
  await context.db.update(arbitrationCase, { id: key }).set({
    phase: 'settled',
    terminalOutcome: `${Number(winningAmtBps)} bps claim settled`,
    nextDeadline: null,
    updatedAt: event.block.timestamp,
    updatedBlock: event.block.number,
  })
  await insertEvent(context, event, {
    mechanism: current.mechanism, caseId: claimId, commitmentId: current.commitmentId,
    manager: current.manager, kind: 'claim-finalized', phase: 'settled',
    outcome: `${Number(winningAmtBps)} bps final answer and settlement`,
  })
})

async function insertTwoTierCase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  values: {
    kind: string
    phase: string
    deadline?: bigint | null
    outcome?: string | null
    terminal?: string | null
  },
) {
  const { caseId, commitmentId, actor } = event.args as { caseId: bigint; commitmentId: bigint; actor: `0x${string}` }
  const manager = await arbiterManager(context, event.log.address, twoTierArbiterAbi)
  const update = {
    phase: values.phase, terminalOutcome: values.terminal ?? null, nextDeadline: values.deadline ?? null,
    updatedAt: event.block.timestamp, updatedBlock: event.block.number,
  }
  await context.db
    .insert(arbitrationCase)
    .values({
      id: caseKey(event.log.address, caseId), mechanism: 'two-tier', arbiter: event.log.address, caseId,
      commitmentId, manager, openedAt: event.block.timestamp, ...update,
    })
    .onConflictDoUpdate(update)
  await insertEvent(context, event, {
    mechanism: 'two-tier', caseId, commitmentId, manager, actor,
    kind: values.kind, phase: values.phase, deadline: values.deadline, outcome: values.outcome ?? values.terminal,
  })
}

ponder.on('TwoTierArbiter:RulingProposed', ({ event, context }) =>
  insertTwoTierCase(event, context, {
    kind: 'ruling-proposed', phase: 'primary-ruling', deadline: event.args.appealDeadline,
    outcome: `${Number(event.args.penaltyBps)} bps primary ruling`,
  }))
ponder.on('TwoTierArbiter:RulingWithdrawn', ({ event, context }) =>
  insertTwoTierCase(event, context, { kind: 'ruling-withdrawn', phase: 'withdrawn', terminal: 'primary ruling withdrawn' }))
ponder.on('TwoTierArbiter:RulingAppealed', ({ event, context }) =>
  insertTwoTierCase(event, context, { kind: 'ruling-appealed', phase: 'appealed', deadline: event.args.humanDeadline }))
ponder.on('TwoTierArbiter:AppealResolved', ({ event, context }) =>
  insertTwoTierCase(event, context, event.args.finalPenaltyBps === 0
    ? { kind: 'appeal-resolved', phase: 'dismissed', terminal: 'appeal dismissed the penalty' }
    : { kind: 'appeal-resolved', phase: 'human-ruling', outcome: `${Number(event.args.finalPenaltyBps)} bps final ruling` }))
ponder.on('TwoTierArbiter:AppealLapsed', ({ event, context }) =>
  insertTwoTierCase(event, context, { kind: 'appeal-lapsed', phase: 'lapsed', terminal: 'appeal response lapsed' }))
ponder.on('TwoTierArbiter:RulingExecuted', ({ event, context }) =>
  insertTwoTierCase(event, context, { kind: 'ruling-executed', phase: 'executed', terminal: `${Number(event.args.penaltyBps)} bps ruling executed` }))
ponder.on('TwoTierArbiter:CaseSynchronized', ({ event, context }) =>
  insertTwoTierCase(event, context, { kind: 'case-synchronized', phase: 'synchronized', terminal: `synchronized terminal state ${Number(event.args.terminalState)}` }))

ponder.on('AttestationArbiter:Acted', async ({ event, context }) => {
  const action = Number(event.args.action)
  // Action 0..2 is commitment-scoped. Agreement and mutual actions keep their
  // own ids and must not be presented as commitment cases.
  const commitmentId = action <= 2 ? event.args.id : null
  const manager = await arbiterManager(context, event.log.address, attestationArbiterAbi)
  const scope = action <= 2 ? 'commitment' : action <= 5 ? 'agreement' : 'mutual'
  const caseValues = {
    mechanism: 'attestation',
    arbiter: event.log.address,
    caseId: event.args.id,
    commitmentId,
    manager,
    phase: `action-${action}-executed`,
    terminalOutcome: `quorum-authorized action ${action} executed`,
    nextDeadline: null,
    updatedAt: event.block.timestamp,
    updatedBlock: event.block.number,
  }
  await context.db
    .insert(arbitrationCase)
    .values({
      id: caseKey(event.log.address, event.args.id, `attestation-${scope}`),
      ...caseValues,
      openedAt: event.block.timestamp,
    })
    .onConflictDoUpdate(caseValues)
  await insertEvent(context, event, {
    mechanism: 'attestation', caseId: event.args.id, commitmentId, manager,
    kind: 'attestation-acted', actor: event.transaction.from, phase: `action-${action}-executed`, deadline: event.args.deadline,
    outcome: `quorum-authorized action ${action}`,
  })
})

ponder.on('OptimisticMutualArbiter:LossProposed', async ({ event, context }) => {
  const { mutualId, proposer, lossNumeraire } = event.args
  const manager = await arbiterManager(context, event.log.address, optimisticMutualArbiterAbi)
  // The challenge window is on the indexed mutual row (MutualCreated precedes
  // any loss proposal).
  const row = await context.db.find(mutual, { id: mutualKey(manager, mutualId) })
  const deadline = row ? event.block.timestamp + row.challengeWindow : null
  const values = {
    mechanism: 'optimistic-mutual', arbiter: event.log.address, caseId: mutualId,
    commitmentId: null, manager, phase: 'loss-proposed', terminalOutcome: null,
    nextDeadline: deadline, updatedAt: event.block.timestamp, updatedBlock: event.block.number,
  }
  await context.db
    .insert(arbitrationCase)
    .values({ id: caseKey(event.log.address, mutualId, 'mutual'), ...values, openedAt: event.block.timestamp })
    .onConflictDoUpdate(values)
  await insertEvent(context, event, {
    mechanism: 'optimistic-mutual', caseId: mutualId, manager, kind: 'loss-proposed',
    actor: proposer, phase: 'loss-proposed', deadline, outcome: `${lossNumeraire} numeraire loss declared`,
  })
})

async function updateMutualTerminal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  phase: string,
  outcome: string,
  kind: string,
) {
  const mutualId = event.args.mutualId as bigint
  const id = caseKey(event.log.address, mutualId, 'mutual')
  const current = await context.db.find(arbitrationCase, { id })
  if (!current) return
  await context.db.update(arbitrationCase, { id }).set({
    phase, terminalOutcome: outcome, nextDeadline: null,
    updatedAt: event.block.timestamp, updatedBlock: event.block.number,
  })
  await insertEvent(context, event, {
    mechanism: 'optimistic-mutual', caseId: mutualId, manager: current.manager, kind,
    actor: event.args.proposer ?? event.transaction.from, phase, outcome,
  })
}

ponder.on('OptimisticMutualArbiter:LossVetoed', ({ event, context }) =>
  updateMutualTerminal(event, context, 'vetoed', 'loss vetoed; proposer bond slashed', 'loss-vetoed'))
ponder.on('OptimisticMutualArbiter:BondReclaimed', ({ event, context }) =>
  updateMutualTerminal(event, context, 'settled', 'loss resolved; proposer bond reclaimed', 'bond-reclaimed'))
