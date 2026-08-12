// Reading `commitment.v1` / `agreement.v1` payloads off an indexed row.
//
// Pure — no React, no DOM. Two things live here and nothing else:
//
//   1. Field accessors that survive a hostile payload. `metadataContent` is a
//      jsonb column holding whatever the producer published, so every field is
//      `unknown` until proven otherwise. Nothing here throws on a malformed
//      document; the worst case is `undefined`.
//   2. The trust classification (`metadataTrust`) that decides how much
//      authority that text has earned. Presentation rules key off it — see
//      `commitmentLabel` and the terms/provenance surfaces.
//
// Callers should not reach into `row.commitment.metadataContent` directly.
// Going through here is what keeps the "unverified text never gets a heading"
// rule in one place instead of re-derived at each render site.

import { type UnifiedRow } from '../hooks/useUnifiedRows'
import { asString, asStringArray } from './metadata'

/** Indexer classification of the fetch + hash check. */
export type MetadataStatus = 'empty' | 'ok' | 'mismatch' | 'unreachable'

/**
 * How much authority a row's off-chain text has earned.
 *
 * A title is attacker-influenced text living at a URI someone else controls.
 * Promoting it into a heading grants it authority, so the promotion has to be
 * earned:
 *
 *   attested    — fetched, and its bytes hash to the value posted on chain.
 *                 The strongest claim available: whoever created the commitment
 *                 committed to these exact bytes.
 *   unattested  — fetched, but the creator posted no hash. The bytes at the URI
 *                 can change at any time and nothing on chain would notice.
 *   mismatch    — a hash WAS posted and the bytes no longer match it. The
 *                 content has been altered since creation, or was never what
 *                 was attested. This is the hostile case.
 *   unreachable — nothing could be fetched. Absence of evidence.
 *   none        — no metadata was ever attached.
 */
export type MetadataTrust = 'attested' | 'unattested' | 'mismatch' | 'unreachable' | 'none'

const ZERO_HASH = `0x${'0'.repeat(64)}`

/** True when the row is a commitment carrying a non-zero on-chain hash attestation. */
function hasHashAttestation(row: UnifiedRow): boolean {
  if (row.kind !== 'commitment') return false
  const hash = row.commitment.metadataHash
  return !!hash && hash.toLowerCase() !== ZERO_HASH
}

/**
 * Classify a row's metadata per the table above. Proposals carry no resolved
 * metadata on the unified row today, so they classify as `none` — they get a
 * derived label, which is the correct outcome either way.
 */
export function metadataTrust(row: UnifiedRow): MetadataTrust {
  if (row.kind !== 'commitment') return 'none'
  switch (row.commitment.metadataStatus) {
    case 'ok':
      return hasHashAttestation(row) ? 'attested' : 'unattested'
    case 'mismatch':
      return 'mismatch'
    case 'unreachable':
      return 'unreachable'
    default:
      return 'none'
  }
}

/**
 * True when the row's off-chain text may be rendered in a position of
 * authority (a heading, a list row's primary line). `unattested` qualifies —
 * it is the common honest case for a producer who skipped the hash — but the
 * surface must mark it, which is why `metadataTrust` stays available.
 *
 * `mismatch` deliberately does NOT qualify. That title is the one an attacker
 * would swap in after the fact.
 */
export function mayPromoteMetadataText(trust: MetadataTrust): boolean {
  return trust === 'attested' || trust === 'unattested'
}

/** The resolved payload, or undefined when there is nothing to read. */
export function metadataContent(row: UnifiedRow): Record<string, unknown> | undefined {
  return row.kind === 'commitment' ? row.commitment.metadataContent : undefined
}

/** `schemaVersion` as published. Undefined when absent or not a string. */
export function metadataSchemaVersion(row: UnifiedRow): string | undefined {
  return asString(metadataContent(row)?.schemaVersion)
}

/**
 * Schemas whose fields this app renders field-by-field. Anything else falls
 * back to the raw JSON dump, because for an unknown schema the dump genuinely
 * IS the content rather than a debugging affordance.
 */
const RENDERED_SCHEMAS: ReadonlySet<string> = new Set(['commitment.v1', 'agreement.v1'])

/** True when we render this payload's fields rather than dumping it. */
export function rendersSchema(row: UnifiedRow): boolean {
  const version = metadataSchemaVersion(row)
  return version !== undefined && RENDERED_SCHEMAS.has(version)
}

/**
 * Off-chain `title`, whatever its trust level. Whitespace is collapsed so a
 * title carrying newlines cannot break a table row's layout.
 *
 * This is the RAW value: it does not consult `metadataTrust`. Use
 * `commitmentLabel` for anything user-facing; this exists for the surfaces
 * that deliberately show withheld text inside a warning, and for search.
 */
export function metadataTitle(row: UnifiedRow): string | undefined {
  const raw = asString(metadataContent(row)?.title)
  return raw === undefined ? undefined : collapseWhitespace(raw)
}

/** Off-chain `description`. Markdown-allowed per the schema; never HTML. */
export function metadataDescription(row: UnifiedRow): string | undefined {
  return asString(metadataContent(row)?.description)
}

/** Off-chain `termsURI` — a link to the fuller terms document. */
export function metadataTermsURI(row: UnifiedRow): string | undefined {
  return asString(metadataContent(row)?.termsURI)
}

/** Off-chain `trustgraphsAttestationId`. */
export function metadataAttestationId(row: UnifiedRow): string | undefined {
  return asString(metadataContent(row)?.trustgraphsAttestationId)
}

/**
 * Free-form `tags`, normalized for display and filtering: trimmed, lowercased,
 * de-duplicated, and capped. The cap is not cosmetic — tags drive a filter
 * facet built from the loaded rows, and one row publishing five hundred of
 * them would otherwise own the entire facet.
 */
export function metadataTags(row: UnifiedRow): string[] {
  const raw = asStringArray(metadataContent(row)?.tags)
  if (!raw) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const tag of raw) {
    const normalized = collapseWhitespace(tag).toLowerCase().slice(0, MAX_TAG_LENGTH)
    if (normalized.length === 0 || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

const MAX_TAG_LENGTH = 32
const MAX_TAGS = 12

/**
 * Every piece of the payload that free-text search should match, lowercased.
 * Deliberately includes `mismatch` titles: search is a lookup, not a
 * presentation surface, and a user hunting for the commitment they remember as
 * "Nightly backup" should find it even after its content was tampered with.
 */
export function metadataSearchText(row: UnifiedRow): string {
  const parts = [metadataTitle(row), metadataDescription(row), ...metadataTags(row)]
  return parts.filter((p): p is string => !!p).join(' ').toLowerCase()
}

/**
 * Narrow a `jsonb` column to a plain object, at the wire boundary.
 *
 * The indexer stores whatever parsed, so a payload of `[1,2,3]` or `"hello"`
 * is a legitimate row value. Neither is a metadata document, and neither
 * should reach a field accessor that expects to index by key.
 */
export function asMetadataObject(v: unknown): Record<string, unknown> | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined
  return v as Record<string, unknown>
}

/** Collapse all runs of whitespace (including newlines) to single spaces. */
function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
