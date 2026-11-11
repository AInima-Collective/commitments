import assert from 'node:assert/strict'
import test from 'node:test'

import { Hono } from 'hono'

import { encodeBlockCursor, jsonBig, parseBlockCursor, parseId, parseLimit, stringifyBig } from './http.ts'

test('stringifyBig writes bigints as decimal strings, nested, and keeps null', () => {
  const big = 2n ** 200n
  assert.equal(
    stringifyBig({ a: 1n, b: null, c: [big, 'x'], d: { e: 0n }, f: 3 }),
    `{"a":"1","b":null,"c":["${big}","x"],"d":{"e":"0"},"f":3}`,
  )
})

test('jsonBig answers application/json with the given status', async () => {
  const app = new Hono()
  app.get('/', (c) => jsonBig(c, [{ id: 7n, at: null }], 201))
  const res = await app.request('/')
  assert.equal(res.status, 201)
  assert.match(res.headers.get('content-type') ?? '', /^application\/json/)
  assert.deepEqual(await res.json(), [{ id: '7', at: null }])
})

const ctx = (limit?: string) => ({ req: { query: (_: string) => limit } }) as never

test('parseLimit clamps, truncates, and never yields NaN', () => {
  assert.equal(parseLimit(ctx(), 100, 500), 100)
  assert.equal(parseLimit(ctx('abc'), 100, 500), 100)
  assert.equal(parseLimit(ctx('0'), 100, 500), 1)
  assert.equal(parseLimit(ctx('-5'), 100, 500), 1)
  assert.equal(parseLimit(ctx('9999'), 100, 500), 500)
  assert.equal(parseLimit(ctx('7.9'), 100, 500), 7)
  assert.equal(parseLimit(ctx('Infinity'), 100, 500), 100)
})

test('parseId accepts only non-negative decimal integers', () => {
  assert.equal(parseId('0'), 0n)
  assert.equal(parseId('42'), 42n)
  for (const bad of [undefined, '', '-1', '1.5', '0x10', ' 1', '01', 'abc']) {
    assert.equal(parseId(bad), null, String(bad))
  }
})

test('block cursor round-trips and rejects malformed input', () => {
  assert.deepEqual(parseBlockCursor(encodeBlockCursor(12n, 34n)), { block: 12n, key: '34' })
  assert.deepEqual(parseBlockCursor(encodeBlockCursor(5n, '0xabc')), { block: 5n, key: '0xabc' })
  for (const bad of ['', '12', '12:', 'x:1', '-1:1']) assert.equal(parseBlockCursor(bad), null, bad)
})
