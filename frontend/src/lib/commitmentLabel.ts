// Naming a commitment.
//
// `#12` is not a name. It is the only authoritative identifier a commitment
// has, so it never disappears, but it answers none of the questions a person
// scanning a list is actually asking.
//
// Three tiers, in order:
//
//   1. The off-chain `title`, when the metadata cleared verification. See
//      `mayPromoteMetadataText` — a title whose hash no longer matches is
//      attacker-controlled text and is never promoted.
//   2. A label derived from the row's own structure. Most commitments were
//      never named by anyone and never will be; the row still knows it is one
//      leg of agreement #4, or a delegation to a registered operator, or a
//      pledge accepting contributions. That is enough to say something true.
//   3. `#12`, when genuinely nothing else is known.
//
// Pure and synchronous. Resolvers that need network state (operator names,
// token symbols) come in through `CommitmentLabelContext` so this module stays
// testable and out of the React layer.

import { type Address } from 'viem'
import { type UnifiedRow } from '../hooks/useUnifiedRows'
import { otherParty } from './commitmentFilters'
import {
  mayPromoteMetadataText,
  metadataTitle,
  metadataTrust,
  type MetadataTrust,
} from './commitmentMetadata'
import { formatTokenAmount, truncateAddress } from './format'

/**
 * A title long enough to wreck a table row is a real payload: only the *URI* is
 * capped on chain at 512 bytes, and an `ipfs://` URI can point at a document of
 * any size. Clamp for display and keep the full string for `title=`.
 */
const MAX_TITLE_CHARS = 96

export interface CommitmentLabelContext {
  /**
   * Resolved operator display names. Feed it `useOperatorNames(...).get` —
   * the page bulk-queries every visible party in one round trip, so this is a
   * synchronous map lookup by the time a row renders.
   */
  operatorName?: (address: string) => string | undefined
  /**
   * Known protocol contracts. Bind `findKnownAddress` to the connected chain:
   * `(a) => findKnownAddress(chainId, a)`.
   */
  knownAddress?: (address: string) => { label: string } | undefined
  /**
   * Per-token decimals + symbol for the last-resort label. Pass `undefined`
   * while the multicall is in flight rather than a resolver that returns a
   * placeholder symbol — the label reads better without an amount than with
   * one denominated in `TOKEN`.
   */
  tokenMeta?: (token: Address) => { decimals: number; symbol: string }
}

export interface CommitmentLabel {
  /** What to render. Clamped to {@link MAX_TITLE_CHARS}. Plain text, never markup. */
  text: string
  /** Unclamped text for `title=`. Equal to `text` when nothing was clamped. */
  full: string
  /** Which tier produced `text`. */
  source: 'metadata' | 'derived' | 'id'
  /** Trust level of the row's off-chain metadata, whether or not it was used. */
  trust: MetadataTrust
  /**
   * An off-chain title that exists but was refused promotion. Only ever set
   * when `trust === 'mismatch'`. Surfaces are free to show it INSIDE a warning
   * block — that is a quotation, not a heading — and nowhere else.
   */
  withheldTitle?: string
}

/**
 * Name a commitment or proposal row. Never returns an empty string.
 */
export function commitmentLabel(row: UnifiedRow, ctx: CommitmentLabelContext = {}): CommitmentLabel {
  const trust = metadataTrust(row)
  const title = metadataTitle(row)

  // Tier 1 — a verified (or at least unaltered-since-posting) title.
  if (title && mayPromoteMetadataText(trust)) {
    return { ...clamp(title), source: 'metadata', trust }
  }

  // Tier 2 — structure. Also the destination for a `mismatch` row, whose own
  // title is carried along as `withheldTitle` so the detail page can quote it.
  const derived = derivedLabel(row, ctx)
  if (derived) {
    return {
      ...clamp(derived),
      source: 'derived',
      trust,
      ...(trust === 'mismatch' && title ? { withheldTitle: clamp(title).full } : {}),
    }
  }

  // Tier 3 — the id, honestly.
  const text = `${row.kind === 'proposal' ? '#p' : '#'}${row.id.toString()}`
  return { text, full: text, source: 'id', trust }
}

/**
 * Everything the structural tier reads, flattened. Stated as its own shape so
 * a commitment that does not exist yet — one being authored in a create form —
 * can run the same tiers in the same order as a live row, instead of the form
 * growing a second, quietly divergent copy of them.
 */
interface DerivableShape {
  kind: 'commitment' | 'proposal'
  /** The party this row is pointed at, from the viewer's side. */
  other: Address | undefined
  /** True when the viewer is the one who staked. */
  viewerCommitted: boolean
  token: Address
  amount: bigint
  agreementId?: bigint
  agreementSide?: 'A' | 'B'
  paired: boolean
  acceptsContributions: boolean
}

function shapeOf(row: UnifiedRow): DerivableShape {
  const common = {
    other: otherParty(row),
    viewerCommitted: row.role === 'committer' || row.role === 'proposer',
    token: row.token,
    amount: row.amount,
    paired: row.direction === 'paired',
  }
  if (row.kind === 'proposal') {
    return { ...common, kind: 'proposal', acceptsContributions: false }
  }
  return {
    ...common,
    kind: 'commitment',
    agreementId: row.commitment.agreementId,
    agreementSide: row.commitment.agreementSide,
    acceptsContributions: row.commitment.acceptsContributions,
  }
}

/**
 * The structural tier. Ordered most-specific first: being one leg of a named
 * agreement says more than the counterparty's identity, which says more than
 * the raw amount.
 *
 * Returns undefined only when the row carries no counterparty at all, which
 * the type system says cannot happen but the wire does not guarantee.
 */
function derivedLabelFrom(d: DerivableShape, ctx: CommitmentLabelContext): string | undefined {
  const other = d.other
  if (!other) return undefined
  const partyName = ctx.operatorName?.(other)

  // A proposal is not yet a commitment; naming it after the party it is
  // addressed to is the only fact it has.
  if (d.kind === 'proposal') {
    return `Proposed agreement with ${partyName ?? truncateAddress(other)}`
  }

  // 1. One leg of a bilateral agreement.
  if (d.paired && d.agreementId !== undefined) {
    const side = d.agreementSide ? `, side ${d.agreementSide}` : ''
    return `Agreement #${d.agreementId.toString()}${side}`
  }

  // 2. The other party is a registered operator with a published name. Read
  //    directionally: stake pointed AT an operator is a delegation to them;
  //    stake an operator pointed at you is a delegation from them.
  if (partyName) {
    return d.viewerCommitted ? `Delegation to ${partyName}` : `Delegation from ${partyName}`
  }

  // 3. The other party is a keyless protocol contract whose label already says
  //    what the commitment promises (restitution to vault depositors, say).
  const known = ctx.knownAddress?.(other)
  if (known) return known.label

  // 4. An open pledge anyone can top up.
  if (d.acceptsContributions) return 'Open pledge, accepting contributions'

  // 5. Nothing but the shape of the stake itself.
  const meta = ctx.tokenMeta?.(d.token)
  if (meta) {
    const { int, fraction } = formatTokenAmount(d.amount, meta.decimals, { precision: 2 })
    return `${int}${fraction} ${meta.symbol} held against ${truncateAddress(other)}`
  }
  return `Stake held against ${truncateAddress(other)}`
}

function derivedLabel(row: UnifiedRow, ctx: CommitmentLabelContext): string | undefined {
  return derivedLabelFrom(shapeOf(row), ctx)
}

/**
 * What a commitment being authored right now will be called if its author
 * writes no title.
 *
 * Create forms nudge rather than gate: an unnamed commitment is valid, so the
 * honest thing is to show the author what declining to name it actually
 * produces. Runs the identical tiers as a live row by construction.
 */
export function pendingCommitmentLabel(
  shape: {
    counterparty: Address | undefined
    token: Address | undefined
    amount: bigint | undefined
    acceptsContributions?: boolean
  },
  ctx: CommitmentLabelContext = {},
): string | undefined {
  if (!shape.counterparty || !shape.token) return undefined
  return derivedLabelFrom(
    {
      kind: 'commitment',
      other: shape.counterparty,
      viewerCommitted: true,
      token: shape.token,
      amount: shape.amount ?? 0n,
      paired: false,
      acceptsContributions: shape.acceptsContributions ?? false,
    },
    ctx,
  )
}

function clamp(value: string): { text: string; full: string } {
  if (value.length <= MAX_TITLE_CHARS) return { text: value, full: value }
  return { text: `${value.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…`, full: value }
}
