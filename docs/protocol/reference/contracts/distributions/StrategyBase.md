---
title: StrategyBase
status: generated
source: src/distributions/StrategyBase.sol
generated: true
---
# StrategyBase
**Inherits:**
[IDistributionStrategy](/docs/protocol/reference/contracts/core/interfaces/IDistributionStrategy)

**Title:**
StrategyBase

Shared scaffolding for distribution strategies: the manager binding, the manager-only
gate, the common errors, a measured pull, and no-op lifecycle hooks a strategy
overrides only where it moves value.

The no-op hooks add no external call and no storage read, so they cost nothing under the
manager's gas-capped hook calls.


## State Variables
### manager
The manager whose hooks this strategy serves. One deployment per manager.


```solidity
address public immutable manager
```


## Functions
### constructor


```solidity
constructor(address manager_) ;
```

### onlyManager


```solidity
modifier onlyManager() ;
```

### distribute

Permissionlessly advance accrual state. Called by the manager from
`manager.distribute(id, strategy)`; reverts bubble to the caller.
Allowed kinds: FromEncumberedToEscrow, FromEncumberedToExternal.


```solidity
function distribute(DistributeContext calldata) external virtual onlyManager returns (TokenMovement[] memory);
```

### onCommitmentReleased

Manager-only; called under guarded semantics (ERC §D.6) BEFORE the committer's
remaining encumbrance is freed, so the strategy can take its final accrual sweep.
Allowed kinds: FromEncumberedToEscrow, FromEscrowToExternal, FromEscrowToFree.


```solidity
function onCommitmentReleased(LifecycleContext calldata)
    external
    virtual
    onlyManager
    returns (TokenMovement[] memory);
```

### onCommitmentForfeited

Manager-only; called under guarded semantics (ERC §D.6), strictly AFTER the
manager-internal forfeit transfer. Disposes of strategy-side in-flight accrual only;
cannot affect the forfeit itself. `FromEncumbered*` caps run against the post-forfeit
residual. Allowed kinds: FromEncumberedToEscrow, FromEscrowToExternal, FromEscrowToFree.


```solidity
function onCommitmentForfeited(ForfeitContext calldata)
    external
    virtual
    onlyManager
    returns (TokenMovement[] memory);
```

### _pullMeasured

Pull `amount` of `token` from `msg.sender` and return the measured balance delta, so a
fee-on-transfer token credits only what arrived (the rule `manager.deposit` follows).
Reverts `ZeroAmount` when nothing arrives.


```solidity
function _pullMeasured(IERC20 token, uint256 amount) internal returns (uint256 received);
```

## Errors
### OnlyManager

```solidity
error OnlyManager();
```

### NotBound

```solidity
error NotBound();
```

### NotAuthorized

```solidity
error NotAuthorized();
```

### NothingToClaim

```solidity
error NothingToClaim();
```

### ZeroAmount

```solidity
error ZeroAmount();
```
