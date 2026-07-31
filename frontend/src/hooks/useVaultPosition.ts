import { type Address, erc20Abi } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import {
  commitmentManagerAbi,
  useReadCommitmentsVaultAsset,
  useReadCommitmentsVaultConvertToAssets,
  useReadCommitmentsVaultDecimals,
  useReadCommitmentsVaultDepositsPaused,
} from '../generated'

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
  const queryOpts = { enabled, refetchInterval: 15_000 }

  // Read vault asset address
  const { data: assetAddress } = useReadCommitmentsVaultAsset({
    address: vaultAddress,
    query: queryOpts,
  })

  // Read vault share decimals
  const { data: shareDecimals } = useReadCommitmentsVaultDecimals({
    address: vaultAddress,
    query: queryOpts,
  })

  // Read asset token decimals and symbol
  const assetEnabled = !!assetAddress && enabled
  const { data: assetDecimals } = useReadContract({
    abi: erc20Abi,
    address: assetAddress,
    functionName: 'decimals',
    query: { enabled: assetEnabled, refetchInterval: 15_000 },
  })

  const { data: assetSymbol } = useReadContract({
    abi: erc20Abi,
    address: assetAddress,
    functionName: 'symbol',
    query: { enabled: assetEnabled, refetchInterval: 15_000 },
  })

  const { data: assetName } = useReadContract({
    abi: erc20Abi,
    address: assetAddress,
    functionName: 'name',
    query: { enabled: assetEnabled, refetchInterval: 15_000 },
  })

  // Wallet share balance (ERC-4626 balanceOf).
  const { data: sharesRaw, isLoading: sharesLoading, refetch: refetchShares } = useReadContract({
    abi: erc20Abi,
    address: vaultAddress,
    functionName: 'balanceOf',
    args: viewAddress ? [viewAddress] : undefined,
    query: queryOpts,
  })
  const shares = sharesRaw as bigint | undefined

  // Manager-ledger free/encumbered for this vault's shares (token = vault share).
  const ledgerEnabled = enabled && !!managerAddress
  const { data: ledgerData, isLoading: ledgerLoading, refetch: refetchLedger } = useReadContracts({
    contracts: [
      {
        abi: commitmentManagerAbi,
        address: managerAddress,
        functionName: 'freeBalance',
        args: vaultAddress && viewAddress ? [vaultAddress, viewAddress] : undefined,
      },
      {
        abi: commitmentManagerAbi,
        address: managerAddress,
        functionName: 'encumberedBalance',
        args: vaultAddress && viewAddress ? [vaultAddress, viewAddress] : undefined,
      },
    ],
    query: { enabled: ledgerEnabled, refetchInterval: 15_000 },
  })
  const free = ledgerData?.[0]?.result as bigint | undefined
  const encumbered = ledgerData?.[1]?.result as bigint | undefined

  // convertToAssets depends on balanceOf result — second render pass
  const { data: underlyingValue, isLoading: underlyingLoading, refetch: refetchUnderlying } =
    useReadCommitmentsVaultConvertToAssets({
      address: vaultAddress,
      args: shares !== undefined ? [shares] : undefined,
      query: {
        enabled: enabled && shares !== undefined,
        refetchInterval: 15_000,
      },
    })

  // Deposit pause flag (v2 vault has no withdrawal pause — exits are instant).
  const { data: depositsPausedRaw, refetch: refetchDepositsPaused } = useReadCommitmentsVaultDepositsPaused({
    address: vaultAddress,
    query: queryOpts,
  })

  function refetch() {
    void refetchShares()
    void refetchLedger()
    void refetchUnderlying()
    void refetchDepositsPaused()
  }

  return {
    shares,
    free,
    encumbered,
    underlyingValue: underlyingValue as bigint | undefined,
    assetAddress: assetAddress as Address | undefined,
    assetSymbol: assetSymbol as string | undefined,
    assetName: assetName as string | undefined,
    assetDecimals: assetDecimals as number | undefined,
    shareDecimals: shareDecimals as number | undefined,
    depositsPaused: depositsPausedRaw === true,
    isLoading: sharesLoading || ledgerLoading || underlyingLoading,
    refetch,
  }
}
