import { useChainId } from 'wagmi'
import { useAnvilTime } from './useAnvilTime'
import { useNowSelect } from './useNow'

const ANVIL_CHAIN_ID = 31337

/**
 * "Display now" — the timestamp countdowns and pending-window UI should be
 * compared against. On anvil (chainId 31337) we read the latest block
 * timestamp so the admin TimeControls (`evm_increaseTime`, `warpTo`) move
 * the UI alongside the chain. On any other chain the anvil poll is disabled
 * and we use the local wall clock, which closely tracks the chain anyway.
 *
 * Returns seconds since the unix epoch, as a number.
 */
export function useDisplayNow(): number {
  return useDisplayNowSelect((now) => now)
}

/**
 * {@link useDisplayNow} through a selector: the caller re-renders only when
 * `select(now)` changes. `select` must return a primitive or stable value.
 */
export function useDisplayNowSelect<T>(select: (nowSeconds: number) => T): T {
  const chainId = useChainId()
  const onAnvil = chainId === ANVIL_CHAIN_ID
  const anvilNow = useAnvilTime(2000, onAnvil).now
  return useNowSelect((wall) =>
    select(onAnvil && anvilNow !== undefined ? Number(anvilNow) : Number(wall)),
  )
}
