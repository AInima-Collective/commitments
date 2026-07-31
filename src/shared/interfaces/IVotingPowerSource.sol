// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title IVotingPowerSource
/// @notice Shared interface for any contract that exposes per-address voting power with
///         checkpointed history. Implemented by TokenWeighting and any future sources
///         (e.g. LST oracles, PoA lists). Consumed by service managers
///         (ECDSA or BLS) to decouple signature validation from stake accounting.
interface IVotingPowerSource {
    /// @notice Current voting power for an address.
    function getVotingPower(address who) external view returns (uint256);

    /// @notice Historical voting power for an address at a given block.
    function getVotingPowerAt(address who, uint256 blockNumber) external view returns (uint256);

    /// @notice Current total voting power across all addresses tracked by this source.
    function getTotalPower() external view returns (uint256);

    /// @notice Historical total voting power at a given block.
    function getTotalPowerAt(uint256 blockNumber) external view returns (uint256);
}
