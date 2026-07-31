---
title: IBackingAdapter
status: generated
source: src/core/interfaces/IBackingAdapter.sol
generated: true
---
# IBackingAdapter
**Title:**
IBackingAdapter

Stateless, view-only descriptor for a category of backing token (ERC-COMMITMENTS Part B).
One adapter serves every token of its category; the same adapter is reusable across managers.

Adapters are untrusted inputs, not protocol authorities: the manager interacts with them
exclusively through view reads, and the movement-validation pipeline (ERC §D.5 / INV-4)
bounds what any adapter-derived computation can move. Adapters MUST NOT custody tokens,
mutate state, or hold any authorization role.


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
