---
title: ERC8004IdentityRegistryDev
status: generated
source: src/periphery/agents/ERC8004IdentityRegistryDev.sol
generated: true
---
# ERC8004IdentityRegistryDev
**Inherits:**
`IdentityRegistryUpgradeable`

**Title:**
ERC8004IdentityRegistryDev

Dev/test bootstrap for the vendored canonical ERC-8004 `IdentityRegistryUpgradeable`.
The canonical `initialize()` is `reinitializer(2) onlyOwner` — the live proxy at
`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` was initialized at version 1 by an
earlier implementation, so a FRESH proxy cannot boot from the vendored source alone.
This subclass adds the missing v1-equivalent initializer (Ownable + ERC-721 +
URIStorage + EIP-712 domain) and changes nothing else: every register/metadata/wallet
code path, event, and storage slot is the vendored canonical implementation.

Deploy behind an `ERC1967Proxy` exactly like the manager. NEVER deploy this to a
production chain — production consumers bind to the canonical registry address.


## Functions
### initializeDev

v1-equivalent bootstrap: what the canonical proxy's version-1 initializer did,
reproduced so a fresh dev proxy reaches the same post-`initialize()` state as
the live deployment (same ERC-721 name/symbol, same EIP-712 domain).


```solidity
function initializeDev(address owner_) external initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`owner_`|`address`|Receives ownership (upgrade authority); unused by the ERC-8004 surface.|
