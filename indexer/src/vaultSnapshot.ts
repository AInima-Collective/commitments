/**
 * Vault snapshots: the `VaultSnapshot` block source (`ponder.config.ts`) fires
 * every N blocks, and this handler writes one `vaultSnapshot` row per indexed
 * vault. Chain reads run at the tick's block (Ponder's `context.client`
 * default) and the aggregates read the indexed tables as of that block, so
 * history backfills deterministically and is reorg-safe.
 */
import { and, asc, eq, gte, sql } from 'ponder'
import { ponder } from 'ponder:registry'
import { commitment, ledgerPosition, vault, vaultSnapshot } from 'ponder:schema'

import { commitmentsVaultAbi } from './abis'
import { APY_30D_SECONDS, APY_7D_SECONDS, rollingApyBps, sharePriceOf } from './api/snapshotMath'

ponder.on('VaultSnapshot:block', async ({ event, context }) => {
  const db = context.db.sql
  const now = event.block.timestamp
  const vaults = await db.select({ address: vault.address }).from(vault)

  for (const { address } of vaults) {
    const [totalAssets, totalSupply] = await Promise.all([
      context.client.readContract({ address, abi: commitmentsVaultAbi, functionName: 'totalAssets' }),
      context.client.readContract({ address, abi: commitmentsVaultAbi, functionName: 'totalSupply' }),
    ])
    const sharePrice = sharePriceOf(totalAssets, totalSupply)

    // Oldest row inside each trailing window: the APY reference.
    const oldestSince = async (windowSec: number) =>
      (
        await db
          .select({ timestamp: vaultSnapshot.timestamp, sharePrice: vaultSnapshot.sharePrice })
          .from(vaultSnapshot)
          .where(and(eq(vaultSnapshot.vault, address), gte(vaultSnapshot.timestamp, now - BigInt(windowSec))))
          .orderBy(asc(vaultSnapshot.timestamp))
          .limit(1)
      )[0]

    // Sequential on purpose: each raw read flushes Ponder's indexing cache first.
    const ref7d = await oldestSince(APY_7D_SECONDS)
    const ref30d = await oldestSince(APY_30D_SECONDS)
    const statusRows = await db
      .select({
        status: commitment.status,
        count: sql<string>`count(*)::text`,
        forfeitable: sql<string>`coalesce(floor(sum(${commitment.amount} * ${commitment.maxPenaltyBps}) / 10000), 0)::text`,
      })
      .from(commitment)
      .where(eq(commitment.vault, address))
      .groupBy(commitment.status)
    const [encumbered] = await db
      .select({ total: sql<string>`coalesce(sum(${ledgerPosition.encumbered}), 0)::text` })
      .from(ledgerPosition)
      .where(eq(ledgerPosition.token, address))

    let totalForfeitable = 0n
    let activeCommitmentCount = 0
    let forfeitPendingCount = 0
    for (const row of statusRows) {
      if (row.status === 'active' || row.status === 'unbonding' || row.status === 'forfeitPending') {
        totalForfeitable += BigInt(row.forfeitable)
      }
      if (row.status === 'active') activeCommitmentCount = Number(row.count)
      if (row.status === 'forfeitPending') forfeitPendingCount = Number(row.count)
    }

    await context.db
      .insert(vaultSnapshot)
      .values({
        vault: address,
        timestamp: now,
        sharePrice,
        totalAssets,
        totalSupply,
        apy7d: rollingApyBps(now, sharePrice, ref7d, APY_7D_SECONDS),
        apy30d: rollingApyBps(now, sharePrice, ref30d, APY_30D_SECONDS),
        totalForfeitable,
        totalEncumberedShares: BigInt(encumbered?.total ?? 0),
        activeCommitmentCount,
        forfeitPendingCount,
      })
      // Two ticks can share a timestamp only on a chain with repeated block
      // times (anvil); keep the first.
      .onConflictDoNothing()
  }
})
