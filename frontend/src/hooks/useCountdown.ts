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

/**
 * Format a millisecond duration as a human-readable countdown string.
 * - <= 0: "MATURED"
 * - >= 1 day: "Xd Yh Zm"
 * - < 1 day: "Xh Ym Zs"
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'MATURED'

  const totalSecs = Math.floor(ms / 1000)
  const days = Math.floor(totalSecs / 86400)
  const hours = Math.floor((totalSecs % 86400) / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60

  if (ms >= 86400000) {
    return `${days}d ${hours}h ${mins}m`
  }
  return `${hours}h ${mins}m ${secs}s`
}
