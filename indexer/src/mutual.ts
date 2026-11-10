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
 *   2. The optional MutualRegistry (`MutualRegistered`), which annotates an
 *      existing mutual row with its synthetic-mutual cover terms. Gated on the
 *      registry being present in the deployment.
 *
 * Accounting model (see CommitmentManager): `cumulativeLoss` (Lambda) is a
 * 1e18-scaled, monotonic, ≤1e18 cumulative loss FRACTION. A member owes raw units =
 * `forfeitableUnits * (Lambda - lossSnapshot) / 1e18`, settled lazily to the mutual
 * beneficiary. `totalShares` = Σ active members' `creditedValue` and moves only on
 * join/release. We refresh the snapshot (via `getMutual` / `getMembership`)
 * on every event that moves value, so the rows stay current.
 */
import { ponder as typedPonder } from 'ponder:registry'
import {
  commitment,
  coverBinding,
  mutual,
  mutualEvent,
  membership,
  premiumClaim,
  premiumFunding,
} from 'ponder:schema'
import { bumpAccount } from './accountStats'
import { bumpEncumbered, recordFlow, type FlowEvent } from './ledgerFlow'

import { commitmentManagerAbi, mutualRegistryAbi } from './abis'
import { loadDeployments } from './loadDeployments'
import { CHAIN_ID } from './env'

// MutualRegistry and LinkedMutualPolicy are conditionally configured. Keep the
// registration surface permissive across deployment shapes; Ponder validates
// event names against the live config at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ponder = typedPonder as unknown as { on: (name: string, fn: (ctx: any) => Promise<void> | void) => void }

// The MutualRegistry is only present in the Ponder config when the seed has
// deployed it (absent in PROD until launch — see ponder.config.ts). Ponder
// rejects `ponder.on` handlers for unconfigured contracts at startup, so we gate
// the MutualRegistered registration on the same deployment-presence check the
// config uses. Resolving the deployment a second time here (off the same
// broadcast files) keeps this module self-contained.
let MUTUAL_REGISTRY_ENABLED = false
// The LinkedMutualPolicy (cover/standby premium router) is likewise only
// present in the Ponder config when the seed has deployed it. Gate its event
// handlers on the same deployment-presence check the config uses so the build
// doesn't break when the seed ships no policy yet (mirrors MutualRegistry).
let LINKED_POLICY_ENABLED = false
try {
  const d = loadDeployments(CHAIN_ID)
  MUTUAL_REGISTRY_ENABLED = Boolean(d.mutualRegistry)
  LINKED_POLICY_ENABLED = Boolean(d.linkedMutualPolicy)
} catch {
  // No resolvable deployment — leave mutual-registry indexing disabled.
}

type Hex = `0x${string}`
const ZERO = '0x0000000000000000000000000000000000000000' as Hex

const mutualKey = (manager: Hex, mutualId: bigint) => `${manager.toLowerCase()}-${mutualId.toString()}`
const membershipKey = (manager: Hex, commitmentId: bigint) =>
  `${manager.toLowerCase()}-${commitmentId.toString()}`

// ----------------------------------------------------------------------------
// Chain-read helpers — live mutual / membership snapshots from the manager.
// ----------------------------------------------------------------------------

type MutualSnapshot = {
  arbiter: Hex
  numeraire: Hex
  beneficiary: Hex
  valuationAuthority: Hex
  challengeWindow: bigint
  deallocationWindow: bigint
  totalShares: bigint
  cumulativeLoss: bigint
  active: boolean
  terminal: boolean
  // Heterogeneous mode (§H §8 / M4) — appended Mutual fields; all zero for homogeneous mutuals.
  bandAdapter: Hex
  valuationFloorBps: bigint
  valuationCeilBps: bigint
  juniorBps: bigint
}

/**
 * Read a single CommitmentManager view, returning null on any RPC failure so a
 * transient blip leaves the indexed column untouched rather than crashing the
 * handler. `context` is Ponder's untyped runtime context (see the cast note above),
 * so the abi-overload narrowing viem would normally apply is intentionally bypassed.
 */
async function safeManagerRead<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  manager: Hex,
  functionName: string,
  args: readonly unknown[],
): Promise<T | null> {
  try {
    return (await context.client.readContract({
      abi: commitmentManagerAbi,
      address: manager,
      functionName,
      args,
    })) as T
  } catch {
    return null
  }
}

async function readMutualSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  manager: Hex,
  mutualId: bigint,
): Promise<MutualSnapshot | null> {
  return safeManagerRead<MutualSnapshot>(context, manager, 'getMutual', [mutualId])
}

type MembershipSnapshot = {
  mutualId: bigint
  forfeitableUnits: bigint
  settledUnits: bigint
  creditedValue: bigint
  lossSnapshot: bigint
  unbondRequestedAt: bigint
  // §G premium index (reward side) — appended to the GroupMembership struct.
  premiumWeight: bigint
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
): Promise<MutualPremiumSnapshot | null> {
  const r = await safeManagerRead<
    readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint]
  >(context, manager, 'getMutualPremiumState', [mutualId])
  if (!r) return null
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

// Live junior shortfall absorber reserve (funded − drawn) for a heterogeneous mutual; 0 for
// homogeneous mutuals. Returns null on an RPC blip so the caller leaves the column untouched.
async function readMutualJuniorPool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  manager: Hex,
  mutualId: bigint,
): Promise<bigint | null> {
  return safeManagerRead<bigint>(context, manager, 'getMutualJuniorPool', [mutualId])
}

async function readMembership(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  manager: Hex,
  commitmentId: bigint,
): Promise<MembershipSnapshot | null> {
  return safeManagerRead<MembershipSnapshot>(context, manager, 'getMembership', [commitmentId])
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: any
  },
): Promise<void> {
  const { manager, mutualId, commitmentId, kind, numeraireAmount, cumulativeLoss, actor, event } = args
  await context.db.insert(mutualEvent).values({
    id: `${mutualId.toString()}-${event.block.number}-${event.log.logIndex}`,
    manager,
    mutualId,
    commitmentId: commitmentId ?? null,
    kind,
    numeraireAmount: numeraireAmount ?? null,
    cumulativeLoss: cumulativeLoss ?? null,
    actor: actor ?? null,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })
}

/**
 * Append a free-balance credit for one of the premium/junior pool payout paths.
 *
 * All four (`MemberPremiumClaimed`, `PremiumReclaimed`, `MutualPremiumSwept`,
 * `MutualJuniorSwept`) plus the settle-time `MutualJuniorDrawn` run through
 * `LedgerLib.mutualPremiumToFree` / `mutualJuniorToFree`, which credit
 * `free[recipient]` in the mutual's numeraire. None of them emits a `Deposited`,
 * so without this the credit is invisible to the balance history.
 *
 * The funding direction is deliberately NOT recorded: `fundMutualPremium` pulls
 * the numeraire in and credits `free[funder]` (via `_pullNumeraireMeasured`),
 * then immediately debits the same measured amount back out through
 * `freeToMutualPremium` + `freeToMutualJunior`. The split is exact
 * (`premiumPortion = received - juniorShare`), so the funder's free balance nets
 * to zero across the call and there is nothing to log.
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
  kind: 'premiumIn' | 'juniorIn',
  event: FlowEvent,
  commitmentId?: bigint,
): Promise<void> {
  if (amount === 0n) return
  const row = await context.db.find(mutual, { id: mutualKey(manager, mutualId) })
  if (!row) return
  await recordFlow(context.db, event, 'a', {
    user: recipient,
    token: row.numeraire as Hex,
    kind,
    freeDelta: amount,
    commitmentId: commitmentId ?? null,
  })
}

// Re-read the mutual's snapshot and persist the value-moving fields. Leaves the
// row untouched (apart from `extra`) on an RPC blip rather than zeroing it.
async function refreshMutual(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  manager: Hex,
  mutualId: bigint,
  block: bigint,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra: Record<string, any> = {},
): Promise<void> {
  const id = mutualKey(manager, mutualId)
  const row = await context.db.find(mutual, { id })
  if (!row) return
  const [snap, premium, juniorPool] = await Promise.all([
    readMutualSnapshot(context, manager, mutualId),
    readMutualPremiumState(context, manager, mutualId),
    readMutualJuniorPool(context, manager, mutualId),
  ])
  await context.db.update(mutual, { id }).set({
    ...(snap
      ? {
          totalShares: snap.totalShares,
          cumulativeLoss: snap.cumulativeLoss,
          active: snap.active,
          terminal: snap.terminal,
          // Heterogeneous config (immutable once set; NULL bandAdapter ⇒ homogeneous).
          bandAdapter: heteroAdapterOrNull(snap.bandAdapter),
          valuationFloorBps: snap.valuationFloorBps,
          valuationCeilBps: snap.valuationCeilBps,
          juniorBps: snap.juniorBps,
        }
      : {}),
    ...(premium
      ? {
          premiumPerShareStored: premium.premiumPerShareStored,
          activeCover: premium.activeCover,
          settledTotal: premium.settledTotal,
          rewardRate: premium.rewardRate,
          lastUpdate: premium.lastUpdate,
          periodFinish: premium.periodFinish,
          premiumRemainder: premium.premiumRemainder,
          bankedTotal: premium.bankedTotal,
          premiumPool: premium.premiumPool,
        }
      : {}),
    ...(juniorPool != null ? { juniorPool } : {}),
    ...extra,
    updatedBlock: block,
  })
}

// The on-chain Mutual.bandAdapter is the zero address until configureHeterogeneous runs;
// normalize that to NULL so `bandAdapter != null` is the canonical "is heterogeneous" predicate.
function heteroAdapterOrNull(adapter: Hex): Hex | null {
  return adapter && adapter !== '0x0000000000000000000000000000000000000000' ? adapter : null
}

// ----------------------------------------------------------------------------
// CommitmentManager mutual event surface (always bound).
// ----------------------------------------------------------------------------

ponder.on('CommitmentManager:MutualCreated', async ({ event, context }) => {
  const { mutualId, arbiter, numeraire, beneficiary, valuationAuthority } = event.args
  const manager = event.log.address as Hex
  const snap = await readMutualSnapshot(context, manager, mutualId)
  await context.db.insert(mutual).values({
    id: mutualKey(manager, mutualId),
    manager,
    mutualId,
    arbiter,
    numeraire,
    beneficiary,
    valuationAuthority,
    challengeWindow: snap ? snap.challengeWindow : 0n,
    deallocationWindow: snap ? snap.deallocationWindow : 0n,
    totalShares: snap ? snap.totalShares : 0n,
    cumulativeLoss: snap ? snap.cumulativeLoss : 0n,
    active: snap ? snap.active : false,
    terminal: snap ? snap.terminal : false,
    status: 'forming',
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
  const manager = event.log.address as Hex
  const id = mutualKey(manager, mutualId)
  const row = await context.db.find(mutual, { id })
  if (row) {
    await context.db
      .update(mutual, { id })
      .set({ status: 'active', active: true, updatedBlock: event.block.number })
  }
  await recordMutualEvent(context, { manager, mutualId, kind: 'activated', event })
})

ponder.on('CommitmentManager:MemberJoined', async ({ event, context }) => {
  const { mutualId, commitmentId, committer, creditedValue, forfeitableUnits } = event.args
  const manager = event.log.address as Hex
  const mem = await readMembership(context, manager, commitmentId)
  await context.db.insert(membership).values({
    id: membershipKey(manager, commitmentId),
    manager,
    mutualId,
    commitmentId,
    committer,
    forfeitableUnits,
    settledUnits: mem ? mem.settledUnits : 0n,
    creditedValue,
    lossSnapshot: mem ? mem.lossSnapshot : 0n,
    premiumWeight: mem ? mem.premiumWeight : creditedValue,
    premiumSnapshot: mem ? mem.premiumSnapshot : 0n,
    rewardBank: mem ? mem.rewardBank : 0n,
    status: 'active',
    createdBlock: event.block.number,
    updatedBlock: event.block.number,
  })
  // totalShares moves on join — refresh from chain.
  await refreshMutual(context, manager, mutualId, event.block.number)
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
  const { mutualId, lossNumeraire, proposer } = event.args
  const manager = event.log.address as Hex
  await refreshMutual(context, manager, mutualId, event.block.number)
  await recordMutualEvent(context, {
    manager,
    mutualId,
    kind: 'lossInitiated',
    numeraireAmount: lossNumeraire,
    actor: proposer,
    event,
  })
})

ponder.on('CommitmentManager:MutualLossExecuted', async ({ event, context }) => {
  const { mutualId, appliedNumeraire, cumulativeLoss } = event.args
  const manager = event.log.address as Hex
  // The event carries the authoritative post-execution Lambda; pin it directly
  // (refreshMutual also re-reads totalShares/active/terminal).
  await refreshMutual(context, manager, mutualId, event.block.number, { cumulativeLoss })
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
  const { mutualId } = event.args
  const manager = event.log.address as Hex
  await refreshMutual(context, manager, mutualId, event.block.number)
  await recordMutualEvent(context, { manager, mutualId, kind: 'lossCancelled', event })
})

ponder.on('CommitmentManager:MutualLossShortfall', async ({ event, context }) => {
  const { mutualId, shortfallNumeraire } = event.args
  const manager = event.log.address as Hex
  await refreshMutual(context, manager, mutualId, event.block.number)
  await recordMutualEvent(context, {
    manager,
    mutualId,
    kind: 'lossShortfall',
    numeraireAmount: shortfallNumeraire,
    event,
  })
})

ponder.on('CommitmentManager:MemberSettled', async ({ event, context }) => {
  const { mutualId, commitmentId, owedUnits, cumulativeLoss } = event.args
  const manager = event.log.address as Hex
  const id = membershipKey(manager, commitmentId)
  const row = await context.db.find(membership, { id })
  const mem = await readMembership(context, manager, commitmentId)
  if (row) {
    await context.db.update(membership, { id }).set({
      settledUnits: mem ? mem.settledUnits : row.settledUnits + owedUnits,
      lossSnapshot: mem ? mem.lossSnapshot : row.lossSnapshot,
      ...(mem
        ? {
            premiumWeight: mem.premiumWeight,
            premiumSnapshot: mem.premiumSnapshot,
            rewardBank: mem.rewardBank,
          }
        : {}),
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
      // `event.args` is `any` through this module's ponder shim; bind the amount
      // to bigint first so unary minus doesn't widen to number.
      const owed = owedUnits as bigint
      await bumpEncumbered(context.db, c.token as Hex, c.committer as Hex, -owed, event.block.number)
      await recordFlow(context.db, event, 'a', {
        user: c.committer as Hex,
        token: c.token as Hex,
        kind: 'forfeitOut',
        encumberedDelta: -owed,
        commitmentId,
      })
      // The credit lands on the mutual's beneficiary, in the COMMITMENT's token
      // (the stake), not the mutual numeraire — the junior top-up above is the
      // numeraire-denominated leg and is logged separately by MutualJuniorDrawn.
      const g = await context.db.find(mutual, { id: mutualKey(manager, mutualId) })
      if (g) {
        await recordFlow(context.db, event, 'b', {
          user: g.beneficiary as Hex,
          token: c.token as Hex,
          kind: 'forfeitIn',
          freeDelta: owed,
          commitmentId,
        })
      }
    }
  }
  // The settle moves settledTotal, activeCover and the premium accumulator.
  await refreshMutual(context, manager, mutualId, event.block.number)
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
  const { mutualId, commitmentId } = event.args
  const manager = event.log.address as Hex
  const id = membershipKey(manager, commitmentId)
  const row = await context.db.find(membership, { id })
  if (row) {
    // requestMutualExit banks the member's accrued premium — re-read it.
    const mem = await readMembership(context, manager, commitmentId)
    await context.db.update(membership, { id }).set({
      status: 'exitRequested',
      ...(mem
        ? {
            premiumWeight: mem.premiumWeight,
            premiumSnapshot: mem.premiumSnapshot,
            rewardBank: mem.rewardBank,
          }
        : {}),
      updatedBlock: event.block.number,
    })
  }
  await recordMutualEvent(context, { manager, mutualId, commitmentId, kind: 'exitRequested', event })
})

ponder.on('CommitmentManager:MemberReleased', async ({ event, context }) => {
  const { mutualId, commitmentId } = event.args
  const manager = event.log.address as Hex
  const id = membershipKey(manager, commitmentId)
  const row = await context.db.find(membership, { id })
  if (row) {
    // releaseGroupMember auto-pays the member's accrued premium, so rewardBank
    // drops — re-read the membership snapshot to capture it alongside the status.
    const mem = await readMembership(context, manager, commitmentId)
    await context.db.update(membership, { id }).set({
      status: 'released',
      ...(mem
        ? {
            premiumWeight: mem.premiumWeight,
            premiumSnapshot: mem.premiumSnapshot,
            rewardBank: mem.rewardBank,
          }
        : {}),
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
  await refreshMutual(context, manager, mutualId, event.block.number)
  await recordMutualEvent(context, { manager, mutualId, commitmentId, kind: 'memberReleased', event })
})

ponder.on('CommitmentManager:MutualTerminated', async ({ event, context }) => {
  const { mutualId } = event.args
  const manager = event.log.address as Hex
  const id = mutualKey(manager, mutualId)
  const row = await context.db.find(mutual, { id })
  if (row) {
    await context.db
      .update(mutual, { id })
      .set({ status: 'terminated', terminal: true, updatedBlock: event.block.number })
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
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })
}

ponder.on('CommitmentManager:MutualPremiumFunded', async ({ event, context }) => {
  const { mutualId, funder, received, rewardRate, periodFinish } = event.args
  const manager = event.log.address as Hex
  // Premium fields (rewardRate / periodFinish / pool) all move on funding.
  await refreshMutual(context, manager, mutualId, event.block.number)
  await recordPremiumFunding(context, {
    manager,
    mutualId,
    kind: 'funded',
    actor: funder as Hex,
    amount: received as bigint,
    rewardRate: rewardRate as bigint,
    periodFinish: periodFinish as bigint,
    event,
  })
})

ponder.on('CommitmentManager:MemberPremiumClaimed', async ({ event, context }) => {
  const { commitmentId, recipient, amount } = event.args
  const manager = event.log.address as Hex
  const id = membershipKey(manager, commitmentId)
  const row = await context.db.find(membership, { id })
  // Resolve mutualId from the membership row (event carries only commitmentId);
  // fall back to a live read if the row is somehow absent.
  const mem = await readMembership(context, manager, commitmentId)
  const mutualId = row?.mutualId ?? (mem ? mem.mutualId : 0n)
  await context.db.insert(premiumClaim).values({
    id: `${manager.toLowerCase()}-${commitmentId.toString()}-${event.block.number}-${event.log.logIndex}`,
    manager,
    mutualId,
    commitmentId,
    recipient: recipient as Hex,
    amount: amount as bigint,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })
  // The member's rewardBank drops on claim — refresh the membership snapshot.
  if (row) {
    await context.db.update(membership, { id }).set({
      ...(mem
        ? {
            premiumWeight: mem.premiumWeight,
            premiumSnapshot: mem.premiumSnapshot,
            rewardBank: mem.rewardBank,
          }
        : {}),
      updatedBlock: event.block.number,
    })
  }
  // bankedTotal / premiumPool move on claim — refresh the mutual.
  await refreshMutual(context, manager, mutualId, event.block.number)
  await recordPoolCredit(
    context,
    manager,
    mutualId,
    recipient as Hex,
    amount as bigint,
    'premiumIn',
    event,
    commitmentId,
  )
})

ponder.on('CommitmentManager:PremiumReclaimed', async ({ event, context }) => {
  const { mutualId, recipient, unstreamed } = event.args
  const manager = event.log.address as Hex
  await refreshMutual(context, manager, mutualId, event.block.number)
  await recordPremiumFunding(context, {
    manager,
    mutualId,
    kind: 'reclaimed',
    actor: recipient as Hex,
    amount: unstreamed as bigint,
    event,
  })
  await recordPoolCredit(
    context,
    manager,
    mutualId,
    recipient as Hex,
    unstreamed as bigint,
    'premiumIn',
    event,
  )
})

ponder.on('CommitmentManager:MutualPremiumSwept', async ({ event, context }) => {
  const { mutualId, recipient, amount } = event.args
  const manager = event.log.address as Hex
  await refreshMutual(context, manager, mutualId, event.block.number)
  await recordPremiumFunding(context, {
    manager,
    mutualId,
    kind: 'swept',
    actor: recipient as Hex,
    amount: amount as bigint,
    event,
  })
  await recordPoolCredit(context, manager, mutualId, recipient as Hex, amount as bigint, 'premiumIn', event)
})

// ----------------------------------------------------------------------------
// Heterogeneous mode (§H §8 / M4) — band config, down-only remark, junior absorber.
// ----------------------------------------------------------------------------

ponder.on('CommitmentManager:MutualHeterogeneousConfigured', async ({ event, context }) => {
  const { mutualId, bandAdapter, valuationFloorBps, valuationCeilBps, juniorBps } = event.args
  const manager = event.log.address as Hex
  // The band/junior config arrives complete in the event args (immutable after), so set it
  // directly rather than re-reading — more robust than a chain round-trip on an RPC blip.
  const id = mutualKey(manager, mutualId)
  const row = await context.db.find(mutual, { id })
  if (row) {
    await context.db.update(mutual, { id }).set({
      bandAdapter: heteroAdapterOrNull(bandAdapter as Hex),
      valuationFloorBps: valuationFloorBps as bigint,
      valuationCeilBps: valuationCeilBps as bigint,
      juniorBps: juniorBps as bigint,
      updatedBlock: event.block.number,
    })
  }
  await recordMutualEvent(context, {
    manager,
    mutualId,
    kind: 'heteroConfigured',
    actor: bandAdapter as Hex,
    event,
  })
})

ponder.on('CommitmentManager:MemberRemarked', async ({ event, context }) => {
  const { commitmentId, newWeight } = event.args
  const manager = event.log.address as Hex
  const id = membershipKey(manager, commitmentId)
  const row = await context.db.find(membership, { id })
  const mem = await readMembership(context, manager, commitmentId)
  if (row) {
    await context.db.update(membership, { id }).set({
      // premiumWeight ratcheted down; premiumSnapshot/rewardBank were poked-and-banked at the
      // old effCover before the shrink, so pull the fresh values when the live read succeeds.
      premiumWeight: mem ? mem.premiumWeight : (newWeight as bigint),
      ...(mem ? { premiumSnapshot: mem.premiumSnapshot, rewardBank: mem.rewardBank } : {}),
      updatedBlock: event.block.number,
    })
  }
  const mutualId = row?.mutualId ?? (mem ? mem.mutualId : 0n)
  // activeCover shrank by the deliverable-cover delta — refresh the mutual denominator.
  if (mutualId !== 0n) await refreshMutual(context, manager, mutualId, event.block.number)
  await recordMutualEvent(context, {
    manager,
    mutualId,
    commitmentId,
    kind: 'remarked',
    numeraireAmount: newWeight as bigint, // the new (lower) premium weight
    event,
  })
})

ponder.on('CommitmentManager:MutualJuniorFunded', async ({ event, context }) => {
  const { mutualId, funder, amount } = event.args
  const manager = event.log.address as Hex
  await refreshMutual(context, manager, mutualId, event.block.number) // juniorPool up
  await recordMutualEvent(context, {
    manager,
    mutualId,
    kind: 'juniorFunded',
    actor: funder as Hex,
    numeraireAmount: amount as bigint,
    event,
  })
})

ponder.on('CommitmentManager:MutualJuniorDrawn', async ({ event, context }) => {
  const { commitmentId, amount } = event.args
  const manager = event.log.address as Hex
  const id = membershipKey(manager, commitmentId)
  const row = await context.db.find(membership, { id })
  const mutualId = row?.mutualId ?? (await readMembership(context, manager, commitmentId))?.mutualId ?? 0n
  if (mutualId !== 0n) await refreshMutual(context, manager, mutualId, event.block.number) // juniorPool down
  await recordMutualEvent(context, {
    manager,
    mutualId,
    commitmentId,
    kind: 'juniorDrawn',
    numeraireAmount: amount as bigint,
    event,
  })
  // The draw tops up the loss beneficiary's recovery, so the credit lands on
  // the MUTUAL's beneficiary — the event names only the member commitment.
  if (mutualId !== 0n) {
    const g = await context.db.find(mutual, { id: mutualKey(manager, mutualId) })
    if (g) {
      await recordPoolCredit(
        context,
        manager,
        mutualId,
        g.beneficiary as Hex,
        amount as bigint,
        'juniorIn',
        event,
        commitmentId,
      )
    }
  }
})

ponder.on('CommitmentManager:MutualJuniorSwept', async ({ event, context }) => {
  const { mutualId, recipient, amount } = event.args
  const manager = event.log.address as Hex
  await refreshMutual(context, manager, mutualId, event.block.number)
  await recordMutualEvent(context, {
    manager,
    mutualId,
    kind: 'juniorSwept',
    actor: recipient as Hex,
    numeraireAmount: amount as bigint,
    event,
  })
  await recordPoolCredit(context, manager, mutualId, recipient as Hex, amount as bigint, 'juniorIn', event)
})

// ----------------------------------------------------------------------------
// MutualRegistry (optional) — annotate the mutual row with cover terms.
// ----------------------------------------------------------------------------

// Resolve and cache the immutable `manager()` a registry/policy reports. The
// binding never changes, so we read it once per address and reuse it to
// reconstruct mutual PKs `${manager}-${mutualId}` that the events don't carry.
// Returns null on an RPC blip without poisoning the cache.
async function resolveManagerCached(
  cache: Map<string, Hex>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  address: Hex,
  abi: readonly unknown[],
): Promise<Hex | null> {
  const key = address.toLowerCase()
  const cached = cache.get(key)
  if (cached) return cached
  try {
    const m = (await context.client.readContract({ abi, address, functionName: 'manager' })) as Hex
    cache.set(key, m)
    return m
  } catch {
    return null
  }
}

// The CommitmentManager a MutualRegistry's mutuals live under.
const managerByRegistry = new Map<string, Hex>()
async function resolveMutualManager(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  registry: Hex,
): Promise<Hex | null> {
  return resolveManagerCached(managerByRegistry, context, registry, mutualRegistryAbi)
}

if (MUTUAL_REGISTRY_ENABLED) {
  ponder.on('MutualRegistry:MutualRegistered', async ({ event, context }) => {
    const { mutualId, beneficiary, numeraire, targetCapacity, termEnd, perilURI, perilHash } =
      event.args
    const registry = event.log.address as Hex
    const manager = await resolveMutualManager(context, registry)
    if (!manager) return
    const id = mutualKey(manager, mutualId)
    const annotation = {
      targetCapacity: targetCapacity as bigint,
      termEnd: termEnd as bigint,
      perilURI: perilURI as string,
      perilHash: perilHash as string,
    }
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
      arbiter: snap?.arbiter ?? ZERO,
      numeraire,
      beneficiary,
      valuationAuthority: snap?.valuationAuthority ?? ZERO,
      challengeWindow: snap ? snap.challengeWindow : 0n,
      deallocationWindow: snap ? snap.deallocationWindow : 0n,
      totalShares: snap ? snap.totalShares : 0n,
      cumulativeLoss: snap ? snap.cumulativeLoss : 0n,
      active: snap ? snap.active : false,
      terminal: snap ? snap.terminal : false,
      status: snap?.active ? 'active' : 'forming',
      ...annotation,
      createdBlock: event.block.number,
      updatedBlock: event.block.number,
    })
  })
}

// ----------------------------------------------------------------------------
// LinkedMutualPolicy (optional) — cover bindings.
// ----------------------------------------------------------------------------

const coverBindingKey = (policy: Hex, bindingId: bigint) =>
  `${policy.toLowerCase()}-${bindingId.toString()}`

if (LINKED_POLICY_ENABLED) {
  ponder.on('LinkedMutualPolicy:CoverBound', async ({ event, context }) => {
    const { bindingId, mutualId, policyholder, notional, expiry, premiumPaid } = event.args
    const policy = event.log.address as Hex
    await context.db.insert(coverBinding).values({
      id: coverBindingKey(policy, bindingId as bigint),
      policy,
      mutualId: mutualId as bigint,
      bindingId: bindingId as bigint,
      policyholder: policyholder as Hex,
      notional: notional as bigint,
      expiry: expiry as bigint,
      premiumPaid: premiumPaid as bigint,
      active: true,
      createdBlock: event.block.number,
      updatedBlock: event.block.number,
    })
  })

  // StandbyFunded is not indexed: the policy funds through
  // `manager.fundMutualPremium`, so the same transaction's MutualPremiumFunded
  // already writes the `funded` row and refreshes the mutual.

  ponder.on('LinkedMutualPolicy:BindingExpired', async ({ event, context }) => {
    const { bindingId } = event.args
    const policy = event.log.address as Hex
    const id = coverBindingKey(policy, bindingId as bigint)
    const row = await context.db.find(coverBinding, { id })
    if (row) {
      await context.db
        .update(coverBinding, { id })
        .set({ active: false, updatedBlock: event.block.number })
    }
  })
}
