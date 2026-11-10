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

/** A non-2xx response from the indexer REST API. */
export class IndexerError extends Error {
  readonly status: number
  readonly path: string
  constructor(status: number, path: string) {
    super(`Indexer error: ${status} (${path})`)
    this.name = 'IndexerError'
    this.status = status
    this.path = path
  }
}

/**
 * REST fetch, `res.ok` check and JSON parse. Throws {@link IndexerError} on a
 * non-2xx response. The one way read hooks call the indexer's REST API.
 */
export async function indexerJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await indexerFetch(path, init)
  if (!res.ok) throw new IndexerError(res.status, path)
  return (await res.json()) as T
}

/** {@link indexerJson}, but a 404 resolves to `null` (entity not indexed). */
export async function indexerJsonOrNull<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    return await indexerJson<T>(path, init)
  } catch (e) {
    if (e instanceof IndexerError && e.status === 404) return null
    throw e
  }
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

/** {@link indexerGraphql}, throwing the first GraphQL error instead of returning it. */
export async function indexerGraphqlData<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await indexerGraphql<T>(query, variables)
  if (res.errors && res.errors.length > 0) throw new Error(res.errors[0].message)
  if (!res.data) throw new Error('Indexer GraphQL returned no data')
  return res.data
}
