// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ICommitmentManager} from "src/core/interfaces/ICommitmentManager.sol";

/// @title MutualRegistry
/// @notice Product wrapper for the Mutual. Creates a `Mutual` in the custody root and records
///         the off-chain-meaningful coverage terms 1:1 against it: the peril descriptor, the target
///         capacity, and the policy term. The numeraire and the beneficiary (a `ClaimRouter`) live
///         in the core `Mutual`. It is the indexer's binding target and the frontend's read surface.
/// @dev Deliberately thin and off the audited core path. Capacity / loss accounting all live in the
///      manager's `Mutual`; this registry only annotates and exposes a capacity view. Members
///      join through the manager's `joinMutual`, and only once the mutual arbiter has activated it.
contract MutualRegistry {
    struct MutualListing {
        address creator;
        uint128 targetCapacity; // informational creditedValue target; gates nothing
        uint64 termEnd; // policy term end (informational; 0 = open-ended)
        string perilURI; // off-chain peril descriptor
        bytes32 perilHash;
    }

    /// @notice Cap on `perilURI`, matching the protocol's other metadata URIs.
    uint256 public constant MAX_PERIL_URI_LENGTH = 512;

    ICommitmentManager public immutable manager;

    /// @dev mutualId => MutualListing (mutualId is the canonical key; 1:1 with the Mutual).
    mapping(uint256 => MutualListing) private _listings;
    uint256[] private _mutualIds;

    event MutualRegistered(
        uint256 indexed mutualId,
        address indexed creator,
        address indexed beneficiary,
        address numeraire,
        uint128 targetCapacity,
        uint64 termEnd,
        string perilURI,
        bytes32 perilHash
    );

    error ZeroAddress();
    error AlreadyRegistered();
    error UnknownMutual();
    error URITooLong();

    constructor(address manager_) {
        if (manager_ == address(0)) revert ZeroAddress();
        manager = ICommitmentManager(manager_);
    }

    /// @notice Create a Mutual and register its coverage terms. The caller chooses the mutual
    ///         arbiter (e.g. an OptimisticMutualArbiter).
    ///         Reverts `URITooLong` if `perilURI` exceeds `MAX_PERIL_URI_LENGTH` bytes.
    function registerMutual(
        ICommitmentManager.MutualParams calldata params,
        uint128 targetCapacity,
        uint64 termEnd,
        string calldata perilURI,
        bytes32 perilHash
    ) external returns (uint256 mutualId) {
        if (bytes(perilURI).length > MAX_PERIL_URI_LENGTH) revert URITooLong();
        mutualId = manager.createMutual(params);
        _listings[mutualId] = MutualListing({
            creator: msg.sender,
            targetCapacity: targetCapacity,
            termEnd: termEnd,
            perilURI: perilURI,
            perilHash: perilHash
        });
        _mutualIds.push(mutualId);

        emit MutualRegistered(
            mutualId, msg.sender, params.beneficiary, params.numeraire, targetCapacity, termEnd, perilURI, perilHash
        );
    }

    /// @notice The recorded mutual terms for a mutual.
    function getMutualListing(uint256 mutualId) external view returns (MutualListing memory s) {
        s = _listings[mutualId];
        if (s.creator == address(0)) revert UnknownMutual();
    }

    /// @notice True once the mutual's filled capacity (`totalShares`) reaches the target.
    function isFilled(uint256 mutualId) external view returns (bool) {
        MutualListing storage s = _listings[mutualId];
        if (s.creator == address(0)) revert UnknownMutual();
        return manager.getMutual(mutualId).totalShares >= s.targetCapacity;
    }

    /// @notice Filled capacity vs target, in numeraire units. NOTE: `filled` is `totalShares`, the
    ///         NOMINAL (join-time) credited capacity — it does NOT subtract loss already absorbed.
    ///         After losses accrue, remaining attributable coverage is `Σ E_i*(1e18 - lossSnapshot_i)
    ///         / 1e18`, which is < nominal; frontends/integrators should compute that off-chain
    ///         (e.g. from the indexer) to avoid over-stating live cover (red-team #5).
    function capacity(uint256 mutualId) external view returns (uint128 filled, uint128 target) {
        MutualListing storage s = _listings[mutualId];
        if (s.creator == address(0)) revert UnknownMutual();
        return (manager.getMutual(mutualId).totalShares, s.targetCapacity);
    }

    /// @notice All registered mutual ids (append-only).
    function allMutualIds() external view returns (uint256[] memory) {
        return _mutualIds;
    }

    function mutualCount() external view returns (uint256) {
        return _mutualIds.length;
    }
}
