/**
 * Underwritten-agent-vault coverage pipeline (use-cases/agent-bonds.md).
 *
 * Two gated singleton bindings feed one ledger table (`vaultYieldFee`) plus the
 * vault↔mutual association on the `mutual` row:
 *
 *   SkimmingStrategy   — the fee-skimming yield strategy. YieldSkimmed /
 *                        OperatorFeePaid / PremiumRouted rows are denominated in
 *                        the vault's underlying asset.
 *   VaultCoverConduit  — the keyless policyholder-of-record. PremiumFunded rows
 *                        are denominated in vault shares (the mutual numeraire);
 *                        the first one also stamps `mutual.coveredVault` /
 *                        `mutual.conduit`, which is what the frontend keys the
 *                        "automatically covered" surfaces on.
 *
 * Settlement restitution needs no handler here: the beneficiary's sweep emits
 * the vault's ordinary `Donation` event (donor = the ForfeitDonationBeneficiary)
 * and is labelled at the API layer.
 */
import { ponder as typedPonder } from 'ponder:registry'
import { mutual, vaultYieldFee } from 'ponder:schema'

import { skimmingMockStrategyAbi, vaultCoverConduitAbi } from './abis'
import { loadDeployments } from './loadDeployments'
import { CHAIN_ID } from './env'

// These contracts are conditionally configured. Keep registration permissive
// across deployment shapes; Ponder validates event names at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ponder = typedPonder as unknown as { on: (name: string, fn: (ctx: any) => Promise<void> | void) => void }

// Both contracts are only present in the Ponder config when the seed deployed
// them — gate handler registration on the same deployment-presence check the
// config uses (Ponder rejects handlers for unconfigured contracts at startup).
let SKIM_STRATEGY_ENABLED = false
let COVER_CONDUIT_ENABLED = false
try {
  const d = loadDeployments(CHAIN_ID)
  SKIM_STRATEGY_ENABLED = Boolean(d.skimmingStrategy)
  COVER_CONDUIT_ENABLED = Boolean(d.vaultCoverConduit)
} catch {
  // No resolvable deployment — leave the coverage pipeline disabled.
}

type Hex = `0x${string}`

const feeRowKey = (source: Hex, blockNumber: bigint, logIndex: number) =>
  `${source.toLowerCase()}-${blockNumber}-${logIndex}`

// Immutable per-contract wiring, read once per process (the bindings are
// per-chain singletons; same pattern as the manager-vault cache in index.ts).
const vaultBySource = new Map<string, Hex>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveVaultCached(context: any, source: Hex, abi: unknown): Promise<Hex> {
  const key = source.toLowerCase()
  const cached = vaultBySource.get(key)
  if (cached) return cached
  // Normalize: readContract returns checksummed addresses, but hex columns and
  // API-side equality filters compare lowercase (log addresses are lowercase).
  const vaultAddr = (
    (await context.client.readContract({
      address: source,
      abi,
      functionName: 'vault',
    })) as Hex
  ).toLowerCase() as Hex
  vaultBySource.set(key, vaultAddr)
  return vaultAddr
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertFeeRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  abi: unknown,
  row: {
    kind: 'skim' | 'operatorFee' | 'premiumRouted' | 'premiumFunded'
    amount: bigint
    recipient?: Hex
    mutualId?: bigint
    streamDuration?: bigint
  },
) {
  const source = event.log.address as Hex
  const vaultAddr = await resolveVaultCached(context, source, abi)
  await context.db.insert(vaultYieldFee).values({
    id: feeRowKey(source, event.block.number, Number(event.log.logIndex)),
    vault: vaultAddr,
    source,
    kind: row.kind,
    amount: row.amount,
    recipient: row.recipient ?? null,
    mutualId: row.mutualId ?? null,
    streamDuration: row.streamDuration ?? null,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  })
}

if (SKIM_STRATEGY_ENABLED) {
  ponder.on('SkimmingStrategy:YieldSkimmed', async ({ event, context }) => {
    const { fee } = event.args
    await insertFeeRow(context, event, skimmingMockStrategyAbi, { kind: 'skim', amount: fee as bigint })
  })

  ponder.on('SkimmingStrategy:OperatorFeePaid', async ({ event, context }) => {
    const { operator, amount } = event.args
    await insertFeeRow(context, event, skimmingMockStrategyAbi, {
      kind: 'operatorFee',
      amount: amount as bigint,
      recipient: operator as Hex,
    })
  })

  ponder.on('SkimmingStrategy:PremiumRouted', async ({ event, context }) => {
    const { premiumRecipient, amount } = event.args
    await insertFeeRow(context, event, skimmingMockStrategyAbi, {
      kind: 'premiumRouted',
      amount: amount as bigint,
      recipient: premiumRecipient as Hex,
    })
  })
}

if (COVER_CONDUIT_ENABLED) {
  ponder.on('VaultCoverConduit:PremiumFunded', async ({ event, context }) => {
    const { mutualId, premium, duration } = event.args
    const conduitAddr = event.log.address as Hex
    await insertFeeRow(context, event, vaultCoverConduitAbi, {
      kind: 'premiumFunded',
      amount: premium as bigint,
      mutualId: mutualId as bigint,
      streamDuration: BigInt(duration as bigint | number),
    })

    // Stamp the vault↔mutual association on the mutual row (idempotent — the
    // conduit's (vault, mutualId) pair is immutable). The mutual row exists by
    // now: MutualCreated indexes on the always-bound manager.
    const managerAddr = (
      (await context.client.readContract({
        address: conduitAddr,
        abi: vaultCoverConduitAbi,
        functionName: 'manager',
      })) as Hex
    ).toLowerCase() as Hex
    const vaultAddr = await resolveVaultCached(context, conduitAddr, vaultCoverConduitAbi)
    const id = `${managerAddr.toLowerCase()}-${mutualId}`
    const row = await context.db.find(mutual, { id })
    if (row && (row.coveredVault !== vaultAddr || row.conduit !== conduitAddr)) {
      await context.db
        .update(mutual, { id })
        .set({ coveredVault: vaultAddr, conduit: conduitAddr, updatedBlock: event.block.number })
    }
  })
}
