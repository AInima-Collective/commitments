// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title MeasuredPull
/// @notice The one measured-delta pull, shared by the manager's custody libraries and the
///         distribution strategies.
library MeasuredPull {
    using SafeERC20 for IERC20;

    /// @notice Pull `amount` of `token` from `msg.sender` into this contract and return the
    ///         measured balance delta, so a fee-on-transfer token credits only what arrived.
    ///         Rebasing tokens are not supported. Callers reject a zero receipt with their own
    ///         `ZeroAmount()`, so no second copy of the error lands in their ABI.
    function pull(address token, uint256 amount) internal returns (uint256 received) {
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        received = IERC20(token).balanceOf(address(this)) - before;
    }
}
