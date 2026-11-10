import { useNowSeconds } from './useNow'

/**
 * Real-time countdown hook — returns milliseconds remaining until maturesAt (Unix seconds).
 * Returns 0 when matured (timestamp is in the past). Rides the shared one-second ticker.
 */
export function useCountdown(maturesAtSeconds: bigint): number {
  const now = useNowSeconds()
  return maturesAtSeconds > now ? Number(maturesAtSeconds - now) * 1000 : 0
}
