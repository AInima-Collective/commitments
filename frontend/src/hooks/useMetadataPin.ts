import { useCallback, useState } from 'react'
import { hasIndexer, indexerFetch } from '../config/indexer'

/**
 * Lifecycle of a single pin request.
 *
 *   idle    → nothing posted yet (or reset)
 *   pinning → POST in flight
 *   pinned  → endpoint returned a `{ metadataURI, metadataHash }` pair
 *   error   → request failed / indexer unreachable / non-2xx response
 */
export type MetadataPinStatus = 'idle' | 'pinning' | 'pinned' | 'error'

/**
 * Shape returned by `POST /metadata/pin` (see indexer/src/api/metadata.ts).
 * The hash is computed server-side over the *exact bytes the client posted*
 * and is therefore authoritative — callers must NOT recompute it.
 */
export interface MetadataPinResult {
  /** Content CID when pinned to IPFS; `null` for the dev `data:` fallback. */
  cid: string | null
  /** `ipfs://…` or `data:application/json;base64,…` — write this on-chain. */
  metadataURI: string
  /** keccak256 of the exact posted bytes — write this on-chain. */
  metadataHash: `0x${string}`
  /** Informational: which backend pinned the bytes. */
  service: string
}

/**
 * State + action shape for the metadata pin flow.
 *
 * Per the design contract (CONTRIBUTING.md §6 — "no imperative hook APIs"),
 * this returns a state shape plus a `pin` action that resolves to the result,
 * not an event emitter. Pages/components own the lifecycle.
 */
export interface UseMetadataPin {
  status: MetadataPinStatus
  result: MetadataPinResult | null
  error: string | null
  /**
   * POST the **exact** UTF-8 bytes of `jsonText` to the pin endpoint. The
   * caller is responsible for serializing the metadata object; the bytes are
   * hashed and pinned verbatim, so re-serialization here would diverge from
   * the authoritative hash. Resolves to the result on success, `null` on
   * failure (inspect `error`/`status` for detail).
   */
  pin: (jsonText: string) => Promise<MetadataPinResult | null>
  /** Return to `idle` and clear any result/error. */
  reset: () => void
}

interface PinErrorBody {
  error?: string
  message?: string
}

/**
 * `useMetadataPin` — thin wrapper over the indexer's `POST /metadata/pin`
 * endpoint. Mirrors the read-side `useIndexerMetadata` hooks: the indexer base
 * URL is resolved from `config/indexer` (`indexerFetch`), and the hook degrades
 * gracefully to an `error` state when no indexer is configured.
 */
export function useMetadataPin(): UseMetadataPin {
  const [status, setStatus] = useState<MetadataPinStatus>('idle')
  const [result, setResult] = useState<MetadataPinResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setStatus('idle')
    setResult(null)
    setError(null)
  }, [])

  const pin = useCallback(async (jsonText: string): Promise<MetadataPinResult | null> => {
    if (!hasIndexer) {
      setStatus('error')
      setResult(null)
      setError('Indexer not configured (VITE_INDEXER_URL is unset) — cannot pin metadata.')
      return null
    }
    setStatus('pinning')
    setResult(null)
    setError(null)
    try {
      // POST the raw bytes verbatim. A plain string body is sent as UTF-8, so
      // the bytes the server hashes match `jsonText` byte-for-byte.
      const res = await indexerFetch('/metadata/pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: jsonText,
      })
      if (!res.ok) {
        let detail = `HTTP ${res.status}`
        try {
          const body = (await res.json()) as PinErrorBody
          if (body.message) detail = body.message
          else if (body.error) detail = body.error
        } catch {
          /* non-JSON error body — keep the status-code detail */
        }
        setStatus('error')
        setError(detail)
        return null
      }
      const pinned = (await res.json()) as MetadataPinResult
      setResult(pinned)
      setStatus('pinned')
      return pinned
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : String(e))
      return null
    }
  }, [])

  return { status, result, error, pin, reset }
}
