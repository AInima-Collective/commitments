// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {ICommitmentManager} from "src/core/interfaces/ICommitmentManager.sol";
import {ILinkedMutualPolicy} from "src/extensions/mutuals/interfaces/ILinkedMutualPolicy.sol";
import {PremiumScheduler} from "src/extensions/mutuals/PremiumScheduler.sol";

/// @title LinkedMutualPolicy
/// @notice The binding + funding executor for a Mutual's premium leg. Off the audited
///         custody path. It is the policyholder's entry point: it prices cover via the
///         PremiumScheduler, pulls the numeraire premium from the policyholder, and atomically funds
///         the core's Synthetix `Pi` stream via `fundMutualPremium`. The policy also maintains the
///         utilization numerator (`activeNotionalSold`) the scheduler prices against, and records a
///         per-binding `{notional, expiry, policyholder}` snapshot the OptimisticMutualArbiter can
///         reference into a loss claim for auditability (never a settlement gate).
///
/// @dev Funding flow (per the ERC §6 periphery): the core's `fundMutualPremium` pulls the numeraire
///      from `msg.sender` (i.e. THIS contract), so this contract must hold the premium and approve
///      the manager before the call. Hence: pull premium from the policyholder into this contract,
///      `forceApprove` the manager for exactly the premium, then `fundMutualPremium`. The whole bind
///      is atomic — if `fundMutualPremium` reverts (e.g. `NoActiveCover`), the bind reverts and no
///      binding is recorded.
///
///      FOLLOW-UP: refund routing to the policyholder-of-record on `reclaimPremium` /
///      terminal sweep is intentionally NOT built here. The core `reclaimPremium` is
///      beneficiary-gated, and routing refunds to the funder-of-record needs a core
///      funder-of-record field; that is out of scope for this version. This contract
///      only records the funder so a future version (and the indexer) can attribute the stream.
contract LinkedMutualPolicy is ILinkedMutualPolicy, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @notice The custody root whose premium stream this policy funds.
    ICommitmentManager public immutable manager;
    /// @notice The pricing brain (utilization curve + leverage cap + capture check).
    PremiumScheduler public immutable scheduler;

    /// @dev bindingId => cover binding (1-indexed; id 0 is never used).
    mapping(uint256 => CoverBinding) private _coverBindings;
    /// @notice Next binding id to assign (1-indexed).
    uint256 public nextBindingId;
    /// @notice mutualId => Σ notional of ACTIVE bindings (the scheduler's utilization numerator).
    mapping(uint256 => uint256) private _activeNotionalSold;

    event CoverBound(
        uint256 indexed bindingId,
        uint256 indexed mutualId,
        address indexed policyholder,
        uint256 notional,
        uint64 expiry,
        uint256 premiumPaid
    );
    event StandbyFunded(uint256 indexed mutualId, address indexed funder, uint256 premiumPaid, uint64 duration);
    event BindingExpired(uint256 indexed bindingId, uint256 indexed mutualId, uint256 notional);

    error ZeroAddress();
    error ZeroNotional();
    error ZeroPremiumQuote();
    error NoStandbyCapacity();
    error UnknownBinding();
    error BindingInactive();
    error BindingNotExpired();

    constructor(address manager_, address scheduler_) {
        if (manager_ == address(0) || scheduler_ == address(0)) revert ZeroAddress();
        manager = ICommitmentManager(manager_);
        scheduler = PremiumScheduler(scheduler_);
        nextBindingId = 1;
    }

    // ---------------------------------------------------------------------
    // Binding + funding
    // ---------------------------------------------------------------------

    /// @inheritdoc ILinkedMutualPolicy
    /// @notice Price `notional` of cover for `duration`, pull the premium from the caller, fund the
    ///         core stream, and record the binding. Atomic: any revert (capture, leverage cap,
    ///         `NoActiveCover`) rolls back the whole call.
    function bindCover(uint256 mutualId, uint256 notional, uint64 duration)
        external
        nonReentrant
        returns (uint256 bindingId)
    {
        if (notional == 0) revert ZeroNotional();

        // Capture defense: the pricing authority must not be the mutual arbiter/beneficiary.
        scheduler.assertNotCaptured(mutualId);

        uint256 premium = scheduler.quote(mutualId, notional, duration);
        if (premium == 0) revert ZeroPremiumQuote();

        _fund(mutualId, premium, duration);

        bindingId = nextBindingId++;
        uint64 expiry = uint64(block.timestamp) + duration;
        _coverBindings[bindingId] = CoverBinding({
            mutualId: mutualId,
            notional: notional,
            expiry: expiry,
            policyholder: msg.sender,
            premiumPaid: premium,
            active: true
        });
        _activeNotionalSold[mutualId] += notional;

        emit CoverBound(bindingId, mutualId, msg.sender, notional, expiry, premium);
    }

    /// @inheritdoc ILinkedMutualPolicy
    /// @notice Fund the existing `Pi` stream with a standby reservation fee priced on the
    ///         offered-but-unallocated cover. Records no binding and no notional — a pure stream
    ///         top-up that compensates idle capacity (plan standby-dilution mitigation).
    function fundStandby(uint256 mutualId, uint64 duration) external nonReentrant {
        // Capture defense, symmetric with bindCover: the pricing authority must not be the mutual
        // arbiter/beneficiary (harmless here since standby only benefits underwriters, but kept
        // consistent so the global capture posture has no asymmetric hole).
        scheduler.assertNotCaptured(mutualId);
        uint256 premium = scheduler.quoteStandby(mutualId, duration);
        if (premium == 0) revert NoStandbyCapacity();
        _fund(mutualId, premium, duration);
        emit StandbyFunded(mutualId, msg.sender, premium, duration);
    }

    /// @inheritdoc ILinkedMutualPolicy
    /// @notice Permissionlessly lapse an expired binding: once `now >= expiry`, mark it inactive and
    ///         remove its notional from utilization so the scheduler re-prices on live demand. The
    ///         `active` flag guards against double-expire.
    function expireBinding(uint256 bindingId) external nonReentrant {
        CoverBinding storage b = _coverBindings[bindingId];
        if (b.policyholder == address(0)) revert UnknownBinding();
        if (!b.active) revert BindingInactive();
        if (block.timestamp < b.expiry) revert BindingNotExpired();

        b.active = false;
        _activeNotionalSold[b.mutualId] -= b.notional;
        emit BindingExpired(bindingId, b.mutualId, b.notional);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @inheritdoc ILinkedMutualPolicy
    function getCoverBinding(uint256 bindingId) external view returns (CoverBinding memory) {
        return _coverBindings[bindingId];
    }

    /// @inheritdoc ILinkedMutualPolicy
    function getActiveNotionalSold(uint256 mutualId) external view returns (uint256) {
        return _activeNotionalSold[mutualId];
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev Pull `premium` of the mutual numeraire from the caller into this contract, approve the
    ///      manager for exactly that amount, and fund the core stream. Shared by bind and standby.
    function _fund(uint256 mutualId, uint256 premium, uint64 duration) internal {
        address numeraire = manager.getMutual(mutualId).numeraire;
        IERC20(numeraire).safeTransferFrom(msg.sender, address(this), premium);
        IERC20(numeraire).forceApprove(address(manager), premium);
        manager.fundMutualPremium(mutualId, premium, duration);
    }
}
