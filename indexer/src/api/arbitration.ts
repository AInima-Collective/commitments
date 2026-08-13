import { isAddress } from 'viem'

export const DEFAULT_ARBITRATION_PAGE_SIZE = 50
export const MAX_ARBITRATION_PAGE_SIZE = 100

export interface ArbitrationCursor {
  blockNumber: bigint
  logIndex: number
}

export interface ArbitrationRequest {
  commitmentId: bigint
  manager: `0x${string}`
  limit: number
  cursor?: ArbitrationCursor
}

export class ArbitrationInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArbitrationInputError'
  }
}

/** Parse the public endpoint identity and pagination inputs without coercion. */
export function parseArbitrationRequest(input: {
  id: string
  manager?: string
  limit?: string
  cursor?: string
}): ArbitrationRequest {
  if (!/^(0|[1-9]\d*)$/.test(input.id)) {
    throw new ArbitrationInputError('invalid commitment id')
  }
  if (!input.manager) throw new ArbitrationInputError('manager is required')
  if (!isAddress(input.manager)) throw new ArbitrationInputError('invalid manager')

  let limit = DEFAULT_ARBITRATION_PAGE_SIZE
  if (input.limit !== undefined) {
    if (!/^[1-9]\d*$/.test(input.limit)) {
      throw new ArbitrationInputError('invalid limit')
    }
    limit = Number(input.limit)
    if (!Number.isSafeInteger(limit) || limit > MAX_ARBITRATION_PAGE_SIZE) {
      throw new ArbitrationInputError(`limit must be between 1 and ${MAX_ARBITRATION_PAGE_SIZE}`)
    }
  }

  const request: ArbitrationRequest = {
    commitmentId: BigInt(input.id),
    manager: input.manager.toLowerCase() as `0x${string}`,
    limit,
  }
  if (input.cursor !== undefined) request.cursor = decodeArbitrationCursor(input.cursor)
  return request
}

export function encodeArbitrationCursor(cursor: ArbitrationCursor): string {
  return Buffer.from(`v1:${cursor.blockNumber}:${cursor.logIndex}`, 'utf8').toString('base64url')
}

export function decodeArbitrationCursor(value: string): ArbitrationCursor {
  let decoded: string
  try {
    decoded = Buffer.from(value, 'base64url').toString('utf8')
  } catch {
    throw new ArbitrationInputError('invalid cursor')
  }
  const match = /^v1:(0|[1-9]\d*):(0|[1-9]\d*)$/.exec(decoded)
  if (!match) throw new ArbitrationInputError('invalid cursor')
  const logIndex = Number(match[2])
  if (!Number.isSafeInteger(logIndex)) throw new ArbitrationInputError('invalid cursor')
  return { blockNumber: BigInt(match[1]), logIndex }
}

export function finalizeArbitrationPage<T extends { blockNumber: bigint; logIndex: number }>(
  rowsWithLookahead: T[],
  limit: number,
): { rows: T[]; nextCursor: string | null } {
  const hasMore = rowsWithLookahead.length > limit
  const rows = hasMore ? rowsWithLookahead.slice(0, limit) : rowsWithLookahead
  const last = rows.at(-1)
  return {
    rows,
    nextCursor:
      hasMore && last
        ? encodeArbitrationCursor({ blockNumber: last.blockNumber, logIndex: last.logIndex })
        : null,
  }
}

export function deriveIndexedProposalStatus(
  commitmentStatus: string,
  latestEventKind?: string,
): string {
  if (commitmentStatus === 'forfeitPending') return 'pending'
  if (commitmentStatus === 'forfeited') return 'executed'
  if (latestEventKind && ['executed', 'cancelled', 'cancelledStale'].includes(latestEventKind)) {
    return latestEventKind
  }
  return 'none'
}

export interface ArbitrationEventRecord {
  kind: string
  blockTimestamp: bigint
  blockNumber: bigint
  logIndex: number
  txHash: string
  penaltyBps: number | null
  challengeWindow: bigint | null
  challengeEnd: bigint | null
  proposalInitiatedAt: bigint
  sharesToForfeit: bigint | null
  counterparty: string | null
  committer: string
  arbiter: string
}

/** Stable wire mapping shared by the endpoint and its contract tests. */
export function serializeArbitrationEvent(row: ArbitrationEventRecord) {
  return {
    kind: row.kind,
    timestamp: row.blockTimestamp.toString(),
    blockNumber: row.blockNumber.toString(),
    logIndex: row.logIndex,
    transactionHash: row.txHash,
    penaltyBps: row.penaltyBps,
    challengeWindow: row.challengeWindow?.toString() ?? null,
    // This is deliberately named nominal: manager pause credit can move the
    // executable time later, and only a live pauseState read can resolve it.
    nominalExecutionAt: row.challengeEnd?.toString() ?? null,
    proposalInitiatedAt: row.proposalInitiatedAt.toString(),
    unitsForfeited: row.sharesToForfeit?.toString() ?? null,
    counterparty: row.counterparty,
    committer: row.committer,
    arbiter: row.arbiter,
  }
}
