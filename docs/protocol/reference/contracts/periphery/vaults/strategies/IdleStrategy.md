---
title: IdleStrategy
status: generated
source: src/periphery/vaults/strategies/IdleStrategy.sol
generated: true
---
# IdleStrategy
**Inherits:**
[IYieldStrategy](/docs/protocol/reference/contracts/periphery/vaults/interfaces/IYieldStrategy)

**Title:**
IdleStrategy

The reference `IYieldStrategy`: a minimal, no-yield strategy that custodies the vault's
asset and earns nothing. It is the canonical template for authoring a real strategy and
a null-object baseline — deploy it when the strategy slot should be filled with a
known-good, audited contract before a live venue is wired.

A `CommitmentsVault` with `yieldStrategy == address(0)` is *already* idle: it holds assets
directly and `totalAssets()` is its own balance. `IdleStrategy` differs only in that it
exercises the full deposit → strategy → withdraw plumbing with a deployed contract, so the
binding path is demonstrable and testable without an external protocol. Yield stays zero.
Custody model (matches the vault's call sequence, `CommitmentsVault._deposit`/`_withdraw`):
- The vault `safeTransfer`s assets to this contract *before* calling [deposit](/docs/protocol/reference/contracts/periphery/vaults/strategies/IdleStrategy#deposit), so
[deposit](/docs/protocol/reference/contracts/periphery/vaults/strategies/IdleStrategy#deposit) is a no-op receiver — the tokens have already landed.
- [withdraw](/docs/protocol/reference/contracts/periphery/vaults/strategies/IdleStrategy#withdraw) transfers the requested assets back to the vault.
- [totalAssets](/docs/protocol/reference/contracts/periphery/vaults/strategies/IdleStrategy#totalassets) reports this contract's live balance, so it is donation-aware and always
reconciles with what [withdraw](/docs/protocol/reference/contracts/periphery/vaults/strategies/IdleStrategy#withdraw) can actually pay.
Only the bound vault may move funds: [deposit](/docs/protocol/reference/contracts/periphery/vaults/strategies/IdleStrategy#deposit) and [withdraw](/docs/protocol/reference/contracts/periphery/vaults/strategies/IdleStrategy#withdraw) are `onlyVault`. There is no
admin, no upgrade, and no other role — the vault's own access control is the whole trust
surface.


## Constants
### asset
The underlying asset. MUST equal the vault's asset.


```solidity
address public immutable override asset
```


### vault
The vault address this strategy is bound to. The vault uses this to
validate that a strategy passed to `setYieldStrategy` was constructed for
this specific vault — guards against accidental cross-vault binding.


```solidity
address public immutable override vault
```


## Functions
### constructor


```solidity
constructor(address asset_, address vault_) ;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`asset_`|`address`|The ERC-20 this strategy custodies; MUST equal the binding vault's `asset()`.|
|`vault_`|`address`|The `CommitmentsVault` proxy this strategy is bound to; the vault validates `vault() == address(this-vault)` in `setYieldStrategy` to prevent cross-vault binding.|


### onlyVault


```solidity
modifier onlyVault() ;
```

### deposit

Take `assets` of the underlying into the strategy. PUSH pattern: the vault has
ALREADY transferred `assets` to this strategy before calling; implementations MUST
NOT `transferFrom` the vault. MUST be callable only by the bound `vault()`.

No-op receiver: the vault has already transferred `assets` here. Idle capital earns
nothing, so there is nothing to deploy. Gated to the vault for symmetry with [withdraw](/docs/protocol/reference/contracts/periphery/vaults/strategies/IdleStrategy#withdraw).


```solidity
function deposit(uint256 assets) external override onlyVault;
```

### withdraw

Return `assets` of the underlying to the vault. Implementations MUST transfer exactly
`assets` to `msg.sender` (the vault) before returning, or the vault's withdraw reverts.
MUST be callable only by the bound `vault()`.

Returns exactly `assets` to the vault. Never fails on accounting drift because
[totalAssets](/docs/protocol/reference/contracts/periphery/vaults/strategies/IdleStrategy#totalassets) is the live balance rather than an internal counter.


```solidity
function withdraw(uint256 assets) external override onlyVault;
```

### totalAssets

Current value of everything this strategy holds for the vault, denominated in the
underlying. MUST include accrued/in-flight value and MUST reconcile with what
`withdraw` can pay, so the vault's share price cannot jump or become unbacked.

The live custody balance. Idle: this only ever changes by vault deposits/withdrawals
(and any direct donation, which is harmlessly withdrawable to the vault).


```solidity
function totalAssets() external view override returns (uint256);
```

### maxDeposit

Maximum additional assets the strategy can currently accept (`type(uint256).max` if
unbounded). The vault mirrors this into `maxDeposit`/`maxMint` so deposits/mints that
would exceed a strategy cap revert at the ERC-4626 boundary rather than deep inside.

Unbounded: an idle holder has no venue cap.


```solidity
function maxDeposit() external pure override returns (uint256);
```

## Errors
### OnlyVault
Reverts a fund-moving call from anyone other than the bound vault.


```solidity
error OnlyVault();
```
