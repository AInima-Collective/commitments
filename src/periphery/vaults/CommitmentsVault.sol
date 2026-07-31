// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC4626Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {ICommitmentsVault} from "src/periphery/vaults/interfaces/ICommitmentsVault.sol";
import {IYieldStrategy} from "src/periphery/vaults/interfaces/IYieldStrategy.sol";
import {CommitmentsVaultStorage} from "src/periphery/vaults/storage/CommitmentsVaultStorage.sol";
import {IEntity} from "src/shared/interfaces/IEntity.sol";

/// @title CommitmentsVault
/// @notice A clean yield-bearing ERC-4626 vault: pluggable yield strategy, instant
///         withdraw/redeem, permissionless NAV donations, deposit circuit breaker, and a
///         metadata sidecar. Shares are plain transferable ERC-20 tokens — depositing them
///         into the CommitmentManager (priced via `ERC4626Adapter.indexNow =
///         convertToAssets(1e18)`) is how vault capital backs commitments while the
///         underlying keeps earning in the strategy.
/// @dev Uses the UUPS proxy pattern; all state lives in EIP-7201 namespaced storage
///      (CommitmentsVaultStorage). Inflation-attack protection via a virtual-shares
///      decimals offset of 9.
contract CommitmentsVault is
    ICommitmentsVault,
    IEntity,
    ERC4626Upgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardTransient,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // === Role Constants ===
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");

    /// @notice `IEntity` type id: `keccak256("commitments.vault")`. Self-verifies this
    ///         implementation when `VaultFactory` whitelists it.
    bytes32 internal constant FACTORY_TYPE_ID = keccak256("commitments.vault");

    /// @inheritdoc IEntity
    function factoryTypeId() external pure returns (bytes32) {
        return FACTORY_TYPE_ID;
    }

    /// @notice Maximum length of a vault metadata URI in bytes. Bounds gas cost of setMetadata.
    /// @dev Matches OperatorRegistry.MAX_METADATA_URI_LENGTH so off-chain tooling can apply
    ///      one cap across the protocol's metadata surfaces.
    uint256 public constant MAX_METADATA_URI_LENGTH = 512;

    /// @dev Disables initializers on the implementation contract (prevents logic contract initialization).
    constructor() {
        _disableInitializers();
    }

    // =========================================================================
    // Initializer
    // =========================================================================

    /// @notice Initialize the vault.
    /// @param asset_ The underlying asset.
    /// @param name_ name for vault shares.
    /// @param symbol_ symbol for vault shares.
    /// @param admin_ Initial admin address — receives DEFAULT_ADMIN_ROLE, PAUSER_ROLE, UNPAUSER_ROLE.
    /// @param yieldStrategy_ Initial strategy address (can be address(0) for idle/no-strategy mode).
    function initialize(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        address admin_,
        address yieldStrategy_
    ) external initializer {
        if (admin_ == address(0)) revert ZeroAddress();

        __ERC4626_init(asset_);
        __ERC20_init(name_, symbol_);
        __AccessControl_init();
        // ReentrancyGuardTransient uses transient storage — no init needed
        // UUPSUpgradeable in OZ v5 is stateless — no init needed

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        _grantRole(UNPAUSER_ROLE, admin_);

        CommitmentsVaultStorage.layout().yieldStrategy = yieldStrategy_;
    }

    // =========================================================================
    // ERC-4626 overrides
    // =========================================================================

    /// @notice Returns 9 to provide inflation attack protection.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 9;
    }

    /// @notice Returns the total assets managed by the vault.
    /// @dev When a strategy is set, returns strategy.totalAssets() PLUS the vault's own idle
    ///      token balance. Idle is ~0 in steady state (deposits are pushed to the strategy),
    ///      but counting it makes share price robust against transient idle balances — e.g.
    ///      mid-migration after draining the old strategy — instead of collapsing to the
    ///      virtual-shares floor. Falls back to the vault's own token balance when no
    ///      strategy is configured.
    function totalAssets() public view override(ERC4626Upgradeable, IERC4626) returns (uint256) {
        CommitmentsVaultStorage.Layout storage s = CommitmentsVaultStorage.layout();
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (s.yieldStrategy != address(0)) {
            return IYieldStrategy(s.yieldStrategy).totalAssets() + idle;
        }
        return idle;
    }

    /// @notice Max depositable amount — returns 0 when depositsPaused; routes through strategy when set.
    function maxDeposit(address) public view override(ERC4626Upgradeable, IERC4626) returns (uint256) {
        CommitmentsVaultStorage.Layout storage s = CommitmentsVaultStorage.layout();
        if (s.depositsPaused) return 0;
        if (s.yieldStrategy != address(0)) {
            return IYieldStrategy(s.yieldStrategy).maxDeposit();
        }
        return type(uint256).max;
    }

    /// @notice Max mintable shares — returns 0 when depositsPaused; mirrors the strategy deposit cap
    ///         so mint() and deposit() agree (ERC-4626 requires maxMint to be the true maximum).
    function maxMint(address) public view override(ERC4626Upgradeable, IERC4626) returns (uint256) {
        CommitmentsVaultStorage.Layout storage s = CommitmentsVaultStorage.layout();
        if (s.depositsPaused) return 0;
        if (s.yieldStrategy != address(0)) {
            uint256 maxAssets = IYieldStrategy(s.yieldStrategy).maxDeposit();
            // Preserve the "unbounded" sentinel unconverted; only cap when the strategy caps.
            if (maxAssets == type(uint256).max) return type(uint256).max;
            return _convertToShares(maxAssets, Math.Rounding.Floor);
        }
        return type(uint256).max;
    }

    /// @notice Deposit assets into vault. Reverts with DepositsPaused if paused.
    function deposit(uint256 assets, address receiver)
        public
        override(ERC4626Upgradeable, IERC4626)
        returns (uint256 shares)
    {
        if (CommitmentsVaultStorage.layout().depositsPaused) {
            revert DepositsPaused();
        }
        return super.deposit(assets, receiver);
    }

    /// @notice Mint exact shares. Reverts with DepositsPaused if paused.
    function mint(uint256 shares, address receiver)
        public
        override(ERC4626Upgradeable, IERC4626)
        returns (uint256 assets)
    {
        if (CommitmentsVaultStorage.layout().depositsPaused) {
            revert DepositsPaused();
        }
        return super.mint(shares, receiver);
    }

    /// @notice Override deposit hook to forward assets to strategy after minting shares.
    /// @dev nonReentrant guard applied here to protect the full deposit path including strategy interaction.
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override nonReentrant {
        // super._deposit: pulls tokens from caller into this contract and mints shares
        super._deposit(caller, receiver, assets, shares);
        // Push assets to strategy after they land in the vault
        CommitmentsVaultStorage.Layout storage s = CommitmentsVaultStorage.layout();
        if (s.yieldStrategy != address(0)) {
            IERC20(asset()).safeTransfer(s.yieldStrategy, assets);
            IYieldStrategy(s.yieldStrategy).deposit(assets);
        }
    }

    /// @notice Override withdraw hook to pull any shortfall from the strategy before paying out.
    /// @dev Withdrawals are instant — the vault holds no encumbrance and runs no unbonding
    ///      queue (the CommitmentManager owns all of that). nonReentrant protects the full
    ///      withdrawal path including the strategy interaction.
    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
        nonReentrant
    {
        CommitmentsVaultStorage.Layout storage s = CommitmentsVaultStorage.layout();
        if (s.yieldStrategy != address(0)) {
            uint256 idle = IERC20(asset()).balanceOf(address(this));
            if (assets > idle) {
                IYieldStrategy(s.yieldStrategy).withdraw(assets - idle);
            }
        }
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    // =========================================================================
    // Circuit Breaker
    // =========================================================================

    /// @notice Pause deposits. Only PAUSER_ROLE.
    function pauseDeposits() external onlyRole(PAUSER_ROLE) {
        CommitmentsVaultStorage.layout().depositsPaused = true;
        emit DepositsPauseToggled(true);
    }

    /// @notice Unpause deposits. Only UNPAUSER_ROLE (separation prevents griefing).
    function unpauseDeposits() external onlyRole(UNPAUSER_ROLE) {
        CommitmentsVaultStorage.layout().depositsPaused = false;
        emit DepositsPauseToggled(false);
    }

    /// @notice Returns whether deposits are currently paused.
    function depositsPaused() external view returns (bool) {
        return CommitmentsVaultStorage.layout().depositsPaused;
    }

    // =========================================================================
    // Strategy
    // =========================================================================

    /// @notice Update the yield strategy. Only DEFAULT_ADMIN_ROLE.
    /// @dev Refuses to switch when the old strategy holds assets.
    ///      Migration procedure: pause deposits, drain old strategy, then call setYieldStrategy.
    ///      When a non-zero strategy is set, validates that its `asset()` matches this
    ///      vault's asset and its `vault()` is bound to this proxy — prevents a misbound
    ///      strategy from leaking deposits into the wrong vault.
    ///      Whenever the new strategy is non-zero, sweeps the vault's idle balance into it
    ///      so existing LP shares are put back to work immediately. This covers both the
    ///      idle → live transition and the live → live migration (the drain step parks all
    ///      assets in the vault as idle balance). totalAssets() also counts idle balance,
    ///      so share price stays continuous even between drain and sweep.
    function setYieldStrategy(address yieldStrategy_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        CommitmentsVaultStorage.Layout storage s = CommitmentsVaultStorage.layout();
        address old = s.yieldStrategy;
        if (old != address(0)) {
            uint256 currentAssets = IYieldStrategy(old).totalAssets();
            if (currentAssets != 0) revert StrategyHasAssets(old, currentAssets);
        }

        // bind validation. A zero strategy means "idle mode" and is allowed.
        if (yieldStrategy_ != address(0)) {
            if (IYieldStrategy(yieldStrategy_).asset() != asset()) revert WrongStrategyAsset();
            if (IYieldStrategy(yieldStrategy_).vault() != address(this)) revert WrongStrategyVault();
        }

        // Idle sweep: whenever the new strategy is non-zero, transfer the vault's idle
        // balance into it. Covers idle → live and live → live (post-drain) transitions;
        // totalAssets() counts idle either way, so this only redeploys capital.
        if (yieldStrategy_ != address(0)) {
            uint256 idleBal = IERC20(asset()).balanceOf(address(this));
            if (idleBal > 0) {
                IERC20(asset()).safeTransfer(yieldStrategy_, idleBal);
                IYieldStrategy(yieldStrategy_).deposit(idleBal);
            }
        }

        s.yieldStrategy = yieldStrategy_;
        emit YieldStrategyUpdated(old, yieldStrategy_);
    }

    /// @notice Returns the current strategy address.
    function yieldStrategy() external view returns (address) {
        return CommitmentsVaultStorage.layout().yieldStrategy;
    }

    // =========================================================================
    // Donations (NAV uplift without minting)
    // =========================================================================

    /// @notice Permissionlessly donate `assets` to the vault. Lifts NAV per share
    ///         for all existing depositors without minting new shares.
    /// @dev Pulls `assets` from `msg.sender` and forwards to the strategy if one
    ///      is set, mirroring the `_deposit` push-to-strategy pattern. With no
    ///      strategy, `assets` sits in the vault and counts toward `totalAssets()`
    ///      via the IERC20 fallback.
    ///      Use cases:
    ///        - Forfeit proceeds recycled into the depositor pool.
    ///        - Treasury DAO retroactive yield top-ups.
    ///        - Fee-share recycling.
    ///      Donations are NOT gated by `depositsPaused`. A pause halts NEW
    ///      depositor share-minting; donations are pure NAV contributions and
    ///      benefit the existing share base regardless of pause state.
    /// @param assets Amount of underlying asset to donate.
    function donate(uint256 assets) external nonReentrant {
        if (assets == 0) revert ZeroAmount();
        CommitmentsVaultStorage.Layout storage s = CommitmentsVaultStorage.layout();

        IERC20(asset()).safeTransferFrom(msg.sender, address(this), assets);

        if (s.yieldStrategy != address(0)) {
            IERC20(asset()).safeTransfer(s.yieldStrategy, assets);
            IYieldStrategy(s.yieldStrategy).deposit(assets);
        }

        emit Donation(msg.sender, assets);
    }

    // =========================================================================
    // Metadata (vault-level sidecar)
    // =========================================================================

    /// @inheritdoc ICommitmentsVault
    /// @dev Only DEFAULT_ADMIN_ROLE may call. Overwrites any prior record with
    ///      `(uri, contentHash, uint64(block.timestamp))` and emits `VaultMetadataUpdated`.
    function setMetadata(string calldata uri, bytes32 contentHash) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bytes(uri).length > MAX_METADATA_URI_LENGTH) revert URITooLong();

        CommitmentsVaultStorage.Layout storage s = CommitmentsVaultStorage.layout();
        uint64 ts = uint64(block.timestamp);
        s.vaultMetadata = ICommitmentsVault.VaultMetadata({uri: uri, contentHash: contentHash, updatedAt: ts});

        emit VaultMetadataUpdated(uri, contentHash, ts);
    }

    /// @inheritdoc ICommitmentsVault
    function getMetadata() external view returns (ICommitmentsVault.VaultMetadata memory) {
        return CommitmentsVaultStorage.layout().vaultMetadata;
    }

    // =========================================================================
    // UUPS Authorization
    // =========================================================================

    /// @dev Only DEFAULT_ADMIN_ROLE can authorize contract upgrades.
    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
