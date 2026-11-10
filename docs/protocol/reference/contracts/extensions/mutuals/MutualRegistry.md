---
title: MutualRegistry
status: generated
source: src/extensions/mutuals/MutualRegistry.sol
generated: true
---
# MutualRegistry
**Title:**
MutualRegistry

Product wrapper for the Mutual. Creates a `Mutual` in the custody root and records
the off-chain-meaningful coverage terms 1:1 against it: the peril descriptor, the target
capacity, and the policy term. The numeraire and the beneficiary (a `ClaimRouter`) live
in the core `Mutual`. It is the indexer's binding target and the frontend's read surface.

Deliberately thin and off the audited core path. Capacity / loss accounting all live in the
manager's `Mutual`; this registry only annotates and exposes a capacity view. Members
join through the manager's `joinMutual`, and only once the mutual arbiter has activated it.


## State Variables
### MAX_PERIL_URI_LENGTH
Cap on `perilURI`, matching the protocol's other metadata URIs.


```solidity
uint256 public constant MAX_PERIL_URI_LENGTH = 512
```


### manager

```solidity
ICommitmentManager public immutable manager
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

### registerMutual

Create a Mutual and register its coverage terms. The caller chooses the mutual
arbiter (e.g. an OptimisticMutualArbiter).
Reverts `URITooLong` if `perilURI` exceeds `MAX_PERIL_URI_LENGTH` bytes.


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

### URITooLong

```solidity
error URITooLong();
```

## Structs
### MutualListing

```solidity
struct MutualListing {
    address creator;
    uint128 targetCapacity; // informational creditedValue target; gates nothing
    uint64 termEnd; // policy term end (informational; 0 = open-ended)
    string perilURI; // off-chain peril descriptor
    bytes32 perilHash;
}
```
