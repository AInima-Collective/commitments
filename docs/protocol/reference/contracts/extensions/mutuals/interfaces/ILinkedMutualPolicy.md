---
title: ILinkedMutualPolicy
status: generated
source: src/extensions/mutuals/interfaces/ILinkedMutualPolicy.sol
generated: true
---
# ILinkedMutualPolicy
**Title:**
ILinkedMutualPolicy

Read/write surface of the LinkedMutualPolicy, factored into an interface so the
PremiumScheduler (reads `getActiveNotionalSold`), the OptimisticMutualArbiter (reads
`getCoverBinding` to snapshot a policy into a loss claim), and the vault periphery can
reference the policy without importing the concrete contract (avoids a deploy-ordering import cycle).


## Functions
### bindCover

Atomically price, fund, and record cover against a mutual's premium stream.


```solidity
function bindCover(uint256 mutualId, uint256 notional, uint64 duration) external returns (uint256 bindingId);
```

### fundStandby

Fund the existing `Pi` stream with a standby reservation fee (no notional recorded).


```solidity
function fundStandby(uint256 mutualId, uint64 duration) external returns (uint256 premiumPaid);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`premiumPaid`|`uint256`|the numeraire pulled from the caller and streamed|


### expireBinding

Permissionlessly lapse an expired binding so its notional leaves utilization.


```solidity
function expireBinding(uint256 bindingId) external;
```

### getCoverBinding

The recorded cover binding for `bindingId` (for arbiter auditability snapshots).


```solidity
function getCoverBinding(uint256 bindingId) external view returns (CoverBinding memory);
```

### getActiveNotionalSold

Sum of ACTIVE bindings' notional for `mutualId` (the utilization numerator).


```solidity
function getActiveNotionalSold(uint256 mutualId) external view returns (uint256);
```

## Structs
### CoverBinding
A policyholder's bound cover against a mutual: how much notional was sold, when the
cover lapses, who bought it, and the premium that funded the matching `Pi` stream.

`active` flips false on `expireBinding` once `now >= expiry`, decaying utilization.


```solidity
struct CoverBinding {
    uint256 mutualId;
    uint256 notional;
    uint64 expiry;
    address policyholder;
    uint256 premiumPaid;
    bool active;
}
```
