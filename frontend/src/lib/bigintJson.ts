/**
 * Global `BigInt.prototype.toJSON` patch — teaches BigInt to JSON-serialize as
 * its decimal string instead of throwing "Do not know how to serialize a BigInt".
 *
 * This is a deliberate, app-wide prototype mutation rather than a local helper
 * because several independent serialization paths stringify bigint-bearing
 * values and all rely on the same behavior:
 *   - React 19.2 dev-mode performance-track logging JSON.stringifies changed
 *     props on every commit (we pass bigints — token amounts, commitment ids —
 *     as props liberally); an uncaught throw there freezes the whole tree.
 *   - react-query query keys and indexer request bodies serialize bigints.
 *
 * Because the dependency is implicit and global, the installer is a named,
 * idempotent function that every entry point invokes explicitly — the app
 * bootstrap (`main.tsx`) and the test setup (`vitest.setup.ts`) — so behavior
 * is identical in the browser and under test. Decimal-string is already how
 * bigints cross every other serialization boundary in the app.
 */
export function installBigIntJsonSerialization(): void {
  const proto = BigInt.prototype as unknown as { toJSON?: () => string }
  if (proto.toJSON) return
  proto.toJSON = function (this: bigint): string {
    return this.toString()
  }
}
