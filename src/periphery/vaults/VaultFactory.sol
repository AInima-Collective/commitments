// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CommitmentsVault} from "src/periphery/vaults/CommitmentsVault.sol";
import {Factory} from "src/shared/factories/Factory.sol";
import {Multicallable} from "src/shared/utilities/Multicallable.sol";

/// @title VaultFactory
/// @notice Deploys per-asset CommitmentsVault instances via ERC1967Proxy and maintains a queryable registry.
/// @dev Uses ERC1967Proxy rather than minimal proxies because CommitmentsVault is UUPS-upgradeable.
///      Minimal clones perform a raw delegatecall that bypasses the UUPS upgrade check — combining
///      them leads to broken upgrade paths. ERC1967Proxy is the correct pattern for UUPS vaults.
///      Per-asset constraint: exactly one vault per asset address.
///      Only the factory owner can deploy new vaults.
///
///      Shares two extracted bases:
///        - `Factory` — whitelist/blacklist ladder for the vault implementation (the
///          implementation is self-verified against `CommitmentsVault.FACTORY_TYPE_ID` at
///          construction; the owner can `blacklist` it to freeze new deployments).
///        - `Multicallable` — batch several `deployVault` calls in one owner transaction.
contract VaultFactory is Factory, Multicallable {
    // =========================================================================
    // Errors
    // =========================================================================

    /// @notice Emitted when trying to deploy a vault for an asset that already has one.
    error VaultAlreadyExists(address asset);

    /// @notice Emitted when a zero address is provided where a valid address is required.
    error ZeroAddress();

    // =========================================================================
    // Events
    // =========================================================================

    /// @notice Emitted when a new vault is deployed.
    event VaultDeployed(address indexed asset, address indexed vault);

    // =========================================================================
    // Storage
    // =========================================================================

    /// @notice The type id a whitelisted implementation must self-report to be a valid vault.
    /// @dev Must equal `CommitmentsVault.FACTORY_TYPE_ID`. Hardcoded here (rather than read from
    ///      the impl) so the self-verification is meaningful: the factory asserts "this must be a
    ///      vault" and the implementation confirms it is.
    bytes32 public constant VAULT_TYPE_ID = keccak256("commitments.vault");

    /// @notice The CommitmentsVault implementation that all proxies delegate to.
    address public immutable vaultImplementation;

    /// @notice Maps an asset address to its deployed vault proxy address.
    /// @dev Returns address(0) if no vault has been deployed for the asset.
    mapping(address => address) public vaultByAsset;

    /// @notice Every deployed vault proxy, in deployment order (append-only).
    address[] public allVaults;

    // =========================================================================
    // Constructor
    // =========================================================================

    /// @param vaultImplementation_ The deployed CommitmentsVault implementation (NOT initialized).
    /// @dev Whitelists the implementation via the `Factory` base, self-verifying it against
    ///      `CommitmentsVault.FACTORY_TYPE_ID` so a non-vault contract can never be wired in.
    ///      The factory deployer becomes the owner of the implementation-set controls.
    constructor(address vaultImplementation_) Factory(msg.sender) {
        vaultImplementation = vaultImplementation_;
        _whitelistImplementation(vaultImplementation_, VAULT_TYPE_ID);
    }

    // =========================================================================
    // Factory
    // =========================================================================

    /// @notice Deploy a new CommitmentsVault proxy for the given asset.
    /// @dev Only callable by the factory owner.
    ///      Reverts if a vault already exists for the asset, or if the implementation has been
    ///      blacklisted via the `Factory` valve.
    ///      Constructs the vault name as "Commitments {symbol} Vault" and symbol as "cv{symbol}".
    /// @param asset asset address (must be non-zero and not already registered).
    /// @param admin Admin address to receive DEFAULT_ADMIN_ROLE, PAUSER_ROLE, UNPAUSER_ROLE in the vault.
    /// @param strategy Initial strategy address — pass address(0) for no-yield idle mode.
    /// @return vault Address of the newly deployed vault proxy.
    function deployVault(address asset, address admin, address strategy) external onlyOwner returns (address vault) {
        if (asset == address(0)) revert ZeroAddress();
        if (vaultByAsset[asset] != address(0)) revert VaultAlreadyExists(asset);

        // Gate on the implementation whitelist/blacklist ladder (Factory base).
        _requireDeployable(vaultImplementation);

        // Construct name and symbol from the asset metadata
        string memory assetSymbol = IERC20Metadata(asset).symbol();
        string memory name = string.concat("Commitments ", assetSymbol, " Vault");
        string memory symbol = string.concat("cv", assetSymbol);

        // Encode the initializer call data for the proxy constructor
        bytes memory initData =
            abi.encodeCall(CommitmentsVault.initialize, (IERC20(asset), name, symbol, admin, strategy));

        // Deploy UUPS-compatible proxy pointing to the shared implementation
        ERC1967Proxy proxy = new ERC1967Proxy(vaultImplementation, initData);
        vault = address(proxy);

        // Register in registry
        vaultByAsset[asset] = vault;
        allVaults.push(vault);

        emit VaultDeployed(asset, vault);
    }

    // =========================================================================
    // Registry Views
    // =========================================================================

    /// @notice Returns the total number of deployed vaults.
    function vaultCount() external view returns (uint256) {
        return allVaults.length;
    }
}
