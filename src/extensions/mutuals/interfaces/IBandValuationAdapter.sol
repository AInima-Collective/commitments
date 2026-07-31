// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title IBandValuationAdapter
/// @notice Minimal pricing surface for heterogeneous-mode Mutuals (ERC-COMMITMENTS-MUTUALS). Returns the
///         numeraire value of `amount` raw units of `token`. The concrete implementation MUST be
///         manipulation-resistant — a TWAP or an ERC-4626 redemption-rate read, NEVER a single-block
///         spot price — because the mutual's premium denominator weight (`premiumWeight`) is derived
///         from it, band-bounded and haircut, at join and at every permissionless `remark`.
/// @dev The manager only ever uses the result to set the PREMIUM weight (reward side); it is band-
///      clamped to `[floorBps, ceilBps] * value / 1e4` with `ceilBps <= 1e4` (no inflation above the
///      adapter value) and is monotone non-increasing across remarks (INV-P11). It NEVER feeds the
///      loss denominator (`creditedValue` / `totalShares` / Lambda / headroom), so a compromised
///      adapter cannot enlarge any claimant's loss recovery (INV-P12/INV-P6). The adapter impl is
///      out of scope for the core; only this interface is normative.
interface IBandValuationAdapter {
    /// @notice Manipulation-resistant numeraire value of `amount` raw units of `token`.
    function value(address token, uint256 amount) external view returns (uint256);
}
