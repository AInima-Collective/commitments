import { ponder } from 'ponder:registry'
import {
  commitment,
  contribution,
  distribution,
  donation,
  agreement,
  agreementProposal,
  agreementSettlement,
  fanInProvider,
  fanOutOutflow,
  ledgerFlow,
  meshDenomWeight,
  meshNode,
  operator,
  registryMembership,
  service,
  serviceOperator,
  forfeitEvent,
  stakeFlow,
  strategyBinding,
  strategyCreditFlow,
  strategyHookFailure,
  vault,
} from 'ponder:schema'
import { fetchMetadata } from './metadataFetcher'
import { bumpAccount } from './accountStats'
import { attributedCommitment, bumpEncumbered, recordFlow } from './ledgerFlow'
// Side-effect import: registers Governor + GovernorFactory handlers.
import './governance'
// Side-effect import: registers CommitmentManager mutual event handlers +
// the optional MutualRegistry handler (Mutual / pooled severally-shared loss).
import './mutual'
// Side-effect import: registers the ERC-8004 AgentIdentityRegistry handlers
// (agent identity badges — issue #33).
import './agents'
// Side-effect import: normalized mechanism case + event handlers.
import './arbitrationMechanisms'
// Side-effect import: registers the underwritten-agent-vault coverage handlers
// (skim strategy fee ledger + conduit premium funding / vault↔mutual link).
import './vaultCover'

// v2 has no `manager.vault()` — the manager custodies vault *shares* as ordinary
// backing tokens. The denormalized `commitment.vault` column instead mirrors the
// backing `token` when that token IS a CommitmentsVault share. We recognize vault
// shares by checking the indexed `vault` table (populated by the VaultFactory
// VaultDeployed handler, which always processes before any commitment that backs
// against it, by block/log ordering). A process-level set short-circuits the db
// lookup once a vault address has been seen.
//
// Loose context typing: ponder's full handler-context type is a deep generic over
// the chain/contracts list and resists narrow shaping. The shape we use is
// stable: `client.readContract` + `contracts.<Name>.abi` + `db.find`.
const knownVaults = new Set<string>()
async function resolveTokenVault(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  token: `0x${string}`,
): Promise<`0x${string}` | null> {
  const key = token.toLowerCase()
  if (knownVaults.has(key)) return token
  const row = await context.db.find(vault, { address: token })
  if (row) {
    knownVaults.add(key)
    return token
  }
  return null
}

// ledgerPosition tracks the per-(token, user) encumbered balance only (see the
// schema comment for why `free` is not derivable from events). All encumbered
// mutations funnel through `bumpEncumbered`, which now lives in ./ledgerFlow so
// the mutual handlers can share it alongside the flow log.

// Registry → CommitmentManager binding is also set at initialize() and never
// changes. OperatorRegistry events arrive with `event.log.address` = registry,
// but to find the parent commitment row (composite key {manager, id}) we need
// the bound manager. One on-chain read per fresh registry; cached afterward.
const managerByRegistry = new Map<string, `0x${string}`>()
async function resolveRegistryManager(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  registry: `0x${string}`,
): Promise<`0x${string}` | null> {
  const key = registry.toLowerCase()
  const cached = managerByRegistry.get(key)
  if (cached) return cached
  try {
    const m = (await context.client.readContract({
      abi: context.contracts.OperatorRegistry.abi,
      address: registry,
      functionName: 'commitmentManager',
    })) as `0x${string}`
    managerByRegistry.set(key, m)
    return m
  } catch {
    return null
  }
}

// Indexer Improvements #1: derive `services` tag list from operator metadataContent.
// Canonical operator.v1 schema has `services: string[]` (see metadata-conventions.md +
// integration.test.ts:54-69). Anything else returns null → schema defaults to no tags.
function extractServices(content: unknown): string[] | null {
  if (!content || typeof content !== 'object') return null
  const candidate = (content as { services?: unknown }).services
  if (!Array.isArray(candidate)) return null
  const out: string[] = []
  for (const item of candidate) if (typeof item === 'string') out.push(item)
  return out
}

// ============================================================================
// Helpers
// ============================================================================

function convictionOf(amount: bigint, maxPenaltyBps: number): bigint {
  return (amount * BigInt(maxPenaltyBps)) / 10_000n
}

// bumpAccount lives in ./accountStats so the mutual handlers can share it
// without a circular import.

// ============================================================================
// CommitmentManager
// ============================================================================

ponder.on('CommitmentManager:CommitmentCreated', async ({ event, context }) => {
  const { commitmentId, committer, arbiter, counterparty, token, adapter, amount, maxPenaltyBps, expiresAt, metadataURI, metadataHash } =
    event.args
  const md = await fetchMetadata(metadataURI, metadataHash)
  // Denormalized vault column = the backing token when it's a CommitmentsVault
  // share, else null (plain-ERC-20 backing). No yieldShareBps read — distribution
  // strategies replaced built-in yield routing (see CommitmentBoundToStrategy).
  const vaultAddr = await resolveTokenVault(context, token)

  await context.db.insert(commitment).values({
    id: commitmentId,
    committer,
    arbiter,
    counterparty,
    token,
    adapter,
    amount,
    maxPenaltyBps: Number(maxPenaltyBps),
    status: 'active',
    // expiresAt now arrives directly on the event (uint64 unix seconds; 0 = none).
    expiresAt,
    createdBlock: event.block.number,
    createdAt: event.block.timestamp,
    createdTx: event.transaction.hash,
    updatedBlock: event.block.number,
    metadataURI: md.uri,
    metadataHash: md.hash,
    metadataStatus: md.status,
    metadataContent: md.content,
    metadataContentRaw: md.contentRaw,
    vault: vaultAddr,
    manager: event.log.address,
  })

  const conviction = convictionOf(amount, Number(maxPenaltyBps))
  await bumpAccount(context.db, committer, {
    commitmentsOut: 1,
    convictionOut: conviction,
    activeDelta: 1,
  })
  await bumpAccount(context.db, counterparty, {
    commitmentsIn: 1,
    convictionIn: conviction,
  })
})

ponder.on('CommitmentManager:CommitmentReleased', async ({ event, context }) => {
  const { commitmentId } = event.args
  const c = await context.db.find(commitment, { id: commitmentId, manager: event.log.address })
  if (!c) return
  await context.db.update(commitment, { id: commitmentId, manager: event.log.address }).set({
    status: 'released',
    // finalizeUnbond clears the per-commitment unbond fields on chain; mirror
    // here so terminal rows don't carry stale unbond timestamps.
    unbondInitiatedAt: null,
    unbondMaturesAt: null,
    updatedBlock: event.block.number,
  })
  await bumpAccount(context.db, c.committer, { activeDelta: -1, releasedDelta: 1 })
})

// finalizeUnbond closes via the same library helper as releaseCommitment but
// the public entry point emits a separate event (`CommitmentFinalized`). Mirror
// it to the same terminal state so the table flips to `released` and the unbond
// timestamps clear.
ponder.on('CommitmentManager:CommitmentFinalized', async ({ event, context }) => {
  const { commitmentId } = event.args
  const c = await context.db.find(commitment, { id: commitmentId, manager: event.log.address })
  if (!c) return
  await context.db.update(commitment, { id: commitmentId, manager: event.log.address }).set({
    status: 'released',
    unbondInitiatedAt: null,
    unbondMaturesAt: null,
    updatedBlock: event.block.number,
  })
  await bumpAccount(context.db, c.committer, { activeDelta: -1, releasedDelta: 1 })
})

// Depositor self-release lifecycle. requestUnbond → CommitmentUnbondRequested,
// then either cancelUnbond → CommitmentUnbondCancelled (status reverts) or
// finalizeUnbond → CommitmentFinalized (handled just above).
//
// Forfeit precedence: if a forfeit is already pending we keep `forfeitPending` as the
// surface-visible status — the unbond clock still ticks but isn't the primary
// concern. ForfeitCancelled (below) restores 'unbonding' iff unbondInitiatedAt
// is still populated, so the depositor doesn't lose their place in the queue.
ponder.on('CommitmentManager:CommitmentUnbondRequested', async ({ event, context }) => {
  const { commitmentId, maturesAt } = event.args
  const c = await context.db.find(commitment, { id: commitmentId, manager: event.log.address })
  if (!c) return
  if (c.status === 'released' || c.status === 'forfeited' || c.status === 'expired') return
  const newStatus = c.status === 'forfeitPending' ? c.status : 'unbonding'
  await context.db.update(commitment, { id: commitmentId, manager: event.log.address }).set({
    status: newStatus,
    unbondInitiatedAt: event.block.timestamp,
    unbondMaturesAt: maturesAt,
    updatedBlock: event.block.number,
  })
})

ponder.on('CommitmentManager:CommitmentUnbondCancelled', async ({ event, context }) => {
  const { commitmentId } = event.args
  const c = await context.db.find(commitment, { id: commitmentId, manager: event.log.address })
  if (!c) return
  const newStatus = c.status === 'unbonding' ? 'active' : c.status
  await context.db.update(commitment, { id: commitmentId, manager: event.log.address }).set({
    status: newStatus,
    unbondInitiatedAt: null,
    unbondMaturesAt: null,
    updatedBlock: event.block.number,
  })
})

ponder.on('CommitmentManager:CommitmentExpired', async ({ event, context }) => {
  const { commitmentId } = event.args
  const c = await context.db.find(commitment, { id: commitmentId, manager: event.log.address })
  if (!c) return
  await context.db.update(commitment, { id: commitmentId, manager: event.log.address }).set({
    status: 'expired',
    updatedBlock: event.block.number,
  })
  await bumpAccount(context.db, c.committer, { activeDelta: -1, releasedDelta: 1 })
})

ponder.on('CommitmentManager:ForfeitInitiated', async ({ event, context }) => {
  const { commitmentId, penaltyBps, challengeWindow } = event.args
  const c = await context.db.find(commitment, { id: commitmentId, manager: event.log.address })
  const challengeEnd = event.block.timestamp + challengeWindow
  await context.db.update(commitment, { id: commitmentId, manager: event.log.address }).set({
    status: 'forfeitPending',
    forfeitPenaltyBps: Number(penaltyBps),
    forfeitInitiatedAt: event.block.timestamp,
    forfeitChallengeEnd: challengeEnd,
    updatedBlock: event.block.number,
  })
  if (c) {
    await context.db.insert(forfeitEvent).values({
      id: `${event.log.address}-${commitmentId}-${event.block.number}-${event.log.logIndex}`,
      commitmentId,
      kind: 'initiated',
      penaltyBps: Number(penaltyBps),
      challengeWindow,
      challengeEnd,
      proposalInitiatedAt: event.block.timestamp,
      sharesToForfeit: null,
      counterparty: c.counterparty,
      committer: c.committer,
      arbiter: c.arbiter,
      vault: c.vault ?? null,
      manager: event.log.address,
      blockNumber: event.block.number,
      logIndex: event.log.logIndex,
      blockTimestamp: event.block.timestamp,
      txHash: event.transaction.hash,
    })
  }
})

ponder.on('CommitmentManager:ForfeitExecuted', async ({ event, context }) => {
  const { commitmentId, unitsForfeited, counterparty } = event.args
  const c = await context.db.find(commitment, { id: commitmentId, manager: event.log.address })
  if (!c) return
  await context.db.update(commitment, { id: commitmentId, manager: event.log.address }).set({
    status: 'forfeited',
    forfeitSharesExecuted: unitsForfeited,
    forfeitCounterparty: counterparty,
    updatedBlock: event.block.number,
  })
  // forfeitTransfer moved encumbered[committer] -> free[counterparty]; the ledger
  // lib emits no encumbrance event for this path, so adjust here. (The
  // counterparty's free balance is read live, not indexed.)
  await bumpEncumbered(context.db, c.token, c.committer, -unitsForfeited, event.block.number)
  // The value crosses between two accounts, so this is the one movement that
  // shows up as a step DOWN on one portfolio and a step UP on another.
  await recordFlow(context.db, event, 'a', {
    user: c.committer,
    token: c.token,
    kind: 'forfeitOut',
    encumberedDelta: -unitsForfeited,
    commitmentId,
  })
  await recordFlow(context.db, event, 'b', {
    user: counterparty,
    token: c.token,
    kind: 'forfeitIn',
    freeDelta: unitsForfeited,
    commitmentId,
  })
  await context.db.insert(forfeitEvent).values({
    id: `${event.log.address}-${commitmentId}-${event.block.number}-${event.log.logIndex}`,
    commitmentId,
    kind: 'executed',
    penaltyBps: c.forfeitPenaltyBps ?? null,
    challengeWindow:
      c.forfeitChallengeEnd && c.forfeitInitiatedAt
        ? c.forfeitChallengeEnd - c.forfeitInitiatedAt
        : null,
    challengeEnd: c.forfeitChallengeEnd ?? null,
    proposalInitiatedAt: c.forfeitInitiatedAt ?? event.block.timestamp,
    sharesToForfeit: unitsForfeited,
    counterparty,
    committer: c.committer,
    arbiter: c.arbiter,
    vault: c.vault ?? null,
    manager: event.log.address,
    blockNumber: event.block.number,
    logIndex: event.log.logIndex,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })
  await bumpAccount(context.db, c.committer, { activeDelta: -1, forfeitedDelta: 1 })
})

ponder.on('CommitmentManager:ForfeitCancelled', async ({ event, context }) => {
  const { commitmentId } = event.args
  const c = await context.db.find(commitment, { id: commitmentId, manager: event.log.address })
  if (!c) return
  // If the depositor was already unbonding when the forfeit hit, restore that
  // status — the unbond clock kept ticking through the challenge window.
  const restoredStatus = c.unbondInitiatedAt && c.unbondInitiatedAt > 0n ? 'unbonding' : 'active'
  await context.db.update(commitment, { id: commitmentId, manager: event.log.address }).set({
    status: restoredStatus,
    forfeitPenaltyBps: null,
    forfeitInitiatedAt: null,
    forfeitChallengeEnd: null,
    updatedBlock: event.block.number,
  })
  await context.db.insert(forfeitEvent).values({
    id: `${event.log.address}-${commitmentId}-${event.block.number}-${event.log.logIndex}`,
    commitmentId,
    kind: 'cancelled',
    penaltyBps: c.forfeitPenaltyBps ?? null,
    challengeWindow:
      c.forfeitChallengeEnd && c.forfeitInitiatedAt
        ? c.forfeitChallengeEnd - c.forfeitInitiatedAt
        : null,
    challengeEnd: c.forfeitChallengeEnd ?? null,
    proposalInitiatedAt: c.forfeitInitiatedAt ?? event.block.timestamp,
    sharesToForfeit: null,
    counterparty: c.counterparty,
    committer: c.committer,
    arbiter: c.arbiter,
    vault: c.vault ?? null,
    manager: event.log.address,
    blockNumber: event.block.number,
    logIndex: event.log.logIndex,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })
})

// Phase 20.8: permissionless force-cancel after challenge window + 14 days.
// Mirrors ForfeitCancelled state-wise but stamped as 'cancelledStale' in the log.
ponder.on('CommitmentManager:ForfeitCancelledStale', async ({ event, context }) => {
  const { commitmentId } = event.args
  const c = await context.db.find(commitment, { id: commitmentId, manager: event.log.address })
  if (!c) return
  const restoredStatus = c.unbondInitiatedAt && c.unbondInitiatedAt > 0n ? 'unbonding' : 'active'
  await context.db.update(commitment, { id: commitmentId, manager: event.log.address }).set({
    status: restoredStatus,
    forfeitPenaltyBps: null,
    forfeitInitiatedAt: null,
    forfeitChallengeEnd: null,
    updatedBlock: event.block.number,
  })
  await context.db.insert(forfeitEvent).values({
    id: `${event.log.address}-${commitmentId}-${event.block.number}-${event.log.logIndex}`,
    commitmentId,
    kind: 'cancelledStale',
    penaltyBps: c.forfeitPenaltyBps ?? null,
    challengeWindow:
      c.forfeitChallengeEnd && c.forfeitInitiatedAt
        ? c.forfeitChallengeEnd - c.forfeitInitiatedAt
        : null,
    challengeEnd: c.forfeitChallengeEnd ?? null,
    proposalInitiatedAt: c.forfeitInitiatedAt ?? event.block.timestamp,
    sharesToForfeit: null,
    counterparty: c.counterparty,
    committer: c.committer,
    arbiter: c.arbiter,
    vault: c.vault ?? null,
    manager: event.log.address,
    blockNumber: event.block.number,
    logIndex: event.log.logIndex,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })
})

// ----------------------------------------------------------------------------
// Agreement lifecycle
// ----------------------------------------------------------------------------

ponder.on('CommitmentManager:AgreementProposed', async ({ event, context }) => {
  const { proposalId, proposer, acceptor, uri, contentHash } = event.args
  const md = await fetchMetadata(uri, contentHash)
  await context.db.insert(agreementProposal).values({
    id: proposalId,
    manager: event.log.address,
    proposer,
    acceptor,
    status: 'open',
    proposedBlock: event.block.number,
    resolvedBlock: null,
    metadataURI: md.uri,
    metadataHash: md.hash,
    metadataStatus: md.status,
    metadataContent: md.content,
    metadataContentRaw: md.contentRaw,
  })
})

// Per-leg economic terms arrive on a companion event emitted in the same tx,
// right after AgreementProposed (AgreementLib.sol). Update the row the proposed
// handler just inserted — this is the indexed replacement for the removed
// getAgreementProposal view.
ponder.on('CommitmentManager:AgreementProposedTerms', async ({ event, context }) => {
  const {
    proposalId,
    arbiter,
    proposerToken,
    proposerAdapter,
    proposerAmount,
    proposerMaxPenaltyBps,
    acceptorToken,
    acceptorAdapter,
    acceptorAmount,
    acceptorMaxPenaltyBps,
    challengeWindow,
    expiresAt,
    maxFlowProposerToAcceptor,
    maxFlowAcceptorToProposer,
  } = event.args
  await context.db.update(agreementProposal, { id: proposalId, manager: event.log.address }).set({
    arbiter,
    proposerToken,
    proposerAdapter,
    proposerAmount,
    proposerMaxPenaltyBps,
    acceptorToken,
    acceptorAdapter,
    acceptorAmount,
    acceptorMaxPenaltyBps,
    challengeWindow: BigInt(challengeWindow),
    expiresAt: BigInt(expiresAt),
    maxFlowProposerToAcceptor,
    maxFlowAcceptorToProposer,
  })
})

ponder.on('CommitmentManager:AgreementAccepted', async ({ event, context }) => {
  const { agreementId, proposalId, commitmentIdA, commitmentIdB, uri, contentHash } = event.args
  // AgreementAccepted carries mirrored URI/hash from the proposal and its
  // originating proposalId (indexed). fetchMetadata on the mirrored values is
  // deterministic — same bytes as the proposal fetch, same result.
  const md = await fetchMetadata(uri, contentHash)

  // Flip the originating proposal to accepted and link the agreement it became.
  await context.db.update(agreementProposal, { id: proposalId, manager: event.log.address }).set({
    status: 'accepted',
    resolvedBlock: event.block.number,
    agreementId,
  })

  // v2.5: caps are NOT in the AgreementProposed event (intentional ABI stability).
  // Read getAgreementSettlement once at accept time. Defaults to (0,0,0,0) for opt-out.
  let caps: { maxPToA: bigint; maxAToP: bigint } = { maxPToA: 0n, maxAToP: 0n }
  try {
    const result = await context.client.readContract({
      abi: context.contracts.CommitmentManager.abi,
      address: event.log.address,
      functionName: 'getAgreementSettlement',
      args: [agreementId],
    })
    // Returns (uint128 maxPToA, uint128 maxAToP, uint128 cumulPToA, uint128 cumulAToP).
    const tuple = result as readonly [bigint, bigint, bigint, bigint]
    caps = { maxPToA: tuple[0], maxAToP: tuple[1] }
  } catch {
    // Defensive: fall back to zeros — agreement still inserts; caps backfillable on resync.
  }

  await context.db.insert(agreement).values({
    id: agreementId,
    manager: event.log.address,
    commitmentIdA,
    commitmentIdB,
    status: 'active',
    acceptedBlock: event.block.number,
    updatedBlock: event.block.number,
    metadataURI: md.uri,
    metadataHash: md.hash,
    metadataStatus: md.status,
    metadataContent: md.content,
    metadataContentRaw: md.contentRaw,
    maxFlowProposerToAcceptor: caps.maxPToA,
    maxFlowAcceptorToProposer: caps.maxAToP,
    cumulativeProposerToAcceptor: 0n,
    cumulativeAcceptorToProposer: 0n,
  })
})

// v2.5: per-settle event log + cumulative-counter bump on the parent agreement.
// Also re-reads commitment.amount on both sides since settle shifted them.
ponder.on('CommitmentManager:AgreementSettled', async ({ event, context }) => {
  const { agreementId, fromProposer, units, cumulativeProposerToAcceptor, cumulativeAcceptorToProposer, evidenceHash } = event.args
  // `units` is the v2 name for the per-settle transfer amount; the schema column
  // is still called `shares` (lexical-only difference — same backing-token units).
  const shares = units

  // Both legs, fetched once: the vault lookup and the ledger movement below
  // need the same two rows. Either parent's vault will do — both sides share
  // one vault under the single-vault manager design.
  const entRow = await context.db.find(agreement, { id: agreementId, manager: event.log.address })
  const parentA = entRow
    ? await context.db.find(commitment, { id: entRow.commitmentIdA, manager: event.log.address })
    : null
  const parentB = entRow
    ? await context.db.find(commitment, { id: entRow.commitmentIdB, manager: event.log.address })
    : null
  const settlementVault: `0x${string}` | null = parentA?.vault ?? parentB?.vault ?? null

  await context.db.insert(agreementSettlement).values({
    id: `${agreementId}-${event.block.number}-${event.log.logIndex}`,
    agreementId,
    fromProposer,
    shares,
    cumulativeAfterPToA: cumulativeProposerToAcceptor,
    cumulativeAfterAToP: cumulativeAcceptorToProposer,
    evidenceHash,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    vault: settlementVault,
    manager: event.log.address,
  })

  await context.db.update(agreement, { id: agreementId, manager: event.log.address }).set({
    cumulativeProposerToAcceptor,
    cumulativeAcceptorToProposer,
    updatedBlock: event.block.number,
  })

  // Ledger movement. `AgreementLib._settleApplyShift` calls
  // `LedgerLib.forfeitTransfer`, which debits the PAYER's encumbered balance
  // and credits the RECEIVER's free balance — and emits no encumbrance event of
  // its own, so this handler is the only place either side can be observed.
  // Missing it left `ledgerPosition` permanently overstating every payer's
  // encumbered balance, the same defect `MemberSettled` had.
  //
  // Both legs are denominated in the PAYER's token even when the two sides
  // committed different assets: settlement shifts the payer leg's collateral,
  // so the receiver is credited in that token, not in their own.
  if (parentA && parentB) {
    const [payer, payerCid] = fromProposer
      ? ([parentA, entRow!.commitmentIdA] as const)
      : ([parentB, entRow!.commitmentIdB] as const)
    const [receiver, receiverCid] = fromProposer
      ? ([parentB, entRow!.commitmentIdB] as const)
      : ([parentA, entRow!.commitmentIdA] as const)
    const token = payer.token as `0x${string}`

    await bumpEncumbered(context.db, token, payer.committer as `0x${string}`, -units, event.block.number)
    await recordFlow(context.db, event, 'a', {
      user: payer.committer as `0x${string}`,
      token,
      kind: 'settleOut',
      encumberedDelta: -units,
      commitmentId: payerCid,
    })
    await recordFlow(context.db, event, 'b', {
      user: receiver.committer as `0x${string}`,
      token,
      kind: 'settleIn',
      freeDelta: units,
      commitmentId: receiverCid,
    })
  }

  // Re-read commitment.amount on both sides — settle shifted shares between them.
  if (entRow) {
    for (const cid of [entRow.commitmentIdA, entRow.commitmentIdB]) {
      try {
        const c = await context.client.readContract({
          abi: context.contracts.CommitmentManager.abi,
          address: event.log.address,
          functionName: 'getCommitment',
          args: [cid],
        })
        const newAmount = (c as { amount: bigint }).amount
        await context.db.update(commitment, { id: cid, manager: event.log.address }).set({
          amount: newAmount,
          updatedBlock: event.block.number,
        })
      } catch {
        // Defensive: skip update if read fails. Indexer will be self-healing on next resync.
      }
    }
  }
})

// v2.5 Part B: depositor opted commitment in to third-party contributions (auto-fired
// on the depositor's first self-contribution).
ponder.on('CommitmentManager:ContributionsEnabled', async ({ event, context }) => {
  const { commitmentId } = event.args
  await context.db.update(commitment, { id: commitmentId, manager: event.log.address }).set({
    acceptsContributions: true,
    updatedBlock: event.block.number,
  })
})

// v2.5 Part B: per-contribution event log + commitment.amount bump.
ponder.on('CommitmentManager:EncumbranceContributed', async ({ event, context }) => {
  const { commitmentId, contributor, receiver, units } = event.args
  const shares = units // schema column is `shares` (lexical only — raw token units)
  const parent = await context.db.find(commitment, { id: commitmentId, manager: event.log.address })

  await context.db.insert(contribution).values({
    id: `${commitmentId}-${event.block.number}-${event.log.logIndex}`,
    commitmentId,
    contributor,
    receiver,
    shares,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    vault: parent?.vault ?? null,
    manager: event.log.address,
  })

  // attributeEncumbrance moved free[contributor] -> encumbered[receiver] without
  // emitting EncumbranceIncreased/Decreased, so credit the receiver's encumbered
  // position here. `receiver` is the commitment's committer; the token comes from
  // the parent commitment row.
  if (parent) {
    await bumpEncumbered(context.db, parent.token, receiver, units, event.block.number)
    // Two legs against two different users: the contributor's free drops and
    // the receiver's encumbered rises. A self-contribution writes both legs
    // against the same address, which folds to the same free->encumbered move
    // an ordinary `encumber` would produce.
    await recordFlow(context.db, event, 'a', {
      user: contributor,
      token: parent.token,
      kind: 'contributeOut',
      freeDelta: -units,
      commitmentId,
    })
    await recordFlow(context.db, event, 'b', {
      user: receiver,
      token: parent.token,
      kind: 'contributeIn',
      encumberedDelta: units,
      commitmentId,
    })
  }

  // Re-read commitment.amount — contribution grew it by `shares`.
  try {
    const c = await context.client.readContract({
      abi: context.contracts.CommitmentManager.abi,
      address: event.log.address,
      functionName: 'getCommitment',
      args: [commitmentId],
    })
    const newAmount = (c as { amount: bigint }).amount
    await context.db.update(commitment, { id: commitmentId, manager: event.log.address }).set({
      amount: newAmount,
      updatedBlock: event.block.number,
    })
  } catch {
    // Defensive: leave amount stale if read fails.
  }
})

ponder.on('CommitmentManager:AgreementProposalCancelled', async ({ event, context }) => {
  const { proposalId } = event.args
  await context.db.update(agreementProposal, { id: proposalId, manager: event.log.address }).set({
    status: 'cancelled',
    resolvedBlock: event.block.number,
  })
})

ponder.on('CommitmentManager:AgreementProposalExpiredCancelled', async ({ event, context }) => {
  const { proposalId } = event.args
  await context.db.update(agreementProposal, { id: proposalId, manager: event.log.address }).set({
    status: 'expired',
    resolvedBlock: event.block.number,
  })
})

ponder.on('CommitmentManager:AgreementForfeited', async ({ event, context }) => {
  const { agreementId } = event.args
  await context.db.update(agreement, { id: agreementId, manager: event.log.address }).set({
    status: 'forfeited',
    updatedBlock: event.block.number,
  })
})

ponder.on('CommitmentManager:AgreementReleased', async ({ event, context }) => {
  const { agreementId } = event.args
  await context.db.update(agreement, { id: agreementId, manager: event.log.address }).set({
    status: 'released',
    updatedBlock: event.block.number,
  })
})

ponder.on('CommitmentManager:AgreementPartialForfeit', async ({ event, context }) => {
  const { agreementId, commitmentId } = event.args
  const e = await context.db.find(agreement, { id: agreementId, manager: event.log.address })
  if (!e) return
  const side = e.commitmentIdA === commitmentId ? 'partialForfeitA' : 'partialForfeitB'
  await context.db.update(agreement, { id: agreementId, manager: event.log.address }).set({
    status: side,
    updatedBlock: event.block.number,
  })
})

// ----------------------------------------------------------------------------
// Ledger custody — per-(token, user) encumbered position
// ----------------------------------------------------------------------------
// EncumbranceIncreased/Transferred moved from the vault (v1) to the manager (v2).
// The old overloaded EncumbranceDecreased was split into three ATTRIBUTABLE
// decrement events (LedgerLib):
//   - EncumbranceReleased(commitmentId, user, token, units)        encumbered[user]   -= units (user named directly)
//   - EncumbranceMovedToEscrow(commitmentId, strategy, token, units)  encumbered[committer] -= units (committer resolved via commitment row)
//   - EncumbrancePaidExternal(commitmentId, strategy, token, units)   encumbered[committer] -= units (committer resolved via commitment row)
// Every path still drops the holder's encumbered by `units`, so we decrement
// directly from the events — no `manager.freeBalance` live read is needed for the
// encumbered side. The escrow/external events name the strategy, not the holder,
// so we look up the parent commitment's committer to attribute the debit.

// Custody in/out. Neither event was indexed before the `ledgerFlow` log existed
// — nothing needed them, because the free balance was only ever read live. They
// are the two endpoints of the free series, so the history is wrong without them.
ponder.on('CommitmentManager:Deposited', async ({ event, context }) => {
  const { user, token, amount } = event.args
  await recordFlow(context.db, event, 'a', { user, token, kind: 'deposit', freeDelta: amount })
})

ponder.on('CommitmentManager:Withdrawn', async ({ event, context }) => {
  const { user, token, amount } = event.args
  await recordFlow(context.db, event, 'a', { user, token, kind: 'withdraw', freeDelta: -amount })
})

ponder.on('CommitmentManager:EncumbranceIncreased', async ({ event, context }) => {
  const { user, token, units } = event.args
  await bumpEncumbered(context.db, token, user, units, event.block.number)
  // free -> encumbered: conserves the holder's total, so the two legs cancel in
  // the portfolio line and only the free/encumbered split moves.
  await recordFlow(context.db, event, 'a', {
    user,
    token,
    kind: 'encumber',
    freeDelta: -units,
    encumberedDelta: units,
  })
})

// Release path conserves the holder's total (free goes up). `user` is named
// directly. commitmentId == 0 is the proposal-cancel sentinel — `user` is still
// the holder whose encumbered drops, so the decrement is correct regardless.
ponder.on('CommitmentManager:EncumbranceReleased', async ({ event, context }) => {
  const { commitmentId, user, token, units } = event.args
  await bumpEncumbered(context.db, token, user, -units, event.block.number)
  await recordFlow(context.db, event, 'a', {
    user,
    token,
    kind: 'release',
    freeDelta: units,
    encumberedDelta: -units,
    commitmentId: attributedCommitment(commitmentId),
  })
})

// Strategy moved encumbered backing into its own escrow. The debited holder is
// the commitment's committer (the event names the strategy), resolved from the
// commitment row keyed by the emitting manager.
ponder.on('CommitmentManager:EncumbranceMovedToEscrow', async ({ event, context }) => {
  const { commitmentId, token, units } = event.args
  const c = await context.db.find(commitment, { id: commitmentId, manager: event.log.address })
  if (!c) return
  await bumpEncumbered(context.db, token, c.committer, -units, event.block.number)
  // Value leaves the holder's ledger for the strategy's escrow: encumbered
  // drops with no matching free credit, so the portfolio line steps down.
  await recordFlow(context.db, event, 'a', {
    user: c.committer,
    token,
    kind: 'escrow',
    encumberedDelta: -units,
    commitmentId,
  })
})

// Strategy paid encumbered backing out of custody (external transfer). Same
// committer-attribution as the escrow path; paired with a DistributionPaid emit.
ponder.on('CommitmentManager:EncumbrancePaidExternal', async ({ event, context }) => {
  const { commitmentId, token, units } = event.args
  const c = await context.db.find(commitment, { id: commitmentId, manager: event.log.address })
  if (!c) return
  await bumpEncumbered(context.db, token, c.committer, -units, event.block.number)
  await recordFlow(context.db, event, 'a', {
    user: c.committer,
    token,
    kind: 'external',
    encumberedDelta: -units,
    commitmentId,
  })
})

ponder.on('CommitmentManager:EncumbranceTransferred', async ({ event, context }) => {
  const { from, to, token, units } = event.args
  await bumpEncumbered(context.db, token, from, -units, event.block.number)
  await bumpEncumbered(context.db, token, to, units, event.block.number)
  await recordFlow(context.db, event, 'a', {
    user: from,
    token,
    kind: 'transferOut',
    encumberedDelta: -units,
  })
  await recordFlow(context.db, event, 'b', {
    user: to,
    token,
    kind: 'transferIn',
    encumberedDelta: units,
  })
})

// ----------------------------------------------------------------------------
// Distribution strategies
// ----------------------------------------------------------------------------

ponder.on('CommitmentManager:CommitmentBoundToStrategy', async ({ event, context }) => {
  const { commitmentId, strategy, strategyParams } = event.args
  const manager = event.log.address
  const id = `${manager.toLowerCase()}-${commitmentId.toString()}-${strategy.toLowerCase()}`
  await context.db
    .insert(strategyBinding)
    .values({
      id,
      manager,
      commitmentId,
      strategy,
      strategyParams,
      boundBlock: event.block.number,
    })
    // A commitment binds each strategy once at creation; the conflict guard keeps
    // the handler idempotent across reorg replays.
    .onConflictDoUpdate({ strategyParams, boundBlock: event.block.number })
})

ponder.on('CommitmentManager:DistributionPaid', async ({ event, context }) => {
  const { strategy, recipient, token, amount, commitmentId, context: payoutContext } = event.args
  await context.db.insert(distribution).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    strategy,
    recipient,
    token,
    amount,
    commitmentId, // 0 = non-attribution sentinel
    context: payoutContext,
    manager: event.log.address,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })
  // ANNOTATION ONLY — both deltas stay zero. DistributionPaid is emitted for
  // FromEscrowToFree (which credits the recipient's free balance) AND for
  // FromEscrowToExternal / FromEncumberedToExternal (which send tokens out of
  // custody), with nothing in the event to tell them apart. Applying it as a
  // free credit would double-count every external payout; ignoring it entirely
  // would lose a real balance change. So the row is written for the history
  // feed and the frontend anchors the free series to a live `freeBalance` read
  // instead. See the `ledgerFlow` schema comment.
  await recordFlow(context.db, event, 'a', {
    user: recipient,
    token,
    kind: 'distribution',
    commitmentId: attributedCommitment(commitmentId),
  })
})

ponder.on('CommitmentManager:StrategyHookFailed', async ({ event, context }) => {
  const { commitmentId, strategy, hookSelector } = event.args
  const manager = event.log.address
  await context.db.insert(strategyHookFailure).values({
    id: `${manager.toLowerCase()}-${commitmentId.toString()}-${strategy.toLowerCase()}-${event.block.number}-${event.log.logIndex}`,
    manager,
    commitmentId,
    strategy,
    hookSelector,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })
})

// --- Self-custody strategies (FlatFeeAtCreate, ERC §D.7) -------------------
//
// These pay counterparties directly and emit DistributionPaid / Prefunded /
// CreditRefunded from their OWN address, so the manager-bound handlers above
// never see them. Instances are discovered from CommitmentBoundToStrategy (see
// ponder.config.ts). The events don't carry the manager, but the strategy's
// `manager()` is immutable, so resolve it once per strategy and cache
// process-wide (same shape as the vault-denorm cache at the top of the file).
const strategyManagerCache = new Map<string, `0x${string}`>()
async function resolveStrategyManager(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  strategy: `0x${string}`,
): Promise<`0x${string}`> {
  const key = strategy.toLowerCase()
  const cached = strategyManagerCache.get(key)
  if (cached) return cached
  const mgr = (await context.client.readContract({
    abi: context.contracts.FlatFeeAtCreate.abi,
    address: strategy,
    functionName: 'manager',
  })) as `0x${string}`
  strategyManagerCache.set(key, mgr)
  return mgr
}

// Self-custody payout — mirrors CommitmentManager:DistributionPaid but sourced
// from the strategy address. Disjoint emit source, so no double-count with the
// manager handler; both write the same `distribution` table.
ponder.on('FlatFeeAtCreate:DistributionPaid', async ({ event, context }) => {
  const { strategy, recipient, token, amount, commitmentId, context: payoutContext } = event.args
  const manager = await resolveStrategyManager(context, event.log.address)
  await context.db.insert(distribution).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    strategy,
    recipient,
    token,
    amount,
    commitmentId, // 0 = non-attribution sentinel
    context: payoutContext,
    manager,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })
})

// Committer prefunded fee credit into the strategy's self-custody ledger.
ponder.on('FlatFeeAtCreate:Prefunded', async ({ event, context }) => {
  const { funder, committer, token, amount } = event.args
  const manager = await resolveStrategyManager(context, event.log.address)
  await context.db.insert(strategyCreditFlow).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    strategy: event.log.address,
    manager,
    kind: 'prefund',
    funder,
    committer,
    token,
    amount,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })
})

// Committer reclaimed unallocated credit from the strategy ledger.
ponder.on('FlatFeeAtCreate:CreditRefunded', async ({ event, context }) => {
  const { committer, token, amount } = event.args
  const manager = await resolveStrategyManager(context, event.log.address)
  await context.db.insert(strategyCreditFlow).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    strategy: event.log.address,
    manager,
    kind: 'refund',
    funder: committer, // refund returns to the committer that prefunded
    committer,
    token,
    amount,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })
})

// ============================================================================
// CommitmentsVault
// ============================================================================

// Track which vault rows we've already filled with name/symbol/decimals so we
// only RPC for those fields once per address. Metadata patches keep flowing on
// every VaultMetadataUpdated emit.
const vaultStaticFieldsFilled = new Set<string>()

async function readVaultStaticFields(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  address: `0x${string}`,
): Promise<{ asset: `0x${string}` | null; name: string | null; symbol: string | null; decimals: number | null }> {
  try {
    const [asset, name, symbol, decimals] = await Promise.all([
      context.client.readContract({ abi: context.contracts.CommitmentsVault.abi, address, functionName: 'asset' }) as Promise<`0x${string}`>,
      context.client.readContract({ abi: context.contracts.CommitmentsVault.abi, address, functionName: 'name' }) as Promise<string>,
      context.client.readContract({ abi: context.contracts.CommitmentsVault.abi, address, functionName: 'symbol' }) as Promise<string>,
      context.client.readContract({ abi: context.contracts.CommitmentsVault.abi, address, functionName: 'decimals' }) as Promise<number>,
    ])
    return { asset, name, symbol, decimals }
  } catch {
    return { asset: null, name: null, symbol: null, decimals: null }
  }
}

ponder.on('VaultFactory:VaultDeployed', async ({ event, context }) => {
  const { asset, vault: vaultAddr } = event.args
  // First sight of a vault: capture asset + static ERC-20 metadata + deployedBlock.
  // The VaultMetadataUpdated handler later patches the metadata columns. We read
  // name/symbol/decimals from the vault contract (the event carries only asset).
  const statics = await readVaultStaticFields(context, vaultAddr)
  vaultStaticFieldsFilled.add(vaultAddr.toLowerCase())
  await context.db
    .insert(vault)
    .values({
      address: vaultAddr,
      asset,
      name: statics.name,
      symbol: statics.symbol,
      decimals: statics.decimals,
      deployedBlock: event.block.number,
      metadataURI: null,
      metadataHash: null,
      metadataStatus: null,
      metadataContent: null,
      metadataContentRaw: null,
    })
    .onConflictDoNothing()
})

// v2.5: per-donate event log. Cross-vault underwriting uses this to surface
// loss-recovery donations landing on the insured vault.
ponder.on('CommitmentsVault:Donation', async ({ event, context }) => {
  const { donor, assets } = event.args
  await context.db.insert(donation).values({
    id: `${event.log.address}-${event.block.number}-${event.log.logIndex}`,
    vault: event.log.address,
    donor,
    assets,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })
})

ponder.on('CommitmentsVault:VaultMetadataUpdated', async ({ event, context }) => {
  const address = event.log.address
  const { uri, contentHash } = event.args
  const md = await fetchMetadata(uri, contentHash)
  const metaPatch = {
    metadataURI: md.uri,
    metadataHash: md.hash,
    metadataStatus: md.status,
    metadataContent: md.content,
    metadataContentRaw: md.contentRaw,
  }
  const existing = await context.db.find(vault, { address })
  if (existing) {
    await context.db.update(vault, { address }).set(metaPatch)
    return
  }
  // First sight of this vault — read static fields from chain so the row has
  // asset/name/symbol/decimals available for fallback rendering when
  // metadataContent is empty or stale.
  const statics = await readVaultStaticFields(context, address)
  vaultStaticFieldsFilled.add(address.toLowerCase())
  await context.db.insert(vault).values({
    address,
    asset: statics.asset,
    name: statics.name,
    symbol: statics.symbol,
    decimals: statics.decimals,
    deployedBlock: event.block.number,
    ...metaPatch,
  })
})

ponder.on('OperatorServiceRegistry:ServiceURIUpdated', async ({ event, context }) => {
  const address = event.log.address
  const { serviceURI } = event.args
  // Service registry stores no on-chain contentHash — pass bytes32(0) so the
  // fetcher skips hash verification and tags status `ok` purely on fetch.
  const md = await fetchMetadata(serviceURI, '0x' + '0'.repeat(64) as `0x${string}`)
  // mismatch is impossible without a hash; collapse it onto `ok`.
  const status = md.status === 'mismatch' ? 'ok' : md.status
  const patch = {
    metadataURI: md.uri,
    metadataStatus: status,
    metadataContent: md.content,
    metadataContentRaw: md.contentRaw,
    updatedBlock: event.block.number,
  }
  const existing = await context.db.find(service, { address })
  if (existing) {
    await context.db.update(service, { address }).set(patch)
  } else {
    await context.db.insert(service).values({ address, ...patch })
  }
})

// ============================================================================
// OperatorRegistry + OperatorServiceRegistry
// ============================================================================

// The event carries no weight: voting power is live-read from the IVotingPowerSource.
ponder.on('OperatorServiceRegistry:OperatorRegistered', async ({ event, context }) => {
  const { operator: op } = event.args
  const serviceAddress = event.log.address
  await context.db
    .insert(operator)
    .values({
      address: op,
      signingKey: null,
      status: 'registered',
      registeredBlock: event.block.number,
      registeredAt: event.block.timestamp,
      updatedBlock: event.block.number,
    })
    .onConflictDoUpdate({
      status: 'registered',
      updatedBlock: event.block.number,
    })
  // Per-service membership row — supports operators that join multiple
  // services without losing track of which one they belong to.
  await context.db
    .insert(serviceOperator)
    .values({
      id: `${serviceAddress.toLowerCase()}-${op.toLowerCase()}`,
      service: serviceAddress,
      operator: op,
      status: 'registered',
      registeredBlock: event.block.number,
      updatedBlock: event.block.number,
    })
    .onConflictDoUpdate({
      status: 'registered',
      updatedBlock: event.block.number,
    })
})

// Indexer Improvements #1: maintain selfStake / totalDelegatedStake / activeDelegationCount
// off the OperatorRegistry events directly. Distinct from OperatorServiceRegistry's
// OperatorRegistered (which carries `weight`). On OperatorRegistry.OperatorRegistered the
// operator's own selfStake commitment is recorded, totalDelegated initializes to selfStake,
// and activeDelegationCount starts at 1 (mirrors OperatorRegistry.sol:148-149).
ponder.on('OperatorRegistry:OperatorRegistered', async ({ event, context }) => {
  const { operator: op, commitmentId, stake } = event.args
  const registry = event.log.address
  const existing = await context.db.find(operator, { address: op })

  // Multi-registry: when the operator registers with a SECOND registry, leave
  // the operator row's stake snapshot pointing at the FIRST registry — its
  // `selfStake`/`totalDelegatedStake`/`activeDelegationCount` would otherwise
  // be clobbered with another denom's units (e.g. WETH wei replacing USDC 1e6).
  // Per-registry truth lives in the registryMembership table below.
  const isFirstRegistration = !existing || existing.status !== 'registered'
  const patch = isFirstRegistration
    ? {
        selfStake: stake,
        selfStakeCommitmentId: commitmentId,
        totalDelegatedStake: stake,
        activeDelegationCount: 1,
        status: 'registered' as const,
        updatedBlock: event.block.number,
      }
    : {
        // Existing snapshot stays attached to the first registry; just bump the timestamp.
        status: 'registered' as const,
        updatedBlock: event.block.number,
      }
  if (existing) {
    await context.db.update(operator, { address: op }).set(patch)
  } else {
    // Stub row — OperatorServiceRegistry.OperatorRegistered may not have fired yet.
    await context.db.insert(operator).values({
      address: op,
      weight: 0n,
      signingKey: null,
      registeredBlock: event.block.number,
      registeredAt: event.block.timestamp,
      ...patch,
    })
  }
  // Per-(operator, registry) truth — multi-registry deployments need this to
  // answer "which registries is this operator registered with?" without
  // overloading the operator row.
  const membershipId = `${registry.toLowerCase()}-${op.toLowerCase()}`
  await context.db
    .insert(registryMembership)
    .values({
      id: membershipId,
      operator: op,
      registry,
      selfStakeCommitmentId: commitmentId,
      selfStake: stake,
      status: 'registered',
      registeredBlock: event.block.number,
      updatedBlock: event.block.number,
    })
    .onConflictDoUpdate({
      selfStakeCommitmentId: commitmentId,
      selfStake: stake,
      status: 'registered',
      updatedBlock: event.block.number,
    })

  // Tag the underlying self-stake commitment with its operator beneficiary so
  // /services/:address/stake-summary can sum committed stake per vault.
  // event.log.address is the registry; the parent commitment lives under the
  // registry's bound manager, resolved via the cached commitmentManager() view.
  const opRegSelfManager = await resolveRegistryManager(context, event.log.address)
  if (opRegSelfManager) {
    const c = await context.db.find(commitment, { id: commitmentId, manager: opRegSelfManager })
    if (c) {
      await context.db.update(commitment, { id: commitmentId, manager: opRegSelfManager }).set({ operatorBeneficiary: op })
    }
  }
})

ponder.on('OperatorRegistry:OperatorDeregistered', async ({ event, context }) => {
  const { operator: op } = event.args
  const registry = event.log.address

  // Update the per-(operator, registry) row first — this is the authoritative
  // multi-registry source.
  const membershipId = `${registry.toLowerCase()}-${op.toLowerCase()}`
  const membership = await context.db.find(registryMembership, { id: membershipId })
  if (membership) {
    await context.db.update(registryMembership, { id: membershipId }).set({
      status: 'deregistered',
      updatedBlock: event.block.number,
    })
  }

  // Operator row continues to use the "latest registry mirror" semantic — the
  // per-registry truth is in registryMembership above. Callers that need to
  // know "is operator X still active in ANY registry?" should query that table.
  // `deregister` zeroes the registry's stake and count and drops the self-stake's routing, so
  // no later release/forfeit event will. Zero the mirror too, but only when it mirrors this
  // registry (same self-stake commitment), so a second registry cannot clobber the first's figures.
  const existing = await context.db.find(operator, { address: op })
  if (!existing) return
  const mirrorsThisRegistry =
    !!membership && existing.selfStakeCommitmentId === membership.selfStakeCommitmentId
  await context.db.update(operator, { address: op }).set({
    status: 'deregistered',
    ...(mirrorsThisRegistry ? { selfStake: 0n, totalDelegatedStake: 0n, activeDelegationCount: 0 } : {}),
    updatedBlock: event.block.number,
  })
})

ponder.on('OperatorRegistry:DelegationCreated', async ({ event, context }) => {
  const { operator: op, commitmentId, amount } = event.args
  const existing = await context.db.find(operator, { address: op })
  if (!existing) return
  await context.db.update(operator, { address: op }).set({
    totalDelegatedStake: existing.totalDelegatedStake + amount,
    activeDelegationCount: existing.activeDelegationCount + 1,
    updatedBlock: event.block.number,
  })
  // Tag the delegation commitment with its operator beneficiary so
  // /services/:address/stake-summary can sum committed stake per vault.
  // event.log.address is the registry; resolve the bound manager.
  const dcManager = await resolveRegistryManager(context, event.log.address)
  if (dcManager) {
    const c = await context.db.find(commitment, { id: commitmentId, manager: dcManager })
    if (c) {
      await context.db.update(commitment, { id: commitmentId, manager: dcManager }).set({ operatorBeneficiary: op })
    }
  }
})

ponder.on('OperatorRegistry:DelegationReleased', async ({ event, context }) => {
  const { operator: op, commitmentId, amount } = event.args
  const existing = await context.db.find(operator, { address: op })
  if (!existing) return
  const isSelf = existing.selfStakeCommitmentId === commitmentId
  // Floor-clamp at 0n / 0 to mirror OperatorRegistry.sol:269-277 (defensive — the contract
  // already enforces invariants but the indexer must not explode if any drift occurs).
  const nextTotal = existing.totalDelegatedStake >= amount
    ? existing.totalDelegatedStake - amount
    : 0n
  const nextCount = existing.activeDelegationCount > 0 ? existing.activeDelegationCount - 1 : 0
  await context.db.update(operator, { address: op }).set({
    totalDelegatedStake: nextTotal,
    activeDelegationCount: nextCount,
    selfStake: isSelf ? 0n : existing.selfStake,
    updatedBlock: event.block.number,
  })
})

ponder.on('OperatorRegistry:DelegationForfeited', async ({ event, context }) => {
  const { operator: op, commitmentId } = event.args
  // The event's amount remains the forfeited penalty portion, while OperatorRegistry
  // subtracts the FULL commitment amount from totalDelegatedStake. Look it up from the
  // commitment table — CommitmentCreated handler ran first by event ordering.
  // event.log.address is the registry; resolve the bound manager.
  const dsManager = await resolveRegistryManager(context, event.log.address)
  const c = dsManager
    ? await context.db.find(commitment, { id: commitmentId, manager: dsManager })
    : null
  const fullAmount = c?.amount ?? 0n
  const existing = await context.db.find(operator, { address: op })
  if (!existing) return
  const isSelf = existing.selfStakeCommitmentId === commitmentId
  const nextTotal = existing.totalDelegatedStake >= fullAmount
    ? existing.totalDelegatedStake - fullAmount
    : 0n
  const nextCount = existing.activeDelegationCount > 0 ? existing.activeDelegationCount - 1 : 0
  await context.db.update(operator, { address: op }).set({
    totalDelegatedStake: nextTotal,
    activeDelegationCount: nextCount,
    selfStake: isSelf ? 0n : existing.selfStake,
    updatedBlock: event.block.number,
  })
})

ponder.on('OperatorServiceRegistry:OperatorDeregistered', async ({ event, context }) => {
  const { operator: op } = event.args
  const serviceAddress = event.log.address
  await context.db.update(operator, { address: op }).set({
    status: 'deregistered',
    updatedBlock: event.block.number,
  })
  // Flip the per-service membership row to deregistered. Don't delete it —
  // historical queries still want to know who used to belong.
  const serviceOperatorId = `${serviceAddress.toLowerCase()}-${op.toLowerCase()}`
  const existing = await context.db.find(serviceOperator, { id: serviceOperatorId })
  if (existing) {
    await context.db.update(serviceOperator, { id: serviceOperatorId }).set({
      status: 'deregistered',
      updatedBlock: event.block.number,
    })
  }
})

// `OperatorWeightSynced` was removed when StakeRegistry stopped tracking stake
// locally. Per-operator voting power is now live-read from the TokenWeighting
// IVotingPowerSource. Frontends should query `stakeRegistry.getVotingPower(op)`
// (or TokenWeighting directly) for an authoritative current value. The `weight`
// column on the operator row is a snapshot at registration time and may drift.

ponder.on('OperatorServiceRegistry:OperatorSigningKeyUpdated', async ({ event, context }) => {
  const { operator: op, newKey } = event.args
  await context.db.update(operator, { address: op }).set({
    signingKey: newKey,
    updatedBlock: event.block.number,
  })
})

ponder.on('OperatorRegistry:OperatorMetadataUpdated', async ({ event, context }) => {
  const { operator: op, uri, contentHash } = event.args
  const md = await fetchMetadata(uri, contentHash)
  const patch = {
    metadataURI: md.uri,
    metadataHash: md.hash,
    metadataStatus: md.status,
    metadataContent: md.content,
    metadataContentRaw: md.contentRaw,
    services: extractServices(md.content),
    updatedBlock: event.block.number,
  }
  const existing = await context.db.find(operator, { address: op })
  if (existing) {
    await context.db.update(operator, { address: op }).set(patch)
  } else {
    // Operator row may be missing if MetadataUpdated fires before OperatorRegistered
    // (cross-contract log ordering in the same block). Create a stub row.
    await context.db.insert(operator).values({
      address: op,
      weight: 0n,
      signingKey: null,
      status: 'registered',
      registeredBlock: event.block.number,
      registeredAt: event.block.timestamp,
      ...patch,
    })
  }
})

// ============================================================================
// MeshFactory + mesh node clones
// ============================================================================

ponder.on('MeshFactory:NodeDeployed', async ({ event, context }) => {
  const { impl, clone, nodeType } = event.args
  await context.db.insert(meshNode).values({
    address: clone,
    impl,
    nodeType,
    deployedBlock: event.block.number,
  })
})

async function recordStake(
  context: any,
  event: any,
  from: `0x${string}`,
  toNode: `0x${string}`,
  denom: `0x${string}`,
  amount: bigint,
  sign: 1n | -1n
) {
  await context.db.insert(stakeFlow).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    from,
    toNode,
    denom,
    amount: amount * sign,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  })
}

// All three mesh node contracts (FanIn, FanOut, TokenWeighting) are discovered
// by Ponder via the same MeshFactory.NodeDeployed factory filter, so every
// clone shows up as an address under all three contract definitions. Because
// Staked/StakeReleased share event signatures across types, a single log
// triggers all three handlers — causing duplicate stake_flow rows with the
// same (tx,logIndex) primary key. `onlyForNodeType` short-circuits handlers
// when the clone's actual nodeType (from the meshNode table) doesn't match.
async function onlyForNodeType(
  context: any,
  address: `0x${string}`,
  expected: 'fan_in' | 'fan_out' | 'token_weighting'
): Promise<boolean> {
  const node = await context.db.find(meshNode, { address })
  return node?.nodeType === expected
}

ponder.on('FanInNode:Staked', async ({ event, context }) => {
  if (!(await onlyForNodeType(context, event.log.address, 'fan_in'))) return
  const { provider, denomOut, amount } = event.args
  await recordStake(context, event, provider, event.log.address, denomOut, amount, 1n)
})
ponder.on('FanInNode:StakeReleased', async ({ event, context }) => {
  if (!(await onlyForNodeType(context, event.log.address, 'fan_in'))) return
  const { provider, denomOut, amount } = event.args
  await recordStake(context, event, provider, event.log.address, denomOut, amount, -1n)
})

ponder.on('FanOutNode:Staked', async ({ event, context }) => {
  if (!(await onlyForNodeType(context, event.log.address, 'fan_out'))) return
  const { staker, denom, amount } = event.args
  await recordStake(context, event, staker, event.log.address, denom, amount, 1n)
})
ponder.on('FanOutNode:StakeReleased', async ({ event, context }) => {
  if (!(await onlyForNodeType(context, event.log.address, 'fan_out'))) return
  const { staker, denom, consumer, amount } = event.args
  await recordStake(context, event, staker, consumer, denom, amount, -1n)
})

ponder.on('TokenWeighting:Staked', async ({ event, context }) => {
  if (!(await onlyForNodeType(context, event.log.address, 'token_weighting'))) return
  const { staker, denom, amount } = event.args
  await recordStake(context, event, staker, event.log.address, denom, amount, 1n)
})
ponder.on('TokenWeighting:StakeReleased', async ({ event, context }) => {
  if (!(await onlyForNodeType(context, event.log.address, 'token_weighting'))) return
  const { staker, denom, amount } = event.args
  await recordStake(context, event, staker, event.log.address, denom, amount, -1n)
})

// Mesh Explorer Phase B: per-(node, denom) security parameters + weights.
// `ProviderRegistered` is FanIn-only and `WeightUpdated` is TokenWeighting-only,
// but the factory pattern fires both contract handlers for every clone — gate
// them with `onlyForNodeType` exactly like the stake-flow handlers do.
ponder.on('FanInNode:ProviderRegistered', async ({ event, context }) => {
  if (!(await onlyForNodeType(context, event.log.address, 'fan_in'))) return
  const { provider, denomIn, denomOut, maxPenaltyBps, unbondingPeriod } = event.args
  const id = `${event.log.address.toLowerCase()}-${denomOut.toLowerCase()}`
  await context.db
    .insert(fanInProvider)
    .values({
      id,
      fanInNode: event.log.address,
      provider,
      denomIn,
      denomOut,
      maxPenaltyBps: Number(maxPenaltyBps),
      unbondingPeriod: BigInt(unbondingPeriod),
      registeredBlock: event.block.number,
    })
    .onConflictDoUpdate({
      provider,
      denomIn,
      maxPenaltyBps: Number(maxPenaltyBps),
      unbondingPeriod: BigInt(unbondingPeriod),
      registeredBlock: event.block.number,
    })
})

ponder.on('TokenWeighting:WeightUpdated', async ({ event, context }) => {
  if (!(await onlyForNodeType(context, event.log.address, 'token_weighting'))) return
  const { denom, newWeightBps } = event.args
  const id = `${event.log.address.toLowerCase()}-${denom.toLowerCase()}`
  await context.db
    .insert(meshDenomWeight)
    .values({
      id,
      nodeAddress: event.log.address,
      denom,
      weightBps: BigInt(newWeightBps),
      updatedBlock: event.block.number,
    })
    .onConflictDoUpdate({
      weightBps: BigInt(newWeightBps),
      updatedBlock: event.block.number,
    })
})

// FanOut.OutflowsSet only emits (staker, denom, count) — to capture the per-
// consumer config we chain-read `getOutflows(staker, denom)` and upsert a row
// per consumer. The Mesh Explorer's topology view uses these rows to draw
// FanOut → consumer edges with portionBps + maxPenaltyBps labels.
//
// Old rows for this (node, staker, denom) tuple are NOT deleted — when a
// staker re-calls setOutflows with a smaller list, stale entries linger in
// the table. The endpoint that consumes this filters by the latest
// updatedBlock per (node, staker, denom) tuple to handle that case.
ponder.on('FanOutNode:OutflowsSet', async ({ event, context }) => {
  if (!(await onlyForNodeType(context, event.log.address, 'fan_out'))) return
  const { staker, denom } = event.args
  let outflows: ReadonlyArray<{ consumer: `0x${string}`; maxPenaltyBps: number; portionBps: bigint }> = []
  try {
    outflows = (await context.client.readContract({
      abi: context.contracts.FanOutNode.abi,
      address: event.log.address,
      functionName: 'getOutflows',
      args: [staker, denom],
    })) as ReadonlyArray<{ consumer: `0x${string}`; maxPenaltyBps: number; portionBps: bigint }>
  } catch {
    // RPC blip — leave the table in its previous state. Next OutflowsSet
    // event for this (staker, denom) will resync.
    return
  }
  for (const o of outflows) {
    const id = `${event.log.address.toLowerCase()}-${staker.toLowerCase()}-${denom.toLowerCase()}-${o.consumer.toLowerCase()}`
    await context.db
      .insert(fanOutOutflow)
      .values({
        id,
        fanOutNode: event.log.address,
        staker,
        denom,
        consumer: o.consumer,
        maxPenaltyBps: Number(o.maxPenaltyBps),
        portionBps: Number(o.portionBps),
        updatedBlock: event.block.number,
      })
      .onConflictDoUpdate({
        maxPenaltyBps: Number(o.maxPenaltyBps),
        portionBps: Number(o.portionBps),
        updatedBlock: event.block.number,
      })
  }
})
