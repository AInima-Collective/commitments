/**
 * A route's numeric id segment as a bigint: a plain decimal integer, or null
 * when it is absent or anything else (hex, sign, spaces, a word).
 */
export function parseIdParam(raw: string | undefined): bigint | null {
  return raw !== undefined && /^(0|[1-9]\d*)$/.test(raw) ? BigInt(raw) : null
}
