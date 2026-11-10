/**
 * Shared read cadences. Every polling read hook picks one of these instead of
 * a literal, so the app's polling load is set in one place.
 *
 * - `fast`: live position, commitment and queue state (was 10–20 s).
 * - `slow`: aggregates and directories (was 30 s).
 * - `idle`: slow-moving history and registry views (was 60 s).
 */
export const POLL = {
  fast: 15_000,
  slow: 30_000,
  idle: 60_000,
} as const

/** Query options for a value that never changes once read (token decimals, symbol, name). */
export const IMMUTABLE = { staleTime: Infinity, gcTime: Infinity } as const

/**
 * Refetch until `isCaughtUp` holds on the fresh data, or `attempts` run out.
 * The shared "wait for the indexer to reach block N" helper: a refetch fired
 * at receipt time otherwise races the indexer and reads the pre-tx state.
 */
export async function refetchUntil<T>(
  refetch: () => Promise<{ data: T | undefined }>,
  isCaughtUp: (data: T | undefined) => boolean,
  { attempts = 12, delayMs = 1_000 }: { attempts?: number; delayMs?: number } = {},
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const { data } = await refetch()
    if (isCaughtUp(data)) return
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}
