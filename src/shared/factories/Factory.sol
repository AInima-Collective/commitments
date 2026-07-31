// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {IEntity} from "src/shared/interfaces/IEntity.sol";
import {FactoryStorage} from "src/shared/factories/FactoryStorage.sol";

/// @title Factory
/// @notice Shared base for contracts that deploy vetted implementations (as EIP-1167 clones
///         or as ERC-1967 proxy logic). Consolidates the whitelist ladder, the `blacklist`
///         kill-valve, and the clone plumbing that `VaultFactory` and `MeshFactory`
///         previously reimplemented.
/// @dev Two-gate deployment policy:
///        1. **Whitelist** — an implementation must be explicitly whitelisted by the owner
///           before it can be deployed. Whitelisting is *self-verifying*: the owner passes an
///           expected type id and the base checks it against `IEntity(impl).factoryTypeId()`,
///           so the wrong contract type can never be whitelisted by mistake.
///        2. **Blacklist** — a one-way valve the owner can flip to permanently forbid an
///           implementation (e.g. one later found buggy). Blacklist overrides whitelist.
///
///      Only *implementation-set management* is owner-gated. The concrete `deploy*` entry
///      points a deriving factory exposes may stay permissionless (e.g. `MeshFactory` lets
///      the registry lazily clone nodes) — they just call `_requireDeployable(impl)` first,
///      so a permissionless caller can only ever clone a vetted, non-blacklisted impl.
abstract contract Factory is Ownable {
    using FactoryStorage for FactoryStorage.Layout;

    // =========================================================================
    // Events
    // =========================================================================

    /// @notice Emitted when an implementation is whitelisted for deployment.
    /// @param impl The implementation address.
    /// @param typeId The self-verified type id (`IEntity.factoryTypeId`) recorded for it.
    event ImplementationWhitelisted(address indexed impl, bytes32 indexed typeId);

    /// @notice Emitted when an implementation is blacklisted (permanently forbidden).
    /// @param impl The implementation address.
    event ImplementationBlacklisted(address indexed impl);

    // =========================================================================
    // Errors
    // =========================================================================

    /// @notice Thrown when an implementation is not whitelisted for deployment.
    error NotWhitelisted(address impl);

    /// @notice Thrown when an implementation has been blacklisted.
    error Blacklisted(address impl);

    /// @notice Thrown when an implementation is already whitelisted.
    error AlreadyWhitelisted(address impl);

    /// @notice Thrown when `IEntity(impl).factoryTypeId()` does not match the expected id.
    error TypeIdMismatch(address impl, bytes32 expected, bytes32 actual);

    /// @notice Thrown when the zero address is supplied where an implementation is required.
    error ZeroImplementation();

    // =========================================================================
    // Constructor
    // =========================================================================

    /// @param initialOwner The address granted ownership of the implementation-set controls.
    constructor(address initialOwner) Ownable(initialOwner) {}

    // =========================================================================
    // Implementation-set management (owner-gated)
    // =========================================================================

    /// @notice Whitelist an implementation for deployment, verifying its self-declared type id.
    /// @dev Reverts if `impl` is zero, already whitelisted, blacklisted, or if its
    ///      `factoryTypeId()` does not equal `expectedTypeId`.
    /// @param impl The implementation address to vet.
    /// @param expectedTypeId The type id the implementation must self-report.
    function whitelistImplementation(address impl, bytes32 expectedTypeId) external onlyOwner {
        _whitelistImplementation(impl, expectedTypeId);
    }

    /// @notice Blacklist an implementation, permanently forbidding future deployments of it.
    /// @dev The valve is one-way: once blacklisted, an implementation can never be re-whitelisted.
    ///      Existing deployed instances are unaffected — this only gates future `deploy*` calls.
    /// @param impl The implementation address to forbid.
    function blacklist(address impl) external onlyOwner {
        FactoryStorage.Layout storage s = FactoryStorage.layout();
        s.blacklisted[impl] = true;
        emit ImplementationBlacklisted(impl);
    }

    // =========================================================================
    // Views
    // =========================================================================

    /// @notice Whether `impl` is whitelisted for deployment.
    function isWhitelisted(address impl) external view returns (bool) {
        return FactoryStorage.layout().whitelisted[impl];
    }

    /// @notice Whether `impl` has been blacklisted.
    function isBlacklisted(address impl) external view returns (bool) {
        return FactoryStorage.layout().blacklisted[impl];
    }

    /// @notice The self-verified type id recorded for `impl` at whitelist time (zero if never whitelisted).
    function implementationTypeId(address impl) external view returns (bytes32) {
        return FactoryStorage.layout().implTypeId[impl];
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    /// @dev Whitelist core, callable from constructors (to vet the impls a factory ships with)
    ///      and from the owner-gated external setter.
    function _whitelistImplementation(address impl, bytes32 expectedTypeId) internal {
        if (impl == address(0)) revert ZeroImplementation();
        FactoryStorage.Layout storage s = FactoryStorage.layout();
        if (s.blacklisted[impl]) revert Blacklisted(impl);
        if (s.whitelisted[impl]) revert AlreadyWhitelisted(impl);

        bytes32 actual = IEntity(impl).factoryTypeId();
        if (actual != expectedTypeId) revert TypeIdMismatch(impl, expectedTypeId, actual);

        s.whitelisted[impl] = true;
        s.implTypeId[impl] = expectedTypeId;
        emit ImplementationWhitelisted(impl, expectedTypeId);
    }

    /// @dev Reverts unless `impl` is deployable: whitelisted and not blacklisted. Call this at
    ///      the top of every concrete `deploy*` entry point.
    function _requireDeployable(address impl) internal view {
        FactoryStorage.Layout storage s = FactoryStorage.layout();
        if (s.blacklisted[impl]) revert Blacklisted(impl);
        if (!s.whitelisted[impl]) revert NotWhitelisted(impl);
    }

    /// @dev Clone a vetted implementation via EIP-1167. Enforces the deploy gate first.
    function _cloneVetted(address impl) internal returns (address clone) {
        _requireDeployable(impl);
        clone = Clones.clone(impl);
    }

    /// @dev Deterministic (CREATE2) clone of a vetted implementation. Enforces the deploy gate first.
    function _cloneVettedDeterministic(address impl, bytes32 salt) internal returns (address clone) {
        _requireDeployable(impl);
        clone = Clones.cloneDeterministic(impl, salt);
    }
}
