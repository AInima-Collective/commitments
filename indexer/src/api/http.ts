import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** `JSON.stringify` with every bigint written as a decimal string. */
export function stringifyBig(data: unknown): string {
  return JSON.stringify(data, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
}

/** `c.json` for payloads that carry bigints (raw rows included). */
export function jsonBig(c: Context, data: unknown, status: ContentfulStatusCode = 200): Response {
  return c.body(stringifyBig(data), status, { 'Content-Type': 'application/json' })
}

/** `?limit=` as an integer in [1, max]; `fallback` when absent or not a number. */
export function parseLimit(c: Pick<Context, 'req'>, fallback: number, max: number): number {
  const raw = Number(c.req.query('limit') ?? fallback)
  return Math.min(Math.max(Number.isFinite(raw) ? Math.trunc(raw) : fallback, 1), max)
}

/** A non-negative decimal id (`0`, `42`), or null for anything else. */
export function parseId(raw: string | undefined): bigint | null {
  return raw !== undefined && /^(0|[1-9]\d*)$/.test(raw) ? BigInt(raw) : null
}

/**
 * Keyset cursor `<block>:<key>` for newest-first lists ordered by
 * (block DESC, key DESC). `key` is the row's unique tie-break within a block.
 * Returns null when the cursor is malformed.
 */
export function parseBlockCursor(raw: string): { block: bigint; key: string } | null {
  const m = /^(0|[1-9]\d*):(.+)$/.exec(raw)
  return m ? { block: BigInt(m[1]), key: m[2] } : null
}

export function encodeBlockCursor(block: bigint, key: string | bigint): string {
  return `${block}:${key}`
}
