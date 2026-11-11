import { decodeEventLog, erc20Abi, parseUnits, type Address, type Hash, zeroAddress, zeroHash } from 'viem'
import {
  commitmentManagerAbi,
  commitmentsVaultAbi,
  manualArbiterAbi,
  twoTierArbiterAbi,
} from '../../../generated'
import type { DevActorId } from '../../../contexts/devWallet'
import type { Scenario, ScenarioContext } from './types'
import { MOCK_ERC20_MINT_ABI } from '../../../lib/mockErc20Abi'

const DEFAULT_DECIMALS = 6 // USDC vault on the Simulate.s.sol seed
const ONE_DAY = 86_400

function requireAddress(value: Address | undefined, name: string): Address {
  if (!value) {
    throw new Error(
      `${name} address not configured (env var missing). Run \`just dev-up\` to deploy + sync.`,
    )
  }
  return value
}

/**
 * Approve + deposit `amount` of the vault's underlying asset as the named
 * actor. Resolves the asset address via vault.asset() the first time it's
 * needed and caches it in `ctx.vars.asset`.
 */
/**
 * Mint MockERC20 underlying to the vault's active strategy (or to the vault
 * itself if no strategy is set). Donating to the strategy is what raises
 * `vault.totalAssets()` because CommitmentsVault routes through
 * `strategy.totalAssets()` whenever a strategy is configured. Anvil-only —
 * relies on MockERC20.mint being permissionless.
 */
async function donateYield(
  ctx: ScenarioContext,
  donorId: DevActorId,
  amount: bigint,
): Promise<Hash> {
  const vault = requireAddress(ctx.vault, 'vault')
  let asset = ctx.vars.asset as Address | undefined
  if (!asset) {
    asset = (await ctx.publicClient.readContract({
      address: vault,
      abi: commitmentsVaultAbi,
      functionName: 'asset',
    })) as Address
    ctx.vars.asset = asset
  }
  const strategy = (await ctx.publicClient.readContract({
    address: vault,
    abi: commitmentsVaultAbi,
    functionName: 'yieldStrategy',
  })) as Address
  const target = strategy && strategy !== zeroAddress ? strategy : vault
  const wallet = ctx.walletFor(donorId)
  return wallet.writeContract({
    address: asset,
    abi: MOCK_ERC20_MINT_ABI,
    functionName: 'mint',
    args: [target, amount],
    chain: wallet.chain,
    account: wallet.account!,
  })
}

async function depositAs(
  ctx: ScenarioContext,
  actorId: DevActorId,
  amount: bigint,
): Promise<Hash> {
  const vault = requireAddress(ctx.vault, 'vault')
  const actor = ctx.actor(actorId)
  let asset = ctx.vars.asset as Address | undefined
  if (!asset) {
    asset = (await ctx.publicClient.readContract({
      address: vault,
      abi: commitmentsVaultAbi,
      functionName: 'asset',
    })) as Address
    ctx.vars.asset = asset
  }

  // Top up the actor's token balance from MockERC20 if they don't have enough.
  // Anvil-only — fails closed if the asset isn't a MockERC20 (real chain).
  const balance = (await ctx.publicClient.readContract({
    address: asset,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [actor.address],
  })) as bigint
  if (balance < amount) {
    const wallet = ctx.walletFor(actorId)
    const mintHash = await wallet.writeContract({
      address: asset,
      abi: MOCK_ERC20_MINT_ABI,
      functionName: 'mint',
      args: [actor.address, amount - balance],
      chain: wallet.chain,
      account: wallet.account!,
    })
    await ctx.publicClient.waitForTransactionReceipt({ hash: mintHash })
  }

  const allowance = (await ctx.publicClient.readContract({
    address: asset,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [actor.address, vault],
  })) as bigint
  const wallet = ctx.walletFor(actorId)
  if (allowance < amount) {
    const approveHash = await wallet.writeContract({
      address: asset,
      abi: erc20Abi,
      functionName: 'approve',
      args: [vault, amount],
      chain: wallet.chain,
      account: wallet.account!,
    })
    await ctx.publicClient.waitForTransactionReceipt({ hash: approveHash })
  }
  return wallet.writeContract({
    address: vault,
    abi: commitmentsVaultAbi,
    functionName: 'deposit',
    args: [amount, actor.address],
    chain: wallet.chain,
    account: wallet.account!,
  })
}

/** Decode a CommitmentCreated log from a manager-targeted receipt. */
function captureCommitmentId(varName: string) {
  return (receipt: import('viem').TransactionReceipt, ctx: ScenarioContext) => {
    const manager = ctx.manager
    if (!manager) return
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== manager.toLowerCase()) continue
      try {
        const decoded = decodeEventLog({
          abi: commitmentManagerAbi,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName === 'CommitmentCreated') {
          ctx.vars[varName] = (decoded.args as { commitmentId: bigint }).commitmentId
          return
        }
      } catch {
        // not a manager event we recognise — skip
      }
    }
  }
}

/**
 * Decode the ERC4626 `Deposit` event and store `shares` minted to `owner`.
 * Returns the EXACT shares the depositor received, regardless of any prior
 * vault balance — needed because the vault's `_decimalsOffset=9` decouples
 * shares from assets.
 */
function captureSharesFromDeposit(actorId: DevActorId, varName: string) {
  return (receipt: import('viem').TransactionReceipt, ctx: ScenarioContext) => {
    const vault = ctx.vault
    if (!vault) return
    const ownerAddress = ctx.actor(actorId).address.toLowerCase()
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== vault.toLowerCase()) continue
      try {
        const decoded = decodeEventLog({
          abi: commitmentsVaultAbi,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName === 'Deposit') {
          const args = decoded.args as { owner: Address; shares: bigint }
          if (args.owner.toLowerCase() === ownerAddress) {
            ctx.vars[varName] = args.shares
            return
          }
        }
      } catch {
        // not a vault event we recognise — skip
      }
    }
  }
}

function captureProposalId(varName: string) {
  return (receipt: import('viem').TransactionReceipt, ctx: ScenarioContext) => {
    const manager = ctx.manager
    if (!manager) return
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== manager.toLowerCase()) continue
      try {
        const decoded = decodeEventLog({
          abi: commitmentManagerAbi,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName === 'AgreementProposed') {
          ctx.vars[varName] = (decoded.args as { proposalId: bigint }).proposalId
          return
        }
      } catch {
        // skip
      }
    }
  }
}

function captureTwoTierCaseId(varName: string) {
  return (receipt: import('viem').TransactionReceipt, ctx: ScenarioContext) => {
    const arbiter = ctx.twoTierArbiter
    if (!arbiter) return
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== arbiter.toLowerCase()) continue
      try {
        const decoded = decodeEventLog({ abi: twoTierArbiterAbi, data: log.data, topics: log.topics })
        if (decoded.eventName === 'RulingProposed') {
          ctx.vars[varName] = (decoded.args as { caseId: bigint }).caseId
          return
        }
      } catch {
        // Not a TwoTierArbiter event.
      }
    }
  }
}

const COMMON_INPUTS = [
  {
    key: 'amount',
    label: 'Deposit amount (USDC)',
    defaultValue: '100',
    placeholder: '100',
    hint: `Asset units. Vault uses _decimalsOffset=9, so 100 USDC ≈ 1e17 share units — scenarios read the actual post-deposit balance.`,
  },
  {
    key: 'maxPenaltyBps',
    label: 'maxPenaltyBps',
    defaultValue: '1000',
    placeholder: '1000',
    hint: '10% by default.',
  },
  {
    key: 'yieldShareBps',
    label: 'yieldShareBps',
    defaultValue: '250',
    placeholder: '250',
    hint: '2.5% by default.',
  },
] as const

function buildCommitmentParams(
  ctx: ScenarioContext,
  inputs: Record<string, string>,
  arbiter: Address,
  counterparty: Address,
  shareAmount: bigint,
  metadataURI = '',
) {
  return {
    arbiter,
    counterparty,
    // v2 backing: the vault share, priced by the ERC-4626 adapter.
    token: requireAddress(ctx.vault, 'vault'),
    adapter: requireAddress(ctx.adapter, 'adapter'),
    amount: shareAmount,
    maxPenaltyBps: Number(inputs.maxPenaltyBps ?? '1000'),
    challengeWindow: BigInt(ONE_DAY),
    expiresAt: 0n,
    // Strategy bindings deferred in scenarios — plain commitments.
    strategies: [] as { strategy: Address; params: `0x${string}` }[],
    metadataURI,
    metadataHash: zeroHash,
  }
}

const happyPathRelease: Scenario = {
  id: 'happy-path-release',
  title: 'Happy path: deposit → commit → release',
  description:
    'Depositor 0 deposits, creates a commitment with the deployed ManualArbiter, then its owner releases it through the arbiter API. Encumbrance returns to the depositor.',
  category: 'lifecycle',
  inputs: [...COMMON_INPUTS],
  build: (inputs) => {
    const amount = parseUnits(inputs.amount ?? '100', DEFAULT_DECIMALS)
    return [
      {
        kind: 'tx',
        label: 'Depositor 0: deposit',
        actor: 'depositor-0',
        run: (ctx) => depositAs(ctx, 'depositor-0', amount),
        capture: captureSharesFromDeposit('depositor-0', 'shares0'),
      },
      {
        kind: 'tx',
        label: 'Depositor 0: createCommitment(arbiter=ManualArbiter, counterparty=Depositor 1)',
        description: 'Locks vault shares; authority is delegated to the deployed ManualArbiter contract.',
        actor: 'depositor-0',
        run: (ctx) => {
          const wallet = ctx.walletFor('depositor-0')
          const params = buildCommitmentParams(
            ctx,
            inputs,
            requireAddress(ctx.manualArbiter, 'manual arbiter'),
            ctx.actor('depositor-1').address,
            ctx.vars.shares0 as bigint,
            'happy-path-release',
          )
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'createCommitment',
            args: [params],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
        capture: captureCommitmentId('commitmentId'),
      },
      {
        kind: 'switch',
        label: 'Switch to Arbiter',
        actor: 'arbiter',
      },
      {
        kind: 'tx',
        label: 'ManualArbiter owner: release',
        actor: 'arbiter',
        run: (ctx) => {
          const id = ctx.vars.commitmentId as bigint
          const wallet = ctx.walletFor('arbiter')
          return wallet.writeContract({
            address: requireAddress(ctx.manualArbiter, 'manual arbiter'),
            abi: manualArbiterAbi,
            functionName: 'release',
            args: [id],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
      },
    ]
  },
}

// Anvil HD account index 7 (standard test mnemonic). NOT one of the preset dev
// actors (those stop at index 6 / Depositor 4), so it is the natural address to
// load into MetaMask and drive the real app's arbitration UI by hand.
const EXTERNAL_ARBITER_ADDRESS =
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address

const arbitrationHandoff: Scenario = {
  id: 'arbitration-handoff',
  title: 'Direct-address / EOA handoff: commit, then resolve in the UI',
  description:
    'Intentional minimal-profile example: Depositor 0 creates an active commitment whose arbiter is an EOA (Anvil account #7, 0x3C44…293BC). Contract introspection is not applicable. The scenario stops there so you can load that address into MetaMask and exercise the arbiter inbox directly.',
  category: 'forfeiture',
  inputs: [
    ...COMMON_INPUTS,
    {
      key: 'arbiter',
      label: 'Arbiter address',
      defaultValue: EXTERNAL_ARBITER_ADDRESS,
      placeholder: EXTERNAL_ARBITER_ADDRESS,
      hint: 'The address that can arbitrate this commitment. Defaults to Anvil account #7 so you can connect that key in MetaMask and drive the arbitration UI yourself.',
    },
  ],
  build: (inputs) => {
    const amount = parseUnits(inputs.amount ?? '100', DEFAULT_DECIMALS)
    const arbiter = (inputs.arbiter?.trim() || EXTERNAL_ARBITER_ADDRESS) as Address
    return [
      {
        kind: 'tx',
        label: 'Depositor 0: deposit',
        actor: 'depositor-0',
        run: (ctx) => depositAs(ctx, 'depositor-0', amount),
        capture: captureSharesFromDeposit('depositor-0', 'shares0'),
      },
      {
        kind: 'tx',
        label: `Depositor 0: createCommitment(arbiter=${arbiter.slice(0, 6)}…${arbiter.slice(-4)})`,
        description:
          'Locks vault shares with the external arbiter. The commitment stays active and pending — switch your wallet to the arbiter address and resolve it from the app.',
        actor: 'depositor-0',
        run: (ctx) => {
          const wallet = ctx.walletFor('depositor-0')
          const params = buildCommitmentParams(
            ctx,
            inputs,
            arbiter,
            ctx.actor('depositor-1').address,
            ctx.vars.shares0 as bigint,
            'arbitration-handoff',
          )
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'createCommitment',
            args: [params],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
        capture: captureCommitmentId('commitmentId'),
      },
    ]
  },
}

const happyPathForfeit: Scenario = {
  id: 'happy-path-forfeit',
  title: 'Forfeit flow: deposit → commit → initiate → +1d → execute',
  description:
    'Depositor 0 deposits and creates a commitment. The Arbiter initiates a forfeit, time advances past the forfeit execution delay, and the forfeit executes.',
  category: 'forfeiture',
  inputs: [
    ...COMMON_INPUTS,
    {
      key: 'penaltyBps',
      label: 'Forfeit penaltyBps',
      defaultValue: '1000',
      placeholder: '1000',
      hint: 'Must be ≤ maxPenaltyBps.',
    },
  ],
  build: (inputs) => {
    const amount = parseUnits(inputs.amount ?? '100', DEFAULT_DECIMALS)
    const penaltyBps = Number(inputs.penaltyBps ?? '1000')
    return [
      {
        kind: 'tx',
        label: 'Depositor 0: deposit',
        actor: 'depositor-0',
        run: (ctx) => depositAs(ctx, 'depositor-0', amount),
        capture: captureSharesFromDeposit('depositor-0', 'shares0'),
      },
      {
        kind: 'tx',
        label: 'Depositor 0: createCommitment',
        actor: 'depositor-0',
        run: (ctx) => {
          const wallet = ctx.walletFor('depositor-0')
          const params = buildCommitmentParams(
            ctx,
            inputs,
            requireAddress(ctx.manualArbiter, 'manual arbiter'),
            ctx.actor('depositor-1').address,
            ctx.vars.shares0 as bigint,
            'forfeit-target',
          )
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'createCommitment',
            args: [params],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
        capture: captureCommitmentId('commitmentId'),
      },
      {
        kind: 'tx',
        label: 'ManualArbiter owner: initiateForfeit',
        actor: 'arbiter',
        run: (ctx) => {
          const id = ctx.vars.commitmentId as bigint
          const wallet = ctx.walletFor('arbiter')
          return wallet.writeContract({
            address: requireAddress(ctx.manualArbiter, 'manual arbiter'),
            abi: manualArbiterAbi,
            functionName: 'initiateForfeit',
            args: [id, penaltyBps],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
      },
      {
        kind: 'time',
        label: 'Advance time +1 day +1s (past forfeit execution delay)',
        advance: ONE_DAY + 1,
      },
      {
        kind: 'tx',
        label: 'Anyone: executeForfeit',
        actor: 'admin',
        run: (ctx) => {
          const id = ctx.vars.commitmentId as bigint
          const wallet = ctx.walletFor('admin')
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'executeForfeit',
            args: [id],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
      },
    ]
  },
}

const cancelledForfeit: Scenario = {
  id: 'cancelled-forfeit',
  title: 'Cancelled forfeit: arbiter initiates then withdraws within window',
  description:
    'Depositor 0 deposits and commits. The Arbiter initiates a forfeit, then changes their mind and cancels during the forfeit execution delay.',
  category: 'forfeiture',
  inputs: [...COMMON_INPUTS],
  build: (inputs) => {
    const amount = parseUnits(inputs.amount ?? '100', DEFAULT_DECIMALS)
    return [
      {
        kind: 'tx',
        label: 'Depositor 0: deposit',
        actor: 'depositor-0',
        run: (ctx) => depositAs(ctx, 'depositor-0', amount),
        capture: captureSharesFromDeposit('depositor-0', 'shares0'),
      },
      {
        kind: 'tx',
        label: 'Depositor 0: createCommitment',
        actor: 'depositor-0',
        run: (ctx) => {
          const wallet = ctx.walletFor('depositor-0')
          const params = buildCommitmentParams(
            ctx,
            inputs,
            requireAddress(ctx.manualArbiter, 'manual arbiter'),
            ctx.actor('depositor-1').address,
            ctx.vars.shares0 as bigint,
            'cancel-target',
          )
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'createCommitment',
            args: [params],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
        capture: captureCommitmentId('commitmentId'),
      },
      {
        kind: 'tx',
        label: 'ManualArbiter owner: initiateForfeit (1000 bps)',
        actor: 'arbiter',
        run: (ctx) => {
          const id = ctx.vars.commitmentId as bigint
          const wallet = ctx.walletFor('arbiter')
          return wallet.writeContract({
            address: requireAddress(ctx.manualArbiter, 'manual arbiter'),
            abi: manualArbiterAbi,
            functionName: 'initiateForfeit',
            args: [id, 1000],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
      },
      {
        kind: 'time',
        label: 'Advance time +1 hour (inside forfeit execution delay)',
        advance: 3600,
      },
      {
        kind: 'tx',
        label: 'ManualArbiter owner: cancelForfeit',
        actor: 'arbiter',
        run: (ctx) => {
          const id = ctx.vars.commitmentId as bigint
          const wallet = ctx.walletFor('arbiter')
          return wallet.writeContract({
            address: requireAddress(ctx.manualArbiter, 'manual arbiter'),
            abi: manualArbiterAbi,
            functionName: 'cancelForfeit',
            args: [id],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
      },
    ]
  },
}

const agreementHappyPath: Scenario = {
  id: 'agreement-release',
  title: 'Agreement: propose → accept → both released',
  description:
    'Two depositors deposit. Depositor 0 proposes a bilateral commitment with Depositor 1; Depositor 1 accepts. The Arbiter then releases both sides atomically.',
  category: 'agreements',
  inputs: [...COMMON_INPUTS],
  build: (inputs) => {
    const amount = parseUnits(inputs.amount ?? '100', DEFAULT_DECIMALS)
    const maxPenaltyBps = Number(inputs.maxPenaltyBps ?? '1000')
    return [
      {
        kind: 'tx',
        label: 'Depositor 0: deposit',
        actor: 'depositor-0',
        run: (ctx) => depositAs(ctx, 'depositor-0', amount),
        capture: captureSharesFromDeposit('depositor-0', 'shares0'),
      },
      {
        kind: 'tx',
        label: 'Depositor 1: deposit',
        actor: 'depositor-1',
        run: (ctx) => depositAs(ctx, 'depositor-1', amount),
        capture: captureSharesFromDeposit('depositor-1', 'shares1'),
      },
      {
        kind: 'tx',
        label: 'Depositor 0: proposeAgreement',
        actor: 'depositor-0',
        run: (ctx) => {
          const wallet = ctx.walletFor('depositor-0')
          const params = {
            arbiter: requireAddress(ctx.manualArbiter, 'manual arbiter'),
            acceptor: ctx.actor('depositor-1').address,
            proposerLeg: {
              token: requireAddress(ctx.vault, 'vault'),
              adapter: requireAddress(ctx.adapter, 'adapter'),
              amount: ctx.vars.shares0 as bigint,
              maxPenaltyBps,
              strategies: [] as { strategy: Address; params: `0x${string}` }[],
            },
            acceptorLeg: {
              token: requireAddress(ctx.vault, 'vault'),
              adapter: requireAddress(ctx.adapter, 'adapter'),
              amount: ctx.vars.shares1 as bigint,
              maxPenaltyBps,
              strategies: [] as { strategy: Address; params: `0x${string}` }[],
            },
            challengeWindow: BigInt(ONE_DAY),
            proposalDuration: BigInt(7 * ONE_DAY),
            metadataURI: 'agreement-release',
            metadataHash: zeroHash,
            maxFlowProposerToAcceptor: 0n,
            maxFlowAcceptorToProposer: 0n,
          }
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'proposeAgreement',
            args: [params],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
        capture: captureProposalId('proposalId'),
      },
      {
        kind: 'tx',
        label: 'Depositor 1: acceptAgreement',
        actor: 'depositor-1',
        run: (ctx) => {
          const proposalId = ctx.vars.proposalId as bigint
          const wallet = ctx.walletFor('depositor-1')
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'acceptAgreement',
            args: [proposalId],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
        capture: (receipt, ctx) => {
          const manager = ctx.manager
          if (!manager) return
          for (const log of receipt.logs) {
            if (log.address.toLowerCase() !== manager.toLowerCase()) continue
            try {
              const decoded = decodeEventLog({
                abi: commitmentManagerAbi,
                data: log.data,
                topics: log.topics,
              })
              if (decoded.eventName === 'AgreementAccepted') {
                const args = decoded.args as {
                  agreementId: bigint
                  commitmentIdA: bigint
                  commitmentIdB: bigint
                }
                ctx.vars.agreementId = args.agreementId
                ctx.vars.commitmentIdA = args.commitmentIdA
                ctx.vars.commitmentIdB = args.commitmentIdB
                return
              }
            } catch {
              // skip
            }
          }
        },
      },
      {
        kind: 'tx',
        label: 'ManualArbiter owner: releaseAgreement',
        actor: 'arbiter',
        run: (ctx) => {
          const agreementId = ctx.vars.agreementId as bigint
          const wallet = ctx.walletFor('arbiter')
          return wallet.writeContract({
            address: requireAddress(ctx.manualArbiter, 'manual arbiter'),
            abi: manualArbiterAbi,
            functionName: 'releaseAgreement',
            args: [agreementId],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
      },
    ]
  },
}

const agreementForfeit: Scenario = {
  id: 'agreement-forfeit',
  title: 'Agreement: propose → accept → both forfeited',
  description:
    'Two depositors deposit and agree. The Arbiter forfeites both sides atomically (forfeitAgreement).',
  category: 'agreements',
  inputs: [...COMMON_INPUTS],
  build: (inputs) => {
    const amount = parseUnits(inputs.amount ?? '100', DEFAULT_DECIMALS)
    const maxPenaltyBps = Number(inputs.maxPenaltyBps ?? '1000')
    return [
      {
        kind: 'tx',
        label: 'Depositor 0: deposit',
        actor: 'depositor-0',
        run: (ctx) => depositAs(ctx, 'depositor-0', amount),
        capture: captureSharesFromDeposit('depositor-0', 'shares0'),
      },
      {
        kind: 'tx',
        label: 'Depositor 1: deposit',
        actor: 'depositor-1',
        run: (ctx) => depositAs(ctx, 'depositor-1', amount),
        capture: captureSharesFromDeposit('depositor-1', 'shares1'),
      },
      {
        kind: 'tx',
        label: 'Depositor 0: proposeAgreement',
        actor: 'depositor-0',
        run: (ctx) => {
          const wallet = ctx.walletFor('depositor-0')
          const params = {
            arbiter: requireAddress(ctx.manualArbiter, 'manual arbiter'),
            acceptor: ctx.actor('depositor-1').address,
            proposerLeg: {
              token: requireAddress(ctx.vault, 'vault'),
              adapter: requireAddress(ctx.adapter, 'adapter'),
              amount: ctx.vars.shares0 as bigint,
              maxPenaltyBps,
              strategies: [] as { strategy: Address; params: `0x${string}` }[],
            },
            acceptorLeg: {
              token: requireAddress(ctx.vault, 'vault'),
              adapter: requireAddress(ctx.adapter, 'adapter'),
              amount: ctx.vars.shares1 as bigint,
              maxPenaltyBps,
              strategies: [] as { strategy: Address; params: `0x${string}` }[],
            },
            challengeWindow: BigInt(ONE_DAY),
            proposalDuration: BigInt(7 * ONE_DAY),
            metadataURI: 'agreement-forfeit',
            metadataHash: zeroHash,
            maxFlowProposerToAcceptor: 0n,
            maxFlowAcceptorToProposer: 0n,
          }
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'proposeAgreement',
            args: [params],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
        capture: captureProposalId('proposalId'),
      },
      {
        kind: 'tx',
        label: 'Depositor 1: acceptAgreement',
        actor: 'depositor-1',
        run: (ctx) => {
          const proposalId = ctx.vars.proposalId as bigint
          const wallet = ctx.walletFor('depositor-1')
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'acceptAgreement',
            args: [proposalId],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
        capture: (receipt, ctx) => {
          const manager = ctx.manager
          if (!manager) return
          for (const log of receipt.logs) {
            if (log.address.toLowerCase() !== manager.toLowerCase()) continue
            try {
              const decoded = decodeEventLog({
                abi: commitmentManagerAbi,
                data: log.data,
                topics: log.topics,
              })
              if (decoded.eventName === 'AgreementAccepted') {
                ctx.vars.agreementId = (decoded.args as { agreementId: bigint }).agreementId
                return
              }
            } catch {
              // skip
            }
          }
        },
      },
      {
        kind: 'tx',
        label: 'ManualArbiter owner: forfeitAgreement',
        actor: 'arbiter',
        run: (ctx) => {
          const agreementId = ctx.vars.agreementId as bigint
          const wallet = ctx.walletFor('arbiter')
          return wallet.writeContract({
            address: requireAddress(ctx.manualArbiter, 'manual arbiter'),
            abi: manualArbiterAbi,
            functionName: 'forfeitAgreement',
            // Forfeit at the full penalty ceiling for the demo scenario.
            args: [agreementId, maxPenaltyBps],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
      },
    ]
  },
}

const unbondingHappyPath: Scenario = {
  id: 'unbonding-finalize',
  title: 'Unbonding: deposit → commit → unbond → +1d → finalize',
  description:
    'Depositor self-exit lifecycle: depositor commits, then changes their mind and requests unbond. After the unbonding period, anyone finalizes — closing the commitment without arbiter involvement. Demonstrates the unbonding queue.',
  category: 'lifecycle',
  inputs: [...COMMON_INPUTS],
  build: (inputs) => {
    const amount = parseUnits(inputs.amount ?? '100', DEFAULT_DECIMALS)
    return [
      {
        kind: 'tx',
        label: 'Depositor 0: deposit',
        actor: 'depositor-0',
        run: (ctx) => depositAs(ctx, 'depositor-0', amount),
        capture: captureSharesFromDeposit('depositor-0', 'shares0'),
      },
      {
        kind: 'tx',
        label: 'Depositor 0: createCommitment',
        actor: 'depositor-0',
        run: (ctx) => {
          const wallet = ctx.walletFor('depositor-0')
          const params = buildCommitmentParams(
            ctx,
            inputs,
            requireAddress(ctx.manualArbiter, 'manual arbiter'),
            ctx.actor('depositor-1').address,
            ctx.vars.shares0 as bigint,
            'unbonding-target',
          )
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'createCommitment',
            args: [params],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
        capture: captureCommitmentId('commitmentId'),
      },
      {
        kind: 'tx',
        label: 'Depositor 0: requestUnbond',
        actor: 'depositor-0',
        run: (ctx) => {
          const id = ctx.vars.commitmentId as bigint
          const wallet = ctx.walletFor('depositor-0')
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'requestUnbond',
            args: [id],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
      },
      {
        kind: 'time',
        label: 'Advance time +1 day +1s',
        advance: ONE_DAY + 1,
      },
      {
        kind: 'tx',
        label: 'Anyone: finalizeUnbond',
        actor: 'admin',
        run: (ctx) => {
          const id = ctx.vars.commitmentId as bigint
          const wallet = ctx.walletFor('admin')
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'finalizeUnbond',
            args: [id],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
      },
    ]
  },
}

const yieldDistributeClaim: Scenario = {
  id: 'yield-distribute-claim',
  title: 'Yield: deposit → commit → donate → distribute → claim',
  description:
    'Depositor 0 deposits and creates a yield-routed commitment with Depositor 1 as counterparty. Admin donates USDC to the active strategy (per-share NAV grows). Anyone calls distribute (mints yieldShares for the counterparty). Depositor 1 then claims their yield incentive.',
  category: 'yield',
  inputs: [
    ...COMMON_INPUTS,
    {
      key: 'donationAmount',
      label: 'Yield donation (USDC)',
      defaultValue: '10000',
      placeholder: '10000',
      hint: 'Donated to the vault (or active strategy) so totalAssets grows while totalSupply stays flat. Default seed has ~50k USDC NAV — donate ≥10k to move the index visibly.',
    },
    {
      key: 'counterparty',
      label: 'Counterparty actor',
      defaultValue: 'depositor-0',
      placeholder: 'depositor-0',
      hint: 'Actor id who will receive the yield. Match this to your MetaMask address (so the Dashboard shows your claimable yield). One of: admin, arbiter, depositor-0..4.',
    },
    {
      key: 'claimAtEnd',
      label: 'Auto-claim at end? (yes/no)',
      defaultValue: 'no',
      placeholder: 'no',
      hint: 'no = stops after distribute so the yield stays in yieldClaimable for the Dashboard to show. yes = runs the full lifecycle and ends with claim, leaving yieldClaimable=0.',
    },
  ],
  build: (inputs) => {
    const amount = parseUnits(inputs.amount ?? '100', DEFAULT_DECIMALS)
    const donation = parseUnits(inputs.donationAmount ?? '10000', DEFAULT_DECIMALS)
    const counterparty = (inputs.counterparty ?? 'depositor-0') as DevActorId
    const shouldClaim = (inputs.claimAtEnd ?? 'no').toLowerCase() === 'yes'
    // The depositor must own the locked shares; pick an actor different from
    // the counterparty so a depositor isn't paying yield to themself, unless
    // explicitly configured. Defaulting depositor=depositor-1 when
    // counterparty=depositor-0 lines up the scenario with MetaMask=Depositor 0.
    const depositor: DevActorId = counterparty === 'depositor-0' ? 'depositor-1' : 'depositor-0'
    const counterpartyLabel = counterparty.replace('-', ' ')
    const depositorLabel = depositor.replace('-', ' ')
    const steps: import('./types').ScenarioStep[] = [
      {
        kind: 'tx',
        label: `${depositorLabel}: deposit`,
        actor: depositor,
        run: (ctx) => depositAs(ctx, depositor, amount),
        capture: captureSharesFromDeposit(depositor, 'sharesDepositor'),
      },
      {
        kind: 'tx',
        label: `${depositorLabel}: createCommitment(counterparty=${counterpartyLabel})`,
        description:
          'yieldShareBps governs how much NAV growth flows to the counterparty. 0 disables yield routing.',
        actor: depositor,
        run: (ctx) => {
          const wallet = ctx.walletFor(depositor)
          const params = buildCommitmentParams(
            ctx,
            inputs,
            requireAddress(ctx.manualArbiter, 'manual arbiter'),
            ctx.actor(counterparty).address,
            ctx.vars.sharesDepositor as bigint,
            'yield-distribute-claim',
          )
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'createCommitment',
            args: [params],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
        capture: captureCommitmentId('commitmentId'),
      },
      {
        kind: 'tx',
        label: 'Admin: donate USDC to vault (simulate yield)',
        description:
          'Mints MockERC20 underlying to the active strategy (or vault if unset). totalAssets grows; totalSupply does not.',
        actor: 'admin',
        run: (ctx) => donateYield(ctx, 'admin', donation),
      },
      {
        kind: 'tx',
        label: 'Admin: distributeAll(commitmentId)',
        description:
          'Pushes accrued payouts across every distribution strategy bound to the commitment (v2 permissionless distributeAll).',
        actor: 'admin',
        run: (ctx) => {
          const id = ctx.vars.commitmentId as bigint
          const wallet = ctx.walletFor('admin')
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'distributeAll',
            args: [id],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
      },
    ]
    if (shouldClaim) {
      steps.push(
        {
          kind: 'switch',
          label: `Switch to ${counterpartyLabel} (counterparty)`,
          actor: counterparty,
        },
        {
          kind: 'tx',
          label: `${counterpartyLabel}: claim(commitmentId, strategy)`,
          description:
            'Counterparty claims accrued payout for the first bound strategy (v2 claim(id, strategy, claimData)). Reads as msg.sender — must be the counterparty.',
          actor: counterparty,
          run: async (ctx) => {
            const manager = requireAddress(ctx.manager, 'manager')
            const id = ctx.vars.commitmentId as bigint
            const strategies = (await ctx.publicClient.readContract({
              address: manager,
              abi: commitmentManagerAbi,
              functionName: 'strategiesOf',
              args: [id],
            })) as readonly Address[]
            if (strategies.length === 0) {
              throw new Error('Commitment has no bound strategies to claim from')
            }
            const wallet = ctx.walletFor(counterparty)
            return wallet.writeContract({
              address: manager,
              abi: commitmentManagerAbi,
              functionName: 'claim',
              args: [id, strategies[0], '0x'],
              chain: wallet.chain,
              account: wallet.account!,
            })
          },
        },
      )
    }
    return steps
  },
}

// =============================================================================
// v2.5 primitives — donate, contribute, settle
// =============================================================================

const vaultDonateNavLift: Scenario = {
  id: 'vault-donate-nav-lift',
  title: 'v2.5 donate: deposit → vault.donate → NAV per share rises',
  description:
    'Depositor 0 deposits to seed shares. Admin mints + approves USDC, then calls vault.donate(amount). Donations transfer assets without minting shares, so NAV per share lifts pro-rata for every existing depositor. Exercises the v2.5 donate() entry point (distinct from the strategy-mint helper used by the yield scenario).',
  category: 'yield',
  inputs: [
    {
      key: 'seedAmount',
      label: 'Seed deposit (USDC)',
      defaultValue: '1000',
      placeholder: '1000',
      hint: 'Depositor 0 deposits this so there is supply for NAV per share to lift against.',
    },
    {
      key: 'donationAmount',
      label: 'Donation (USDC)',
      defaultValue: '500',
      placeholder: '500',
      hint: 'Donated to the vault. Pulled from Admin via transferFrom — needs prior approve.',
    },
  ],
  build: (inputs) => {
    const seedAmount = parseUnits(inputs.seedAmount ?? '1000', DEFAULT_DECIMALS)
    const donation = parseUnits(inputs.donationAmount ?? '500', DEFAULT_DECIMALS)
    return [
      {
        kind: 'tx',
        label: 'Depositor 0: deposit (seed supply)',
        actor: 'depositor-0',
        run: (ctx) => depositAs(ctx, 'depositor-0', seedAmount),
      },
      {
        kind: 'tx',
        label: 'Admin: mint USDC for donation',
        description: 'MockERC20.mint is permissionless on anvil — tops up the donor.',
        actor: 'admin',
        run: async (ctx) => {
          const vault = requireAddress(ctx.vault, 'vault')
          let asset = ctx.vars.asset as Address | undefined
          if (!asset) {
            asset = (await ctx.publicClient.readContract({
              address: vault,
              abi: commitmentsVaultAbi,
              functionName: 'asset',
            })) as Address
            ctx.vars.asset = asset
          }
          const wallet = ctx.walletFor('admin')
          return wallet.writeContract({
            address: asset,
            abi: MOCK_ERC20_MINT_ABI,
            functionName: 'mint',
            args: [ctx.actor('admin').address, donation],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
      },
      {
        kind: 'tx',
        label: 'Admin: approve vault for donation amount',
        actor: 'admin',
        run: (ctx) => {
          const vault = requireAddress(ctx.vault, 'vault')
          const asset = ctx.vars.asset as Address
          const wallet = ctx.walletFor('admin')
          return wallet.writeContract({
            address: asset,
            abi: erc20Abi,
            functionName: 'approve',
            args: [vault, donation],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
      },
      {
        kind: 'tx',
        label: 'Admin: vault.donate(amount)',
        description:
          'Pulls USDC from Admin into the vault; mints no shares. totalAssets grows; totalSupply unchanged → NAV per share rises for every existing depositor.',
        actor: 'admin',
        run: (ctx) => {
          const vault = requireAddress(ctx.vault, 'vault')
          const wallet = ctx.walletFor('admin')
          return wallet.writeContract({
            address: vault,
            abi: commitmentsVaultAbi,
            functionName: 'donate',
            args: [donation],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
      },
    ]
  },
}

const commitmentContribute: Scenario = {
  id: 'commitment-contribute',
  title: 'v2.5 contribute: depositor self-contributes → third party adds',
  description:
    'Depositor 0 creates a commitment, then calls contributeEncumbered on themselves — auto-enabling third-party contributions. Depositor 1 (an unrelated free-share holder) then contributes too, growing the commitment\'s encumbered position. Exercises the auto-enable gate end-to-end.',
  category: 'lifecycle',
  inputs: [
    {
      key: 'amount',
      label: 'Initial commitment amount (USDC)',
      defaultValue: '100',
      placeholder: '100',
      hint: 'Depositor 0\'s starting stake. Self-contribution and third-party contribution amounts default to half this.',
    },
    {
      key: 'maxPenaltyBps',
      label: 'maxPenaltyBps',
      defaultValue: '1000',
      placeholder: '1000',
    },
  ],
  build: (inputs) => {
    const amount = parseUnits(inputs.amount ?? '100', DEFAULT_DECIMALS)
    return [
      {
        kind: 'tx',
        label: 'Depositor 0: deposit (initial stake + self-contribution buffer)',
        actor: 'depositor-0',
        run: (ctx) => depositAs(ctx, 'depositor-0', amount * 2n),
        capture: captureSharesFromDeposit('depositor-0', 'shares0'),
      },
      {
        kind: 'tx',
        label: 'Depositor 1: deposit (third-party contribution buffer)',
        actor: 'depositor-1',
        run: (ctx) => depositAs(ctx, 'depositor-1', amount),
        capture: captureSharesFromDeposit('depositor-1', 'shares1'),
      },
      {
        kind: 'tx',
        label: 'Depositor 0: createCommitment(counterparty=Depositor 2)',
        description:
          'Counterparty is Depositor 2 — keeps the contributors (D0 self, D1 third-party) distinct from the protected party.',
        actor: 'depositor-0',
        run: (ctx) => {
          const wallet = ctx.walletFor('depositor-0')
          // Use only HALF of D0's deposited shares for the initial commitment
          // so the remaining half is FREE and available for the self-contribute
          // step that follows.
          const initialStake = (ctx.vars.shares0 as bigint) / 2n
          ctx.vars.initialStake = initialStake
          const params = buildCommitmentParams(
            ctx,
            inputs,
            requireAddress(ctx.manualArbiter, 'manual arbiter'),
            ctx.actor('depositor-2').address,
            initialStake,
            'commitment-contribute',
          )
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'createCommitment',
            args: [params],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
        capture: captureCommitmentId('commitmentId'),
      },
      {
        kind: 'tx',
        label: 'Depositor 0: contributeEncumbered (self → auto-enables door)',
        description:
          'First self-contribution flips acceptsContributions[id] = true. Without this, the third-party step below would revert with ContributionsDisabled().',
        actor: 'depositor-0',
        run: (ctx) => {
          const id = ctx.vars.commitmentId as bigint
          const wallet = ctx.walletFor('depositor-0')
          // Contribute half of D0\'s remaining free shares.
          const selfTopup = ((ctx.vars.shares0 as bigint) - (ctx.vars.initialStake as bigint)) / 2n
          ctx.vars.selfTopup = selfTopup
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'contributeEncumbered',
            args: [id, selfTopup],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
      },
      {
        kind: 'switch',
        label: 'Switch to Depositor 1 (third-party contributor)',
        actor: 'depositor-1',
      },
      {
        kind: 'tx',
        label: 'Depositor 1: contributeEncumbered (third party)',
        description:
          'Now permitted because Depositor 0 opened the door above. D1\'s free vault shares move directly into the commitment\'s encumbered position.',
        actor: 'depositor-1',
        run: (ctx) => {
          const id = ctx.vars.commitmentId as bigint
          const wallet = ctx.walletFor('depositor-1')
          const thirdParty = (ctx.vars.shares1 as bigint) / 2n
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'contributeEncumbered',
            args: [id, thirdParty],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
      },
    ]
  },
}

const agreementSettle: Scenario = {
  id: 'agreement-settle',
  title: 'v2.5 settle: bilateral agreement → arbiter rebalances both directions',
  description:
    'Depositor 0 and Depositor 1 agree WITH non-zero settlement caps in both directions. The Arbiter calls settleAgreement once each direction (P→A, then A→P), exercising the per-direction lifetime cap. Watch the SettlementBar fill on the Agreements page.',
  category: 'agreements',
  inputs: [
    ...COMMON_INPUTS,
    {
      key: 'capP2A',
      label: 'Cap proposer → acceptor (USDC equivalent)',
      defaultValue: '50',
      placeholder: '50',
      hint: 'Lifetime cap on cumulative settle flows from D0 to D1. Denominated in vault shares (parsed with USDC decimals).',
    },
    {
      key: 'capA2P',
      label: 'Cap acceptor → proposer (USDC equivalent)',
      defaultValue: '30',
      placeholder: '30',
      hint: 'Lifetime cap in the other direction. Both caps must be > 0 to exercise full bilateral settle.',
    },
    {
      key: 'settleP2A',
      label: 'First settle (P→A)',
      defaultValue: '20',
      placeholder: '20',
      hint: 'Must be ≤ capP2A. The arbiter moves this many shares from D0\'s leg to D1\'s leg.',
    },
    {
      key: 'settleA2P',
      label: 'Second settle (A→P)',
      defaultValue: '10',
      placeholder: '10',
      hint: 'Must be ≤ capA2P. Reverse-direction rebalance.',
    },
  ],
  build: (inputs) => {
    const amount = parseUnits(inputs.amount ?? '100', DEFAULT_DECIMALS)
    const maxPenaltyBps = Number(inputs.maxPenaltyBps ?? '1000')
    const capP2A = parseUnits(inputs.capP2A ?? '50', DEFAULT_DECIMALS)
    const capA2P = parseUnits(inputs.capA2P ?? '30', DEFAULT_DECIMALS)
    const settleP2A = parseUnits(inputs.settleP2A ?? '20', DEFAULT_DECIMALS)
    const settleA2P = parseUnits(inputs.settleA2P ?? '10', DEFAULT_DECIMALS)
    return [
      {
        kind: 'tx',
        label: 'Depositor 0: deposit',
        actor: 'depositor-0',
        run: (ctx) => depositAs(ctx, 'depositor-0', amount),
        capture: captureSharesFromDeposit('depositor-0', 'shares0'),
      },
      {
        kind: 'tx',
        label: 'Depositor 1: deposit',
        actor: 'depositor-1',
        run: (ctx) => depositAs(ctx, 'depositor-1', amount),
        capture: captureSharesFromDeposit('depositor-1', 'shares1'),
      },
      {
        kind: 'tx',
        label: 'Depositor 0: proposeAgreement (with settlement caps)',
        description:
          'Caps must be set at proposal time — they cannot be added later. Both directions are non-zero so the arbiter can rebalance either way.',
        actor: 'depositor-0',
        run: (ctx) => {
          const wallet = ctx.walletFor('depositor-0')
          const params = {
            arbiter: requireAddress(ctx.manualArbiter, 'manual arbiter'),
            acceptor: ctx.actor('depositor-1').address,
            proposerLeg: {
              token: requireAddress(ctx.vault, 'vault'),
              adapter: requireAddress(ctx.adapter, 'adapter'),
              amount: ctx.vars.shares0 as bigint,
              maxPenaltyBps,
              strategies: [] as { strategy: Address; params: `0x${string}` }[],
            },
            acceptorLeg: {
              token: requireAddress(ctx.vault, 'vault'),
              adapter: requireAddress(ctx.adapter, 'adapter'),
              amount: ctx.vars.shares1 as bigint,
              maxPenaltyBps,
              strategies: [] as { strategy: Address; params: `0x${string}` }[],
            },
            challengeWindow: BigInt(ONE_DAY),
            proposalDuration: BigInt(7 * ONE_DAY),
            metadataURI: 'agreement-settle',
            metadataHash: zeroHash,
            maxFlowProposerToAcceptor: capP2A,
            maxFlowAcceptorToProposer: capA2P,
          }
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'proposeAgreement',
            args: [params],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
        capture: captureProposalId('proposalId'),
      },
      {
        kind: 'tx',
        label: 'Depositor 1: acceptAgreement',
        actor: 'depositor-1',
        run: (ctx) => {
          const proposalId = ctx.vars.proposalId as bigint
          const wallet = ctx.walletFor('depositor-1')
          return wallet.writeContract({
            address: requireAddress(ctx.manager, 'manager'),
            abi: commitmentManagerAbi,
            functionName: 'acceptAgreement',
            args: [proposalId],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
        capture: (receipt, ctx) => {
          const manager = ctx.manager
          if (!manager) return
          for (const log of receipt.logs) {
            if (log.address.toLowerCase() !== manager.toLowerCase()) continue
            try {
              const decoded = decodeEventLog({
                abi: commitmentManagerAbi,
                data: log.data,
                topics: log.topics,
              })
              if (decoded.eventName === 'AgreementAccepted') {
                ctx.vars.agreementId = (decoded.args as { agreementId: bigint }).agreementId
                return
              }
            } catch {
              // skip
            }
          }
        },
      },
      {
        kind: 'switch',
        label: 'Switch to Arbiter',
        actor: 'arbiter',
      },
      {
        kind: 'tx',
        label: 'ManualArbiter owner: settleAgreement(P→A)',
        description:
          'fromProposer = true. Moves encumbered shares from D0\'s leg to D1\'s leg. Cumulative P→A flow becomes settleP2A; remaining headroom = capP2A - settleP2A.',
        actor: 'arbiter',
        run: (ctx) => {
          const agreementId = ctx.vars.agreementId as bigint
          const wallet = ctx.walletFor('arbiter')
          return wallet.writeContract({
            address: requireAddress(ctx.manualArbiter, 'manual arbiter'),
            abi: manualArbiterAbi,
            functionName: 'settleAgreement',
            args: [agreementId, true, settleP2A, zeroHash],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
      },
      {
        kind: 'tx',
        label: 'ManualArbiter owner: settleAgreement(A→P)',
        description:
          'fromProposer = false. Moves shares back from D1\'s leg to D0\'s leg. Independent cap; the P→A flow above does not consume A→P headroom.',
        actor: 'arbiter',
        run: (ctx) => {
          const agreementId = ctx.vars.agreementId as bigint
          const wallet = ctx.walletFor('arbiter')
          return wallet.writeContract({
            address: requireAddress(ctx.manualArbiter, 'manual arbiter'),
            abi: manualArbiterAbi,
            functionName: 'settleAgreement',
            args: [agreementId, false, settleA2P, zeroHash],
            chain: wallet.chain,
            account: wallet.account!,
          })
        },
      },
    ]
  },
}

function twoTierScenario(appealed: boolean): Scenario {
  return {
    id: appealed ? 'two-tier-appealed' : 'two-tier-unappealed',
    title: appealed
      ? 'Two-tier: primary ruling → appeal → final ruling → execute'
      : 'Two-tier: primary ruling → no appeal → execute',
    description: appealed
      ? 'Creates a commitment governed by the deployed TwoTierArbiter. The primary controller rules, the committer appeals, the appeal controller responds, and permissionless manager enforcement follows its own delay.'
      : 'Creates a commitment governed by the deployed TwoTierArbiter. The primary ruling remains unappealed and is executed only after the separately configured manager execution delay.',
    category: 'forfeiture',
    inputs: [
      ...COMMON_INPUTS,
      {
        key: 'penaltyBps',
        label: appealed ? 'Primary penaltyBps' : 'PenaltyBps',
        defaultValue: '1000',
        placeholder: '1000',
        hint: 'Must not exceed maxPenaltyBps.',
      },
      ...(appealed
        ? [{
            key: 'finalPenaltyBps',
            label: 'Final appeal penaltyBps',
            defaultValue: '500',
            placeholder: '500',
            hint: 'The appeal controller’s final ruling.',
          }]
        : []),
    ],
    build: (inputs) => {
      const amount = parseUnits(inputs.amount ?? '100', DEFAULT_DECIMALS)
      const primaryPenalty = Number(inputs.penaltyBps ?? '1000')
      const finalPenalty = Number(inputs.finalPenaltyBps ?? '500')
      const steps: import('./types').ScenarioStep[] = [
        {
          kind: 'tx',
          label: 'Depositor 0: deposit',
          actor: 'depositor-0',
          run: (ctx) => depositAs(ctx, 'depositor-0', amount),
          capture: captureSharesFromDeposit('depositor-0', 'twoTierShares'),
        },
        {
          kind: 'tx',
          label: 'Depositor 0: createCommitment(arbiter=TwoTierArbiter)',
          actor: 'depositor-0',
          run: (ctx) => {
            const wallet = ctx.walletFor('depositor-0')
            const params = buildCommitmentParams(
              ctx,
              inputs,
              requireAddress(ctx.twoTierArbiter, 'two-tier arbiter'),
              ctx.actor('depositor-1').address,
              ctx.vars.twoTierShares as bigint,
              appealed ? 'two-tier-appealed' : 'two-tier-unappealed',
            )
            // Court windows are 1d each and the execution buffer is 1h, so
            // the commitment must exceed the court's 25h minimum.
            params.challengeWindow = BigInt(2 * ONE_DAY)
            return wallet.writeContract({
              address: requireAddress(ctx.manager, 'manager'),
              abi: commitmentManagerAbi,
              functionName: 'createCommitment',
              args: [params],
              chain: wallet.chain,
              account: wallet.account!,
            })
          },
          capture: captureCommitmentId('twoTierCommitmentId'),
        },
        {
          kind: 'tx',
          label: 'Primary controller: proposeRuling',
          actor: 'arbiter',
          run: (ctx) => {
            const wallet = ctx.walletFor('arbiter')
            return wallet.writeContract({
              address: requireAddress(ctx.twoTierArbiter, 'two-tier arbiter'),
              abi: twoTierArbiterAbi,
              functionName: 'proposeRuling',
              args: [ctx.vars.twoTierCommitmentId as bigint, primaryPenalty, zeroHash.replace(/0$/, '1') as `0x${string}`],
              chain: wallet.chain,
              account: wallet.account!,
            })
          },
          capture: captureTwoTierCaseId('twoTierCaseId'),
        },
      ]
      if (appealed) {
        steps.push(
          {
            kind: 'tx',
            label: 'Committer: appeal before appeal deadline',
            actor: 'depositor-0',
            run: (ctx) => {
              const wallet = ctx.walletFor('depositor-0')
              return wallet.writeContract({
                address: requireAddress(ctx.twoTierArbiter, 'two-tier arbiter'),
                abi: twoTierArbiterAbi,
                functionName: 'appeal',
                args: [ctx.vars.twoTierCaseId as bigint, zeroHash.replace(/0$/, '2') as `0x${string}`],
                chain: wallet.chain,
                account: wallet.account!,
              })
            },
          },
          {
            kind: 'tx',
            label: 'Appeal controller: resolveAppeal',
            actor: 'admin',
            run: (ctx) => {
              const wallet = ctx.walletFor('admin')
              return wallet.writeContract({
                address: requireAddress(ctx.twoTierArbiter, 'two-tier arbiter'),
                abi: twoTierArbiterAbi,
                functionName: 'resolveAppeal',
                args: [ctx.vars.twoTierCaseId as bigint, finalPenalty, zeroHash.replace(/0$/, '3') as `0x${string}`],
                chain: wallet.chain,
                account: wallet.account!,
              })
            },
          },
        )
      }
      steps.push(
        {
          kind: 'time',
          label: 'Advance past manager execution delay (+2 days +1s)',
          advance: 2 * ONE_DAY + 1,
        },
        {
          kind: 'tx',
          label: 'Anyone: executeRuling',
          actor: 'admin',
          run: (ctx) => {
            const wallet = ctx.walletFor('admin')
            return wallet.writeContract({
              address: requireAddress(ctx.twoTierArbiter, 'two-tier arbiter'),
              abi: twoTierArbiterAbi,
              functionName: 'executeRuling',
              args: [ctx.vars.twoTierCaseId as bigint],
              chain: wallet.chain,
              account: wallet.account!,
            })
          },
        },
      )
      return steps
    },
  }
}

const twoTierUnappealed = twoTierScenario(false)
const twoTierAppealed = twoTierScenario(true)

export const SCENARIOS: Scenario[] = [
  happyPathRelease,
  arbitrationHandoff,
  happyPathForfeit,
  cancelledForfeit,
  twoTierUnappealed,
  twoTierAppealed,
  unbondingHappyPath,
  agreementHappyPath,
  agreementForfeit,
  agreementSettle,
  commitmentContribute,
  yieldDistributeClaim,
  vaultDonateNavLift,
]
