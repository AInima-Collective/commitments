# ERC-8004 agent identity (vendored)

Support for [ERC-8004 "Trustless Agents"](https://eips.ethereum.org/EIPS/eip-8004)
identities: AI agents registered as ERC-721 tokens whose owner is the agent's
controlling account and whose `tokenURI` is the agent's registration file.
Used by the agent-bond use case (`docs/protocol/use-cases/agent-bonds.md`), the
dev seed, the indexer's `agent` table, and the frontend's agent badge.

## Provenance — do not edit the vendored implementation

`IdentityRegistryUpgradeable.sol` is a **byte-identical** copy of the
canonical implementation behind the ERC-1967/UUPS proxy deployed at

```
0x8004A169FB4a3325136EB29fA0ceB6D2e539a432   (same address on 20+ chains, Optimism included)
```

Verified 2026-07-05 against three sources that all agree:

1. `erc-8004/erc-8004-contracts` @ `main` — `contracts/IdentityRegistryUpgradeable.sol`
2. Optimism Blockscout verified source of the live implementation
   `0x7274e874CA62410a93Bd8bf61c69d8045E399c02` (whitespace-normalized diff exit 0)
3. Live RPC: ERC-1967 impl slot matches, `getVersion() == "2.0.0"`,
   `name() == "AgentIdentity"`

The file is excluded from `forge fmt` (see `foundry.toml`) to preserve
byte-identity. If the canonical deployment upgrades, re-vendor and re-verify —
don't patch in place.

## Files

- `IdentityRegistryUpgradeable.sol` — canonical implementation, untouched.
- `interfaces/IERC8004IdentityRegistry.sol` — our consumer surface (register
  overloads, URI, metadata, agent wallet, resolution views + the three ERC-8004
  events with indexing notes).
- `../../periphery/agents/ERC8004IdentityRegistryDev.sol` — dev/test bootstrap. The canonical
  `initialize()` is `reinitializer(2) onlyOwner` (the live proxy was initialized
  at v1 by an earlier implementation), so a fresh proxy can't boot from the
  vendored source alone; the subclass adds the v1-equivalent initializer and
  nothing else. Dev chains only — production consumers bind to the canonical
  address above.

## Gotchas (learned from the deployed source)

- **`agentId` starts at 0** (`_lastId++`). Never use 0 as a "no agent" sentinel.
- **`tokenURI` IS the agentURI** — there is no separate getter. `setAgentURI`
  emits both `MetadataUpdate` (ERC-4906, from URIStorage) and `URIUpdated`.
- **`MetadataSet`'s `string indexed indexedMetadataKey`** topic is
  `keccak256(bytes(metadataKey))`; the readable key repeats un-indexed in data.
- **`agentWallet` is auto-cleared on every transfer**: `_update` emits
  `MetadataSet(id, "agentWallet", "agentWallet", "")` before `Transfer`.
  Indexers must treat that as a wallet unset, not noise.
- Registration emits `Transfer(0 → owner)` then `Registered` then the
  `agentWallet` `MetadataSet` (then one `MetadataSet` per extra entry).
