---
title: ERC4626Adapter
status: generated
source: src/backing/ERC4626Adapter.sol
generated: true
---
# ERC4626Adapter
**Inherits:**
[IBackingAdapter](/docs/protocol/reference/contracts/core/interfaces/IBackingAdapter)

**Title:**
ERC4626Adapter

Backing adapter for any ERC-4626 vault share (ERC-COMMITMENTS §B.4). The index is
the vault's units-to-underlying conversion at 1e18 scale; payouts are most
meaningfully priced in the vault's underlying asset.

Stateless and view-only per ERC §B.2. One deployment serves every ERC-4626 vault.
The adapter is an untrusted input: a donation-pumped or lying vault can distort what a
strategy computes, but the manager's movement caps (ERC §D.5 / INV-4) bound what any
computation can move.


## Functions
### indexNow

Current value-per-unit index for `token`, scaled to a 1e18 base.
For tokens with no internal appreciation (raw ERC-20s) this is the constant 1e18.
For appreciating receipts (ERC-4626 shares, LSTs) it is the venue's
units-to-underlying conversion at 1e18 scale.


```solidity
function indexNow(address token) external view returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|The backing token to price.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|The 1e18-scaled value-per-unit index.|


### payoutDenomination

The denomination in which `token`'s units are most meaningfully priced
(e.g. the underlying asset of an ERC-4626 vault).

INFORMATIONAL ONLY (ERC §B.3). The manager never unwraps, redeems, or converts
backing on any payout path; all payouts deliver raw backing-token units. This view
exists so UIs and indexers can price what raw units mean.


```solidity
function payoutDenomination(address token) external view returns (address);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|The backing token to describe.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`address`|The token address payouts should be priced in.|
