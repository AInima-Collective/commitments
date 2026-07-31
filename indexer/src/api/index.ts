import { Hono } from 'hono'
import { client, graphql } from 'ponder'
import { db, publicClients } from 'ponder:api'
import schema from 'ponder:schema'
import type { Hex } from 'viem'

import { commitmentsVaultAbi } from '../abis'
import graph from './graph'
import account from './account'
import commitments from './commitments'
import agreements from './agreements'
import services from './services'
import vaults from './vaults'
import mutuals from './mutuals'
import protocol from './protocol'
import prices from './prices'
import governance from './governance'
import metadata from './metadata'
import { ensureOffchainSchema } from './offchainDb'
import { takeAllSnapshots } from './snapshot'
import { CHAIN_NAME, CHAIN_ID } from '../env'

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000

interface MinimalPublicClient {
  readContract(args: {
    address: Hex
    abi: typeof commitmentsVaultAbi
    functionName: 'totalAssets' | 'totalSupply'
  }): Promise<bigint>
  // Snapshot's default "now" reads the chain clock; the real viem client has this.
  getBlock(): Promise<{ timestamp: bigint }>
}

let snapshotTimer: ReturnType<typeof setInterval> | null = null

/**
 * Start the periodic snapshot job. Idempotent: a previously-registered timer
 * is cleared first so HMR/restart in dev doesn't stack jobs.
 *
 * Errors inside the job are caught and logged so a single bad run doesn't
 * tear down the indexer process. Idempotent inserts mean the next tick
 * recovers gracefully.
 */
function startSnapshotJob() {
  if (snapshotTimer) {
    clearInterval(snapshotTimer)
    snapshotTimer = null
  }

  const tick = async () => {
    try {
      const clients = publicClients as Record<string, MinimalPublicClient | undefined>
      const client = clients[CHAIN_NAME]
      if (!client) {
        console.warn(
          `[snapshot] publicClient not found for chain "${CHAIN_NAME}", skipping`,
        )
        return
      }
      const results = await takeAllSnapshots({ publicClient: client, chainId: CHAIN_ID })
      for (const result of results) {
        if (result.status === 'error') {
          console.warn(`[snapshot] ${result.message}`)
        } else if (result.status === 'created') {
          console.log(`[snapshot] ${result.message}`)
        }
      }
    } catch (err) {
      console.warn(
        `[snapshot] uncaught error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // Fire once on startup so the first row exists ahead of the first interval.
  void tick()
  snapshotTimer = setInterval(tick, SNAPSHOT_INTERVAL_MS)
  // Don't keep the process alive solely for this timer.
  if (typeof snapshotTimer.unref === 'function') {
    snapshotTimer.unref()
  }
}

// Bring up the offchain schema first; only start the periodic job once it
// exists so the first tick can write without race-condition retries.
void ensureOffchainSchema()
  .then(() => startSnapshotJob())
  .catch((err) => {
    console.warn(
      `[snapshot] failed to ensure offchain schema; periodic snapshots disabled: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  })

// Metadata columns on commitment, agreementProposal, agreement, operator
// (added in Phase 15 Plan 02) are auto-exposed by Ponder's graphql() middleware
// — no per-column wiring needed. Query via GET /graphql with standard GraphQL.
//
// Example query:
//   query { commitments { id depositor metadataURI metadataStatus metadataContent } }
//
// Note: /graph/* and /account/* custom routes use db.select() (no explicit column
// list), so they also return metadata columns. The /graph/agreements edge
// mapping intentionally omits metadata fields for graph rendering perf; use
// /graphql or /account/:address for full metadata access.

const app = new Hono()

// CORS for the Vite frontend running on localhost:5173.
app.use('*', async (c, next) => {
  c.res.headers.set('Access-Control-Allow-Origin', '*')
  c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (c.req.method === 'OPTIONS') return c.body(null, 204)
  await next()
})

app.use('/sql/*', client({ db, schema }))
app.use('/', graphql({ db, schema }))
app.use('/graphql', graphql({ db, schema }))

app.route('/graph', graph)
app.route('/account', account)
app.route('/commitments', commitments)
app.route('/agreements', agreements)
app.route('/services', services)
app.route('/vaults', vaults)
app.route('/mutuals', mutuals)
app.route('/protocol', protocol)
app.route('/prices', prices)
app.route('/governors', governance)
app.route('/metadata', metadata)

export default app
