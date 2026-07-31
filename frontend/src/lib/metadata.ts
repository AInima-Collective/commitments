// Pure helpers for reading off-chain metadata payloads (vault.v1, service.v1)
// and rendering their link fields. Used by feature pages — no React, no DOM.
//
// Extracted from Vault.tsx / Service.tsx / Services.tsx where these were
// duplicated identically. New sites should import from here rather than
// reintroduce inline copies.

/**
 * Narrow `unknown` to a non-empty string. Returns `undefined` for empty
 * strings, non-string values, and `null` so callers can `?? fallback`
 * without further checks.
 */
export function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/**
 * Narrow `unknown` to a non-empty array of non-empty strings. Returns
 * `undefined` if the input isn't an array, or if filtering would produce
 * an empty array. Filters out non-string and empty-string entries.
 */
export function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.filter((x): x is string => typeof x === 'string' && x.length > 0)
  return out.length > 0 ? out : undefined
}

/**
 * Best-effort hostname extraction for a URL string. Falls back to the
 * input if URL parsing throws so the UI never renders an empty link.
 */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/**
 * Convert a twitter.com / x.com URL into a `@handle` display string.
 * Returns the original URL untouched for any other shape so the link
 * still renders.
 */
export function twitterHandle(url: string): string {
  const m = url.match(/^https?:\/\/(?:twitter|x)\.com\/([^/?#]+)/i)
  return m ? `@${m[1]}` : url
}
