---
title: MutualRegistry
status: generated
source: src/extensions/mutuals/MutualRegistry.sol
generated: true
---
# MutualRegistry
**Title:**
MutualRegistry

Product wrapper for the Mutual (Position A). Creates a `Mutual` in
the custody root and records the off-chain-meaningful coverage terms 1:1 against it:
the peril descriptor, the target capacity, the policy term, and the beneficiary
(a `ClaimRouter`). It is the indexer's binding target and the frontend's read surface.

Deliberately thin and off the audited core path. Capacity / loss accounting all live in the
manager's `Mutual`; this registry only annotates and exposes a capacity view. Members
join through the manager's `joinMutual`; the mutual arbiter activates once capacity is filled.


## Constants
### manager

```solidity
ICommitmentManager public immutable manager
```


### admin
Deployer-recorded admin, allowed to wire the cover policy once.


```solidity
address public immutable admin
```


## State Variables
### coverPolicy
The LinkedMutualPolicy supplying `activeNotionalSold` for the premium views.
Optional: until set, `premiumInfo` reports `activeNotionalSold == 0`.


```solidity
address public coverPolicy
```


### _listings
mutualId => MutualListing (mutualId is the canonical key; 1:1 with the Mutual).


```solidity
mapping(uint256 => MutualListing) private _listings
```


### _mutualIds

```solidity
uint256[] private _mutualIds
```


## Functions
### constructor


```solidity
constructor(address manager_) ;
```

### setCoverPolicy

Wire the LinkedMutualPolicy whose `activeNotionalSold` feeds `premiumInfo`. Set
post-deploy by the admin (keeps the single-arg constructor backward-compatible and
breaks the policy<->registry deploy cycle).


```solidity
function setCoverPolicy(address coverPolicy_) external;
```

### registerMutual

Create a Mutual and register its coverage terms. The caller chooses the mutual
arbiter (e.g. an OptimisticMutualArbiter) and the valuationAuthority (0 = homogeneous).


```solidity
function registerMutual(
    ICommitmentManager.MutualParams calldata params,
    uint128 targetCapacity,
    uint64 termEnd,
    string calldata perilURI,
    bytes32 perilHash
) external returns (uint256 mutualId);
```

### getMutualListing

The recorded mutual terms for a mutual.


```solidity
function getMutualListing(uint256 mutualId) external view returns (MutualListing memory s);
```

### isFilled

True once the mutual's filled capacity (`totalShares`) reaches the target.


```solidity
function isFilled(uint256 mutualId) external view returns (bool);
```

### capacity

Filled capacity vs target, in numeraire units. NOTE: `filled` is `totalShares`, the
NOMINAL (join-time) credited capacity — it does NOT subtract loss already absorbed.
After losses accrue, remaining attributable coverage is `Σ E_i*(1e18 - lossSnapshot_i)
1e18`, which is < nominal; frontends/integrators should compute that off-chain
(e.g. from the indexer) to avoid over-stating live cover (red-team #5).


```solidity
function capacity(uint256 mutualId) external view returns (uint128 filled, uint128 target);
```

### allMutualIds

All registered mutual ids (append-only).


```solidity
function allMutualIds() external view returns (uint256[] memory);
```

### mutualCount


```solidity
function mutualCount() external view returns (uint256);
```

### premiumInfo

Combined premium read surface for a mutual: the core's live cover/stream state plus
the periphery's `activeNotionalSold`, with utilization in basis points.

`utilizationBps = activeNotionalSold * 1e4 / activeCover` (0 when `activeCover == 0`).
`activeNotionalSold` is 0 when no cover policy is wired. Pure read; never gates anything.


```solidity
function premiumInfo(uint256 mutualId)
    external
    view
    returns (
        uint128 activeCover,
        uint256 activeNotionalSold,
        uint256 utilizationBps,
        uint128 rewardRate,
        uint64 periodFinish,
        uint256 premiumPool
    );
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`activeCover`|`uint128`|live deliverable-cover denominator (numeraire units)|
|`activeNotionalSold`|`uint256`|Σ ACTIVE bindings' notional (the demand numerator)|
|`utilizationBps`|`uint256`|demand/supply utilization in bps|
|`rewardRate`|`uint128`|streamed numeraire per second|
|`periodFinish`|`uint64`|stream end timestamp|
|`premiumPool`|`uint256`|reserve (`funded − claimed`)|


## Events
### MutualRegistered

```solidity
event MutualRegistered(
    uint256 indexed mutualId,
    address indexed creator,
    address indexed beneficiary,
    address numeraire,
    uint128 targetCapacity,
    uint64 termEnd,
    string perilURI,
    bytes32 perilHash
);
```

### CoverPolicyUpdated

```solidity
event CoverPolicyUpdated(address indexed coverPolicy);
```

## Errors
### ZeroAddress

```solidity
error ZeroAddress();
```

### AlreadyRegistered

```solidity
error AlreadyRegistered();
```

### UnknownMutual

```solidity
error UnknownMutual();
```

### NotAdmin

```solidity
error NotAdmin();
```

## Structs
### MutualListing

```solidity
struct MutualListing {
    uint256 mutualId; // the backing Mutual (1:1)
    address creator;
    address numeraire;
    address beneficiary; // the ClaimRouter
    uint128 targetCapacity; // creditedValue sum at which the mutual should activate
    uint64 termEnd; // policy term end (informational; 0 = open-ended)
    string perilURI; // off-chain peril descriptor
    bytes32 perilHash;
}
```
