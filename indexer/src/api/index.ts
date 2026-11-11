import { Hono } from 'hono'
import { client, graphql } from 'ponder'
import { db } from 'ponder:api'
import schema from 'ponder:schema'

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

// Metadata columns on commitment, agreementProposal, agreement, operator
// (added in Phase 15 Plan 02) are auto-exposed by Ponder's graphql() middleware
// — no per-column wiring needed. Query via GET /graphql with standard GraphQL.
//
// Example query:
//   query { commitments { id committer metadataURI metadataStatus metadataContent } }
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
