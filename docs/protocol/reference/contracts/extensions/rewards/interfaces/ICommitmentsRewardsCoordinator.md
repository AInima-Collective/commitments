---
title: ICommitmentsRewardsCoordinator
status: generated
source: src/extensions/rewards/interfaces/ICommitmentsRewardsCoordinator.sol
generated: true
---
# ICommitmentsRewardsCoordinator
**Title:**
ICommitmentsRewardsCoordinator

Per-service cumulative-merkle reward distributor. Binds to one
`MerkleSnapshot` (immutable post-init). Receives token deposits, holds
them, and pays out earner-claimed amounts against an active root.
Sibling standard to ERC-COMMITMENTS — never reads commitment state
on-chain (free-form leaves), so the coordinator works with
non-AVS services (frontend rewards, ecosystem grants) just as well as
with operator-set services.

Locked decisions reflected in this interface:
- D1 per-service deployment (factory-spawned)
- D5 multi-token leaves: `(earner, token, cumulativeAmount)`
- D7 no token cap (omitted from interface)
- D8 off-chain forfeit interaction (no forfeit awareness here)
- D9 off-chain operator commission
- D10 zero protocol fee, immutable
- D11 service-only `disableRoot` (lives on the snapshot, not here)
- D12 on-chain monotonicity check at claim time (`CumulativeRegression`)
- Q2 revert with `NoOp` on zero-delta re-claim
- Q3 UUPS-upgradeable; service is the upgrade authority

The staged-updater swap surface (`stageUpdater` / `activateUpdater` /
`cancelStagedUpdater` / `activeUpdater` / `pendingUpdater`) now lives
on `IMerkleSnapshot`, not here — see that interface.


## Functions
### depositRewards

Pull `amount` of `token` from the caller into the coordinator. The
caller is the funder; nothing about the funder is recorded beyond
the event. `safeTransferFrom` semantics; reverts on failure.

Funding semantics are off-chain : the coordinator does NOT
track per-root obligations. The updater is responsible for not
over-promising; an under-funded coordinator reverts payouts with
`InsufficientBalance` rather than fail-closed at submit.


```solidity
function depositRewards(address token, uint256 amount) external;
```

### processClaim

Claim cumulative rewards for `token` against `rootId`. Caller must
be the leaf's earner (no claim-on-behalf).


```solidity
function processClaim(bytes32 rootId, address token, uint256 cumulativeAmount, bytes32[] calldata proof)
    external
    returns (uint256 amountPaidOut);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rootId`|`bytes32`|The active root to claim against.|
|`token`|`address`|The reward token.|
|`cumulativeAmount`|`uint256`|The leaf's cumulative-amount field. Reverts `CumulativeRegression` if `cumulativeAmount < claimed[caller][token]`.|
|`proof`|`bytes32[]`|Merkle proof for `keccak256(abi.encode(caller, token, cumulativeAmount))`.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`amountPaidOut`|`uint256`|Equals `cumulativeAmount - claimed[caller][token]`. Reverts `NoOp` if zero. Reverts `InsufficientBalance` if the coordinator does not hold enough of `token`.|


### freeze

Freeze claim processing. Service-only. While frozen, `processClaim`
reverts `ClaimsFrozen`. This is the on-chain recourse against a
fraudulent root that has already activated (and so can no longer be
`disableRoot`'d). Reverts `AlreadyFrozen` if already engaged.


```solidity
function freeze() external;
```

### unfreeze

Lift the claim freeze. Service-only. Reverts `NotFrozen` if not
currently frozen.


```solidity
function unfreeze() external;
```

### frozen

Whether claim processing is currently frozen.


```solidity
function frozen() external view returns (bool);
```

### claimed

Cumulative amount of `token` already paid out to `earner` across
all roots ever processed.


```solidity
function claimed(address earner, address token) external view returns (uint256);
```

### snapshot

Bound merkle-snapshot contract.


```solidity
function snapshot() external view returns (IMerkleSnapshot);
```

### service

Service controller. Identical to `snapshot().service()`.


```solidity
function service() external view returns (address);
```

## Events
### RewardsDeposited

```solidity
event RewardsDeposited(address indexed depositor, address indexed token, uint256 amount);
```

### RewardsClaimed

```solidity
event RewardsClaimed(
    bytes32 indexed rootId,
    address indexed earner,
    address indexed token,
    uint256 amountPaidOut,
    uint256 cumulativeAfter
);
```

### ClaimsFrozenSet
Emitted when the service freezes claim processing (emergency pause).


```solidity
event ClaimsFrozenSet(address indexed by);
```

### ClaimsUnfrozen
Emitted when the service lifts the claim freeze.


```solidity
event ClaimsUnfrozen(address indexed by);
```

## Errors
### ZeroAmount

```solidity
error ZeroAmount();
```

### ZeroAddress

```solidity
error ZeroAddress();
```

### NotService

```solidity
error NotService();
```

### RootDisabled

```solidity
error RootDisabled();
```

### RootNotActive

```solidity
error RootNotActive();
```

### InvalidProof

```solidity
error InvalidProof();
```

### CumulativeRegression

```solidity
error CumulativeRegression();
```

### NoOp

```solidity
error NoOp();
```

### InsufficientBalance

```solidity
error InsufficientBalance();
```

### AlreadyInitialized

```solidity
error AlreadyInitialized();
```

### ClaimsFrozen

```solidity
error ClaimsFrozen();
```

### NotFrozen

```solidity
error NotFrozen();
```

### AlreadyFrozen

```solidity
error AlreadyFrozen();
```
