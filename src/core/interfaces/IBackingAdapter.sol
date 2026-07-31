// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title IBackingAdapter
/// @notice Stateless, view-only descriptor for a category of backing token (ERC-COMMITMENTS Part B).
///         One adapter serves every token of its category; the same adapter is reusable across managers.
/// @dev Adapters are untrusted inputs, not protocol authorities: the manager interacts with them
///      exclusively through view reads, and the movement-validation pipeline (ERC §D.5 / INV-4)
///      bounds what any adapter-derived computation can move. Adapters MUST NOT custody tokens,
///      mutate state, or hold any authorization role.
interface IBackingAdapter {
    /// @notice Current value-per-unit index for `token`, scaled to a 1e18 base.
    ///         For tokens with no internal appreciation (raw ERC-20s) this is the constant 1e18.
    ///         For appreciating receipts (ERC-4626 shares, LSTs) it is the venue's
    ///         units-to-underlying conversion at 1e18 scale.
    /// @param token The backing token to price.
    /// @return The 1e18-scaled value-per-unit index.
    function indexNow(address token) external view returns (uint256);

    /// @notice The denomination in which `token`'s units are most meaningfully priced
    ///         (e.g. the underlying asset of an ERC-4626 vault).
    /// @dev INFORMATIONAL ONLY (ERC §B.3). The manager never unwraps, redeems, or converts
    ///      backing on any payout path; all payouts deliver raw backing-token units. This view
    ///      exists so UIs and indexers can price what raw units mean.
    /// @param token The backing token to describe.
    /// @return The token address payouts should be priced in.
    function payoutDenomination(address token) external view returns (address);
}
