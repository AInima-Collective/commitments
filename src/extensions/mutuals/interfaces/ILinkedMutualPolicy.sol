// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title ILinkedMutualPolicy
/// @notice Read/write surface of the LinkedMutualPolicy, factored into an interface so the
///         PremiumScheduler (reads `getActiveNotionalSold`), the OptimisticMutualArbiter (reads
///         `getCoverBinding` to snapshot a policy into a loss claim), and the vault periphery can
///         reference the policy without importing the concrete contract (avoids a deploy-ordering import cycle).
interface ILinkedMutualPolicy {
    /// @notice A policyholder's bound cover against a mutual: how much notional was sold, when the
    ///         cover lapses, who bought it, and the premium that funded the matching `Pi` stream.
    /// @dev `active` flips false on `expireBinding` once `now >= expiry`, decaying utilization.
    struct CoverBinding {
        uint256 mutualId;
        uint256 notional;
        uint64 expiry;
        address policyholder;
        uint256 premiumPaid;
        bool active;
    }

    /// @notice Atomically price, fund, and record cover against a mutual's premium stream.
    function bindCover(uint256 mutualId, uint256 notional, uint64 duration) external returns (uint256 bindingId);

    /// @notice Fund the existing `Pi` stream with a standby reservation fee (no notional recorded).
    /// @return premiumPaid the numeraire pulled from the caller and streamed
    function fundStandby(uint256 mutualId, uint64 duration) external returns (uint256 premiumPaid);

    /// @notice Permissionlessly lapse an expired binding so its notional leaves utilization.
    function expireBinding(uint256 bindingId) external;

    /// @notice The recorded cover binding for `bindingId` (for arbiter auditability snapshots).
    function getCoverBinding(uint256 bindingId) external view returns (CoverBinding memory);

    /// @notice Sum of ACTIVE bindings' notional for `mutualId` (the utilization numerator).
    function getActiveNotionalSold(uint256 mutualId) external view returns (uint256);
}
