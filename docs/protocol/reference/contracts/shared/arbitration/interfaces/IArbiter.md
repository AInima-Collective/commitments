---
title: IArbiter
status: generated
source: src/shared/arbitration/interfaces/IArbiter.sol
generated: true
---
# IArbiter
**Inherits:**
IERC165

**Title:**
IArbiter

Capability interface for contracts named as the `arbiter` field on a
Commitment. `CommitmentManager` still authenticates the arbiter by
`msg.sender` equality — naming a contract as arbiter is the trust
act, and no on-chain interface check gates dispatch. This interface
exists so a counterparty, service, or indexer can *introspect* an
arbiter before opting into it:
- `commitmentManager()` — the manager this arbiter is wired to, so
a integrator can confirm it targets the expected instance.
- `arbiterCapabilities()` — a bitmap (see {ArbiterCapabilities}) of
the manager actions this arbiter can dispatch. A counterparty can
refuse an arbiter that lacks `SETTLE_AGREEMENT`, or a mutual can
require `MUTUAL_LOSS`, without reading the arbiter's source.
- `arbiterMetadataURI()` — an off-chain pointer (jurisdiction,
policy, dispute process, contact) for the human trust decision.
Support is advertised through ERC-165 so callers can probe with
`try arbiter.supportsInterface(type(IArbiter).interfaceId)` and fall
back gracefully for legacy marker-only arbiters.

The `interfaceId` is `commitmentManager ^ arbiterCapabilities ^
arbiterMetadataURI` (the IArbiter-specific selectors, excluding the
inherited ERC-165 selector, per the ERC-165 composition convention).


## Functions
### commitmentManager

Returns the CommitmentManager this arbiter dispatches to.

Implementations should make this immutable to preserve the trust
model commitments opt into when naming this contract as arbiter.


```solidity
function commitmentManager() external view returns (address);
```

### arbiterCapabilities

Bitmap of manager actions this arbiter is able to dispatch.

Bits are defined in {ArbiterCapabilities}. An arbiter MUST only set
a bit it can actually execute — the value is a self-declaration the
capability is *reachable*, not a guarantee any particular call will
succeed (auth/state preconditions still apply at dispatch time).


```solidity
function arbiterCapabilities() external view returns (uint256);
```

### arbiterMetadataURI

Optional off-chain metadata pointer (URI) describing the
arbiter's policy, jurisdiction, or dispute process.

Empty string if the arbiter publishes no metadata. Not consumed
on-chain; surfaced for the human/service trust decision.


```solidity
function arbiterMetadataURI() external view returns (string memory);
```
