---
title: SkimmingMockStrategy
status: generated
source: src/periphery/vaults/strategies/SkimmingMockStrategy.sol
generated: true
---
# SkimmingMockStrategy
**Inherits:**
[PremiumSkimStrategy](/docs/protocol/reference/contracts/periphery/vaults/strategies/PremiumSkimStrategy)

**Title:**
SkimmingMockStrategy

Dev/demo concrete of `PremiumSkimStrategy`: a `MockStrategy`-style reported-assets
ledger with yield/loss simulation, plus the skim leg. Used by the anvil seed and the
admin Risk tab for the underwritten agent vault (cvaDAI).
Its yield/loss simulators are permissionless: dev chains only, never deploy it to a
real network.

`simulateYield` is ledger-only (no backing tokens): a later `skim()` reverts on the fee
transfer because the contract holds nothing to pay it with — intentionally loud. Drive
demo yield with [simulateBackedYield](/docs/protocol/reference/contracts/periphery/vaults/strategies/SkimmingMockStrategy#simulatebackedyield), which pulls real underlying from the caller so
the skim is token-backed.


## State Variables
### _reportedAssets

```solidity
uint256 private _reportedAssets
```


### _maxDeposit

```solidity
uint256 private _maxDeposit = type(uint256).max
```


## Functions
### constructor


```solidity
constructor(
    address asset_,
    address vault_,
    address operator_,
    address premiumRecipient_,
    uint16 skimBps_,
    uint16 operatorFeeBps_
) PremiumSkimStrategy(asset_, vault_, operator_, premiumRecipient_, skimBps_, operatorFeeBps_);
```

### maxDeposit


```solidity
function maxDeposit() external view override returns (uint256);
```

### _managedAssets


```solidity
function _managedAssets() internal view override returns (uint256);
```

### _afterDeposit


```solidity
function _afterDeposit(uint256 assets) internal override;
```

### _beforeWithdraw


```solidity
function _beforeWithdraw(uint256 assets) internal override;
```

### _realizeSkim


```solidity
function _realizeSkim(uint256 fee) internal override;
```

### setMaxDeposit

Test helper: configure the maxDeposit return value.


```solidity
function setMaxDeposit(uint256 val) external;
```

### simulateYield

Test helper: simulate yield by increasing reported assets (UNBACKED — see contract
NatSpec; a following skim reverts on transfer).


```solidity
function simulateYield(uint256 amount) external;
```

### simulateBackedYield

Demo helper: simulate yield backed by real underlying pulled from the caller, so
skims and withdrawals stay token-backed.


```solidity
function simulateBackedYield(uint256 amount) external;
```

### simulateLoss

Test helper: simulate loss by decreasing reported assets.


```solidity
function simulateLoss(uint256 amount) external;
```
