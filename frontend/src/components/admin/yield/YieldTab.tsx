import { useState } from 'react'
import { useChainId, useReadContracts } from 'wagmi'
import { type Address, type Hex, encodeAbiParameters, erc20Abi, parseUnits } from 'viem'
import { AddressDisplay, Button, Card, Input, Notice, Select, Skeleton, TokenAmount } from '../../ui'
import {
  commitmentManagerAbi,
  commitmentsVaultAbi,
  useReadCommitmentManagerGetCommitment,
  useReadCommitmentManagerStrategiesOf,
} from '../../../generated'
import {
  getContractAddresses,
  getDefaultBacking,
  getVaultRegistry,
} from '../../../config/contracts'
import { useTokenMeta } from '../../../hooks/useTokenMeta'
import {
  type SimulateYieldStep,
  useSimulateYieldToApy,
} from '../../../hooks/useSimulateYieldToApy'
import { AdminActionPanel } from '../AdminActionPanel'
import { useAdminAction } from '../useAdminAction'
import { MOCK_ERC20_MINT_ABI } from '../../../lib/mockErc20Abi'

/**
 * Best-effort decimals for a vault's underlying, keyed by asset symbol. The
 * vault registry carries only the symbol; these are the demo tokens' decimals.
 * Falls back to 18 for anything unrecognized.
 */
const ASSET_DECIMALS: Record<string, number> = {
  USDC: 6,
  USDT: 6,
  WETH: 18,
  ETH: 18,
  DAI: 18,
}

function decimalsForSymbol(symbol: string): number {
  return ASSET_DECIMALS[symbol.toUpperCase()] ?? 18
}

const EMPTY_CLAIM_DATA = '0x' as Hex
/** Committer abandonment-reclaim flag for IndexAppreciationYield: `abi.encode(true)`. */
const RECLAIM_CLAIM_DATA = encodeAbiParameters([{ type: 'bool' }], [true])

/**
 * YieldTab — v2 strategy-aware yield admin surface (rebuilt per FUTURE_WORK §2).
 *
 * v1's per-commitment accumulator (`pendingYieldIncentive`/`distribute`/
 * `claimYieldIncentive`) is gone. v2 routes every value flow through pluggable
 * distribution strategies bound at creation, so this tab drives the manager's
 * strategy surface directly:
 *   - inspect:      `strategiesOf(id)` + `pending(id, strategy, 0x)` + `escrowOf(token, strategy)`
 *   - distribute:   `distributeAll(id)` (permissionless accrual push)
 *   - fund:         approve → `fundStrategy(strategy, token, amount)` (FlatFee prefund)
 *   - claim:        `claim(id, strategy, claimData)` (counterparty payout / committer reclaim)
 */
export function YieldTab() {
  const chainId = useChainId()
  const { commitmentManager, indexYieldStrategy, flatFeeStrategy } = getContractAddresses(chainId)

  if (!commitmentManager) {
    return (
      <Notice tone="warn" title="Manager not configured">
        VITE_COMMITMENT_MANAGER_ADDRESS is unset. Run `just dev-up` to deploy + sync env.
      </Notice>
    )
  }

  return (
    <div className="ds-stack ds-stack-4">
      <SimulateYieldToApyPanel chainId={chainId} />
      <DonateNavPanel chainId={chainId} />
      <InspectYieldPanel manager={commitmentManager} />
      <DistributeAllPanel manager={commitmentManager} />
      <FundStrategyPanel
        manager={commitmentManager}
        defaultStrategy={flatFeeStrategy}
        chainId={chainId}
      />
      <ClaimPanel manager={commitmentManager} defaultStrategy={indexYieldStrategy} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Simulate yield → APY — one orchestrated control that closes the loop with    */
/* REAL donate(): baseline snapshot → donate → warp +4d → snapshot → refetch.   */
/* -------------------------------------------------------------------------- */

const SIMULATE_STEP_LABEL: Record<SimulateYieldStep, string> = {
  idle: '',
  baseline: '1/4 baseline snapshot (current chain-time price)…',
  donating: '2/4 donating real backing (mint → approve → donate)…',
  warping: '3/4 advancing chain time +4 days…',
  snapshot: '4/4 post-warp snapshot (computing apy7d)…',
  done: 'Done — the vault APY now reflects real share-price movement.',
}

function SimulateYieldToApyPanel({ chainId }: { chainId: number }) {
  const { run, isPending, step, error, lastResult } = useSimulateYieldToApy()
  const vaults = getVaultRegistry(chainId)

  const [vault, setVault] = useState<string>(vaults[0]?.address ?? '')
  const [amount, setAmount] = useState('1000')

  const selected = vaults.find((v) => v.address === vault) ?? vaults[0]
  const decimals = selected ? decimalsForSymbol(selected.assetSymbol) : 18

  const options = vaults.map((v) => ({
    value: v.address,
    label: `${v.name ?? `${v.assetSymbol} Vault`} (${v.assetSymbol})`,
  }))

  const submit = () => {
    if (!vault) return
    void run({ vault: vault as Address, amount, decimals }).catch(() => {
      // error surfaced via the hook's `error` state
    })
  }

  if (vaults.length === 0) {
    return (
      <Notice tone="warn" title="No vaults configured">
        No vault addresses in env. Run `just dev-up` to deploy + sync.
      </Notice>
    )
  }

  const stepLabel = SIMULATE_STEP_LABEL[step]
  const noticeTone = step === 'done' ? 'success' : 'info'

  return (
    <Card as="section" tone="info" className="ds-stack ds-stack-3" data-admin-panel>
      <header className="ds-stack ds-stack-1">
        <h3 className="ds-text-lg">Simulate yield → APY</h3>
        <p className="ds-text-sm ds-muted">
          One-click end-to-end demo. Takes a baseline snapshot, donates real backing to the vault
          (mints the MockERC20 underlying if you&apos;re short, then approves + donates — no yield
          strategy required), advances anvil chain time by 4 days, then snapshots again so{' '}
          <code>apy7d</code> computes a genuine positive delta from the raised share price. The
          Vaults APY chart refetches automatically.
        </p>
      </header>

      <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <Select
          aria-label="vault"
          options={options}
          value={vault}
          onChange={(e) => setVault(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <Input
          aria-label="amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="amount"
          suffix={selected ? `${selected.assetSymbol} · ${decimals} dec` : undefined}
          style={{ maxWidth: 220 }}
        />
      </div>

      <div className="ds-row ds-row-2" style={{ alignItems: 'center', gap: 'var(--space-2)' }}>
        <Button
          variant="primary"
          disabled={isPending || !vault || !Number(amount)}
          onClick={submit}
        >
          {isPending ? 'running…' : 'Simulate yield → APY'}
        </Button>
      </div>

      {step !== 'idle' && stepLabel && (
        <Notice tone={noticeTone} size="sm">
          {stepLabel}
        </Notice>
      )}

      {lastResult && (
        <Notice tone="success" size="sm" title="Result">
          apy7d:{' '}
          {lastResult.apy7dBps !== null
            ? `${(lastResult.apy7dBps / 100).toFixed(2)}%`
            : 'not yet computable (needs ≥ half the 7-day window of history)'}
          {lastResult.sharePriceBefore !== null && lastResult.sharePriceAfter !== null && (
            <>
              {' · share price '}
              <span className="ds-mono-num">{lastResult.sharePriceBefore.toString()}</span>
              {' → '}
              <span className="ds-mono-num">{lastResult.sharePriceAfter.toString()}</span>
            </>
          )}
        </Notice>
      )}

      {error && (
        <Notice tone="danger" size="sm" title="Failed">
          {error.message}
        </Notice>
      )}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Donate — raise vault NAV/share so IndexAppreciationYield has something to    */
/* accrue (the source of claimable yield)                                       */
/* -------------------------------------------------------------------------- */

function DonateNavPanel({ chainId }: { chainId: number }) {
  const action = useAdminAction()
  const vaults = getVaultRegistry(chainId)

  const [vault, setVault] = useState<string>(vaults[0]?.address ?? '')
  const [amount, setAmount] = useState('100')
  const [decimals, setDecimals] = useState('6')

  const options = vaults.map((v) => ({
    value: v.address,
    label: `${v.name ?? `${v.assetSymbol} Vault`} (${v.assetSymbol})`,
  }))

  const submit = async () => {
    const value = parseUnits(amount, Number(decimals))
    await action.run(async ({ walletClient, publicClient, actorAddress }) => {
      // donate() pulls the vault's underlying asset from the caller via
      // safeTransferFrom, so resolve the asset, mint-if-short (anvil), approve.
      const asset = (await publicClient.readContract({
        address: vault as Address,
        abi: commitmentsVaultAbi,
        functionName: 'asset',
      })) as Address

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
        args: [actorAddress, vault as Address],
      })) as bigint
      if (allowance < value) {
        const approveHash = await walletClient.writeContract({
          address: asset,
          abi: erc20Abi,
          functionName: 'approve',
          args: [vault as Address, value],
          chain: walletClient.chain,
          account: walletClient.account!,
        })
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
      }

      return walletClient.writeContract({
        address: vault as Address,
        abi: commitmentsVaultAbi,
        functionName: 'donate',
        args: [value],
        chain: walletClient.chain,
        account: walletClient.account!,
      })
    })
  }

  if (vaults.length === 0) {
    return (
      <Notice tone="warn" title="No vaults configured">
        No vault addresses in env. Run `just dev-up` to deploy + sync.
      </Notice>
    )
  }

  return (
    <AdminActionPanel
      title="Donate to vault (raise NAV)"
      description="Asset-backed NAV bump: transfers the vault's underlying asset in WITHOUT minting shares, so price-per-share (the adapter index) rises for every holder. This is the appreciation IndexAppreciationYield routes to counterparties. On anvil, mints the MockERC20 if the actor is short, then approves + donates."
      submitLabel="Donate"
      onSubmit={submit}
      disabled={!vault || !Number(amount)}
      state={action.state}
    >
      <div className="ds-row ds-row-2" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <Select
          aria-label="vault"
          options={options}
          value={vault}
          onChange={(e) => setVault(e.target.value)}
          style={{ minWidth: 220 }}
        />
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
      </div>
    </AdminActionPanel>
  )
}

/* -------------------------------------------------------------------------- */
/* Inspect — strategiesOf + per-strategy pending + escrow                     */
/* -------------------------------------------------------------------------- */

function InspectYieldPanel({ manager }: { manager: Address }) {
  const [idInput, setIdInput] = useState('1')
  const id = idInput.trim() === '' ? undefined : (() => {
    try {
      return BigInt(idInput)
    } catch {
      return undefined
    }
  })()

  const enabled = id !== undefined

  const { data: commitment } = useReadCommitmentManagerGetCommitment({
    address: manager,
    args: id !== undefined ? [id] : undefined,
    query: { enabled, refetchInterval: 15_000 },
  })

  const { data: strategiesData, isLoading: strategiesLoading } =
    useReadCommitmentManagerStrategiesOf({
      address: manager,
      args: id !== undefined ? [id] : undefined,
      query: { enabled, refetchInterval: 15_000 },
    })

  const strategies = (strategiesData as readonly Address[] | undefined)?.slice() ?? []
  const token = commitment?.token as Address | undefined
  const { decimals, symbol } = useTokenMeta(token)

  // pending(id, strategy, 0x) per bound strategy — the counterparty-claim view.
  const { data: pendingData, isLoading: pendingLoading } = useReadContracts({
    contracts: strategies.map((strategy) => ({
      abi: commitmentManagerAbi,
      address: manager,
      functionName: 'pending' as const,
      args: [id as bigint, strategy, EMPTY_CLAIM_DATA] as const,
    })),
    query: { enabled: enabled && strategies.length > 0, refetchInterval: 15_000 },
  })

  // escrowOf(token, strategy) — units currently held in each strategy's escrow.
  const { data: escrowData } = useReadContracts({
    contracts: strategies.map((strategy) => ({
      abi: commitmentManagerAbi,
      address: manager,
      functionName: 'escrowOf' as const,
      args: [token as Address, strategy] as const,
    })),
    query: { enabled: enabled && strategies.length > 0 && !!token, refetchInterval: 15_000 },
  })

  const isLoading = strategiesLoading || pendingLoading

  return (
    <Card as="section" className="ds-stack ds-stack-3" data-admin-panel>
      <header className="ds-stack ds-stack-1">
        <h3 className="ds-text-lg">Inspect commitment yield</h3>
        <p className="ds-text-sm ds-muted">
          Read the strategies bound to a commitment plus each one&apos;s live{' '}
          <code>pending</code> (claimable now) and <code>escrowOf</code> (already swept into
          escrow). Distribute moves encumbered → escrow; claim moves escrow → recipient.
        </p>
      </header>

      <Input
        aria-label="commitment id"
        value={idInput}
        onChange={(e) => setIdInput(e.target.value)}
        placeholder="commitment id"
        style={{ maxWidth: 220 }}
      />

      {!enabled ? (
        <Notice tone="neutral" size="sm">
          Enter a commitment id to inspect.
        </Notice>
      ) : isLoading ? (
        <Skeleton style={{ height: 64 }} />
      ) : strategies.length === 0 ? (
        <Notice tone="neutral" size="sm" title="No bound strategies">
          Commitment #{idInput} has no distribution strategies — it accrues no yield. Bind one at
          creation (IndexAppreciationYield for premium routing, FlatFeeAtCreate for an upfront fee).
        </Notice>
      ) : (
        <div className="ds-stack ds-stack-2">
          {commitment && (
            <div className="ds-row ds-text-xs ds-subtle" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <span>
                token <AddressDisplay address={token as Address} compact />
              </span>
              <span>
                committer <AddressDisplay address={commitment.committer as Address} compact />
              </span>
              <span>
                counterparty <AddressDisplay address={commitment.counterparty as Address} compact />
              </span>
            </div>
          )}
          {strategies.map((strategy, i) => {
            const pending = (pendingData?.[i]?.result as bigint | undefined) ?? 0n
            const escrow = (escrowData?.[i]?.result as bigint | undefined) ?? 0n
            return (
              <div
                key={strategy}
                className="ds-row"
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-2)',
                  border: '1px solid var(--border)',
                }}
              >
                <AddressDisplay address={strategy} compact />
                <div className="ds-row" style={{ gap: 'var(--space-4)', alignItems: 'baseline' }}>
                  <span className="ds-text-xs ds-subtle">
                    pending{' '}
                    <TokenAmount amount={pending} decimals={decimals} symbol={symbol} size="inline" />
                  </span>
                  <span className="ds-text-xs ds-subtle">
                    escrow{' '}
                    <TokenAmount amount={escrow} decimals={decimals} symbol={symbol} size="inline" />
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Distribute all — permissionless accrual push                              */
/* -------------------------------------------------------------------------- */

function DistributeAllPanel({ manager }: { manager: Address }) {
  const action = useAdminAction()
  const [id, setId] = useState('1')

  const submit = async () => {
    await action.run(({ walletClient }) =>
      walletClient.writeContract({
        address: manager,
        abi: commitmentManagerAbi,
        functionName: 'distributeAll',
        args: [BigInt(id)],
        chain: walletClient.chain,
        account: walletClient.account!,
      }),
    )
  }

  return (
    <AdminActionPanel
      title="Distribute yield"
      description="Permissionless. Sweeps accrued appreciation into each bound strategy's escrow across every strategy on the commitment (distributeAll). Idempotent + cheap when nothing has accrued."
      submitLabel="Distribute all"
      onSubmit={submit}
      disabled={!id}
      state={action.state}
    >
      <Input
        aria-label="commitment id"
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="commitment id"
        style={{ maxWidth: 220 }}
      />
    </AdminActionPanel>
  )
}

/* -------------------------------------------------------------------------- */
/* Fund strategy — approve → fundStrategy (FlatFeeAtCreate prefund)          */
/* -------------------------------------------------------------------------- */

function FundStrategyPanel({
  manager,
  defaultStrategy,
  chainId,
}: {
  manager: Address
  defaultStrategy: Address | undefined
  chainId: number
}) {
  const action = useAdminAction()
  const backing = getDefaultBacking(chainId)

  const [strategy, setStrategy] = useState<string>(defaultStrategy ?? '')
  const [token, setToken] = useState<string>(backing?.token ?? '')
  const [amount, setAmount] = useState('100')
  const { decimals } = useTokenMeta((token || undefined) as Address | undefined)

  const submit = async () => {
    const value = parseUnits(amount, decimals)
    await action.run(async ({ walletClient, publicClient }) => {
      // FlatFeeAtCreate pulls the fee on fundStrategy, so the manager must be
      // approved on the fee token first. Approve, wait, then fund.
      const approveHash = await walletClient.writeContract({
        address: token as Address,
        abi: erc20Abi,
        functionName: 'approve',
        args: [manager, value],
        chain: walletClient.chain,
        account: walletClient.account!,
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
      return walletClient.writeContract({
        address: manager,
        abi: commitmentManagerAbi,
        functionName: 'fundStrategy',
        args: [strategy as Address, token as Address, value],
        chain: walletClient.chain,
        account: walletClient.account!,
      })
    })
  }

  return (
    <AdminActionPanel
      title="Fund strategy escrow"
      description="Prefund a strategy escrow (FlatFeeAtCreate reverts creation unless its fee is already escrowed). Approves the manager on the fee token, then calls fundStrategy(strategy, token, amount) as the active actor."
      submitLabel="Approve + fund"
      onSubmit={submit}
      disabled={!strategy || !token || !Number(amount)}
      state={action.state}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-2)',
        }}
      >
        <Input
          aria-label="strategy"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          placeholder="strategy address"
        />
        <Input
          aria-label="fee token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="fee token (backing token)"
        />
        <Input
          aria-label="amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="amount"
          suffix={`${decimals} dec`}
        />
      </div>
    </AdminActionPanel>
  )
}

/* -------------------------------------------------------------------------- */
/* Claim — counterparty payout / committer reclaim                           */
/* -------------------------------------------------------------------------- */

function ClaimPanel({
  manager,
  defaultStrategy,
}: {
  manager: Address
  defaultStrategy: Address | undefined
}) {
  const action = useAdminAction()
  const [id, setId] = useState('1')
  const [strategy, setStrategy] = useState<string>(defaultStrategy ?? '')
  const [reclaim, setReclaim] = useState(false)

  const submit = async () => {
    const claimData = reclaim ? RECLAIM_CLAIM_DATA : EMPTY_CLAIM_DATA
    await action.run(({ walletClient }) =>
      walletClient.writeContract({
        address: manager,
        abi: commitmentManagerAbi,
        functionName: 'claim',
        args: [BigInt(id), strategy as Address, claimData],
        chain: walletClient.chain,
        account: walletClient.account!,
      }),
    )
  }

  return (
    <AdminActionPanel
      title="Claim yield"
      description="Pay escrowed accrual out. Default: the counterparty claims their owed premium (claimData 0x). Reclaim: the committer recovers abandoned accrual after the strategy's 90-day window past close (claimData abi.encode(true)). Switch actor accordingly before submitting."
      submitLabel={reclaim ? 'Reclaim (committer)' : 'Claim (counterparty)'}
      onSubmit={submit}
      disabled={!id || !strategy}
      state={action.state}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-2)',
        }}
      >
        <Input
          aria-label="commitment id"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="commitment id"
        />
        <Input
          aria-label="strategy"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          placeholder="strategy address"
        />
      </div>
      <label className="ds-row ds-text-sm" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={reclaim}
          onChange={(e) => setReclaim(e.target.checked)}
        />
        committer reclaim (abandoned accrual, post-window)
      </label>
    </AdminActionPanel>
  )
}
