// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IYieldStrategy} from "src/periphery/vaults/interfaces/IYieldStrategy.sol";

/// @title IdleStrategy
/// @notice The reference `IYieldStrategy`: a minimal, no-yield strategy that custodies the vault's
///         asset and earns nothing. It is the canonical template for authoring a real strategy and
///         a null-object baseline — deploy it when the strategy slot should be filled with a
///         known-good, audited contract before a live venue is wired.
/// @dev A `CommitmentsVault` with `yieldStrategy == address(0)` is *already* idle: it holds assets
///      directly and `totalAssets()` is its own balance. `IdleStrategy` differs only in that it
///      exercises the full deposit → strategy → withdraw plumbing with a deployed contract, so the
///      binding path is demonstrable and testable without an external protocol. Yield stays zero.
///
///      Custody model (matches the vault's call sequence, `CommitmentsVault._deposit`/`_withdraw`):
///      - The vault `safeTransfer`s assets to this contract *before* calling {deposit}, so
///        {deposit} is a no-op receiver — the tokens have already landed.
///      - {withdraw} transfers the requested assets back to the vault.
///      - {totalAssets} reports this contract's live balance, so it is donation-aware and always
///        reconciles with what {withdraw} can actually pay.
///
///      Only the bound vault may move funds: {deposit} and {withdraw} are `onlyVault`. There is no
///      admin, no upgrade, and no other role — the vault's own access control is the whole trust
///      surface.
contract IdleStrategy is IYieldStrategy {
    using SafeERC20 for IERC20;

    /// @inheritdoc IYieldStrategy
    address public immutable override asset;
    /// @inheritdoc IYieldStrategy
    address public immutable override vault;

    /// @notice Reverts a fund-moving call from anyone other than the bound vault.
    error OnlyVault();

    /// @param asset_ The ERC-20 this strategy custodies; MUST equal the binding vault's `asset()`.
    /// @param vault_ The `CommitmentsVault` proxy this strategy is bound to; the vault validates
    ///        `vault() == address(this-vault)` in `setYieldStrategy` to prevent cross-vault binding.
    constructor(address asset_, address vault_) {
        asset = asset_;
        vault = vault_;
    }

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    /// @inheritdoc IYieldStrategy
    /// @dev No-op receiver: the vault has already transferred `assets` here. Idle capital earns
    ///      nothing, so there is nothing to deploy. Gated to the vault for symmetry with {withdraw}.
    function deposit(uint256 assets) external override onlyVault {}

    /// @inheritdoc IYieldStrategy
    /// @dev Returns exactly `assets` to the vault. Never fails on accounting drift because
    ///      {totalAssets} is the live balance rather than an internal counter.
    function withdraw(uint256 assets) external override onlyVault {
        IERC20(asset).safeTransfer(vault, assets);
    }

    /// @inheritdoc IYieldStrategy
    /// @dev The live custody balance. Idle: this only ever changes by vault deposits/withdrawals
    ///      (and any direct donation, which is harmlessly withdrawable to the vault).
    function totalAssets() external view override returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }

    /// @inheritdoc IYieldStrategy
    /// @dev Unbounded: an idle holder has no venue cap.
    function maxDeposit() external pure override returns (uint256) {
        return type(uint256).max;
    }
}
