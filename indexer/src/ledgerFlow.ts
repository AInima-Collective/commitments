/**
 * Append-only ledger-movement log — see the `ledgerFlow` schema comment for the
 * full rationale, including the one path (FromEscrowToFree vs.
 * FromEscrowToExternal) the event stream cannot distinguish.
 *
 * Lives outside `index.ts` so the mutual handlers (side-effect-imported from
 * `index.ts`) can append without a circular import — same reason as
 * `accountStats.ts`.
 */
import { ledgerFlow, ledgerPosition } from 'ponder:schema'

/**
 * Maintain the per-(token, user) CURRENT encumbered balance. Lives here beside
 * `recordFlow` because every caller that appends an encumbered delta to the log
 * must also move the position, and the mutual handlers need both.
 *
 * Clamps at zero: a missed increment upstream should leave the row at 0 rather
 * than go negative and poison every later read.
 */
export async function bumpEncumbered(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  token: `0x${string}`,
  user: `0x${string}`,
  delta: bigint,
  block: bigint,
) {
  const id = `${token.toLowerCase()}-${user.toLowerCase()}`
  const existing = await db.find(ledgerPosition, { id })
  if (existing) {
    const next = existing.encumbered + delta
    await db.update(ledgerPosition, { id }).set({
      encumbered: next > 0n ? next : 0n,
      updatedBlock: block,
    })
  } else {
    await db.insert(ledgerPosition).values({
      id,
      token,
      user,
      encumbered: delta > 0n ? delta : 0n,
      updatedBlock: block,
    })
  }
}

/**
 * Movement path. Suffix convention: `Out` debits the named user, `In` credits
 * them — used where one event produces two legs against two different users.
 */
export type LedgerFlowKind =
  | 'deposit'
  | 'withdraw'
  | 'encumber'
  | 'release'
  | 'escrow'
  | 'external'
  | 'transferOut'
  | 'transferIn'
  | 'contributeOut'
  | 'contributeIn'
  | 'forfeitOut'
  | 'forfeitIn'
  | 'settleOut'
  | 'settleIn'
  | 'distribution'
  | 'premiumIn'
  | 'juniorIn'

/**
 * The subset of ponder's event shape this module needs. Declared structurally
 * rather than imported because ponder's generated event type is a deep generic
 * over the chain/contract union and does not narrow usefully here.
 */
export interface FlowEvent {
  block: { number: bigint; timestamp: bigint }
  log: { logIndex: number; address: `0x${string}` }
  transaction: { hash: `0x${string}` }
}

export interface FlowLeg {
  user: `0x${string}`
  token: `0x${string}`
  kind: LedgerFlowKind
  /** Signed. Omit for paths that only move the encumbered side. */
  freeDelta?: bigint
  /** Signed. Omit for paths that only move the free side. */
  encumberedDelta?: bigint
  /** Commitment this movement is attributed to, when the event names one. */
  commitmentId?: bigint | null
}

/**
 * Append one leg of a ledger movement.
 *
 * `leg` distinguishes rows produced by the same log — a transfer debits one
 * user and credits another, so it writes legs 'a' and 'b'. Insert is
 * conflict-tolerant so a reorg replay of the same log is a no-op rather than a
 * duplicate delta (which would silently corrupt every later point in the fold).
 *
 * Zero-delta legs are still written when the kind is informational
 * ('distribution'): the history endpoint returns them as annotations, and a row
 * that moves nothing is cheaper than a second table.
 */
export async function recordFlow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  event: FlowEvent,
  leg: string,
  entry: FlowLeg,
) {
  await db
    .insert(ledgerFlow)
    .values({
      id: `${event.transaction.hash}-${event.log.logIndex}-${leg}`,
      user: entry.user,
      token: entry.token,
      manager: event.log.address,
      freeDelta: entry.freeDelta ?? 0n,
      encumberedDelta: entry.encumberedDelta ?? 0n,
      kind: entry.kind,
      commitmentId: entry.commitmentId ?? null,
      blockNumber: event.block.number,
      logIndex: event.log.logIndex,
      blockTimestamp: event.block.timestamp,
      txHash: event.transaction.hash,
    })
    .onConflictDoNothing()
}

/**
 * `EncumbranceReleased` uses `commitmentId == 0` as the sentinel for the
 * agreement-proposal-cancel path, where no commitment exists yet. Store NULL
 * for it so consumers don't have to know the sentinel.
 */
export function attributedCommitment(id: bigint): bigint | null {
  return id === 0n ? null : id
}
