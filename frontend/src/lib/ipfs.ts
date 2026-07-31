// Turning a metadata URI into something a browser may follow.
//
// Pure — no React, no DOM. Lives in `lib/` rather than under a feature folder
// because every layer needs it: `components/ui` renders link-outs,
// `components/protocol` renders terms documents and operator logos, and pages
// render service profiles. A copy under `components/metadata/` had the
// protocol layer importing upward into a feature folder, which is exactly the
// dependency the layering rule exists to prevent.

export const IPFS_GATEWAY_DEFAULT: string =
  (import.meta.env.VITE_IPFS_GATEWAY as string | undefined) ?? 'https://ipfs.io/ipfs/'

/**
 * Rewrite `ipfs://` through a gateway; pass `https://` and
 * `data:application/json` (base64 or plaintext) through; reject any other
 * scheme by returning null.
 *
 * The allowlist is the point. `data:` URIs are narrowed to `application/json`
 * so the only thing a click can render is a JSON document rather than
 * arbitrary HTML or script, and everything unrecognized — `http://`,
 * `javascript:`, `file://`, a bare `example.com/x` — resolves to null so
 * callers render inert text instead of a live link.
 */
export function rewriteIpfsURI(uri: string): string | null {
  if (uri.startsWith('https://')) return uri
  if (uri.startsWith('data:application/json,')) return uri
  if (uri.startsWith('data:application/json;base64,')) return uri
  if (uri.startsWith('ipfs://')) {
    const rest = uri.slice('ipfs://'.length)
    const gw = IPFS_GATEWAY_DEFAULT.endsWith('/')
      ? IPFS_GATEWAY_DEFAULT
      : `${IPFS_GATEWAY_DEFAULT}/`
    return `${gw}${rest}`
  }
  return null
}
