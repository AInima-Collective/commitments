import { useEffect, useState } from 'react'

/**
 * Returns the current Unix timestamp (seconds) and re-renders every `tickMs`
 * milliseconds. Used by countdown-driven derived state (e.g. resolve action
 * availability) so callers don't have to call `Date.now()` directly during
 * render — which the react-hooks/purity rule forbids.
 */
export function useNowSeconds(tickMs = 1000): bigint {
  const [now, setNow] = useState<bigint>(() => BigInt(Math.floor(Date.now() / 1000)))

  useEffect(() => {
    const id = setInterval(() => {
      setNow(BigInt(Math.floor(Date.now() / 1000)))
    }, tickMs)
    return () => clearInterval(id)
  }, [tickMs])

  return now
}
