import { type Address, erc20Abi } from 'viem'
import { useReadContracts } from 'wagmi'
import {
  commitmentManagerAbi,
  commitmentsVaultAbi,
  useReadCommitmentsVaultConvertToAssets,
} from '../generated'
import { IMMUTABLE, POLL } from './polling'

export interface VaultPosition {
  /** Vault shares held in the user's WALLET (ERC-4626 balanceOf). These are
   *  freely withdrawable from the vault; they are NOT yet backing any commitment. */
  shares: bigint | undefined
  /** Free vault-share balance deposited into the manager ledger — available to
   *  back new commitments or `manager.withdraw`. Sourced from
   *  `manager.freeBalance(vaultShare, user)`; undefined when no `managerAddress`. */
  free: bigint | undefined
  /** Vault shares currently encumbered by active commitments in the manager
   *  ledger (`manager.encumberedBalance(vaultShare, user)`). */
  encumbered: bigint | undefined
  /** convertToAssets(shares) — underlying value of the wallet shares. */
  underlyingValue: bigint | undefined
  assetAddress: Address | undefined
  assetSymbol: string | undefined
  assetName: string | undefined
  assetDecimals: number | undefined
  shareDecimals: number | undefined
  depositsPaused: boolean
  isLoading: boolean
  refetch: () => void
}

interface UseVaultPositionParams {
  vaultAddress: Address | undefined
  viewAddress: Address | undefined
  /**
   * Manager whose ledger holds the free/encumbered split for this vault's
   * shares. Optional: when omitted, `free`/`encumbered` are undefined and only
   * the pure ERC-4626 vault fields are populated. (v2: the vault no longer
   * tracks encumbrance — that lives in the manager's per-(token, user) ledger.)
   */
  managerAddress?: Address | undefined
}

export function useVaultPosition({
  vaultAddress,
  viewAddress,
  managerAddress,
}: UseVaultPositionParams): VaultPosition {
  const enabled = !!vaultAddress && !!viewAddress

  // Immutable: the vault's asset and share decimals, then the asset's metadata.
  // These do not depend on the viewer, so they load with no wallet connected:
  // a page that falls back to 18 decimals would show a 6-decimal vault's TVL as ~0.
  const { data: vaultMeta } = useReadContracts({
    contracts: [
      { abi: commitmentsVaultAbi, address: vaultAddress, functionName: 'asset' },
      { abi: commitmentsVaultAbi, address: vaultAddress, functionName: 'decimals' },
    ],
    query: { enabled: !!vaultAddress, ...IMMUTABLE },
  })
  const assetAddress = vaultMeta?.[0]?.result
  const shareDecimals = vaultMeta?.[1]?.result
  const { data: assetMeta } = useReadContracts({
    contracts: [
      { abi: erc20Abi, address: assetAddress, functionName: 'decimals' },
      { abi: erc20Abi, address: assetAddress, functionName: 'symbol' },
      { abi: erc20Abi, address: assetAddress, functionName: 'name' },
    ],
    query: { enabled: !!assetAddress, ...IMMUTABLE },
  })

  // Live: wallet shares and the deposit pause flag.
  const { data: live, isLoading: liveLoading, refetch: refetchLive } = useReadContracts({
    contracts: [
      {
        abi: erc20Abi,
        address: vaultAddress,
        functionName: 'balanceOf',
        args: viewAddress ? [viewAddress] : undefined,
      },
      { abi: commitmentsVaultAbi, address: vaultAddress, functionName: 'depositsPaused' },
    ],
    query: { enabled, refetchInterval: POLL.fast },
  })
  const shares = live?.[0]?.result

  // Manager-ledger free/encumbered for this vault's shares (token = vault share).
  const ledgerArgs = vaultAddress && viewAddress ? ([vaultAddress, viewAddress] as const) : undefined
  const { data: ledger, isLoading: ledgerLoading, refetch: refetchLedger } = useReadContracts({
    contracts: [
      { abi: commitmentManagerAbi, address: managerAddress, functionName: 'freeBalance', args: ledgerArgs },
      { abi: commitmentManagerAbi, address: managerAddress, functionName: 'encumberedBalance', args: ledgerArgs },
    ],
    query: { enabled: enabled && !!managerAddress, refetchInterval: POLL.fast },
  })
  const free = ledger?.[0]?.result
  const encumbered = ledger?.[1]?.result

  // convertToAssets depends on balanceOf result — second render pass
  const { data: underlyingValue, isLoading: underlyingLoading, refetch: refetchUnderlying } =
    useReadCommitmentsVaultConvertToAssets({
      address: vaultAddress,
      args: shares !== undefined ? [shares] : undefined,
      query: {
        enabled: enabled && shares !== undefined,
        refetchInterval: POLL.fast,
      },
    })

  function refetch() {
    void refetchLive()
    void refetchLedger()
    void refetchUnderlying()
  }

  return {
    shares,
    free,
    encumbered,
    underlyingValue: underlyingValue as bigint | undefined,
    assetAddress,
    assetSymbol: assetMeta?.[1]?.result,
    assetName: assetMeta?.[2]?.result,
    assetDecimals: assetMeta?.[0]?.result,
    shareDecimals,
    depositsPaused: live?.[1]?.result === true,
    isLoading: liveLoading || ledgerLoading || underlyingLoading,
    refetch,
  }
}
