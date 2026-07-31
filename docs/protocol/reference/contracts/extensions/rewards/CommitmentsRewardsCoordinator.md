---
title: CommitmentsRewardsCoordinator
status: generated
source: src/extensions/rewards/CommitmentsRewardsCoordinator.sol
generated: true
---
# CommitmentsRewardsCoordinator
**Inherits:**
Initializable, UUPSUpgradeable, ReentrancyGuardTransient, [ICommitmentsRewardsCoordinator](/docs/protocol/reference/contracts/extensions/rewards/interfaces/ICommitmentsRewardsCoordinator)

**Title:**
CommitmentsRewardsCoordinator

Per-service cumulative-merkle reward distributor. Receives token
deposits and pays out earner-claimed amounts against active roots
stored on a bound `MerkleSnapshot`.

Locked behaviors:
- depositRewards: permissionless funder; SafeERC20.
- processClaim: caller-only earner; on-chain monotonicity
check; revert with NoOp on zero-delta; CEI ordering; halted while
the emergency freeze is engaged.
- freeze / unfreeze: service-gated emergency pause over `processClaim`.
- snapshot binding: immutable post-init.
- service: cached at init; immutable.
- zero protocol fee: NO fee path; D10 immutable.
- UUPS upgrades: authorized by service.
This coordinator is a pure self-custody distributor: reward funds live
on this contract and never flow through the commitment manager, so it
does NOT implement `IDistributionStrategy` (the former no-op "costume"
was removed). The staged-updater swap surface lives on `MerkleSnapshot`.


## Functions
### constructor

Disable initializers on the implementation contract (proxy pattern).


```solidity
constructor() ;
```

### initialize

Initialize the coordinator proxy. Called once by the factory.


```solidity
function initialize(address service_, address snapshot_) external initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`service_`|`address`|Service controller. Cached for cheaper auth and UUPS upgrade authorization. Must equal `snapshot_.service()` but the factory enforces this — the coordinator does not re-validate.|
|`snapshot_`|`address`|Bound merkle-snapshot. immutable post-init.|


### onlyService


```solidity
modifier onlyService() ;
```

### depositRewards

Pull `amount` of `token` from the caller into the coordinator. The
caller is the funder; nothing about the funder is recorded beyond
the event. `safeTransferFrom` semantics; reverts on failure.

Funding semantics are off-chain : the coordinator does NOT
track per-root obligations. The updater is responsible for not
over-promising; an under-funded coordinator reverts payouts with
`InsufficientBalance` rather than fail-closed at submit.


```solidity
function depositRewards(address token, uint256 amount) external nonReentrant;
```

### processClaim

Claim cumulative rewards for `token` against `rootId`. Caller must
be the leaf's earner (no claim-on-behalf).


```solidity
function processClaim(bytes32 rootId, address token, uint256 cumulativeAmount, bytes32[] calldata proof)
    external
    nonReentrant
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
function freeze() external onlyService;
```

### unfreeze

Lift the claim freeze. Service-only. Reverts `NotFrozen` if not
currently frozen.


```solidity
function unfreeze() external onlyService;
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

### _authorizeUpgrade


```solidity
function _authorizeUpgrade(address) internal view override onlyService;
```

## Events
### DistributionPaid
ERC-COMMITMENTS §D.7 uniform payout event, emitted by whichever contract
executes the payout — here, this coordinator's own `processClaim`.
`commitmentId = 0`: merkle leaves carry no per-commitment attribution;
indexers reconstruct it from `CommitmentBoundToStrategy`.


```solidity
event DistributionPaid(
    address indexed strategy,
    address indexed recipient,
    address indexed token,
    uint256 amount,
    uint256 commitmentId,
    bytes32 context
);
```
