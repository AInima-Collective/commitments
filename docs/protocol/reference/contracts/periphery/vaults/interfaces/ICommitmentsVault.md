---
title: ICommitmentsVault
status: generated
source: src/periphery/vaults/interfaces/ICommitmentsVault.sol
generated: true
---
# ICommitmentsVault
**Inherits:**
IERC4626

**Title:**
ICommitmentsVault

A clean yield-bearing ERC-4626 vault with a pluggable yield strategy, permissionless
NAV donations, a deposit circuit breaker, and a content-addressed metadata sidecar.
Vault shares are plain transferable ERC-20 tokens; they serve as backing for the
CommitmentManager via `ERC4626Adapter` (the manager custodies shares, the underlying
keeps earning in the strategy). The vault itself knows nothing about commitments.


## Functions
### pauseDeposits


```solidity
function pauseDeposits() external;
```

### unpauseDeposits


```solidity
function unpauseDeposits() external;
```

### depositsPaused


```solidity
function depositsPaused() external view returns (bool);
```

### setYieldStrategy


```solidity
function setYieldStrategy(address strategy) external;
```

### yieldStrategy


```solidity
function yieldStrategy() external view returns (address);
```

### donate


```solidity
function donate(uint256 assets) external;
```

### setMetadata

Set the vault's content-addressed metadata. DEFAULT_ADMIN_ROLE only.

Reverts with `URITooLong` if `uri` length exceeds the protocol cap.
Overwrites any prior record and emits `VaultMetadataUpdated`.


```solidity
function setMetadata(string calldata uri, bytes32 contentHash) external;
```

### getMetadata

Returns the vault's metadata sidecar (uri, contentHash, updatedAt).

`updatedAt == 0` means metadata has never been set.


```solidity
function getMetadata() external view returns (VaultMetadata memory);
```

## Events
### YieldStrategyUpdated

```solidity
event YieldStrategyUpdated(address indexed oldStrategy, address indexed newStrategy);
```

### DepositsPauseToggled

```solidity
event DepositsPauseToggled(bool paused);
```

### Donation
Emitted when assets are donated to the vault, lifting NAV per share for all
depositors without minting shares. Permissionless caller.


```solidity
event Donation(address indexed donor, uint256 assets);
```

### VaultMetadataUpdated
Emitted whenever a vault admin writes or updates the vault's metadata sidecar.


```solidity
event VaultMetadataUpdated(string uri, bytes32 contentHash, uint64 timestamp);
```

## Errors
### ZeroAddress

```solidity
error ZeroAddress();
```

### ZeroAmount

```solidity
error ZeroAmount();
```

### StrategyHasAssets

```solidity
error StrategyHasAssets(address strategy, uint256 assets);
```

### WrongStrategyAsset
setYieldStrategy with a strategy whose `asset()` doesn't match this vault.


```solidity
error WrongStrategyAsset();
```

### WrongStrategyVault
setYieldStrategy with a strategy whose `vault()` doesn't match this proxy.


```solidity
error WrongStrategyVault();
```

### URITooLong
Thrown by `setMetadata` when the URI exceeds the protocol length cap.


```solidity
error URITooLong();
```

## Structs
### VaultMetadata
Mutable, content-addressed metadata sidecar for the vault itself.

Mirrors the `OperatorMetadata` shape used by `OperatorRegistry` so off-chain
indexers can render vault descriptions, audit links, risk blurbs, etc. via the
same (uri, contentHash, updatedAt) triple. A zero `updatedAt` means metadata
has never been set on this vault.


```solidity
struct VaultMetadata {
    string uri;
    bytes32 contentHash;
    uint64 updatedAt;
}
```
