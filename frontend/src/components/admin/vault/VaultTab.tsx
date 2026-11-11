import { useState } from 'react'
import { useChainId } from 'wagmi'
import { erc20Abi, parseUnits, type Address } from 'viem'
import { Input, Notice } from '../../ui'
import { commitmentsVaultAbi } from '../../../generated'
import { getContractAddresses } from '../../../config/contracts'
import { AdminActionPanel } from '../AdminActionPanel'
import { useAdminAction } from '../../../hooks/useAdminAction'
import { MOCK_ERC20_MINT_ABI } from '../../../lib/mockErc20Abi'

const DEFAULT_ASSET_DECIMALS = 6

export function VaultTab() {
  const chainId = useChainId()
  const { commitmentsVault } = getContractAddresses(chainId)

  if (!commitmentsVault) {
    return (
      <Notice tone="warn" title="Vault not configured">
        VITE_COMMITMENTS_VAULT_ADDRESS is unset. Run `just dev-up` to deploy + sync env.
      </Notice>
    )
  }

  return (
    <div className="ds-stack ds-stack-4">
      <DepositPanel vault={commitmentsVault} />
      <RedeemPanel vault={commitmentsVault} />
      <PauseRow vault={commitmentsVault} />
      <SetStrategyPanel vault={commitmentsVault} />
    </div>
  )
}

function DepositPanel({ vault }: { vault: Address }) {
  const action = useAdminAction()
  const [assetAddress, setAssetAddress] = useState('')
  const [amount, setAmount] = useState('100')
  const [decimals, setDecimals] = useState(String(DEFAULT_ASSET_DECIMALS))

  const submit = async () => {
    const decimalsN = Number(decimals)
    const value = parseUnits(amount, decimalsN)
    await action.run(async ({ walletClient, publicClient, actorAddress }) => {
      const asset =
        (assetAddress as Address) ||
        ((await publicClient.readContract({
          address: vault,
          abi: commitmentsVaultAbi,
          functionName: 'asset',
        })) as Address)
      // Anvil-only convenience: top up MockERC20 balance if the actor is
      // short. Falls through to a clean approve+deposit when balance is fine.
      const balance = (await publicClient.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [actorAddress],
      })) as bigint
      if (balance < value) {
        const mintHash = await walletClient.writeContract({
          address: asset,
          abi: MOCK_ERC20_MINT_ABI,
          functionName: 'mint',
          args: [actorAddress, value - balance],
          chain: walletClient.chain,
          account: walletClient.account!,
        })
        await publicClient.waitForTransactionReceipt({ hash: mintHash })
      }
      const allowance = (await publicClient.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [actorAddress, vault],
      })) as bigint
      if (allowance < value) {
        const approveHash = await walletClient.writeContract({
          address: asset,
          abi: erc20Abi,
          functionName: 'approve',
          args: [vault, value],
          chain: walletClient.chain,
          account: walletClient.account!,
        })
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
      }
      return walletClient.writeContract({
        address: vault,
        abi: commitmentsVaultAbi,
        functionName: 'deposit',
        args: [value, actorAddress],
        chain: walletClient.chain,
        account: walletClient.account!,
      })
    })
  }

  return (
    <AdminActionPanel
      title="Deposit"
      description="On anvil, mints MockERC20 if balance is short, approves, then deposits. Receiver = actor."
      submitLabel="Deposit"
      onSubmit={submit}
      disabled={!Number(amount)}
      state={action.state}
    >
      <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <Input
          aria-label="amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="amount"
          style={{ maxWidth: 160 }}
        />
        <Input
          aria-label="decimals"
          value={decimals}
          onChange={(e) => setDecimals(e.target.value)}
          placeholder="decimals"
          style={{ maxWidth: 100 }}
          suffix="dec"
        />
        <Input
          aria-label="asset address (optional override)"
          value={assetAddress}
          onChange={(e) => setAssetAddress(e.target.value)}
          placeholder="asset address (auto)"
          style={{ minWidth: 280, flex: 1 }}
        />
      </div>
    </AdminActionPanel>
  )
}

function RedeemPanel({ vault }: { vault: Address }) {
  const action = useAdminAction()
  const [shares, setShares] = useState('100')
  const [decimals, setDecimals] = useState(String(DEFAULT_ASSET_DECIMALS))

  const submit = async () => {
    const value = parseUnits(shares, Number(decimals))
    await action.run(({ walletClient }) => {
      const owner = walletClient.account!.address
      return walletClient.writeContract({
        address: vault,
        abi: commitmentsVaultAbi,
        // v2: instant ERC-4626 redeem — no unbonding queue.
        functionName: 'redeem',
        args: [value, owner, owner],
        chain: walletClient.chain,
        account: walletClient.account!,
      })
    })
  }

  return (
    <AdminActionPanel
      title="Redeem shares"
      description="Instant ERC-4626 redeem — burns shares and returns the underlying asset to the caller. No unbonding queue."
      submitLabel="Redeem"
      onSubmit={submit}
      disabled={!Number(shares)}
      state={action.state}
    >
      <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <Input
          aria-label="shares"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          placeholder="shares"
          style={{ maxWidth: 200 }}
          suffix="shares"
        />
        <Input
          aria-label="decimals"
          value={decimals}
          onChange={(e) => setDecimals(e.target.value)}
          placeholder="decimals"
          style={{ maxWidth: 100 }}
          suffix="dec"
        />
      </div>
    </AdminActionPanel>
  )
}

// v2 vault circuit breakers are deposit-only — withdrawals are instant and
// forfeiture is paused on the manager, not the vault.
const PAUSE_ACTIONS = [
  { fn: 'pauseDeposits', label: 'Pause deposits' },
  { fn: 'unpauseDeposits', label: 'Unpause deposits' },
] as const

function PauseRow({ vault }: { vault: Address }) {
  return (
    <div className="ds-stack ds-stack-3">
      <div className="ds-text-sm ds-muted">Circuit breakers (admin / pauser role)</div>
      <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        {PAUSE_ACTIONS.map((a) => (
          <PausePanel key={a.fn} vault={vault} fnName={a.fn} label={a.label} />
        ))}
      </div>
    </div>
  )
}

function PausePanel({
  vault,
  fnName,
  label,
}: {
  vault: Address
  fnName: (typeof PAUSE_ACTIONS)[number]['fn']
  label: string
}) {
  const action = useAdminAction()
  const submit = async () => {
    await action.run(({ walletClient }) =>
      walletClient.writeContract({
        address: vault,
        abi: commitmentsVaultAbi,
        functionName: fnName,
        chain: walletClient.chain,
        account: walletClient.account!,
      }),
    )
  }
  return (
    <div style={{ minWidth: 240, flex: '1 1 240px' }}>
      <AdminActionPanel
        title={label}
        submitLabel={label}
        onSubmit={submit}
        state={action.state}
      />
    </div>
  )
}

function SetStrategyPanel({ vault }: { vault: Address }) {
  const action = useAdminAction()
  const [strategy, setStrategy] = useState<string>('')

  const submit = async () => {
    await action.run(({ walletClient }) =>
      walletClient.writeContract({
        address: vault,
        abi: commitmentsVaultAbi,
        functionName: 'setYieldStrategy',
        args: [strategy as Address],
        chain: walletClient.chain,
        account: walletClient.account!,
      }),
    )
  }

  return (
    <AdminActionPanel
      title="Vault.setYieldStrategy"
      description="Admin only. Swap the yield strategy contract. Pass 0x0… to disable strategy (idle vault)."
      submitLabel="Set strategy"
      onSubmit={submit}
      disabled={!strategy}
      state={action.state}
    >
      <Input
        aria-label="strategy address"
        value={strategy}
        onChange={(e) => setStrategy(e.target.value)}
        placeholder="strategy address (or 0x0…0)"
        style={{ minWidth: 360 }}
      />
    </AdminActionPanel>
  )
}
