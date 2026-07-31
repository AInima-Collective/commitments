---
title: LinkedMutualPolicy
status: generated
source: src/extensions/mutuals/LinkedMutualPolicy.sol
generated: true
---
# LinkedMutualPolicy
**Inherits:**
[ILinkedMutualPolicy](/docs/protocol/reference/contracts/extensions/mutuals/interfaces/ILinkedMutualPolicy), ReentrancyGuardTransient

**Title:**
LinkedMutualPolicy

The binding + funding executor for a Mutual's premium leg. Off the audited
custody path. It is the policyholder's entry point: it prices cover via the
PremiumScheduler, pulls the numeraire premium from the policyholder, and atomically funds
the core's Synthetix `Pi` stream via `fundMutualPremium`. The policy also maintains the
utilization numerator (`activeNotionalSold`) the scheduler prices against, and records a
per-binding `{notional, expiry, policyholder}` snapshot the OptimisticMutualArbiter can
reference into a loss claim for auditability (never a settlement gate).

Funding flow (per the ERC §6 periphery): the core's `fundMutualPremium` pulls the numeraire
from `msg.sender` (i.e. THIS contract), so this contract must hold the premium and approve
the manager before the call. Hence: pull premium from the policyholder into this contract,
`forceApprove` the manager for exactly the premium, then `fundMutualPremium`. The whole bind
is atomic — if `fundMutualPremium` reverts (e.g. `NoActiveCover`), the bind reverts and no
binding is recorded.
FOLLOW-UP: refund routing to the policyholder-of-record on `reclaimPremium` /
terminal sweep is intentionally NOT built here. The core `reclaimPremium` is
beneficiary-gated, and routing refunds to the funder-of-record needs a core
funder-of-record field; that is out of scope for this version. This contract
only records the funder so a future version (and the indexer) can attribute the stream.


## Constants
### manager
The custody root whose premium stream this policy funds.


```solidity
ICommitmentManager public immutable manager
```


### scheduler
The pricing brain (utilization curve + leverage cap + capture check).


```solidity
PremiumScheduler public immutable scheduler
```


## State Variables
### _coverBindings
bindingId => cover binding (1-indexed; id 0 is never used).


```solidity
mapping(uint256 => CoverBinding) private _coverBindings
```


### nextBindingId
Next binding id to assign (1-indexed).


```solidity
uint256 public nextBindingId
```


### _activeNotionalSold
mutualId => Σ notional of ACTIVE bindings (the scheduler's utilization numerator).


```solidity
mapping(uint256 => uint256) private _activeNotionalSold
```


## Functions
### constructor


```solidity
constructor(address manager_, address scheduler_) ;
```

### bindCover

Price `notional` of cover for `duration`, pull the premium from the caller, fund the
core stream, and record the binding. Atomic: any revert (capture, leverage cap,
`NoActiveCover`) rolls back the whole call.


```solidity
function bindCover(uint256 mutualId, uint256 notional, uint64 duration)
    external
    nonReentrant
    returns (uint256 bindingId);
```

### fundStandby

Fund the existing `Pi` stream with a standby reservation fee priced on the
offered-but-unallocated cover. Records no binding and no notional — a pure stream
top-up that compensates idle capacity (plan standby-dilution mitigation).


```solidity
function fundStandby(uint256 mutualId, uint64 duration) external nonReentrant;
```

### expireBinding

Permissionlessly lapse an expired binding: once `now >= expiry`, mark it inactive and
remove its notional from utilization so the scheduler re-prices on live demand. The
`active` flag guards against double-expire.


```solidity
function expireBinding(uint256 bindingId) external nonReentrant;
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

### _fund

Pull `premium` of the mutual numeraire from the caller into this contract, approve the
manager for exactly that amount, and fund the core stream. Shared by bind and standby.


```solidity
function _fund(uint256 mutualId, uint256 premium, uint64 duration) internal;
```

## Events
### CoverBound

```solidity
event CoverBound(
    uint256 indexed bindingId,
    uint256 indexed mutualId,
    address indexed policyholder,
    uint256 notional,
    uint64 expiry,
    uint256 premiumPaid
);
```

### StandbyFunded

```solidity
event StandbyFunded(uint256 indexed mutualId, address indexed funder, uint256 premiumPaid, uint64 duration);
```

### BindingExpired

```solidity
event BindingExpired(uint256 indexed bindingId, uint256 indexed mutualId, uint256 notional);
```

## Errors
### ZeroAddress

```solidity
error ZeroAddress();
```

### ZeroNotional

```solidity
error ZeroNotional();
```

### ZeroPremiumQuote

```solidity
error ZeroPremiumQuote();
```

### NoStandbyCapacity

```solidity
error NoStandbyCapacity();
```

### UnknownBinding

```solidity
error UnknownBinding();
```

### BindingInactive

```solidity
error BindingInactive();
```

### BindingNotExpired

```solidity
error BindingNotExpired();
```
