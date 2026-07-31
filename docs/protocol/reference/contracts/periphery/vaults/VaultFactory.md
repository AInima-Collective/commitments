---
title: VaultFactory
status: generated
source: src/periphery/vaults/VaultFactory.sol
generated: true
---
# VaultFactory
**Inherits:**
`Factory`, `Registry`, `Multicallable`

**Title:**
VaultFactory

Deploys per-asset CommitmentsVault instances via ERC1967Proxy and maintains a queryable registry.

Uses ERC1967Proxy rather than minimal proxies because CommitmentsVault is UUPS-upgradeable.
Minimal clones perform a raw delegatecall that bypasses the UUPS upgrade check — combining
them leads to broken upgrade paths. ERC1967Proxy is the correct pattern for UUPS vaults.
Per-asset constraint: exactly one vault per asset address.
Only the factory owner can deploy new vaults.
Shares three extracted bases:
- `Factory` — whitelist/blacklist ladder for the vault implementation (the
implementation is self-verified against `CommitmentsVault.FACTORY_TYPE_ID` at
construction; the owner can `blacklist` it to freeze new deployments).
- `Registry` — `EnumerableSet.AddressSet` membership backing the deployed-vault
enumeration (`allVaults`/`vaultCount` are thin wrappers over `entity`/`totalEntities`).
- `Multicallable` — batch several `deployVault` calls in one owner transaction.


## Constants
### VAULT_TYPE_ID
The type id a whitelisted implementation must self-report to be a valid vault.

Must equal `CommitmentsVault.FACTORY_TYPE_ID`. Hardcoded here (rather than read from
the impl) so the self-verification is meaningful: the factory asserts "this must be a
vault" and the implementation confirms it is.


```solidity
bytes32 public constant VAULT_TYPE_ID = keccak256("commitments.vault")
```


### vaultImplementation
The CommitmentsVault implementation that all proxies delegate to.


```solidity
address public immutable vaultImplementation
```


## State Variables
### vaultByAsset
Maps an asset address to its deployed vault proxy address.

Returns address(0) if no vault has been deployed for the asset.


```solidity
mapping(address => address) public vaultByAsset
```


## Functions
### constructor

Whitelists the implementation via the `Factory` base, self-verifying it against
`CommitmentsVault.FACTORY_TYPE_ID` so a non-vault contract can never be wired in.
The factory deployer becomes the owner of the implementation-set controls.


```solidity
constructor(address vaultImplementation_) Factory(msg.sender);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`vaultImplementation_`|`address`|The deployed CommitmentsVault implementation (NOT initialized).|


### deployVault

Deploy a new CommitmentsVault proxy for the given asset.

Only callable by the factory owner.
Reverts if a vault already exists for the asset, or if the implementation has been
blacklisted via the `Factory` valve.
Constructs the vault name as "Commitments {symbol} Vault" and symbol as "cv{symbol}".


```solidity
function deployVault(address asset, address admin, address strategy) external onlyOwner returns (address vault);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`asset`|`address`|asset address (must be non-zero and not already registered).|
|`admin`|`address`|Admin address to receive DEFAULT_ADMIN_ROLE, PAUSER_ROLE, UNPAUSER_ROLE in the vault.|
|`strategy`|`address`|Initial strategy address — pass address(0) for no-yield idle mode.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`vault`|`address`|Address of the newly deployed vault proxy.|


### allVaults

Returns the vault address at the given index in the enumeration array.

Thin wrapper over the shared `Registry` membership set.


```solidity
function allVaults(uint256 index) external view returns (address);
```

### vaultCount

Returns the total number of deployed vaults.

Thin wrapper over the shared `Registry` membership set.


```solidity
function vaultCount() external view returns (uint256);
```

## Events
### VaultDeployed
Emitted when a new vault is deployed.


```solidity
event VaultDeployed(address indexed asset, address indexed vault);
```

## Errors
### VaultAlreadyExists
Emitted when trying to deploy a vault for an asset that already has one.


```solidity
error VaultAlreadyExists(address asset);
```

### ZeroAddress
Emitted when a zero address is provided where a valid address is required.


```solidity
error ZeroAddress();
```
