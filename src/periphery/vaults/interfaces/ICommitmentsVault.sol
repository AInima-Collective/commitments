// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/// @title ICommitmentsVault
/// @notice A clean yield-bearing ERC-4626 vault with a pluggable yield strategy, permissionless
///         NAV donations, a deposit circuit breaker, and a content-addressed metadata sidecar.
///         Vault shares are plain transferable ERC-20 tokens; they serve as backing for the
///         CommitmentManager via `ERC4626Adapter` (the manager custodies shares, the underlying
///         keeps earning in the strategy). The vault itself knows nothing about commitments.
interface ICommitmentsVault is IERC4626 {
    // === Structs ===

    /// @notice Mutable, content-addressed metadata sidecar for the vault itself.
    /// @dev Mirrors the `OperatorMetadata` shape used by `OperatorRegistry` so off-chain
    ///      indexers can render vault descriptions, audit links, risk blurbs, etc. via the
    ///      same (uri, contentHash, updatedAt) triple. A zero `updatedAt` means metadata
    ///      has never been set on this vault.
    struct VaultMetadata {
        string uri;
        bytes32 contentHash;
        uint64 updatedAt;
    }

    // === Events ===
    event YieldStrategyUpdated(address indexed oldStrategy, address indexed newStrategy);
    event DepositsPauseToggled(bool paused);
    /// @notice Emitted when assets are donated to the vault, lifting NAV per share for all
    ///         depositors without minting shares. Permissionless caller.
    event Donation(address indexed donor, uint256 assets);
    /// @notice Emitted whenever a vault admin writes or updates the vault's metadata sidecar.
    event VaultMetadataUpdated(string uri, bytes32 contentHash, uint64 timestamp);

    // === Errors ===
    error ZeroAddress();
    error ZeroAmount();
    error StrategyHasAssets(address strategy, uint256 assets);
    /// @notice setYieldStrategy with a strategy whose `asset()` doesn't match this vault.
    error WrongStrategyAsset();
    /// @notice setYieldStrategy with a strategy whose `vault()` doesn't match this proxy.
    error WrongStrategyVault();
    /// @notice Thrown by `setMetadata` when the URI exceeds the protocol length cap.
    error URITooLong();

    // === Circuit Breaker ===
    function pauseDeposits() external;
    function unpauseDeposits() external;
    function depositsPaused() external view returns (bool);

    // === Strategy ===
    function setYieldStrategy(address strategy) external;
    function yieldStrategy() external view returns (address);

    // === Donations (NAV uplift without minting) ===
    function donate(uint256 assets) external;

    // === Metadata (vault-level sidecar) ===
    /// @notice Set the vault's content-addressed metadata. DEFAULT_ADMIN_ROLE only.
    /// @dev Reverts with `URITooLong` if `uri` length exceeds the protocol cap.
    ///      Overwrites any prior record and emits `VaultMetadataUpdated`.
    function setMetadata(string calldata uri, bytes32 contentHash) external;

    /// @notice Returns the vault's metadata sidecar (uri, contentHash, updatedAt).
    /// @dev `updatedAt == 0` means metadata has never been set.
    function getMetadata() external view returns (VaultMetadata memory);
}
