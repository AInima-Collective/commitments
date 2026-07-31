---
title: ERC20StaticAdapter
status: generated
source: src/backing/ERC20StaticAdapter.sol
generated: true
---
# ERC20StaticAdapter
**Inherits:**
[IBackingAdapter](/docs/protocol/reference/contracts/core/interfaces/IBackingAdapter)

**Title:**
ERC20StaticAdapter

Backing adapter for plain ERC-20 tokens with no internal appreciation
(ERC-COMMITMENTS §B.4). The index is the constant 1e18 and payouts are
denominated in the token itself.

Stateless and view-only per ERC §B.2. One deployment serves every plain ERC-20.


## Functions
### indexNow

Current value-per-unit index for `token`, scaled to a 1e18 base.
For tokens with no internal appreciation (raw ERC-20s) this is the constant 1e18.
For appreciating receipts (ERC-4626 shares, LSTs) it is the venue's
units-to-underlying conversion at 1e18 scale.


```solidity
function indexNow(address) external pure returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`address`||

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
function payoutDenomination(address token) external pure returns (address);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|The backing token to describe.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`address`|The token address payouts should be priced in.|
