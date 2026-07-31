// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IMerkleSnapshot} from "src/extensions/rewards/interfaces/IMerkleSnapshot.sol";

/// @title ICommitmentsRewardsCoordinator
/// @notice Per-service cumulative-merkle reward distributor. Binds to one
///         `MerkleSnapshot` (immutable post-init). Receives token deposits, holds
///         them, and pays out earner-claimed amounts against an active root.
///         Sibling standard to ERC-COMMITMENTS — never reads commitment state
///         on-chain (free-form leaves), so the coordinator works with
///         non-AVS services (frontend rewards, ecosystem grants) just as well as
///         with operator-set services.
/// @dev Locked decisions reflected in this interface:
///         - D1 per-service deployment (factory-spawned)
///         - D5 multi-token leaves: `(earner, token, cumulativeAmount)`
///         - D7 no token cap (omitted from interface)
///         - D8 off-chain forfeit interaction (no forfeit awareness here)
///         - D9 off-chain operator commission
///         - D10 zero protocol fee, immutable
///         - D11 service-only `disableRoot` (lives on the snapshot, not here)
///         - D12 on-chain monotonicity check at claim time (`CumulativeRegression`)
///         - Q2 revert with `NoOp` on zero-delta re-claim
///         - Q3 UUPS-upgradeable; service is the upgrade authority
/// @dev The staged-updater swap surface (`stageUpdater` / `activateUpdater` /
///         `cancelStagedUpdater` / `activeUpdater` / `pendingUpdater`) now lives
///         on `IMerkleSnapshot`, not here — see that interface.
interface ICommitmentsRewardsCoordinator {
    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event RewardsDeposited(address indexed depositor, address indexed token, uint256 amount);

    event RewardsClaimed(
        bytes32 indexed rootId,
        address indexed earner,
        address indexed token,
        uint256 amountPaidOut,
        uint256 cumulativeAfter
    );

    /// @notice Emitted when the service freezes claim processing (emergency pause).
    event ClaimsFrozenSet(address indexed by);
    /// @notice Emitted when the service lifts the claim freeze.
    event ClaimsUnfrozen(address indexed by);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAmount();
    error ZeroAddress();
    error NotService();
    error RootDisabled();
    error RootNotActive();
    error InvalidProof();
    error CumulativeRegression(); // D12 enforcement
    error NoOp(); // zero-delta re-claim
    error InsufficientBalance();
    error AlreadyInitialized();
    error ClaimsFrozen(); // emergency pause engaged
    error NotFrozen();
    error AlreadyFrozen();

    // -------------------------------------------------------------------------
    // Reward flow
    // -------------------------------------------------------------------------

    /// @notice Pull `amount` of `token` from the caller into the coordinator. The
    ///         caller is the funder; nothing about the funder is recorded beyond
    ///         the event. `safeTransferFrom` semantics; reverts on failure.
    /// @dev Funding semantics are off-chain : the coordinator does NOT
    ///         track per-root obligations. The updater is responsible for not
    ///         over-promising; an under-funded coordinator reverts payouts with
    ///         `InsufficientBalance` rather than fail-closed at submit.
    function depositRewards(address token, uint256 amount) external;

    /// @notice Claim cumulative rewards for `token` against `rootId`. Caller must
    ///         be the leaf's earner (no claim-on-behalf).
    /// @param rootId The active root to claim against.
    /// @param token The reward token.
    /// @param cumulativeAmount The leaf's cumulative-amount field. Reverts
    ///         `CumulativeRegression` if `cumulativeAmount < claimed[caller][token]`.
    /// @param proof Merkle proof for `keccak256(abi.encode(caller, token, cumulativeAmount))`.
    /// @return amountPaidOut Equals `cumulativeAmount - claimed[caller][token]`.
    ///         Reverts `NoOp` if zero. Reverts `InsufficientBalance` if the
    ///         coordinator does not hold enough of `token`.
    function processClaim(bytes32 rootId, address token, uint256 cumulativeAmount, bytes32[] calldata proof)
        external
        returns (uint256 amountPaidOut);

    // -------------------------------------------------------------------------
    // Emergency freeze
    // -------------------------------------------------------------------------

    /// @notice Freeze claim processing. Service-only. While frozen, `processClaim`
    ///         reverts `ClaimsFrozen`. This is the on-chain recourse against a
    ///         fraudulent root that has already activated (and so can no longer be
    ///         `disableRoot`'d). Reverts `AlreadyFrozen` if already engaged.
    function freeze() external;

    /// @notice Lift the claim freeze. Service-only. Reverts `NotFrozen` if not
    ///         currently frozen.
    function unfreeze() external;

    /// @notice Whether claim processing is currently frozen.
    function frozen() external view returns (bool);

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Cumulative amount of `token` already paid out to `earner` across
    ///         all roots ever processed.
    function claimed(address earner, address token) external view returns (uint256);

    /// @notice Bound merkle-snapshot contract.
    function snapshot() external view returns (IMerkleSnapshot);

    /// @notice Service controller. Identical to `snapshot().service()`.
    function service() external view returns (address);
}
