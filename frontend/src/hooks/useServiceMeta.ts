import { rewriteIpfsURI } from '../lib/ipfs'
import { asString } from '../lib/metadata'

/**
 * Service identity fallback shape — fields the registry config (or a similar
 * descriptor) provides regardless of indexer state. The hook always returns
 * non-empty `name` + `description` strings, falling back to these when the
 * vault.v1 metadata payload is missing or sparse.
 */
export interface ServiceMetaFallback {
  name: string
  description: string
}

export interface ServiceMeta {
  name: string
  description: string
  /** Resolved IPFS / data: URI; null if no logo metadata. */
  logoSrc: string | null
  /** Raw website URL from metadata; null if absent. The display layer is
   *  responsible for `hostnameOf()` if it wants the host-only form. */
  website: string | null
  /** Raw twitter URL from metadata; null if absent. */
  twitter: string | null
}

/**
 * Read service identity from a vault.v1-shaped metadata payload, falling
 * back to a registry-config descriptor when the payload is sparse.
 *
 * Pure helper (not a React hook — no use* prefix internally), intentionally
 * synchronous so callers can pass it through `useMemo` if they need
 * stability. Names "use" anyway because the surrounding files conventionally
 * compose hooks for metadata reading and contributors expect the prefix.
 *
 * Lifted from duplicate metadata-extraction code in Services.tsx and
 * Service.tsx — same five fields, same resolution order, same IPFS rewrite.
 */
export function useServiceMeta(
  meta: Record<string, unknown> | null,
  fallback: ServiceMetaFallback,
): ServiceMeta {
  const name = asString(meta?.name) ?? fallback.name
  const description = asString(meta?.description) ?? fallback.description
  const logoURI = asString(meta?.logoURI)
  const website = asString(meta?.website) ?? null
  const twitter = asString(meta?.twitter) ?? null
  const logoSrc = logoURI ? rewriteIpfsURI(logoURI) : null
  return { name, description, logoSrc, website, twitter }
}
