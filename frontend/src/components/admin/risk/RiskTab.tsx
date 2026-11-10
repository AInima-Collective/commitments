import { useState } from 'react'
import { useChainId, useReadContract } from 'wagmi'
import { type Address, erc20Abi, keccak256, parseUnits, toHex } from 'viem'
import { Input, Notice, Select, TokenAmount } from '../../ui'
import {
  commitmentManagerAbi,
  commitmentsVaultAbi,
  linkedMutualPolicyAbi,
  mockStrategyAbi,
  optimisticMutualArbiterAbi,
  skimmingMockStrategyAbi,
  vaultCoverConduitAbi,
} from '../../../generated'
import { getContractAddresses } from '../../../config/contracts'
import { MOCK_ERC20_MINT_ABI } from '../../../lib/mockErc20Abi'
import { useAnvilTime } from '../../../hooks/useAnvilTime'
import { AdminActionPanel } from '../AdminActionPanel'
import { useAdminAction } from '../useAdminAction'

// cvUSDC vault shares: USDC's 6 decimals + the vault's decimals offset of 9.
const CV_SHARE_DECIMALS = 15
// cvaDAI vault shares: DAI's 18 decimals + the vault's decimals offset of 9.
const CVA_SHARE_DECIMALS = 27
// DAI underlying (the agent vault's asset + the agent arbiter's bond token).
const DAI_DECIMALS = 18
// Mutual challenge-window floor (MutualLib hard floor, 2 days).
const MUTUAL_CHALLENGE_WINDOW = 172_800
// Generous premium budget minted to the policyholder so any reasonable cover
// notional's quoted premium is covered (premium ≪ notional at low utilization).
const PREMIUM_BUDGET_USDC = 1_000

type Env = ReturnType<typeof getContractAddresses>

/**
 * Risk-coverage admin controls (anvil-only). Drives the "risk coverage through
 * mutuals" demo end to end:
 *   - simulate vault yield / loss by moving a demo strategy's reported NAV,
 *   - buy cover from a mutual (binds a policy, funds the premium stream),
 *   - run the mutual-loss combo (propose → advance time → execute), after which
 *     members can settle from the mutual's roster.
 */
export function RiskTab() {
  const chainId = useChainId()
  const env = getContractAddresses(chainId)

  if (!env.commitmentManager || !env.linkedMutualPolicy) {
    return (
      <Notice tone="warn" title="Mutual periphery not configured">
        VITE_COMMITMENT_MANAGER_ADDRESS / VITE_LINKED_MUTUAL_POLICY_ADDRESS are unset. Run `just
        dev-up` to deploy + sync env.
      </Notice>
    )
  }

  return (
    <div className="ds-stack ds-stack-4">
      <Notice tone="info" size="sm">
        Risk-coverage demo controls. "Simulate vault yield" raises a plain vault's NAV with REAL
        backing via donate() (the agent vault keeps its asset-backed skim path). "Simulate vault
        loss" drops NAV via a demo strategy — only for vaults that still run one; strategy-less
        plain vaults have no un-donate. "Buy cover" funds a mutual's premium stream. "Run mutual
        loss" declares + executes a mutual loss (the NAV-Shortfall trigger); settle members
        afterward from the mutual roster.
      </Notice>
      <SimulateNavPanel env={env} mode="yield" />
      <SimulateNavPanel env={env} mode="loss" />
      <SkimPokePanel env={env} />
      <BuyCoverPanel env={env} />
      <MutualLossComboPanel env={env} />
    </div>
  )
}

function SimulateNavPanel({ env, mode }: { env: Env; mode: 'yield' | 'loss' }) {
  return mode === 'yield' ? <SimulateYieldPanel env={env} /> : <SimulateLossPanel env={env} />
}

/* -------------------------------------------------------------------------- */
/* Simulate vault yield — donate-backed for plain vaults, asset-backed skim for */
/* the agent vault. Plain demo vaults ship strategy-less now, so donate() is    */
/* the canonical NAV source (it lifts price-per-share with real backing and     */
/* works even when the vault has no yield strategy).                            */
/* -------------------------------------------------------------------------- */

/** A plain-vault donate target: raise NAV by donating the underlying asset. */
interface DonateYieldOption {
  kind: 'donate'
  /** Vault address (donate + resolve-asset target). */
  value: Address
  label: string
  decimals: number
  assetSymbol: string
}

/**
 * The agent/skimming vault target: asset-backed `simulateBackedYield` (mint →
 * approve → pull) so a later `skim()` has tokens behind the reported gains.
 * Ledger-only yield would make skim() revert. This path drives the coverage
 * demo and is intentionally left on the skimming strategy.
 */
interface BackedYieldOption {
  kind: 'backed'
  /** Strategy address (simulateBackedYield target). */
  value: Address
  label: string
  decimals: number
  assetSymbol: string
  backedAsset: Address
}

type YieldOption = DonateYieldOption | BackedYieldOption

function yieldOptions(env: Env): YieldOption[] {
  const out: YieldOption[] = []
  // Plain vaults: donate the underlying to raise NAV/share (no strategy needed).
  const wethVault = import.meta.env.VITE_ETH_VAULT_ADDRESS as Address | undefined
  const usdtVault = import.meta.env.VITE_USDT_VAULT_ADDRESS as Address | undefined
  if (env.commitmentsVault)
    out.push({ kind: 'donate', value: env.commitmentsVault, label: 'cvUSDC vault (USDC)', decimals: 6, assetSymbol: 'USDC' })
  if (wethVault)
    out.push({ kind: 'donate', value: wethVault, label: 'cvWETH vault (WETH)', decimals: 18, assetSymbol: 'WETH' })
  if (usdtVault)
    out.push({ kind: 'donate', value: usdtVault, label: 'cvUSDT vault (USDT)', decimals: 6, assetSymbol: 'USDT' })
  // Agent/skimming vault: keep the asset-backed skim path.
  if (env.agentStrategy && env.daiToken)
    out.push({
      kind: 'backed',
      value: env.agentStrategy,
      label: 'cvaDAI vault (DAI, agent-managed)',
      decimals: DAI_DECIMALS,
      assetSymbol: 'DAI',
      backedAsset: env.daiToken,
    })
  return out
}

function SimulateYieldPanel({ env }: { env: Env }) {
  const action = useAdminAction()
  const options = yieldOptions(env)
  const [target, setTarget] = useState<string>(options[0]?.value ?? '')
  const [amount, setAmount] = useState('1000')

  const selected = options.find((o) => o.value === target) ?? options[0]

  const submit = async () => {
    if (!selected) return
    const wei = parseUnits(amount, selected.decimals)

    if (selected.kind === 'backed') {
      // Skimming strategy: mint → approve → pull (simulateBackedYield).
      const asset = selected.backedAsset
      const strategy = selected.value
      await action.run(async ({ walletClient }) => {
        const account = walletClient.account!
        await walletClient.writeContract({
          address: asset,
          abi: MOCK_ERC20_MINT_ABI,
          functionName: 'mint',
          args: [account.address, wei],
          chain: walletClient.chain,
          account,
        })
        await walletClient.writeContract({
          address: asset,
          abi: erc20Abi,
          functionName: 'approve',
          args: [strategy, wei],
          chain: walletClient.chain,
          account,
        })
        return walletClient.writeContract({
          address: strategy,
          abi: skimmingMockStrategyAbi,
          functionName: 'simulateBackedYield',
          args: [wei],
          chain: walletClient.chain,
          account,
        })
      })
      return
    }

    // Plain vault: donate the underlying (mint-if-short → approve → donate).
    const vault = selected.value
    await action.run(async ({ walletClient, publicClient, actorAddress }) => {
      const account = walletClient.account!
      const asset = (await publicClient.readContract({
        address: vault,
        abi: commitmentsVaultAbi,
        functionName: 'asset',
      })) as Address
      const balance = (await publicClient.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [actorAddress],
      })) as bigint
      if (balance < wei) {
        const mintHash = await walletClient.writeContract({
          address: asset,
          abi: MOCK_ERC20_MINT_ABI,
          functionName: 'mint',
          args: [actorAddress, wei - balance],
          chain: walletClient.chain,
          account,
        })
        await publicClient.waitForTransactionReceipt({ hash: mintHash })
      }
      const allowance = (await publicClient.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [actorAddress, vault],
      })) as bigint
      if (allowance < wei) {
        const approveHash = await walletClient.writeContract({
          address: asset,
          abi: erc20Abi,
          functionName: 'approve',
          args: [vault, wei],
          chain: walletClient.chain,
          account,
        })
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
      }
      return walletClient.writeContract({
        address: vault,
        abi: commitmentsVaultAbi,
        functionName: 'donate',
        args: [wei],
        chain: walletClient.chain,
        account,
      })
    })
  }

  if (options.length === 0) {
    return (
      <Notice tone="warn" size="sm">
        No demo vaults configured (VITE_COMMITMENTS_VAULT_ADDRESS / VITE_*_VAULT_ADDRESS unset).
      </Notice>
    )
  }

  return (
    <AdminActionPanel
      title="Simulate vault yield"
      description={
        selected?.kind === 'backed'
          ? "Raises the agent vault's NAV with REAL tokens: mints the underlying, approves the strategy, then pulls it in (simulateBackedYield) — so a later skim() has assets behind it."
          : "Raises the selected plain vault's NAV with REAL backing: donate() transfers the underlying in WITHOUT minting shares, so price-per-share rises for every holder. Mints the MockERC20 if the actor is short, then approves + donates. No yield strategy required."
      }
      submitLabel="Add yield"
      onSubmit={submit}
      disabled={!target || !Number(amount)}
      state={action.state}
    >
      <div className="ds-row ds-row-2" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Select
          aria-label="vault"
          options={options.map((o) => ({ value: o.value, label: o.label }))}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          style={{ maxWidth: 240 }}
        />
        <Input
          aria-label="amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="amount"
          suffix={selected?.assetSymbol}
          style={{ maxWidth: 200 }}
        />
      </div>
    </AdminActionPanel>
  )
}

/* -------------------------------------------------------------------------- */
/* Simulate vault loss — only where a mock/skimming strategy still exists. There */
/* is no on-chain "un-donate", so strategy-less plain vaults have no NAV-loss    */
/* action; the plain usdc/weth/usdt vaults run idle, so the only option is the */
/* agent vault's skimming strategy (VITE_AGENT_STRATEGY_ADDRESS).              */
/* -------------------------------------------------------------------------- */

interface LossStrategyOption {
  value: Address
  label: string
  decimals: number
  assetSymbol: string
}

function lossStrategyOptions(env: Env): LossStrategyOption[] {
  const out: LossStrategyOption[] = []
  if (env.agentStrategy)
    out.push({ value: env.agentStrategy, label: 'cvaDAI vault (DAI, agent-managed)', decimals: DAI_DECIMALS, assetSymbol: 'DAI' })
  return out
}

function SimulateLossPanel({ env }: { env: Env }) {
  const action = useAdminAction()
  const options = lossStrategyOptions(env)
  const [strategy, setStrategy] = useState<string>(options[0]?.value ?? '')
  const [amount, setAmount] = useState('500')

  const selected = options.find((o) => o.value === strategy) ?? options[0]

  const submit = async () => {
    if (!selected) return
    const wei = parseUnits(amount, selected.decimals)
    await action.run(({ walletClient }) =>
      walletClient.writeContract({
        address: selected.value,
        abi: mockStrategyAbi,
        functionName: 'simulateLoss',
        args: [wei],
        chain: walletClient.chain,
        account: walletClient.account!,
      }),
    )
  }

  if (options.length === 0) {
    return (
      <Notice tone="neutral" size="sm" title="Simulate vault loss unavailable">
        No demo strategies configured (VITE_*_STRATEGY_ADDRESS unset). Plain vaults ship
        strategy-less and NAV is raised via real donate() — there is no on-chain un-donate, so
        there is no NAV-loss action for them. Use "Run mutual loss" below to drive the coverage
        demo, or re-enable a mock strategy to simulate a raw NAV drop.
      </Notice>
    )
  }

  return (
    <AdminActionPanel
      title="Simulate vault loss"
      description="Drops the selected vault's reported NAV via its demo strategy (simulateLoss). Only available for vaults that still run a mock/skimming strategy — plain donate-backed vaults have no un-donate. Holders' share value falls."
      submitLabel="Apply loss"
      onSubmit={submit}
      disabled={!strategy || !Number(amount)}
      state={action.state}
    >
      <div className="ds-row ds-row-2" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Select
          aria-label="vault"
          options={options.map((o) => ({ value: o.value, label: o.label }))}
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          style={{ maxWidth: 240 }}
        />
        <Input
          aria-label="amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="amount"
          suffix={selected?.assetSymbol}
          style={{ maxWidth: 200 }}
        />
      </div>
    </AdminActionPanel>
  )
}

type SkimPhase = 'idle' | 'skimming' | 'poking' | 'success' | 'error'

function SkimPokePanel({ env }: { env: Env }) {
  const action = useAdminAction()
  const [phase, setPhase] = useState<SkimPhase>('idle')
  const [phaseError, setPhaseError] = useState<string | null>(null)

  const strategy = env.agentStrategy
  const conduit = env.vaultCoverConduit
  const ready = Boolean(strategy && conduit)

  const pending = useReadContract({
    abi: skimmingMockStrategyAbi,
    functionName: 'pendingSkim',
    address: strategy,
    query: { enabled: Boolean(strategy), refetchInterval: 15_000 },
  })
  const [newGains, operatorFee, premiumShare] = pending.data ?? []

  const submit = async () => {
    if (!strategy || !conduit) return
    setPhase('skimming')
    setPhaseError(null)
    const skimmed = await action.run(({ walletClient }) =>
      walletClient.writeContract({
        address: strategy,
        abi: skimmingMockStrategyAbi,
        functionName: 'skim',
        chain: walletClient.chain,
        account: walletClient.account!,
      }),
    )
    if (!skimmed) {
      setPhase('error')
      setPhaseError(
        'skim failed — a NothingToSkim revert means no gains have accrued since the last skim; run "Simulate vault yield" on the cvaDAI vault first',
      )
      return
    }

    setPhase('poking')
    const poked = await action.run(({ walletClient }) =>
      walletClient.writeContract({
        address: conduit,
        abi: vaultCoverConduitAbi,
        functionName: 'poke',
        chain: walletClient.chain,
        account: walletClient.account!,
      }),
    )
    setPhase(poked ? 'success' : 'error')
    if (!poked) setPhaseError('conduit poke failed (premium may be below the minimum funding threshold)')
    void pending.refetch()
  }

  const tone = phase === 'success' ? 'success' : phase === 'error' ? 'danger' : 'info'
  const phaseLabel: Record<SkimPhase, string> = {
    idle: '',
    skimming: '1/2 skimming realized gains (operator fee + premium share)…',
    poking: '2/2 poking the conduit (funds the premium stream)…',
    success: 'Skim + poke done — underwriters accrue premium from the vault’s own yield',
    error: phaseError ? `Failed: ${phaseError}` : 'Failed',
  }

  return (
    <AdminActionPanel
      title="Skim gains + fund premium (cvaDAI)"
      description="Realizes accrued gains: pays the agent its operator fee and routes the premium share to the conduit, which (re)funds the underwriters' premium stream. Run after 'Simulate yield'."
      submitLabel="Skim + poke"
      onSubmit={submit}
      disabled={!ready || phase === 'skimming' || phase === 'poking'}
      state={action.state}
    >
      {newGains !== undefined && operatorFee !== undefined && premiumShare !== undefined && (
        <span className="ds-text-sm ds-muted">
          pending: <TokenAmount amount={newGains} decimals={DAI_DECIMALS} symbol="DAI" size="inline" /> new
          gains → operator fee{' '}
          <TokenAmount amount={operatorFee} decimals={DAI_DECIMALS} symbol="DAI" size="inline" /> · premium{' '}
          <TokenAmount amount={premiumShare} decimals={DAI_DECIMALS} symbol="DAI" size="inline" />
        </span>
      )}
      {!ready && (
        <Notice tone="warn" size="sm">
          Needs VITE_AGENT_STRATEGY_ADDRESS + VITE_VAULT_COVER_CONDUIT_ADDRESS. Run `just dev-up`.
        </Notice>
      )}
      {phase !== 'idle' && phaseLabel[phase] && (
        <Notice tone={tone} size="sm">
          {phaseLabel[phase]}
        </Notice>
      )}
    </AdminActionPanel>
  )
}

type BuyPhase = 'idle' | 'funding' | 'binding' | 'success' | 'error'

function BuyCoverPanel({ env }: { env: Env }) {
  const action = useAdminAction()
  const [mutualId, setMutualId] = useState('1')
  const [notional, setNotional] = useState('1000')
  const [durationDays, setDurationDays] = useState('180')
  const [phase, setPhase] = useState<BuyPhase>('idle')
  const [phaseError, setPhaseError] = useState<string | null>(null)

  const vault = env.commitmentsVault
  const usdcToken = env.usdcToken
  const policy = env.linkedMutualPolicy
  const ready = Boolean(vault && usdcToken && policy)

  const submit = async () => {
    if (!vault || !usdcToken || !policy) return
    setPhase('funding')
    setPhaseError(null)
    // Fund the policyholder with cvUSDC for the premium: mint USDC, deposit into
    // the cvUSDC vault (shares stay in-wallet), then approve the policy to pull
    // the numeraire premium.
    const funded = await action.run(async ({ walletClient }) => {
      const account = walletClient.account!
      const budget = parseUnits(String(PREMIUM_BUDGET_USDC), 6)
      await walletClient.writeContract({
        address: usdcToken,
        abi: MOCK_ERC20_MINT_ABI,
        functionName: 'mint',
        args: [account.address, budget],
        chain: walletClient.chain,
        account,
      })
      await walletClient.writeContract({
        address: usdcToken,
        abi: erc20Abi,
        functionName: 'approve',
        args: [vault, budget],
        chain: walletClient.chain,
        account,
      })
      await walletClient.writeContract({
        address: vault,
        abi: commitmentsVaultAbi,
        functionName: 'deposit',
        args: [budget, account.address],
        chain: walletClient.chain,
        account,
      })
      return walletClient.writeContract({
        address: vault,
        abi: erc20Abi,
        functionName: 'approve',
        args: [policy, parseUnits('1000000000', CV_SHARE_DECIMALS)],
        chain: walletClient.chain,
        account,
      })
    })
    if (!funded) {
      setPhase('error')
      setPhaseError('funding/approval failed')
      return
    }

    setPhase('binding')
    const bound = await action.run(({ walletClient }) =>
      walletClient.writeContract({
        address: policy,
        abi: linkedMutualPolicyAbi,
        functionName: 'bindCover',
        args: [
          BigInt(mutualId),
          parseUnits(notional, CV_SHARE_DECIMALS),
          BigInt(Number(durationDays) * 86_400),
        ],
        chain: walletClient.chain,
        account: walletClient.account!,
      }),
    )
    setPhase(bound ? 'success' : 'error')
    if (!bound) setPhaseError('bindCover failed')
  }

  const tone = phase === 'success' ? 'success' : phase === 'error' ? 'danger' : 'info'
  const phaseLabel: Record<BuyPhase, string> = {
    idle: '',
    funding: '1/2 minting + depositing cvUSDC, approving policy…',
    binding: '2/2 binding cover (funds the premium stream)…',
    success: 'Cover bound — premium now streaming to members',
    error: phaseError ? `Failed: ${phaseError}` : 'Failed',
  }

  return (
    <AdminActionPanel
      title="Buy cover from a mutual"
      description="As the connected actor: funds cvUSDC, then binds a cover policy. Pulls the quoted premium and funds the mutual's Synthetix premium stream so members accrue claimable premium."
      submitLabel="Buy cover"
      onSubmit={submit}
      disabled={!ready || !mutualId || !Number(notional) || !Number(durationDays) || phase === 'funding' || phase === 'binding'}
      state={action.state}
    >
      <div className="ds-row ds-row-3" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Input
          aria-label="mutual id"
          value={mutualId}
          onChange={(e) => setMutualId(e.target.value)}
          placeholder="mutual id"
          style={{ maxWidth: 140 }}
        />
        <Input
          aria-label="notional"
          value={notional}
          onChange={(e) => setNotional(e.target.value)}
          placeholder="notional"
          suffix="cvUSDC"
          style={{ maxWidth: 180 }}
        />
        <Input
          aria-label="duration days"
          value={durationDays}
          onChange={(e) => setDurationDays(e.target.value)}
          placeholder="duration"
          suffix="days"
          style={{ maxWidth: 160 }}
        />
      </div>
      {!ready && (
        <Notice tone="warn" size="sm">
          Needs VITE_COMMITMENTS_VAULT_ADDRESS + VITE_USDC_TOKEN_ADDRESS + the policy address.
        </Notice>
      )}
      {phase !== 'idle' && phaseLabel[phase] && (
        <Notice tone={tone} size="sm">
          {phaseLabel[phase]}
        </Notice>
      )}
    </AdminActionPanel>
  )
}

type LossPhase = 'idle' | 'proposing' | 'warping' | 'executing' | 'success' | 'error'

/**
 * A loss-declaration target: which OptimisticMutualArbiter instance to propose
 * through, which token funds its bond (one arbiter per bond denomination), and
 * the loss-share decimals of the mutual's numeraire (vault shares).
 */
interface LossTarget {
  value: string
  label: string
  arbiter: Address | undefined
  bondToken: Address | undefined
  bondDecimals: number
  bondSymbol: string
  lossDecimals: number
  lossSymbol: string
}

function lossTargets(env: Env): LossTarget[] {
  return [
    {
      value: 'cvusdc',
      label: 'cvUSDC mutuals (USDC bond)',
      arbiter: env.optimisticMutualArbiter,
      bondToken: env.usdcToken,
      bondDecimals: 6,
      bondSymbol: 'USDC',
      lossDecimals: CV_SHARE_DECIMALS,
      lossSymbol: 'cvUSDC',
    },
    {
      value: 'cvadai',
      label: 'cvaDAI coverage market (DAI bond)',
      arbiter: env.agentMutualArbiter,
      bondToken: env.daiToken,
      bondDecimals: DAI_DECIMALS,
      bondSymbol: 'DAI',
      lossDecimals: CVA_SHARE_DECIMALS,
      lossSymbol: 'cvaDAI',
    },
  ]
}

function MutualLossComboPanel({ env }: { env: Env }) {
  const action = useAdminAction()
  const time = useAnvilTime()
  const targets = lossTargets(env)
  const [targetValue, setTargetValue] = useState(targets[0]?.value ?? 'cvusdc')
  const [mutualId, setMutualId] = useState('1')
  const [lossAmount, setLossAmount] = useState('500')
  const [bond, setBond] = useState('100')
  const [phase, setPhase] = useState<LossPhase>('idle')
  const [phaseError, setPhaseError] = useState<string | null>(null)

  const target = targets.find((t) => t.value === targetValue) ?? targets[0]
  const manager = env.commitmentManager
  const arbiter = target?.arbiter
  const bondToken = target?.bondToken
  const ready = Boolean(manager && arbiter && bondToken)

  const submit = async () => {
    if (!manager || !arbiter || !bondToken || !target) return
    setPhase('proposing')
    setPhaseError(null)
    const bondWei = parseUnits(bond, target.bondDecimals)
    const proposed = await action.run(async ({ walletClient }) => {
      const account = walletClient.account!
      // Fund + approve the loss-declaration bond (raw bond token), then propose.
      await walletClient.writeContract({
        address: bondToken,
        abi: MOCK_ERC20_MINT_ABI,
        functionName: 'mint',
        args: [account.address, bondWei],
        chain: walletClient.chain,
        account,
      })
      await walletClient.writeContract({
        address: bondToken,
        abi: erc20Abi,
        functionName: 'approve',
        args: [arbiter, bondWei],
        chain: walletClient.chain,
        account,
      })
      return walletClient.writeContract({
        address: arbiter,
        abi: optimisticMutualArbiterAbi,
        functionName: 'proposeLoss',
        args: [
          BigInt(mutualId),
          parseUnits(lossAmount, target.lossDecimals),
          keccak256(toHex(`demo-loss-${mutualId}`)),
          bondWei,
        ],
        chain: walletClient.chain,
        account,
      })
    })
    if (!proposed) {
      setPhase('error')
      setPhaseError('proposeLoss failed')
      return
    }

    setPhase('warping')
    try {
      await time.advance(MUTUAL_CHALLENGE_WINDOW + 1)
    } catch (e) {
      setPhase('error')
      setPhaseError(e instanceof Error ? e.message : String(e))
      return
    }

    setPhase('executing')
    const executed = await action.run(({ walletClient }) =>
      walletClient.writeContract({
        address: manager,
        abi: commitmentManagerAbi,
        functionName: 'executeMutualLoss',
        args: [BigInt(mutualId)],
        chain: walletClient.chain,
        account: walletClient.account!,
      }),
    )
    setPhase(executed ? 'success' : 'error')
    if (!executed) setPhaseError('executeMutualLoss failed')
  }

  const tone = phase === 'success' ? 'success' : phase === 'error' ? 'danger' : 'info'
  const phaseLabel: Record<LossPhase, string> = {
    idle: '',
    proposing: '1/3 funding bond + proposing loss…',
    warping: '2/3 advancing time +2 days (challenge window)…',
    executing: '3/3 executing mutual loss (bumps Λ)…',
    success: 'Loss executed — settle members from the mutual roster',
    error: phaseError ? `Failed: ${phaseError}` : 'Failed',
  }

  return (
    <AdminActionPanel
      title="Run mutual loss (combo)"
      description="Funds a bond → proposes a loss through the optimistic arbiter → advances time past the 2-day challenge window → executes the loss (bumps the cumulative-loss index Λ). Members then settle pro-rata from the mutual roster, paying the claim to the policyholder."
      submitLabel="Run loss"
      onSubmit={submit}
      disabled={!ready || !mutualId || !Number(lossAmount) || !Number(bond) || phase === 'proposing' || phase === 'warping' || phase === 'executing'}
      state={action.state}
    >
      <div className="ds-row ds-row-3" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Select
          aria-label="mutual target"
          options={targets.map((t) => ({ value: t.value, label: t.label }))}
          value={targetValue}
          onChange={(e) => setTargetValue(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <Input
          aria-label="mutual id"
          value={mutualId}
          onChange={(e) => setMutualId(e.target.value)}
          placeholder="mutual id"
          style={{ maxWidth: 140 }}
        />
        <Input
          aria-label="loss amount"
          value={lossAmount}
          onChange={(e) => setLossAmount(e.target.value)}
          placeholder="loss"
          suffix={target?.lossSymbol}
          style={{ maxWidth: 180 }}
        />
        <Input
          aria-label="bond"
          value={bond}
          onChange={(e) => setBond(e.target.value)}
          placeholder="bond"
          suffix={target?.bondSymbol}
          style={{ maxWidth: 160 }}
        />
      </div>
      {!ready && (
        <Notice tone="warn" size="sm">
          Needs the manager, the target's optimistic mutual arbiter, and its bond-token address.
        </Notice>
      )}
      {phase !== 'idle' && phaseLabel[phase] && (
        <Notice tone={tone} size="sm">
          {phaseLabel[phase]}
        </Notice>
      )}
    </AdminActionPanel>
  )
}
