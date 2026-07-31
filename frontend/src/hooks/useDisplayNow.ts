import { useChainId } from 'wagmi'
import { useAnvilTime } from './useAnvilTime'
import { useNowSeconds } from './useNow'

const ANVIL_CHAIN_ID = 31337

/**
 * "Display now" — the timestamp countdowns and pending-window UI should be
 * compared against. On anvil (chainId 31337) we read the latest block
 * timestamp so the admin TimeControls (`evm_increaseTime`, `warpTo`) move
 * the UI alongside the chain. On any other chain we fall back to the local
 * wall clock — which closely tracks the chain anyway and avoids hammering an
 * RPC every second.
 *
 * Returns seconds since the unix epoch, as a number.
 */
export function useDisplayNow(): number {
  const chainId = useChainId()
  const anvilTime = useAnvilTime(2000)
  const wallNow = useNowSeconds()
  if (chainId === ANVIL_CHAIN_ID && anvilTime.now !== undefined) {
    return Number(anvilTime.now)
  }
  return Number(wallNow)
}
