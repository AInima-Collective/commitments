// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IYieldStrategy} from "src/periphery/vaults/interfaces/IYieldStrategy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title MockStrategy
/// @notice Test double for IYieldStrategy with configurable reported assets and yield/loss simulation.
contract MockStrategy is IYieldStrategy {
    using SafeERC20 for IERC20;

    address public override asset;
    address public vault;
    uint256 private _reportedAssets;
    uint256 private _maxDeposit = type(uint256).max;

    constructor(address asset_, address vault_) {
        asset = asset_;
        vault = vault_;
    }

    function deposit(uint256 assets) external override {
        _reportedAssets += assets;
    }

    function withdraw(uint256 assets) external override {
        _reportedAssets -= assets;
        IERC20(asset).safeTransfer(vault, assets);
    }

    function totalAssets() external view override returns (uint256) {
        return _reportedAssets;
    }

    function maxDeposit() external view override returns (uint256) {
        return _maxDeposit;
    }

    /// @dev Test helper: configure the maxDeposit return value
    function setMaxDeposit(uint256 val) external {
        _maxDeposit = val;
    }

    /// @dev Test helper: simulate yield by increasing reported assets
    function simulateYield(uint256 amount) external {
        _reportedAssets += amount;
    }

    /// @dev Test helper: simulate loss by decreasing reported assets
    function simulateLoss(uint256 amount) external {
        _reportedAssets -= amount;
    }
}
