/**
 * ERC-8004 agent identity registry handlers (issue #33).
 *
 * Wired into Ponder's runtime via this module's `import` side-effect from
 * `src/index.ts` (same pattern as `governance.ts` / `mutual.ts`). Handlers
 * maintain the `agent` table so the frontend can badge accounts that own a
 * registered agent NFT (bulk lookup via GraphQL `agents(where: { owner_in })`).
 *
 * Contract facts (verified against the vendored canonical implementation —
 * src/vendor/erc8004/IdentityRegistryUpgradeable.sol):
 *   - ERC-721 based: agentId = tokenId (STARTS AT ZERO — never a sentinel),
 *     token owner = the agent's controlling account, tokenURI = agentURI.
 *   - Every register() overload emits, in order: Transfer(0 → owner) [mint],
 *     Registered(agentId, agentURI, owner), then the reserved-key
 *     MetadataSet(agentId, "agentWallet", packed(registrant)). So within a tx
 *     the Registered handler always inserts the row before the agentWallet
 *     MetadataSet or any user-key MetadataSet arrives (Ponder processes logs
 *     in order).
 *   - On every ERC-721 transfer the contract emits
 *     MetadataSet(agentId, "agentWallet", "") BEFORE the Transfer log — the
 *     wallet is auto-cleared, then ownership moves.
 *   - MetadataSet's `indexedMetadataKey` is an INDEXED string: viem surfaces
 *     only its keccak256 topic. The readable key is the un-indexed
 *     `metadataKey` param — match on that, never on the topic.
 *   - There is NO on-chain content hash for the agentURI (unlike the
 *     protocol's metadataURI/metadataHash pairs), so `fetchMetadata` is called
 *     with the zero hash and a successful fetch is always 'ok' (never
 *     'mismatch'). The dev seed uses inline data:application/json;base64 URIs,
 *     which fetchMetadata resolves without a gateway.
 */
import { ponder as typedPonder } from 'ponder:registry'
import { agent } from 'ponder:schema'
import { getAddress, size } from 'viem'

import { fetchMetadata } from './metadataFetcher'

// These handlers target an unconditionally configured contract whose address
// list may be empty. Keep the registration surface permissive across those
// deployment shapes; Ponder validates event names against the live config.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ponder = typedPonder as unknown as { on: (name: string, fn: (ctx: any) => Promise<void> | void) => void }

type Hex = `0x${string}`
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Hex
const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex

/** Fetch + shape the agent metadata columns for an agentURI (no on-chain hash → zero hash). */
async function agentMetadataPatch(agentURI: string) {
  const md = await fetchMetadata(agentURI, ZERO_HASH)
  return {
    metadataStatus: md.status,
    metadataContent: md.content,
    metadataContentRaw: md.contentRaw,
  }
}

/**
 * Decode the reserved "agentWallet" metadata value: a 20-byte packed address,
 * or empty bytes for the auto-clear on transfer. Anything else is malformed
 * (the canonical contract only ever emits these two shapes) → null.
 */
function decodeAgentWallet(value: Hex): Hex | null {
  if (!value || value === '0x' || size(value) !== 20) return null
  return getAddress(value)
}

ponder.on('AgentIdentityRegistry:Registered', async ({ event, context }) => {
  const { agentId, agentURI, owner } = event.args as { agentId: bigint; agentURI: string; owner: Hex }
  const registry = event.log.address as Hex
  const md = await agentMetadataPatch(agentURI)
  await context.db
    .insert(agent)
    .values({
      agentId,
      registry,
      owner,
      // The reserved "agentWallet" key is auto-set to the registrant in the
      // same tx; its MetadataSet log lands right after this one and fills the
      // column. Start NULL rather than assuming.
      agentWallet: null,
      agentURI,
      ...md,
      registeredBlock: event.block.number,
      registeredAt: event.block.timestamp,
      updatedBlock: event.block.number,
    })
    .onConflictDoUpdate({
      owner,
      agentURI,
      ...md,
      updatedBlock: event.block.number,
    })
})

ponder.on('AgentIdentityRegistry:URIUpdated', async ({ event, context }) => {
  const { agentId, newURI } = event.args as { agentId: bigint; newURI: string }
  const registry = event.log.address as Hex
  const existing = await context.db.find(agent, { registry, agentId })
  // URIUpdated cannot precede Registered for an existing token — an unknown id
  // means a registry outside our watch set replayed; ignore rather than stub
  // (owner is notNull and unknowable here).
  if (!existing) return
  const md = await agentMetadataPatch(newURI)
  await context.db.update(agent, { registry, agentId }).set({
    agentURI: newURI,
    ...md,
    updatedBlock: event.block.number,
  })
})

ponder.on('AgentIdentityRegistry:MetadataSet', async ({ event, context }) => {
  // NOTE: event.args also carries `indexedMetadataKey`, but as an indexed
  // string viem only surfaces its keccak256 topic — the readable key is the
  // un-indexed `metadataKey` param.
  const { agentId, metadataKey, metadataValue } = event.args as {
    agentId: bigint
    metadataKey: string
    metadataValue: Hex
  }
  // Only the reserved wallet key is mirrored for now; arbitrary user keys are
  // recoverable from the event log if a future surface needs them.
  if (metadataKey !== 'agentWallet') return
  const registry = event.log.address as Hex
  const existing = await context.db.find(agent, { registry, agentId })
  // Registered always inserts before the same-tx agentWallet MetadataSet (log
  // ordering) — an unknown id here is out-of-scope; ignore defensively.
  if (!existing) return
  await context.db.update(agent, { registry, agentId }).set({
    agentWallet: decodeAgentWallet(metadataValue), // empty bytes → null (cleared)
    updatedBlock: event.block.number,
  })
})

ponder.on('AgentIdentityRegistry:Transfer', async ({ event, context }) => {
  const { from, to, tokenId } = event.args as { from: Hex; to: Hex; tokenId: bigint }
  // Mint (registration) is handled by Registered — it carries the agentURI and
  // fires in the same tx right after this Transfer(0 → owner).
  if (from.toLowerCase() === ZERO_ADDRESS) return
  const registry = event.log.address as Hex
  const existing = await context.db.find(agent, { registry, agentId: tokenId })
  // Transfer of an unknown id → ignore (a real transfer always postdates the
  // Registered insert; mirrors the operator handlers' out-of-order stance).
  if (!existing) return
  // The wallet-clear MetadataSet accompanies every transfer (emitted BEFORE
  // this Transfer log), so agentWallet is already NULL by the time we get here.
  await context.db.update(agent, { registry, agentId: tokenId }).set({
    owner: to,
    updatedBlock: event.block.number,
  })
})
