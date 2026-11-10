// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {
    IDistributionStrategy,
    TokenMovement,
    DistributeContext,
    LifecycleContext,
    ForfeitContext
} from "src/core/interfaces/IDistributionStrategy.sol";

/// @title StrategyBase
/// @notice Shared scaffolding for distribution strategies: the manager binding, the manager-only
///         gate, the common errors, a measured pull, and no-op lifecycle hooks a strategy
///         overrides only where it moves value.
/// @dev The no-op hooks add no external call and no storage read, so they cost nothing under the
///      manager's gas-capped hook calls.
abstract contract StrategyBase is IDistributionStrategy {
    using SafeERC20 for IERC20;

    /// @notice The manager whose hooks this strategy serves. One deployment per manager.
    address public immutable manager;

    error OnlyManager();
    error NotBound();
    error NotAuthorized();
    error NothingToClaim();
    error ZeroAmount();

    constructor(address manager_) {
        manager = manager_;
    }

    modifier onlyManager() {
        if (msg.sender != manager) revert OnlyManager();
        _;
    }

    /// @inheritdoc IDistributionStrategy
    function distribute(DistributeContext calldata) external virtual onlyManager returns (TokenMovement[] memory) {
        return new TokenMovement[](0);
    }

    /// @inheritdoc IDistributionStrategy
    function onCommitmentReleased(LifecycleContext calldata)
        external
        virtual
        onlyManager
        returns (TokenMovement[] memory)
    {
        return new TokenMovement[](0);
    }

    /// @inheritdoc IDistributionStrategy
    function onCommitmentForfeited(ForfeitContext calldata)
        external
        virtual
        onlyManager
        returns (TokenMovement[] memory)
    {
        return new TokenMovement[](0);
    }

    /// @dev Pull `amount` of `token` from `msg.sender` and return the measured balance delta, so a
    ///      fee-on-transfer token credits only what arrived (the rule `manager.deposit` follows).
    ///      Reverts `ZeroAmount` when nothing arrives.
    function _pullMeasured(IERC20 token, uint256 amount) internal returns (uint256 received) {
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        received = token.balanceOf(address(this)) - balanceBefore;
        if (received == 0) revert ZeroAmount();
    }
}
