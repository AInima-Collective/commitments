/**
 * Shared per-IP fixed-window rate limiting for the indexer's write/expensive
 * endpoints (metadata pinning, manual snapshot trigger).
 *
 * Intentionally simple: a single-process in-memory counter that blunts
 * accidental floods and casual abuse, not a distributed DoS. Each caller gets
 * its own {@link RateLimiter} so windows/limits can differ per endpoint.
 */

export interface RateLimiterOptions {
  /** Sliding-window length in milliseconds. */
  windowMs: number
  /** Maximum requests allowed per window before rejection. */
  maxPerWindow: number
}

export interface RateLimiter {
  /** Returns true when `key` has exceeded its budget for the current window. */
  limited: (key: string) => boolean
}

export function createRateLimiter({ windowMs, maxPerWindow }: RateLimiterOptions): RateLimiter {
  const buckets = new Map<string, { count: number; windowStart: number }>()
  return {
    limited(key: string): boolean {
      const now = Date.now()
      const bucket = buckets.get(key)
      if (!bucket || now - bucket.windowStart >= windowMs) {
        buckets.set(key, { count: 1, windowStart: now })
        return false
      }
      bucket.count += 1
      return bucket.count > maxPerWindow
    },
  }
}

/**
 * Derive a stable client key from proxy headers, falling back to a shared
 * `'global'` bucket when no client IP is available.
 */
export function clientKey(forwardedFor: string | undefined, realIp: string | undefined): string {
  const fwd = forwardedFor?.split(',')[0]?.trim()
  return fwd || realIp?.trim() || 'global'
}
