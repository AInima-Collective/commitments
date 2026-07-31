import { Hono } from 'hono'
import { and, desc, eq } from 'ponder'
import { db } from 'ponder:api'
import schema from 'ponder:schema'

const app = new Hono()

/**
 * Agreement endpoints. Currently only the v2.5 settlements log; expand here
 * when more agreement-scoped views are needed.
 */

/**
 * GET /agreements/:id/settlements
 *
 * Per-AgreementSettled-event log for one agreement, newest first, capped at 500.
 * Use `?limit=N` to override the default of 100.
 *
 * Multi-manager: agreementId is per-manager; pass `?manager=0x...` to
 * disambiguate. Without it, returns matches across all managers (typically
 * fine because settlements are sparse).
 */
app.get('/:id/settlements', async (c) => {
  const id = BigInt(c.req.param('id'))
  const managerParam = c.req.query('manager')?.toLowerCase() as `0x${string}` | undefined
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 100), 1), 500)

  const where = managerParam
    ? and(
        eq(schema.agreementSettlement.agreementId, id),
        eq(schema.agreementSettlement.manager, managerParam),
      )
    : eq(schema.agreementSettlement.agreementId, id)

  const rows = await db
    .select()
    .from(schema.agreementSettlement)
    .where(where)
    .orderBy(desc(schema.agreementSettlement.blockNumber))
    .limit(limit)

  return c.json(rows)
})

export default app
