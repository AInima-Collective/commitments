import { Hono } from 'hono'
import { and, eq, inArray, sql } from 'ponder'
import { db, publicClients } from 'ponder:api'
import schema from 'ponder:schema'
import type { Hex } from 'viem'

import { commitmentsVaultAbi } from '../abis'
import { CHAIN_NAME } from '../env'

// Minimal IERC20Metadata ABI for reading the underlying asset's symbol /
// decimals. The vault's own symbol/decimals describe its share token (e.g.
// "cvUSDC" at 15 decimals because of the ERC-4626 virtual-share offset),
// but display + price-feed lookups need the underlying asset's vocabulary
// (e.g. "USDC" at 6 decimals). Keep this as `as const` so TypeScript can
// narrow the return types across the readContract overloads.
const erc20MetadataAbi = [
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string', name: '' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8', name: '' }],
  },
] as const

// Loose typing — the publicClient object is shaped by Ponder's runtime, but
// the readContract overloads we use are stable across viem 2.x. A union of
// concrete signatures keeps callers honest without dragging in the full
// PublicClient type from viem.
interface MinimalPublicClient {
  readContract(args: {
    address: Hex
    abi: typeof commitmentsVaultAbi
    functionName: 'convertToAssets'
    args: [bigint]
  }): Promise<bigint>
  readContract(args: {
    address: Hex
    abi: typeof commitmentsVaultAbi
    functionName: 'name' | 'symbol'
  }): Promise<string>
  readContract(args: {
    address: Hex
    abi: typeof commitmentsVaultAbi
    functionName: 'asset'
  }): Promise<Hex>
  readContract(args: {
    address: Hex
    abi: typeof commitmentsVaultAbi
    functionName: 'decimals'
  }): Promise<number>
  readContract(args: {
    address: Hex
    abi: typeof erc20MetadataAbi
    functionName: 'symbol'
  }): Promise<string>
  readContract(args: {
    address: Hex
    abi: typeof erc20MetadataAbi
    functionName: 'decimals'
  }): Promise<number>
}

function getPublicClient(): MinimalPublicClient | null {
  const clients = publicClients as Record<string, MinimalPublicClient | undefined>
  return clients[CHAIN_NAME] ?? null
}

interface VaultStaticFields {
  asset: Hex | null
  name: string | null
  symbol: string | null
  decimals: number | null
  /** Underlying ERC-20 symbol — what end users recognize (e.g. "USDC"). */
  assetSymbol: string | null
  /** Underlying ERC-20 decimals — used to format `totalAssets`. */
  assetDecimals: number | null
}

/**
 * Read display-relevant ERC-4626 fields from a vault contract in one
 * parallelized batch — and then read the underlying asset's own symbol +
 * decimals via IERC20Metadata so the row carries the vocabulary the user
 * actually recognizes (USDC at 6 decimals, not cvUSDC at 15).
 *
 * Used by /stake-summary so the endpoint works for any vault even if the
 * indexer hasn't seen a VaultMetadataUpdated event for it (e.g. vaults
 * deployed via VaultFactory.deployVault, which surface as
 * `additionalContracts` in the broadcast and aren't in the indexer's single
 * CommitmentsVault registration).
 *
 * Returns nulls on failure — the frontend renders share counts and the
 * "TOKEN" placeholder rather than blowing up the row.
 */
async function readVaultStaticFields(
  publicClient: MinimalPublicClient,
  address: Hex,
): Promise<VaultStaticFields> {
  let asset: Hex | null = null
  let name: string | null = null
  let symbol: string | null = null
  let decimals: number | null = null
  try {
    const [a, n, s, d] = await Promise.all([
      publicClient.readContract({ address, abi: commitmentsVaultAbi, functionName: 'asset' }),
      publicClient.readContract({ address, abi: commitmentsVaultAbi, functionName: 'name' }),
      publicClient.readContract({ address, abi: commitmentsVaultAbi, functionName: 'symbol' }),
      publicClient.readContract({ address, abi: commitmentsVaultAbi, functionName: 'decimals' }),
    ])
    asset = a
    name = n
    symbol = s
    decimals = d
  } catch {
    // fall through with nulls
  }

  let assetSymbol: string | null = null
  let assetDecimals: number | null = null
  if (asset) {
    try {
      const [s, d] = await Promise.all([
        publicClient.readContract({ address: asset, abi: erc20MetadataAbi, functionName: 'symbol' }),
        publicClient.readContract({ address: asset, abi: erc20MetadataAbi, functionName: 'decimals' }),
      ])
      assetSymbol = s
      assetDecimals = d
    } catch {
      // best-effort; keep nulls
    }
  }

  return { asset, name, symbol, decimals, assetSymbol, assetDecimals }
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
 * metadata (name, asset, symbol, decimals, logoURI).
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

  // 3. Resolve vault metadata + share→asset conversion for each row.
  //    Static fields (asset/name/symbol/decimals) come from the chain so this
  //    works for any vault — including those deployed via VaultFactory whose
  //    proxies live in `additionalContracts` of the broadcast and aren't in
  //    the indexer's CommitmentsVault registration. logoURI + display name
  //    overrides are best-effort from the vault row when present.
  const publicClient = getPublicClient()
  const denoms = await Promise.all(
    stakeRows
      .filter((r): r is { vault: Hex; totalShares: string } => Boolean(r.vault))
      .map(async (row) => {
        const totalShares = BigInt(row.totalShares)
        const [vaultRow, statics, totalAssets] = await Promise.all([
          db
            .select()
            .from(schema.vault)
            .where(eq(schema.vault.address, row.vault))
            .limit(1)
            .then((rows) => rows[0]),
          publicClient ? readVaultStaticFields(publicClient, row.vault) : Promise.resolve({
            asset: null,
            name: null,
            symbol: null,
            decimals: null,
            assetSymbol: null,
            assetDecimals: null,
          } as VaultStaticFields),
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
        // the on-chain ERC-4626 name, then the indexer-cached name.
        const name = metaName ?? statics.name ?? vaultRow?.name ?? null
        return {
          vault: row.vault,
          totalShares: totalShares.toString(),
          totalAssets: totalAssets === null ? null : totalAssets.toString(),
          asset: statics.asset ?? vaultRow?.asset ?? null,
          name,
          // The vault's own ERC-4626 share symbol/decimals (e.g.
          // "cvUSDC" at 15dp from the virtual-share offset).
          symbol: statics.symbol ?? vaultRow?.symbol ?? null,
          decimals: statics.decimals ?? vaultRow?.decimals ?? null,
          // The underlying asset's ERC-20 symbol/decimals (e.g. "USDC"
          // at 6dp). Use these to format `totalAssets` and to look up
          // USD prices — never use `decimals` for that, the share
          // offset will scale the value into invisibility.
          assetSymbol: statics.assetSymbol ?? null,
          assetDecimals: statics.assetDecimals ?? null,
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
