import { useEffect, useState } from 'react'

/**
 * Real-time countdown hook — returns milliseconds remaining until maturesAt (Unix seconds).
 * Returns 0 when matured (timestamp is in the past).
 * Updates every second.
 */
export function useCountdown(maturesAtSeconds: bigint): number {
  function getRemainingMs(): number {
    const nowMs = Date.now()
    const maturesAtMs = Number(maturesAtSeconds) * 1000
    return Math.max(0, maturesAtMs - nowMs)
  }

  const [remaining, setRemaining] = useState<number>(getRemainingMs)

  useEffect(() => {
    // If already matured, no need to run interval
    if (getRemainingMs() === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external subscription (timer) reset on key change; see frontend/docs/eslint-disable-rationale.md §Pattern-3
      setRemaining(0)
      return
    }

    const interval = setInterval(() => {
      const ms = getRemainingMs()
      setRemaining(ms)
      if (ms === 0) {
        clearInterval(interval)
      }
    }, 1000)

    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maturesAtSeconds])

  return remaining
}
