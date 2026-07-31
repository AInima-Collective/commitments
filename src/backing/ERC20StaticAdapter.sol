// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IBackingAdapter} from "src/core/interfaces/IBackingAdapter.sol";

/// @title ERC20StaticAdapter
/// @notice Backing adapter for plain ERC-20 tokens with no internal appreciation
///         (ERC-COMMITMENTS §B.4). The index is the constant 1e18 and payouts are
///         denominated in the token itself.
/// @dev Stateless and view-only per ERC §B.2. One deployment serves every plain ERC-20.
contract ERC20StaticAdapter is IBackingAdapter {
    /// @inheritdoc IBackingAdapter
    function indexNow(address) external pure returns (uint256) {
        return 1e18;
    }

    /// @inheritdoc IBackingAdapter
    function payoutDenomination(address token) external pure returns (address) {
        return token;
    }
}
