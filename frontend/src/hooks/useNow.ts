import { useSyncExternalStore } from 'react'

// One module-level one-second ticker shared by every subscriber: a page with a
// hundred countdowns runs one interval, not a hundred.
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined
let current = wallSeconds()

function wallSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000))
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    current = wallSeconds()
    timer = setInterval(() => {
      current = wallSeconds()
      for (const l of listeners) l()
    }, 1000)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) clearInterval(timer)
  }
}

/**
 * Re-renders only when `select(now)` changes (by `Object.is`), so a component
 * that needs the clock only to cross a deadline does not re-render every
 * second. `select` must return a primitive or an otherwise stable value.
 */
export function useNowSelect<T>(select: (nowSeconds: bigint) => T): T {
  return useSyncExternalStore(subscribe, () => select(current))
}

/**
 * Returns the current Unix timestamp (seconds) and re-renders every second.
 * Used by countdown-driven derived state (e.g. resolve action availability) so
 * callers don't have to call `Date.now()` directly during render — which the
 * react-hooks/purity rule forbids. Subscribe from the leaf that shows the
 * time, not from a page root.
 */
export function useNowSeconds(): bigint {
  return useNowSelect((now) => now)
}
