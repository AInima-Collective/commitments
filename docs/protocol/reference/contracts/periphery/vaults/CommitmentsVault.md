---
title: CommitmentsVault
status: generated
source: src/periphery/vaults/CommitmentsVault.sol
generated: true
---
# CommitmentsVault
**Inherits:**
[ICommitmentsVault](/docs/protocol/reference/contracts/periphery/vaults/interfaces/ICommitmentsVault), [IEntity](/docs/protocol/reference/contracts/shared/interfaces/IEntity), ERC4626Upgradeable, AccessControlUpgradeable, ReentrancyGuardTransient, UUPSUpgradeable

**Title:**
CommitmentsVault

A clean yield-bearing ERC-4626 vault: pluggable yield strategy, instant
withdraw/redeem, permissionless NAV donations, deposit circuit breaker, and a
metadata sidecar. Shares are plain transferable ERC-20 tokens — depositing them
into the CommitmentManager (priced via `ERC4626Adapter.indexNow =
convertToAssets(1e18)`) is how vault capital backs commitments while the
underlying keeps earning in the strategy.

Uses the UUPS proxy pattern; all state lives in EIP-7201 namespaced storage
(CommitmentsVaultStorage). Inflation-attack protection via a virtual-shares
decimals offset of 9.


## State Variables
### PAUSER_ROLE

```solidity
bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE")
```


### UNPAUSER_ROLE

```solidity
bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE")
```


### FACTORY_TYPE_ID
`IEntity` type id: `keccak256("commitments.vault")`. Self-verifies this
implementation when `VaultFactory` whitelists it.


```solidity
bytes32 internal constant FACTORY_TYPE_ID = keccak256("commitments.vault")
```


### MAX_METADATA_URI_LENGTH
Maximum length of a vault metadata URI in bytes. Bounds gas cost of setMetadata.

Matches OperatorRegistry.MAX_METADATA_URI_LENGTH so off-chain tooling can apply
one cap across the protocol's metadata surfaces.


```solidity
uint256 public constant MAX_METADATA_URI_LENGTH = 512
```


## Functions
### factoryTypeId

A stable, unique identifier for this contract's type.


```solidity
function factoryTypeId() external pure returns (bytes32);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes32`|The type id, a domain-separated keccak256 constant.|


### constructor

Disables initializers on the implementation contract (prevents logic contract initialization).


```solidity
constructor() ;
```

### initialize

Initialize the vault.


```solidity
function initialize(
    IERC20 asset_,
    string memory name_,
    string memory symbol_,
    address admin_,
    address yieldStrategy_
) external initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`asset_`|`IERC20`|The underlying asset.|
|`name_`|`string`|name for vault shares.|
|`symbol_`|`string`|symbol for vault shares.|
|`admin_`|`address`|Initial admin address — receives DEFAULT_ADMIN_ROLE, PAUSER_ROLE, UNPAUSER_ROLE.|
|`yieldStrategy_`|`address`|Initial strategy address (can be address(0) for idle/no-strategy mode).|


### _decimalsOffset

Returns 9 to provide inflation attack protection.


```solidity
function _decimalsOffset() internal pure override returns (uint8);
```

### totalAssets

Returns the total assets managed by the vault.

When a strategy is set, returns strategy.totalAssets() PLUS the vault's own idle
token balance. Idle is ~0 in steady state (deposits are pushed to the strategy),
but counting it makes share price robust against transient idle balances — e.g.
mid-migration after draining the old strategy — instead of collapsing to the
virtual-shares floor. Falls back to the vault's own token balance when no
strategy is configured.


```solidity
function totalAssets() public view override(ERC4626Upgradeable, IERC4626) returns (uint256);
```

### maxDeposit

Max depositable amount — returns 0 when depositsPaused, so a paused `deposit` reverts
`ERC4626ExceededMaxDeposit`; routes through strategy when set.


```solidity
function maxDeposit(address) public view override(ERC4626Upgradeable, IERC4626) returns (uint256);
```

### maxMint

Max mintable shares — returns 0 when depositsPaused (a paused `mint` reverts
`ERC4626ExceededMaxMint`); mirrors the strategy deposit cap
so mint() and deposit() agree (ERC-4626 requires maxMint to be the true maximum).


```solidity
function maxMint(address) public view override(ERC4626Upgradeable, IERC4626) returns (uint256);
```

### _deposit

Override deposit hook to forward assets to strategy after minting shares.

nonReentrant guard applied here to protect the full deposit path including strategy interaction.


```solidity
function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override nonReentrant;
```

### _withdraw

Override withdraw hook to pull any shortfall from the strategy before paying out.

Withdrawals are instant — the vault holds no encumbrance and runs no unbonding
queue (the CommitmentManager owns all of that). nonReentrant protects the full
withdrawal path including the strategy interaction.


```solidity
function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
    internal
    override
    nonReentrant;
```

### pauseDeposits

Pause deposits. Only PAUSER_ROLE.


```solidity
function pauseDeposits() external onlyRole(PAUSER_ROLE);
```

### unpauseDeposits

Unpause deposits. Only UNPAUSER_ROLE (separation prevents griefing).


```solidity
function unpauseDeposits() external onlyRole(UNPAUSER_ROLE);
```

### depositsPaused

Returns whether deposits are currently paused.


```solidity
function depositsPaused() external view returns (bool);
```

### setYieldStrategy

Update the yield strategy. Only DEFAULT_ADMIN_ROLE.

Refuses to switch when the old strategy holds assets.
Migration procedure: pause deposits, drain old strategy, then call setYieldStrategy.
When a non-zero strategy is set, validates that its `asset()` matches this
vault's asset and its `vault()` is bound to this proxy — prevents a misbound
strategy from leaking deposits into the wrong vault.
Whenever the new strategy is non-zero, sweeps the vault's idle balance into it
so existing LP shares are put back to work immediately. This covers both the
idle → live transition and the live → live migration (the drain step parks all
assets in the vault as idle balance). totalAssets() also counts idle balance,
so share price stays continuous even between drain and sweep.


```solidity
function setYieldStrategy(address yieldStrategy_) external onlyRole(DEFAULT_ADMIN_ROLE);
```

### yieldStrategy

Returns the current strategy address.


```solidity
function yieldStrategy() external view returns (address);
```

### donate

Permissionlessly donate `assets` to the vault. Lifts NAV per share
for all existing depositors without minting new shares.

Pulls `assets` from `msg.sender` and forwards to the strategy if one
is set, mirroring the `_deposit` push-to-strategy pattern. With no
strategy, `assets` sits in the vault and counts toward `totalAssets()`
via the IERC20 fallback.
Use cases:
- Forfeit proceeds recycled into the depositor pool.
- Treasury DAO retroactive yield top-ups.
- Fee-share recycling.
Donations are NOT gated by `depositsPaused`. A pause halts NEW
depositor share-minting; donations are pure NAV contributions and
benefit the existing share base regardless of pause state.


```solidity
function donate(uint256 assets) external nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`assets`|`uint256`|Amount of underlying asset to donate.|


### setMetadata

Set the vault's content-addressed metadata. DEFAULT_ADMIN_ROLE only.

Only DEFAULT_ADMIN_ROLE may call. Overwrites any prior record with
`(uri, contentHash, uint64(block.timestamp))` and emits `VaultMetadataUpdated`.


```solidity
function setMetadata(string calldata uri, bytes32 contentHash) external onlyRole(DEFAULT_ADMIN_ROLE);
```

### getMetadata

Returns the vault's metadata sidecar (uri, contentHash, updatedAt).

`updatedAt == 0` means metadata has never been set.


```solidity
function getMetadata() external view returns (ICommitmentsVault.VaultMetadata memory);
```

### _pushToStrategy

Push model (see `IYieldStrategy.deposit`): transfer `assets` to `strategy`, then notify
it. No-op when `strategy` is zero (idle mode).


```solidity
function _pushToStrategy(address strategy, uint256 assets) private;
```

### _authorizeUpgrade

Only DEFAULT_ADMIN_ROLE can authorize contract upgrades.


```solidity
function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE);
```
