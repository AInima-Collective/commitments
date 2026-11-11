import { Hono } from 'hono'
import { and, eq, inArray, sql } from 'ponder'
import { db, publicClients } from 'ponder:api'
import schema from 'ponder:schema'
import type { Hex } from 'viem'

import { commitmentsVaultAbi } from '../abis'
import { CHAIN_NAME } from '../env'

// Loose typing — the publicClient object is shaped by Ponder's runtime; the
// one readContract call we make is stable across viem 2.x.
interface MinimalPublicClient {
  readContract(args: {
    address: Hex
    abi: typeof commitmentsVaultAbi
    functionName: 'convertToAssets'
    args: [bigint]
  }): Promise<bigint>
}

function getPublicClient(): MinimalPublicClient | null {
  const clients = publicClients as Record<string, MinimalPublicClient | undefined>
  return clients[CHAIN_NAME] ?? null
}

const app = new Hono()

/**
 * GET /services/:address/stake-summary
 *
 * Per-vault committed stake totals for a service. Joins the
 * service_operator membership table to commitment.operatorBeneficiary,
 * filters out non-active commitments (released / forfeited / expired drop
 * out for free via the existing status column), and groups by
 * commitment.vault.
 *
 * For each (vault, totalShares), reads vault.convertToAssets(totalShares)
 * fresh per request so the asset-denominated value reflects the live
 * share-price. The vault row from the indexer carries the display
 * metadata (name, asset, symbol, decimals, assetSymbol, assetDecimals, logoURI).
 *
 * USD aggregation is intentionally NOT done server-side — the frontend
 * applies useAssetPrices() so we don't bake a price-feed dependency
 * into the indexer. The endpoint returns raw shares + raw asset
 * amounts and lets the caller decide.
 *
 * Note on forfeiture: status='forfeited' is set by the existing
 * ForfeitExecuted handler on the commitment table, so forfeited stake
 * automatically falls out of the SUM. No bespoke decrement path.
 *
 * Response shape:
 * {
 *   "service": "0x...",
 *   "operatorCount": 3,
 *   "denoms": [
 *     {
 *       "vault": "0x...",
 *       "totalShares": "12600000000000000000",  // formatted with `decimals` (vault share decimals)
 *       "totalAssets": "13229999999",            // formatted with `assetDecimals`
 *       "asset": "0x...",
 *       "name": "Commitments USDC Vault",        // vault.v1 name override → vault.name() fallback
 *       "symbol": "cvUSDC",                      // ERC-4626 share symbol
 *       "decimals": 15,                          // ERC-4626 share decimals (asset + virtual offset)
 *       "assetSymbol": "USDC",                   // underlying ERC-20 symbol — use for price lookups
 *       "assetDecimals": 6,                      // underlying ERC-20 decimals — use to format `totalAssets`
 *       "logoURI": "/assets/usdc.png"
 *     }
 *   ]
 * }
 */
app.get('/:address/stake-summary', async (c) => {
  const serviceAddress = c.req.param('address').toLowerCase() as `0x${string}`

  // 1. Registered operators in this service.
  const memberships = await db
    .select({ operator: schema.serviceOperator.operator })
    .from(schema.serviceOperator)
    .where(
      and(
        eq(schema.serviceOperator.service, serviceAddress),
        eq(schema.serviceOperator.status, 'registered'),
      ),
    )

  if (memberships.length === 0) {
    return c.json({
      service: serviceAddress,
      operatorCount: 0,
      denoms: [],
    })
  }

  const operatorAddresses = memberships.map((m) => m.operator)

  // 2. Per-vault committed shares across those operators' active commitments.
  //    'active' covers the live stake; 'unbonding' is in flight but still
  //    encumbered until the unbond window matures, so it counts. 'released',
  //    'forfeited', 'expired' are excluded — forfeit accounting falls out for free.
  //    Postgres SUM(bigint) returns numeric → cast to text and parse with
  //    BigInt() on the way out (mirrors api/graph.ts pattern).
  const stakeRows = await db
    .select({
      vault: schema.commitment.vault,
      totalShares: sql<string>`SUM(${schema.commitment.amount})::text`.as('total_shares'),
    })
    .from(schema.commitment)
    .where(
      and(
        inArray(schema.commitment.operatorBeneficiary, operatorAddresses),
        inArray(schema.commitment.status, ['active', 'unbonding', 'forfeitPending']),
      ),
    )
    .groupBy(schema.commitment.vault)

  // 3. Vault display fields come from the indexed `vault` row (written at
  //    VaultDeployed; VaultFactory vaults are indexed through the factory).
  //    Only the share→asset conversion is live, so it tracks the share price.
  const publicClient = getPublicClient()
  const denoms = await Promise.all(
    stakeRows
      .filter((r): r is { vault: Hex; totalShares: string } => Boolean(r.vault))
      .map(async (row) => {
        const totalShares = BigInt(row.totalShares)
        const [vaultRow, totalAssets] = await Promise.all([
          db
            .select()
            .from(schema.vault)
            .where(eq(schema.vault.address, row.vault))
            .limit(1)
            .then((rows) => rows[0]),
          (async (): Promise<bigint | null> => {
            if (!publicClient) return null
            if (totalShares === 0n) return 0n
            try {
              return await publicClient.readContract({
                address: row.vault,
                abi: commitmentsVaultAbi,
                functionName: 'convertToAssets',
                args: [totalShares],
              })
            } catch {
              return null
            }
          })(),
        ])
        const metaContent = (vaultRow?.metadataContent ?? null) as Record<string, unknown> | null
        const logoURI = typeof metaContent?.logoURI === 'string' ? metaContent.logoURI : null
        const metaName = typeof metaContent?.name === 'string' ? metaContent.name : null
        // vault.v1 metadata `name` is preferred (curated label); fall back to
        // the ERC-4626 name read at deploy.
        const name = metaName ?? vaultRow?.name ?? null
        return {
          vault: row.vault,
          totalShares: totalShares.toString(),
          totalAssets: totalAssets === null ? null : totalAssets.toString(),
          asset: vaultRow?.asset ?? null,
          name,
          // The vault's own ERC-4626 share symbol/decimals (e.g.
          // "cvUSDC" at 15dp from the virtual-share offset).
          symbol: vaultRow?.symbol ?? null,
          decimals: vaultRow?.decimals ?? null,
          // The underlying asset's ERC-20 symbol/decimals (e.g. "USDC"
          // at 6dp). Use these to format `totalAssets` and to look up
          // USD prices — never use `decimals` for that, the share
          // offset will scale the value into invisibility.
          assetSymbol: vaultRow?.assetSymbol ?? null,
          assetDecimals: vaultRow?.assetDecimals ?? null,
          logoURI,
        }
      }),
  )

  return c.json({
    service: serviceAddress,
    operatorCount: memberships.length,
    denoms,
  })
})

export default app
