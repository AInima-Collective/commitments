// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ICommitmentManager} from "src/core/interfaces/ICommitmentManager.sol";
import {ILinkedMutualPolicy} from "src/extensions/mutuals/interfaces/ILinkedMutualPolicy.sol";
import {BPS_DENOMINATOR} from "src/shared/Constants.sol";

/// @title MutualRegistry
/// @notice Product wrapper for the Mutual (Position A). Creates a `Mutual` in
///         the custody root and records the off-chain-meaningful coverage terms 1:1 against it:
///         the peril descriptor, the target capacity, the policy term, and the beneficiary
///         (a `ClaimRouter`). It is the indexer's binding target and the frontend's read surface.
/// @dev Deliberately thin and off the audited core path. Capacity / loss accounting all live in the
///      manager's `Mutual`; this registry only annotates and exposes a capacity view. Members
///      join through the manager's `joinMutual`; the mutual arbiter activates once capacity is filled.
contract MutualRegistry {
    struct MutualListing {
        uint256 mutualId; // the backing Mutual (1:1)
        address creator;
        address numeraire;
        address beneficiary; // the ClaimRouter
        uint128 targetCapacity; // creditedValue sum at which the mutual should activate
        uint64 termEnd; // policy term end (informational; 0 = open-ended)
        string perilURI; // off-chain peril descriptor
        bytes32 perilHash;
    }

    ICommitmentManager public immutable manager;
    /// @notice Deployer-recorded admin, allowed to wire the cover policy once.
    address public immutable admin;
    /// @notice The LinkedMutualPolicy supplying `activeNotionalSold` for the premium views.
    ///         Optional: until set, `premiumInfo` reports `activeNotionalSold == 0`.
    address public coverPolicy;

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

    event CoverPolicyUpdated(address indexed coverPolicy);

    error ZeroAddress();
    error AlreadyRegistered();
    error UnknownMutual();
    error NotAdmin();

    constructor(address manager_) {
        if (manager_ == address(0)) revert ZeroAddress();
        manager = ICommitmentManager(manager_);
        admin = msg.sender;
    }

    /// @notice Wire the LinkedMutualPolicy whose `activeNotionalSold` feeds `premiumInfo`. Set
    ///         post-deploy by the admin (keeps the single-arg constructor backward-compatible and
    ///         breaks the policy<->registry deploy cycle).
    function setCoverPolicy(address coverPolicy_) external {
        if (msg.sender != admin) revert NotAdmin();
        if (coverPolicy_ == address(0)) revert ZeroAddress();
        coverPolicy = coverPolicy_;
        emit CoverPolicyUpdated(coverPolicy_);
    }

    /// @notice Create a Mutual and register its coverage terms. The caller chooses the mutual
    ///         arbiter (e.g. an OptimisticMutualArbiter) and the valuationAuthority (0 = homogeneous).
    function registerMutual(
        ICommitmentManager.MutualParams calldata params,
        uint128 targetCapacity,
        uint64 termEnd,
        string calldata perilURI,
        bytes32 perilHash
    ) external returns (uint256 mutualId) {
        mutualId = manager.createMutual(params);
        _listings[mutualId] = MutualListing({
            mutualId: mutualId,
            creator: msg.sender,
            numeraire: params.numeraire,
            beneficiary: params.beneficiary,
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
        if (s.beneficiary == address(0)) revert UnknownMutual();
    }

    /// @notice True once the mutual's filled capacity (`totalShares`) reaches the target.
    function isFilled(uint256 mutualId) external view returns (bool) {
        MutualListing storage s = _listings[mutualId];
        if (s.beneficiary == address(0)) revert UnknownMutual();
        return manager.getMutual(mutualId).totalShares >= s.targetCapacity;
    }

    /// @notice Filled capacity vs target, in numeraire units. NOTE: `filled` is `totalShares`, the
    ///         NOMINAL (join-time) credited capacity — it does NOT subtract loss already absorbed.
    ///         After losses accrue, remaining attributable coverage is `Σ E_i*(1e18 - lossSnapshot_i)
    ///         / 1e18`, which is < nominal; frontends/integrators should compute that off-chain
    ///         (e.g. from the indexer) to avoid over-stating live cover (red-team #5).
    function capacity(uint256 mutualId) external view returns (uint128 filled, uint128 target) {
        MutualListing storage s = _listings[mutualId];
        if (s.beneficiary == address(0)) revert UnknownMutual();
        return (manager.getMutual(mutualId).totalShares, s.targetCapacity);
    }

    /// @notice All registered mutual ids (append-only).
    function allMutualIds() external view returns (uint256[] memory) {
        return _mutualIds;
    }

    function mutualCount() external view returns (uint256) {
        return _mutualIds.length;
    }

    /// @notice Combined premium read surface for a mutual: the core's live cover/stream state plus
    ///         the periphery's `activeNotionalSold`, with utilization in basis points.
    /// @dev `utilizationBps = activeNotionalSold * 1e4 / activeCover` (0 when `activeCover == 0`).
    ///      `activeNotionalSold` is 0 when no cover policy is wired. Pure read; never gates anything.
    /// @return activeCover live deliverable-cover denominator (numeraire units)
    /// @return activeNotionalSold Σ ACTIVE bindings' notional (the demand numerator)
    /// @return utilizationBps demand/supply utilization in bps
    /// @return rewardRate streamed numeraire per second
    /// @return periodFinish stream end timestamp
    /// @return premiumPool reserve (`funded − claimed`)
    function premiumInfo(uint256 mutualId)
        external
        view
        returns (
            uint128 activeCover,
            uint256 activeNotionalSold,
            uint256 utilizationBps,
            uint128 rewardRate,
            uint64 periodFinish,
            uint256 premiumPool
        )
    {
        // getMutualPremiumState order: (premiumPerShareStored, activeCover, settledTotal, rewardRate,
        //   lastUpdate, periodFinish, premiumRemainder, bankedTotal, premiumPool).
        (, activeCover,, rewardRate,, periodFinish,,, premiumPool) = manager.getMutualPremiumState(mutualId);

        address policy = coverPolicy;
        if (policy != address(0)) {
            activeNotionalSold = ILinkedMutualPolicy(policy).getActiveNotionalSold(mutualId);
        }
        utilizationBps = activeCover == 0 ? 0 : (activeNotionalSold * BPS_DENOMINATOR) / activeCover;
    }
}
