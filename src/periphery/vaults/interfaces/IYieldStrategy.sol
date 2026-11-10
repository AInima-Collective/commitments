// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title IYieldStrategy
/// @notice Pluggable yield sink for `CommitmentsVault`. A strategy custodies the vault's idle
///         assets and reports their current value. The custody handshake is a **push** model and
///         every mutating call is **vault-only** — see the per-function requirements below.
interface IYieldStrategy {
    /// @notice Take `assets` of the underlying into the strategy. PUSH pattern: the vault has
    ///         ALREADY transferred `assets` to this strategy before calling; implementations MUST
    ///         NOT `transferFrom` the vault. MUST be callable only by the bound `vault()`.
    function deposit(uint256 assets) external;

    /// @notice Return `assets` of the underlying to the vault. Implementations MUST transfer exactly
    ///         `assets` to `msg.sender` (the vault) before returning, or the vault's withdraw reverts.
    ///         MUST be callable only by the bound `vault()`.
    function withdraw(uint256 assets) external;

    /// @notice Current value of everything this strategy holds for the vault, denominated in the
    ///         underlying. MUST include accrued/in-flight value and MUST reconcile with what
    ///         `withdraw` can pay, so the vault's share price cannot jump or become unbacked.
    function totalAssets() external view returns (uint256);

    /// @notice The underlying asset. MUST equal the vault's asset.
    function asset() external view returns (address);

    /// @notice Maximum additional assets the strategy can currently accept (`type(uint256).max` if
    ///         unbounded). The vault mirrors this into `maxDeposit`/`maxMint` so deposits/mints that
    ///         would exceed a strategy cap revert at the ERC-4626 boundary rather than deep inside.
    function maxDeposit() external view returns (uint256);

    /// @notice The vault address this strategy is bound to. The vault uses this to
    ///         validate that a strategy passed to `setYieldStrategy` was constructed for
    ///         this specific vault — guards against accidental cross-vault binding.
    function vault() external view returns (address);
}
