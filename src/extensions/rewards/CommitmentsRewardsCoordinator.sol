// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {ICommitmentManager} from "src/core/interfaces/ICommitmentManager.sol";
import {ICommitmentsRewardsCoordinator} from "src/extensions/rewards/interfaces/ICommitmentsRewardsCoordinator.sol";
import {IMerkleSnapshot} from "src/extensions/rewards/interfaces/IMerkleSnapshot.sol";
import {
    CommitmentsRewardsCoordinatorStorage
} from "src/extensions/rewards/storage/CommitmentsRewardsCoordinatorStorage.sol";

/// @title CommitmentsRewardsCoordinator
/// @notice Per-service cumulative-merkle reward distributor. Receives token
///         deposits and pays out earner-claimed amounts against active roots
///         stored on a bound `MerkleSnapshot`.
/// @dev Locked behaviors:
///         - depositRewards: permissionless funder; SafeERC20.
///         - processClaim: caller-only earner; on-chain monotonicity
///           check; revert with NoOp on zero-delta; CEI ordering; halted while
///           the emergency freeze is engaged.
///         - freeze / unfreeze: service-gated emergency pause over `processClaim`.
///         - snapshot binding: immutable post-init.
///         - service: cached at init; immutable.
///         - zero protocol fee: NO fee path; D10 immutable.
///         - UUPS upgrades: authorized by service.
///       This coordinator is a pure self-custody distributor: reward funds live
///       on this contract and never flow through the commitment manager, so it
///       does NOT implement `IDistributionStrategy` (the former no-op "costume"
///       was removed). The staged-updater swap surface lives on `MerkleSnapshot`.
contract CommitmentsRewardsCoordinator is
    Initializable,
    UUPSUpgradeable,
    ReentrancyGuardTransient,
    ICommitmentsRewardsCoordinator
{
    using CommitmentsRewardsCoordinatorStorage for CommitmentsRewardsCoordinatorStorage.Layout;
    using SafeERC20 for IERC20;

    /// @dev Disable initializers on the implementation contract (proxy pattern).
    constructor() {
        _disableInitializers();
    }

    // -------------------------------------------------------------------------
    // Initializer
    // -------------------------------------------------------------------------

    /// @notice Initialize the coordinator proxy. Called once by the factory.
    /// @param service_ Service controller. Cached for cheaper auth and UUPS
    ///                  upgrade authorization. Must equal `snapshot_.service()`
    ///                  but the factory enforces this — the coordinator does
    ///                  not re-validate.
    /// @param snapshot_ Bound merkle-snapshot. immutable post-init.
    function initialize(address service_, address snapshot_) external initializer {
        if (service_ == address(0) || snapshot_ == address(0)) revert ZeroAddress();

        CommitmentsRewardsCoordinatorStorage.Layout storage $ = CommitmentsRewardsCoordinatorStorage.layout();
        $.service = service_;
        $.snapshot = snapshot_;
    }

    // -------------------------------------------------------------------------
    // Auth modifiers
    // -------------------------------------------------------------------------

    modifier onlyService() {
        if (msg.sender != CommitmentsRewardsCoordinatorStorage.layout().service) revert NotService();
        _;
    }

    // -------------------------------------------------------------------------
    // Reward flow
    // -------------------------------------------------------------------------

    /// @inheritdoc ICommitmentsRewardsCoordinator
    function depositRewards(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (token == address(0)) revert ZeroAddress();

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit RewardsDeposited(msg.sender, token, amount);
    }

    /// @inheritdoc ICommitmentsRewardsCoordinator
    function processClaim(bytes32 rootId, address token, uint256 cumulativeAmount, bytes32[] calldata proof)
        external
        nonReentrant
        returns (uint256 amountPaidOut)
    {
        if (token == address(0)) revert ZeroAddress();

        CommitmentsRewardsCoordinatorStorage.Layout storage $ = CommitmentsRewardsCoordinatorStorage.layout();
        if ($.frozen) revert ClaimsFrozen(); // emergency pause — stops a draining root
        IMerkleSnapshot snap = IMerkleSnapshot($.snapshot);
        if (!snap.isActive(rootId)) revert RootNotActive();

        bytes32 leaf = keccak256(abi.encode(msg.sender, token, cumulativeAmount));
        if (!MerkleProof.verifyCalldata(proof, rootId, leaf)) revert InvalidProof();

        uint256 alreadyClaimed = $.claimed[msg.sender][token];
        if (cumulativeAmount < alreadyClaimed) revert CumulativeRegression(); // D12

        amountPaidOut = cumulativeAmount - alreadyClaimed;
        if (amountPaidOut == 0) revert NoOp(); // fail fast on zero-delta

        // CEI: state write before external call.
        $.claimed[msg.sender][token] = cumulativeAmount;
        IERC20(token).safeTransfer(msg.sender, amountPaidOut);

        emit RewardsClaimed(rootId, msg.sender, token, amountPaidOut, cumulativeAmount);
        // ERC-COMMITMENTS §D.7: the payout-executing contract emits the uniform event.
        // `commitmentId = 0`: merkle leaves carry no per-commitment attribution.
        emit ICommitmentManager.DistributionPaid(address(this), msg.sender, token, amountPaidOut, 0, rootId);
    }

    // -------------------------------------------------------------------------
    // Emergency freeze
    // -------------------------------------------------------------------------

    /// @inheritdoc ICommitmentsRewardsCoordinator
    function freeze() external onlyService {
        CommitmentsRewardsCoordinatorStorage.Layout storage $ = CommitmentsRewardsCoordinatorStorage.layout();
        if ($.frozen) revert AlreadyFrozen();
        $.frozen = true;
        emit ClaimsFrozenSet(msg.sender);
    }

    /// @inheritdoc ICommitmentsRewardsCoordinator
    function unfreeze() external onlyService {
        CommitmentsRewardsCoordinatorStorage.Layout storage $ = CommitmentsRewardsCoordinatorStorage.layout();
        if (!$.frozen) revert NotFrozen();
        $.frozen = false;
        emit ClaimsUnfrozen(msg.sender);
    }

    /// @inheritdoc ICommitmentsRewardsCoordinator
    function frozen() external view returns (bool) {
        return CommitmentsRewardsCoordinatorStorage.layout().frozen;
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @inheritdoc ICommitmentsRewardsCoordinator
    function claimed(address earner, address token) external view returns (uint256) {
        return CommitmentsRewardsCoordinatorStorage.layout().claimed[earner][token];
    }

    /// @inheritdoc ICommitmentsRewardsCoordinator
    function snapshot() external view returns (IMerkleSnapshot) {
        return IMerkleSnapshot(CommitmentsRewardsCoordinatorStorage.layout().snapshot);
    }

    /// @inheritdoc ICommitmentsRewardsCoordinator
    function service() external view returns (address) {
        return CommitmentsRewardsCoordinatorStorage.layout().service;
    }

    // -------------------------------------------------------------------------
    // UUPS auth
    // -------------------------------------------------------------------------

    function _authorizeUpgrade(address) internal view override onlyService {}
}
