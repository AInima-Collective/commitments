// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {IBackingAdapter} from "src/core/interfaces/IBackingAdapter.sol";

/// @title ERC4626Adapter
/// @notice Backing adapter for any ERC-4626 vault share (ERC-COMMITMENTS §B.4). The index is
///         the vault's units-to-underlying conversion at 1e18 scale; payouts are most
///         meaningfully priced in the vault's underlying asset.
/// @dev Stateless and view-only per ERC §B.2. One deployment serves every ERC-4626 vault.
///      The adapter is an untrusted input: a donation-pumped or lying vault can distort what a
///      strategy computes, but the manager's movement caps (ERC §D.5 / INV-4) bound what any
///      computation can move.
contract ERC4626Adapter is IBackingAdapter {
    /// @inheritdoc IBackingAdapter
    function indexNow(address token) external view returns (uint256) {
        return IERC4626(token).convertToAssets(1e18);
    }

    /// @inheritdoc IBackingAdapter
    function payoutDenomination(address token) external view returns (address) {
        return IERC4626(token).asset();
    }
}
