/**
 * Underwritten-agent-vault coverage pipeline (use-cases/agent-bonds.md).
 *
 * Two singleton bindings feed one ledger table (`vaultYieldFee`) plus the
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
import { ponder } from 'ponder:registry'
import { mutual, vaultYieldFee } from 'ponder:schema'

import { skimmingMockStrategyAbi, vaultCoverConduitAbi } from './abis'

type Hex = `0x${string}`

const feeRowKey = (source: Hex, blockNumber: bigint, logIndex: number) =>
  `${source.toLowerCase()}-${blockNumber}-${logIndex}`

// Both contracts expose an immutable `vault()`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readVault(context: any, source: Hex, abi: unknown): Promise<Hex> {
  // Normalize: readContract returns checksummed addresses, but hex columns and
  // API-side equality filters compare lowercase (log addresses are lowercase).
  const vaultAddr = (await context.client.readContract({
    address: source,
    abi,
    functionName: 'vault',
    cache: 'immutable',
  })) as Hex
  return vaultAddr.toLowerCase() as Hex
}

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
  const vaultAddr = await readVault(context, source, abi)
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

ponder.on('SkimmingStrategy:YieldSkimmed', async ({ event, context }) => {
  await insertFeeRow(context, event, skimmingMockStrategyAbi, { kind: 'skim', amount: event.args.fee })
})

ponder.on('SkimmingStrategy:OperatorFeePaid', async ({ event, context }) => {
  const { operator, amount } = event.args
  await insertFeeRow(context, event, skimmingMockStrategyAbi, { kind: 'operatorFee', amount, recipient: operator })
})

ponder.on('SkimmingStrategy:PremiumRouted', async ({ event, context }) => {
  const { premiumRecipient, amount } = event.args
  await insertFeeRow(context, event, skimmingMockStrategyAbi, {
    kind: 'premiumRouted',
    amount,
    recipient: premiumRecipient,
  })
})

ponder.on('VaultCoverConduit:PremiumFunded', async ({ event, context }) => {
  const { mutualId, premium, duration } = event.args
  const conduitAddr = event.log.address
  await insertFeeRow(context, event, vaultCoverConduitAbi, {
    kind: 'premiumFunded',
    amount: premium,
    mutualId,
    streamDuration: BigInt(duration),
  })

  // Stamp the vault↔mutual association on the mutual row (idempotent — the
  // conduit's (vault, mutualId) pair is immutable). The mutual row exists by
  // now: MutualCreated indexes on the always-bound manager.
  const managerAddr = await context.client.readContract({
    address: conduitAddr,
    abi: vaultCoverConduitAbi,
    functionName: 'manager',
    cache: 'immutable',
  })
  const vaultAddr = await readVault(context, conduitAddr, vaultCoverConduitAbi)
  const id = `${managerAddr.toLowerCase()}-${mutualId}`
  const row = await context.db.find(mutual, { id })
  if (row && (row.coveredVault !== vaultAddr || row.conduit !== conduitAddr)) {
    await context.db
      .update(mutual, { id })
      .set({ coveredVault: vaultAddr, conduit: conduitAddr, updatedBlock: event.block.number })
  }
})
