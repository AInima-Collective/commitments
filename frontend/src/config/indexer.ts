/**
 * Indexer config — base URL for the Ponder indexer REST + GraphQL.
 *
 * If `VITE_INDEXER_URL` is not set, the graph tabs display an informational
 * empty state prompting the user to start the indexer. All other features of
 * the app (tables, direct-RPC reads) keep working unchanged.
 */
export const INDEXER_URL = import.meta.env.VITE_INDEXER_URL as string | undefined

export const hasIndexer = Boolean(INDEXER_URL && INDEXER_URL.length > 0)

/**
 * Resolve the trailing-slash-trimmed indexer base URL, or throw a single
 * canonical error. Shared by every indexer helper so they reject identically
 * when the indexer is not configured (guard with `hasIndexer` first to avoid it).
 */
function requireIndexerBase(): string {
  if (!INDEXER_URL) {
    throw new Error('VITE_INDEXER_URL not set')
  }
  return INDEXER_URL.replace(/\/$/, '')
}

/**
 * Low-level REST fetch — returns the raw `Response` so callers can branch on
 * `res.ok` / stream / parse as needed. Rejects with the canonical
 * "VITE_INDEXER_URL not set" error when the indexer is unconfigured, matching
 * {@link indexerGraphql}.
 */
export async function indexerFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${requireIndexerBase()}${path}`, init)
}

export interface GraphqlError {
  message: string
  path?: ReadonlyArray<string | number>
}

export interface GraphqlResponse<T> {
  data: T | null
  errors?: GraphqlError[]
}

/**
 * POST a GraphQL query to the Ponder indexer's /graphql endpoint.
 *
 * Throws if !hasIndexer (caller must check first). Returns the parsed
 * response including any top-level `errors` array so callers can decide
 * how to present partial data vs hard-fail.
 */
export async function indexerGraphql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphqlResponse<T>> {
  const res = await fetch(`${requireIndexerBase()}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) {
    return { data: null, errors: [{ message: `HTTP ${res.status}` }] }
  }
  const json = (await res.json()) as GraphqlResponse<T>
  return json
}
