/**
 * Mutual / Synthetic Mutual event handlers.
 *
 * Wired into Ponder's runtime via this module's `import` side-effect from
 * `src/index.ts` (same pattern as `governance.ts`). Handlers maintain
 * the `mutual`, `membership`, and `mutualEvent` tables.
 *
 * Two surfaces feed these tables:
 *   1. The CommitmentManager mutual event surface (MutualCreated / MutualActivated /
 *      MemberJoined / MutualLoss{Initiated,Executed,Cancelled,Shortfall} /
 *      MemberSettled / GroupMember{ExitRequested,Released} / MutualTerminated).
 *      The manager is ALWAYS bound, so these handlers register unconditionally.
 *   2. The MutualRegistry (`MutualRegistered`), which annotates an existing
 *      mutual row with its synthetic-mutual cover terms. Its address list is
 *      empty when the deployment has no registry.
 *
 * Accounting model (see CommitmentManager): `cumulativeLoss` (Lambda) is a
 * 1e18-scaled, monotonic, ≤1e18 cumulative loss FRACTION. A member owes raw units =
 * `forfeitableUnits * (Lambda - lossSnapshot) / 1e18`, settled lazily to the mutual
 * beneficiary. `totalShares` = Σ active members' `creditedValue` and moves only on
 * join/release. We refresh the snapshot (via `getMutual` / `getMembership`)
 * on every event that moves value, so the rows stay current.
 */
import { ponder } from 'ponder:registry'
import {
  commitment,
  coverBinding,
  mutual,
  mutualEvent,
  mutualState,
  membership,
  premiumClaim,
  premiumFunding,
} from 'ponder:schema'
import { bumpAccount } from './accountStats'
import { bumpEncumbered, recordFlow, type FlowEvent } from './ledgerFlow'

import { commitmentManagerAbi, mutualRegistryAbi } from './abis'

type Hex = `0x${string}`

export const mutualKey = (manager: Hex, mutualId: bigint) => `${manager.toLowerCase()}-${mutualId.toString()}`
const membershipKey = (manager: Hex, commitmentId: bigint) =>
  `${manager.toLowerCase()}-${commitmentId.toString()}`

// ----------------------------------------------------------------------------
// Chain-read helpers — live mutual / membership snapshots from the manager.
// ----------------------------------------------------------------------------

type MutualSnapshot = {
  arbiter: Hex
  numeraire: Hex
  beneficiary: Hex
  challengeWindow: bigint
  deallocationWindow: bigint
  totalShares: bigint
  cumulativeLoss: bigint
  active: boolean
  terminal: boolean
}

async function readMutualSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  manager: Hex,
  mutualId: bigint,
): Promise<MutualSnapshot> {
  return context.client.readContract({
    abi: commitmentManagerAbi,
    address: manager,
    functionName: 'getMutual',
    args: [mutualId],
  })
}

type MembershipSnapshot = {
  mutualId: bigint
  forfeitableUnits: bigint
  settledUnits: bigint
  creditedValue: bigint
  lossSnapshot: bigint
  unbondRequestedAt: bigint
  // §G premium index (reward side) — appended to the GroupMembership struct.
  premiumSnapshot: bigint
  rewardBank: bigint
}

// getMutualPremiumState returns a flat tuple of 9 named outputs (not a struct), so
// viem hands back a positional array — destructure it into a typed snapshot.
type MutualPremiumSnapshot = {
  premiumPerShareStored: bigint
  activeCover: bigint
  settledTotal: bigint
  rewardRate: bigint
  lastUpdate: bigint
  periodFinish: bigint
  premiumRemainder: bigint
  bankedTotal: bigint
  premiumPool: bigint
}

async function readMutualPremiumState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  manager: Hex,
  mutualId: bigint,
): Promise<MutualPremiumSnapshot> {
  const r: readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] =
    await context.client.readContract({
      abi: commitmentManagerAbi,
      address: manager,
      functionName: 'getMutualPremiumState',
      args: [mutualId],
    })
  return {
    premiumPerShareStored: r[0],
    activeCover: r[1],
    settledTotal: r[2],
    rewardRate: r[3],
    lastUpdate: r[4],
    periodFinish: r[5],
    premiumRemainder: r[6],
    bankedTotal: r[7],
    premiumPool: r[8],
  }
}

async function readMembership(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  manager: Hex,
  commitmentId: bigint,
): Promise<MembershipSnapshot> {
  return context.client.readContract({
    abi: commitmentManagerAbi,
    address: manager,
    functionName: 'getMembership',
    args: [commitmentId],
  })
}

// Append one append-only timeline row. id = `${mutualId}-${blockNumber}-${logIndex}`.
async function recordMutualEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  args: {
    manager: Hex
    mutualId: bigint
    commitmentId?: bigint | null
    kind: string
    numeraireAmount?: bigint | null
    cumulativeLoss?: bigint | null
    actor?: Hex | null
    evidenceHash?: Hex | null
    stale?: boolean | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: any
  },
): Promise<void> {
  const { manager, mutualId, commitmentId, kind, numeraireAmount, cumulativeLoss, actor, evidenceHash, stale, event } =
    args
  await context.db.insert(mutualEvent).values({
    id: `${mutualId.toString()}-${event.block.number}-${event.log.logIndex}`,
    manager,
    mutualId,
    commitmentId: commitmentId ?? null,
    kind,
    numeraireAmount: numeraireAmount ?? null,
    cumulativeLoss: cumulativeLoss ?? null,
    actor: actor ?? null,
    evidenceHash: evidenceHash ?? null,
    stale: stale ?? null,
    blockNumber: event.block.number,
    logIndex: event.log.logIndex,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })
}

/**
 * Append a free-balance credit for one of the premium pool payout paths.
 *
 * All three (`MemberPremiumClaimed`, `PremiumReclaimed`, `MutualPremiumSwept`)
 * run through `LedgerLib.mutualPremiumToFree`, which credit
 * `free[recipient]` in the mutual's numeraire. None of them emits a `Deposited`,
 * so without this the credit is invisible to the balance history.
 *
 * The funding direction is deliberately NOT recorded: `fundMutualPremium` pulls
 * the numeraire in and credits `free[funder]` (via `_pullNumeraireMeasured`),
 * then immediately debits the same measured amount back out through
 * `freeToMutualPremium`, so the funder's free balance nets to zero across the
 * call and there is nothing to log.
 *
 * Returns silently when the mutual row is missing — the numeraire is only known
 * from the indexed row, and a wrong token is worse than a missing delta.
 */
async function recordPoolCredit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  manager: Hex,
  mutualId: bigint,
  recipient: Hex,
  amount: bigint,
  kind: 'premiumIn',
  event: FlowEvent,
  commitmentId?: bigint,
): Promise<void> {
  if (amount === 0n) return
  const row = await context.db.find(mutual, { id: mutualKey(manager, mutualId) })
  if (!row) return
  await recordFlow(context.db, event, 'a', {
    user: recipient,
    token: row.numeraire,
    kind,
    freeDelta: amount,
    commitmentId: commitmentId ?? null,
  })
}

// Re-read the mutual's snapshot, persist the value-moving fields, and upsert
// this block's `mutualState` row. The reads are end-of-block state, so every
// event in a block writes the same row.
async function refreshMutual(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  manager: Hex,
  mutualId: bigint,
  block: { number: bigint; timestamp: bigint },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra: Record<string, any> = {},
): Promise<void> {
  const id = mutualKey(manager, mutualId)
  const row = await context.db.find(mutual, { id })
  if (!row) return
  const [snap, premium] = await Promise.all([
    readMutualSnapshot(context, manager, mutualId),
    readMutualPremiumState(context, manager, mutualId),
  ])
  await context.db.update(mutual, { id }).set({
    totalShares: snap.totalShares,
    cumulativeLoss: snap.cumulativeLoss,
    active: snap.active,
    terminal: snap.terminal,
    ...premium,
    ...extra,
    updatedBlock: block.number,
  })
  const state = {
    blockTimestamp: block.timestamp,
    totalShares: snap.totalShares,
    activeCover: premium.activeCover,
    cumulativeLoss: snap.cumulativeLoss,
    settledTotal: premium.settledTotal,
    rewardRate: premium.rewardRate,
    periodFinish: premium.periodFinish,
    premiumPool: premium.premiumPool,
  }
  await context.db
    .insert(mutualState)
    .values({ id: `${id}-${block.number}`, manager, mutualId, blockNumber: block.number, ...state })
    .onConflictDoUpdate(state)
}

// ----------------------------------------------------------------------------
// CommitmentManager mutual event surface (always bound).
// ----------------------------------------------------------------------------

ponder.on('CommitmentManager:MutualCreated', async ({ event, context }) => {
  const { mutualId, arbiter, numeraire, beneficiary } = event.args
  const manager = event.log.address
  const snap = await readMutualSnapshot(context, manager, mutualId)
  await context.db.insert(mutual).values({
    id: mutualKey(manager, mutualId),
    manager,
    mutualId,
    arbiter,
    numeraire,
    beneficiary,
    challengeWindow: snap.challengeWindow,
    deallocationWindow: snap.deallocationWindow,
    totalShares: snap.totalShares,
    cumulativeLoss: snap.cumulativeLoss,
    active: snap.active,
    terminal: snap.terminal,
    targetCapacity: null,
    termEnd: null,
    perilURI: null,
    perilHash: null,
    createdBlock: event.block.number,
    updatedBlock: event.block.number,
  })
  await recordMutualEvent(context, { manager, mutualId, kind: 'created', actor: arbiter, event })
})

ponder.on('CommitmentManager:MutualActivated', async ({ event, context }) => {
  const { mutualId } = event.args
  const manager = event.log.address
  const id = mutualKey(manager, mutualId)
  const row = await context.db.find(mutual, { id })
  if (row) {
    await context.db
      .update(mutual, { id })
      .set({ active: true, updatedBlock: event.block.number })
  }
  await recordMutualEvent(context, { manager, mutualId, kind: 'activated', event })
})

ponder.on('CommitmentManager:MemberJoined', async ({ event, context }) => {
  const { mutualId, commitmentId, committer, creditedValue, forfeitableUnits } = event.args
  const manager = event.log.address
  const mem = await readMembership(context, manager, commitmentId)
  await context.db.insert(membership).values({
    id: membershipKey(manager, commitmentId),
    manager,
    mutualId,
    commitmentId,
    committer,
    forfeitableUnits,
    settledUnits: mem.settledUnits,
    creditedValue,
    lossSnapshot: mem.lossSnapshot,
    premiumSnapshot: mem.premiumSnapshot,
    rewardBank: mem.rewardBank,
    status: 'active',
    createdBlock: event.block.number,
    updatedBlock: event.block.number,
  })
  // totalShares moves on join — refresh from chain.
  await refreshMutual(context, manager, mutualId, event.block)
  await recordMutualEvent(context, {
    manager,
    mutualId,
    commitmentId,
    kind: 'memberJoined',
    numeraireAmount: creditedValue,
    actor: committer,
    event,
  })
})

ponder.on('CommitmentManager:MutualLossInitiated', async ({ event, context }) => {
  const { mutualId, lossNumeraire, evidenceHash, proposer } = event.args
  const manager = event.log.address
  // Opening a loss proposal moves no indexed mutual field.
  await recordMutualEvent(context, {
    manager,
    mutualId,
    kind: 'lossInitiated',
    numeraireAmount: lossNumeraire,
    actor: proposer,
    evidenceHash,
    event,
  })
})

ponder.on('CommitmentManager:MutualLossExecuted', async ({ event, context }) => {
  const { mutualId, appliedNumeraire, cumulativeLoss } = event.args
  const manager = event.log.address
  // The event carries the authoritative post-execution Lambda; pin it directly
  // (refreshMutual also re-reads totalShares/active/terminal).
  await refreshMutual(context, manager, mutualId, event.block, { cumulativeLoss })
  await recordMutualEvent(context, {
    manager,
    mutualId,
    kind: 'lossExecuted',
    numeraireAmount: appliedNumeraire,
    cumulativeLoss,
    event,
  })
})

ponder.on('CommitmentManager:MutualLossCancelled', async ({ event, context }) => {
  const { mutualId, stale } = event.args
  await recordMutualEvent(context, { manager: event.log.address, mutualId, kind: 'lossCancelled', stale, event })
})

ponder.on('CommitmentManager:MutualLossShortfall', async ({ event, context }) => {
  const { mutualId, shortfallNumeraire } = event.args
  // Emitted beside MutualLossExecuted, whose handler refreshes the mutual.
  await recordMutualEvent(context, {
    manager: event.log.address,
    mutualId,
    kind: 'lossShortfall',
    numeraireAmount: shortfallNumeraire,
    event,
  })
})

ponder.on('CommitmentManager:MemberSettled', async ({ event, context }) => {
  const { mutualId, commitmentId, owedUnits, cumulativeLoss } = event.args
  const manager = event.log.address
  const id = membershipKey(manager, commitmentId)
  const row = await context.db.find(membership, { id })
  const mem = await readMembership(context, manager, commitmentId)
  if (row) {
    await context.db.update(membership, { id }).set({
      settledUnits: mem.settledUnits,
      lossSnapshot: mem.lossSnapshot,
      premiumSnapshot: mem.premiumSnapshot,
      rewardBank: mem.rewardBank,
      updatedBlock: event.block.number,
    })
  }
  // settleMemberLoss moves `owedUnits` of the member's stake to the mutual
  // beneficiary and decrements `c.amount` on chain — mirror it so list/detail
  // surfaces don't overstate the stake.
  if (owedUnits > 0n) {
    const c = await context.db.find(commitment, { id: commitmentId, manager })
    if (c) {
      const newAmount = c.amount > owedUnits ? c.amount - owedUnits : 0n
      await context.db
        .update(commitment, { id: commitmentId, manager })
        .set({ amount: newAmount, updatedBlock: event.block.number })

      // The settle leg reuses `LedgerLib.forfeitTransfer` — encumbered[committer]
      // -> free[beneficiary] — and emits NO encumbrance event, only MemberSettled.
      // Without this the member's indexed encumbered balance stays at its
      // pre-loss value forever. (Same shape as the ForfeitExecuted handler in
      // index.ts, which already carries its own bumpEncumbered for this reason.)
      await bumpEncumbered(context.db, c.token, c.committer, -owedUnits, event.block.number)
      await recordFlow(context.db, event, 'a', {
        user: c.committer,
        token: c.token,
        kind: 'forfeitOut',
        encumberedDelta: -owedUnits,
        commitmentId,
      })
      // The credit lands on the mutual's beneficiary, in the COMMITMENT's token
      // (the stake), which is the mutual numeraire.
      const g = await context.db.find(mutual, { id: mutualKey(manager, mutualId) })
      if (g) {
        await recordFlow(context.db, event, 'b', {
          user: g.beneficiary,
          token: c.token,
          kind: 'forfeitIn',
          freeDelta: owedUnits,
          commitmentId,
        })
      }
    }
  }
  // The settle moves settledTotal, activeCover and the premium accumulator.
  await refreshMutual(context, manager, mutualId, event.block)
  await recordMutualEvent(context, {
    manager,
    mutualId,
    commitmentId,
    kind: 'memberSettled',
    numeraireAmount: owedUnits,
    cumulativeLoss,
    event,
  })
})

ponder.on('CommitmentManager:MemberExitRequested', async ({ event, context }) => {
  const { mutualId, commitmentId, slashableUntil } = event.args
  const manager = event.log.address
  const id = membershipKey(manager, commitmentId)
  const row = await context.db.find(membership, { id })
  if (row) {
    // requestMutualExit banks the member's accrued premium — re-read it.
    const mem = await readMembership(context, manager, commitmentId)
    await context.db.update(membership, { id }).set({
      status: 'exitRequested',
      exitRequestedAt: event.block.timestamp,
      slashableUntil,
      premiumSnapshot: mem.premiumSnapshot,
      rewardBank: mem.rewardBank,
      updatedBlock: event.block.number,
    })
  }
  await recordMutualEvent(context, { manager, mutualId, commitmentId, kind: 'exitRequested', event })
})

ponder.on('CommitmentManager:MemberReleased', async ({ event, context }) => {
  const { mutualId, commitmentId } = event.args
  const manager = event.log.address
  const id = membershipKey(manager, commitmentId)
  const row = await context.db.find(membership, { id })
  if (row) {
    // releaseGroupMember auto-pays the member's accrued premium, so rewardBank
    // drops — re-read the membership snapshot to capture it alongside the status.
    const mem = await readMembership(context, manager, commitmentId)
    await context.db.update(membership, { id }).set({
      status: 'released',
      premiumSnapshot: mem.premiumSnapshot,
      rewardBank: mem.rewardBank,
      updatedBlock: event.block.number,
    })
  }
  // releaseMutualMember closes the commitment on chain (c.released = true,
  // c.amount = 0) but emits only MemberReleased — no CommitmentReleased — so
  // mirror the terminal state onto the commitment row here or list/detail
  // surfaces show a phantom ACTIVE commitment forever.
  const c = await context.db.find(commitment, { id: commitmentId, manager })
  if (c && c.status !== 'released') {
    await context.db.update(commitment, { id: commitmentId, manager }).set({
      status: 'released',
      amount: 0n,
      unbondInitiatedAt: null,
      unbondMaturesAt: null,
      updatedBlock: event.block.number,
    })
    await bumpAccount(context.db, c.committer, { activeDelta: -1, releasedDelta: 1 })
  }
  // totalShares decremented on release — refresh from chain.
  await refreshMutual(context, manager, mutualId, event.block)
  await recordMutualEvent(context, { manager, mutualId, commitmentId, kind: 'memberReleased', event })
})

ponder.on('CommitmentManager:MutualTerminated', async ({ event, context }) => {
  const { mutualId } = event.args
  const manager = event.log.address
  const id = mutualKey(manager, mutualId)
  const row = await context.db.find(mutual, { id })
  if (row) {
    await context.db
      .update(mutual, { id })
      .set({ terminal: true, updatedBlock: event.block.number })
  }
  await recordMutualEvent(context, { manager, mutualId, kind: 'terminated', event })
})

// ----------------------------------------------------------------------------
// CommitmentManager premium index (always bound, §G reward side).
// ----------------------------------------------------------------------------

// Append one premium inflow/outflow row. id = `${mutualId}-${blockNumber}-${logIndex}`.
async function recordPremiumFunding(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  args: {
    manager: Hex
    mutualId: bigint
    kind: string
    actor?: Hex | null
    amount: bigint
    rewardRate?: bigint | null
    periodFinish?: bigint | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: any
  },
): Promise<void> {
  const { manager, mutualId, kind, actor, amount, rewardRate, periodFinish, event } = args
  await context.db.insert(premiumFunding).values({
    id: `${mutualId.toString()}-${event.block.number}-${event.log.logIndex}`,
    manager,
    mutualId,
    kind,
    actor: actor ?? null,
    amount,
    rewardRate: rewardRate ?? null,
    periodFinish: periodFinish ?? null,
    blockNumber: event.block.number,
    logIndex: event.log.logIndex,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })
}

ponder.on('CommitmentManager:MutualPremiumFunded', async ({ event, context }) => {
  const { mutualId, funder, received, rewardRate, periodFinish } = event.args
  const manager = event.log.address
  // Premium fields (rewardRate / periodFinish / pool) all move on funding.
  await refreshMutual(context, manager, mutualId, event.block)
  await recordPremiumFunding(context, {
    manager,
    mutualId,
    kind: 'funded',
    actor: funder,
    amount: received,
    rewardRate,
    periodFinish,
    event,
  })
})

ponder.on('CommitmentManager:MemberPremiumClaimed', async ({ event, context }) => {
  const { commitmentId, recipient, amount } = event.args
  const manager = event.log.address
  const id = membershipKey(manager, commitmentId)
  const row = await context.db.find(membership, { id })
  // Resolve mutualId from the membership row (event carries only commitmentId),
  // else from the live membership read the rewardBank refresh needs anyway.
  const mem = await readMembership(context, manager, commitmentId)
  const mutualId = row?.mutualId ?? mem.mutualId
  await context.db.insert(premiumClaim).values({
    id: `${manager.toLowerCase()}-${commitmentId.toString()}-${event.block.number}-${event.log.logIndex}`,
    manager,
    mutualId,
    commitmentId,
    recipient,
    amount,
    blockNumber: event.block.number,
    logIndex: event.log.logIndex,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })
  // The member's rewardBank drops on claim — refresh the membership snapshot.
  if (row) {
    await context.db.update(membership, { id }).set({
      premiumSnapshot: mem.premiumSnapshot,
      rewardBank: mem.rewardBank,
      updatedBlock: event.block.number,
    })
  }
  // bankedTotal / premiumPool move on claim — refresh the mutual.
  await refreshMutual(context, manager, mutualId, event.block)
  await recordPoolCredit(context, manager, mutualId, recipient, amount, 'premiumIn', event, commitmentId)
})

ponder.on('CommitmentManager:PremiumReclaimed', async ({ event, context }) => {
  const { mutualId, recipient, unstreamed } = event.args
  const manager = event.log.address
  await refreshMutual(context, manager, mutualId, event.block)
  await recordPremiumFunding(context, {
    manager,
    mutualId,
    kind: 'reclaimed',
    actor: recipient,
    amount: unstreamed,
    event,
  })
  await recordPoolCredit(context, manager, mutualId, recipient, unstreamed, 'premiumIn', event)
})

ponder.on('CommitmentManager:MutualPremiumSwept', async ({ event, context }) => {
  const { mutualId, recipient, amount } = event.args
  const manager = event.log.address
  await refreshMutual(context, manager, mutualId, event.block)
  await recordPremiumFunding(context, {
    manager,
    mutualId,
    kind: 'swept',
    actor: recipient,
    amount,
    event,
  })
  await recordPoolCredit(context, manager, mutualId, recipient, amount, 'premiumIn', event)
})

// ----------------------------------------------------------------------------
// MutualRegistry — annotate the mutual row with cover terms.
// ----------------------------------------------------------------------------

ponder.on('MutualRegistry:MutualRegistered', async ({ event, context }) => {
  const { mutualId, beneficiary, numeraire, targetCapacity, termEnd, perilURI, perilHash } = event.args
  // The registry's `manager()` is immutable; it rebuilds the mutual PK the
  // event does not carry.
  const manager = await context.client.readContract({
    abi: mutualRegistryAbi,
    address: event.log.address,
    functionName: 'manager',
    cache: 'immutable',
  })
  const id = mutualKey(manager, mutualId)
  const annotation = { targetCapacity, termEnd, perilURI, perilHash }
  const row = await context.db.find(mutual, { id })
  if (row) {
    await context.db
      .update(mutual, { id })
      .set({ ...annotation, updatedBlock: event.block.number })
    return
  }
  // Registration observed before MutualCreated (unexpected given createMutual
  // precedes registerMutual, but tolerate log-order surprises): seed the
  // row from the live chain snapshot so the annotation isn't dropped.
  const snap = await readMutualSnapshot(context, manager, mutualId)
  await context.db.insert(mutual).values({
    id,
    manager,
    mutualId,
    arbiter: snap.arbiter,
    numeraire,
    beneficiary,
    challengeWindow: snap.challengeWindow,
    deallocationWindow: snap.deallocationWindow,
    totalShares: snap.totalShares,
    cumulativeLoss: snap.cumulativeLoss,
    active: snap.active,
    terminal: snap.terminal,
    ...annotation,
    createdBlock: event.block.number,
    updatedBlock: event.block.number,
  })
})

// ----------------------------------------------------------------------------
// LinkedMutualPolicy — cover bindings.
// ----------------------------------------------------------------------------

const coverBindingKey = (policy: Hex, bindingId: bigint) =>
  `${policy.toLowerCase()}-${bindingId.toString()}`

ponder.on('LinkedMutualPolicy:CoverBound', async ({ event, context }) => {
  const { bindingId, mutualId, policyholder, notional, expiry, premiumPaid } = event.args
  const policy = event.log.address
  await context.db.insert(coverBinding).values({
    id: coverBindingKey(policy, bindingId),
    policy,
    mutualId,
    bindingId,
    policyholder,
    notional,
    expiry,
    premiumPaid,
    active: true,
    createdBlock: event.block.number,
    createdAt: event.block.timestamp,
    updatedBlock: event.block.number,
  })
})

// StandbyFunded is not indexed: the policy funds through
// `manager.fundMutualPremium`, so the same transaction's MutualPremiumFunded
// already writes the `funded` row and refreshes the mutual.

ponder.on('LinkedMutualPolicy:BindingExpired', async ({ event, context }) => {
  const id = coverBindingKey(event.log.address, event.args.bindingId)
  const row = await context.db.find(coverBinding, { id })
  if (row) {
    await context.db
      .update(coverBinding, { id })
      .set({ active: false, expiredAt: event.block.timestamp, updatedBlock: event.block.number })
  }
})
