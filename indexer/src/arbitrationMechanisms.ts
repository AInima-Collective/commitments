import { ponder } from 'ponder:registry'
import { arbitrationCase, arbitrationMechanismEvent } from 'ponder:schema'

const managerCache = new Map<string, `0x${string}`>()
const answerTimeoutCache = new Map<string, bigint>()

function caseKey(arbiter: string, caseId: bigint, scope = 'case') {
  return `${arbiter.toLowerCase()}-${scope}-${caseId}`
}

function eventKey(address: string, block: bigint, logIndex: number) {
  return `${address.toLowerCase()}-${block}-${logIndex}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function optimisticConfig(context: any, address: `0x${string}`) {
  const key = address.toLowerCase()
  let manager = managerCache.get(key)
  let answerTimeout = answerTimeoutCache.get(key)
  if (!manager) {
    manager = await context.client.readContract({
      address,
      abi: context.contracts.OptimisticInsuranceArbiter.abi,
      functionName: 'commitmentManager',
    }) as `0x${string}`
    managerCache.set(key, manager)
  }
  if (answerTimeout === undefined) {
    answerTimeout = await context.client.readContract({
      address,
      abi: context.contracts.OptimisticInsuranceArbiter.abi,
      functionName: 'answerTimeout',
    }) as bigint
    answerTimeoutCache.set(key, answerTimeout)
  }
  return { manager, answerTimeout }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function twoTierManager(context: any, address: `0x${string}`) {
  const key = address.toLowerCase()
  let manager = managerCache.get(key)
  if (!manager) {
    manager = await context.client.readContract({
      address,
      abi: context.contracts.TwoTierArbiter.abi,
      functionName: 'commitmentManager',
    }) as `0x${string}`
    managerCache.set(key, manager)
  }
  return manager
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function attestationManager(context: any, address: `0x${string}`) {
  const key = address.toLowerCase()
  let manager = managerCache.get(key)
  if (!manager) {
    manager = await context.client.readContract({
      address,
      abi: context.contracts.AttestationArbiter.abi,
      functionName: 'commitmentManager',
    }) as `0x${string}`
    managerCache.set(key, manager)
  }
  return manager
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function optimisticMutualConfig(context: any, address: `0x${string}`, mutualId: bigint) {
  const key = address.toLowerCase()
  let manager = managerCache.get(key)
  if (!manager) {
    manager = await context.client.readContract({
      address,
      abi: context.contracts.OptimisticMutualArbiter.abi,
      functionName: 'commitmentManager',
    }) as `0x${string}`
    managerCache.set(key, manager)
  }
  const mutual = await context.client.readContract({
    address: manager,
    abi: context.contracts.CommitmentManager.abi,
    functionName: 'getMutual',
    args: [mutualId],
  }) as { challengeWindow: bigint }
  return { manager, challengeWindow: mutual.challengeWindow }
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
  const { manager, answerTimeout } = await optimisticConfig(context, event.log.address)
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
  const { answerTimeout } = await optimisticConfig(context, event.log.address)
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

ponder.on('OptimisticInsuranceArbiter:ClaimRuled', async ({ event, context }) => {
  const { claimId, winningAmtBps } = event.args
  const key = caseKey(event.log.address, claimId)
  const current = await context.db.find(arbitrationCase, { id: key })
  if (!current) return
  await context.db.update(arbitrationCase, { id: key }).set({
    phase: 'ruled', nextDeadline: null, updatedAt: event.block.timestamp, updatedBlock: event.block.number,
  })
  await insertEvent(context, event, {
    mechanism: current.mechanism, caseId: claimId, commitmentId: current.commitmentId,
    manager: current.manager, kind: 'claim-ruled', phase: 'ruled',
    outcome: `${Number(winningAmtBps)} bps ruling`,
  })
})

ponder.on('OptimisticInsuranceArbiter:ClaimFinalized', async ({ event, context }) => {
  const { claimId, winningAmtBps } = event.args
  const key = caseKey(event.log.address, claimId)
  const current = await context.db.find(arbitrationCase, { id: key })
  if (!current) return
  const claim = await context.client.readContract({
    address: event.log.address,
    abi: context.contracts.OptimisticInsuranceArbiter.abi,
    functionName: 'getClaim',
    args: [claimId],
  }) as { state: number }
  const settled = Number(claim.state) === 4
  const phase = settled ? 'settled' : 'manager-enforcement'
  await context.db.update(arbitrationCase, { id: key }).set({
    phase,
    terminalOutcome: settled ? `${Number(winningAmtBps)} bps claim settled` : null,
    nextDeadline: null,
    updatedAt: event.block.timestamp,
    updatedBlock: event.block.number,
  })
  await insertEvent(context, event, {
    mechanism: current.mechanism, caseId: claimId, commitmentId: current.commitmentId,
    manager: current.manager, kind: 'claim-finalized', phase,
    outcome: `${Number(winningAmtBps)} bps final answer${settled ? ' and settlement' : ''}`,
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
  const manager = await twoTierManager(context, event.log.address)
  const key = caseKey(event.log.address, caseId)
  const current = await context.db.find(arbitrationCase, { id: key })
  if (current) {
    await context.db.update(arbitrationCase, { id: key }).set({
      phase: values.phase, terminalOutcome: values.terminal ?? null, nextDeadline: values.deadline ?? null,
      updatedAt: event.block.timestamp, updatedBlock: event.block.number,
    })
  } else {
    await context.db.insert(arbitrationCase).values({
      id: key, mechanism: 'two-tier', arbiter: event.log.address, caseId, commitmentId, manager,
      phase: values.phase, terminalOutcome: values.terminal ?? null, nextDeadline: values.deadline ?? null,
      openedAt: event.block.timestamp, updatedAt: event.block.timestamp, updatedBlock: event.block.number,
    })
  }
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
  const manager = await attestationManager(context, event.log.address)
  const scope = action <= 2 ? 'commitment' : action <= 5 ? 'agreement' : 'mutual'
  const key = caseKey(event.log.address, event.args.id, `attestation-${scope}`)
  const current = await context.db.find(arbitrationCase, { id: key })
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
  if (current) {
    await context.db.update(arbitrationCase, { id: key }).set(caseValues)
  } else {
    await context.db.insert(arbitrationCase).values({
      id: key,
      ...caseValues,
      openedAt: event.block.timestamp,
    })
  }
  await insertEvent(context, event, {
    mechanism: 'attestation', caseId: event.args.id, commitmentId, manager,
    kind: 'attestation-acted', actor: event.transaction.from, phase: `action-${action}-executed`, deadline: event.args.deadline,
    outcome: `quorum-authorized action ${action}`,
  })
})

ponder.on('OptimisticMutualArbiter:LossProposed', async ({ event, context }) => {
  const { mutualId, proposer, lossNumeraire } = event.args
  const { manager, challengeWindow } = await optimisticMutualConfig(context, event.log.address, mutualId)
  const deadline = event.block.timestamp + challengeWindow
  const id = caseKey(event.log.address, mutualId, 'mutual')
  const current = await context.db.find(arbitrationCase, { id })
  const values = {
    mechanism: 'optimistic-mutual', arbiter: event.log.address, caseId: mutualId,
    commitmentId: null, manager, phase: 'loss-proposed', terminalOutcome: null,
    nextDeadline: deadline, updatedAt: event.block.timestamp, updatedBlock: event.block.number,
  }
  if (current) await context.db.update(arbitrationCase, { id }).set(values)
  else await context.db.insert(arbitrationCase).values({ id, ...values, openedAt: event.block.timestamp })
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
  const { manager } = await optimisticMutualConfig(context, event.log.address, mutualId)
  const id = caseKey(event.log.address, mutualId, 'mutual')
  const current = await context.db.find(arbitrationCase, { id })
  if (!current) return
  await context.db.update(arbitrationCase, { id }).set({
    phase, terminalOutcome: outcome, nextDeadline: null,
    updatedAt: event.block.timestamp, updatedBlock: event.block.number,
  })
  await insertEvent(context, event, {
    mechanism: 'optimistic-mutual', caseId: mutualId, manager, kind,
    actor: event.args.proposer ?? event.transaction.from, phase, outcome,
  })
}

ponder.on('OptimisticMutualArbiter:LossVetoed', ({ event, context }) =>
  updateMutualTerminal(event, context, 'vetoed', 'loss vetoed; proposer bond slashed', 'loss-vetoed'))
ponder.on('OptimisticMutualArbiter:BondReclaimed', ({ event, context }) =>
  updateMutualTerminal(event, context, 'settled', 'loss resolved; proposer bond reclaimed', 'bond-reclaimed'))
