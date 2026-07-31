// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {PremiumSkimStrategy} from "src/periphery/vaults/strategies/PremiumSkimStrategy.sol";

/// @title SkimmingMockStrategy
/// @notice Dev/demo concrete of `PremiumSkimStrategy`: a `MockStrategy`-style reported-assets
///         ledger with yield/loss simulation, plus the skim leg. Used by the anvil seed and the
///         admin Risk tab for the underwritten agent vault (cvaDAI).
/// @dev `simulateYield` is ledger-only (no backing tokens): a later `skim()` reverts on the fee
///      transfer because the contract holds nothing to pay it with — intentionally loud. Drive
///      demo yield with {simulateBackedYield}, which pulls real underlying from the caller so
///      the skim is token-backed.
contract SkimmingMockStrategy is PremiumSkimStrategy {
    using SafeERC20 for IERC20;

    uint256 private _reportedAssets;
    uint256 private _maxDeposit = type(uint256).max;

    constructor(
        address asset_,
        address vault_,
        address operator_,
        address premiumRecipient_,
        uint16 skimBps_,
        uint16 operatorFeeBps_
    ) PremiumSkimStrategy(asset_, vault_, operator_, premiumRecipient_, skimBps_, operatorFeeBps_) {}

    function maxDeposit() external view override returns (uint256) {
        return _maxDeposit;
    }

    function _managedAssets() internal view override returns (uint256) {
        return _reportedAssets;
    }

    function _afterDeposit(uint256 assets) internal override {
        _reportedAssets += assets;
    }

    function _beforeWithdraw(uint256 assets) internal override {
        _reportedAssets -= assets;
    }

    function _realizeSkim(uint256 fee) internal override {
        _reportedAssets -= fee;
    }

    /// @dev Test helper: configure the maxDeposit return value.
    function setMaxDeposit(uint256 val) external {
        _maxDeposit = val;
    }

    /// @dev Test helper: simulate yield by increasing reported assets (UNBACKED — see contract
    ///      NatSpec; a following skim reverts on transfer).
    function simulateYield(uint256 amount) external {
        _reportedAssets += amount;
    }

    /// @dev Demo helper: simulate yield backed by real underlying pulled from the caller, so
    ///      skims and withdrawals stay token-backed.
    function simulateBackedYield(uint256 amount) external {
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        _reportedAssets += amount;
    }

    /// @dev Test helper: simulate loss by decreasing reported assets.
    function simulateLoss(uint256 amount) external {
        _reportedAssets -= amount;
    }
}
