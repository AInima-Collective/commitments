// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC5805} from "@openzeppelin/contracts/interfaces/IERC5805.sol";
import {IERC6372} from "@openzeppelin/contracts/interfaces/IERC6372.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

import {IVotingPowerSource} from "src/shared/interfaces/IVotingPowerSource.sol";

/// @title TokenWeightingVotesShim
/// @notice Stateless adapter that exposes an IVotingPowerSource as IERC5805 so it
///         can drive an OpenZeppelin Governor without forcing the underlying source
///         to implement the full IVotes delegation surface.
///
///         The Governor + GovernorVotes + GovernorVotesQuorumFraction modules only
///         ever read four IERC5805 methods: clock(), CLOCK_MODE(), getPastVotes,
///         getPastTotalSupply. delegate(), delegates() and delegateBySig() are part
///         of the IVotes UX surface and are never invoked by the Governor itself.
///         This shim forwards the four read methods to IVotingPowerSource and
///         reverts the delegation methods (with a self-delegation identity for
///         delegates() so Tally and other tooling render correctly).
///
///         Block-based clock — TokenWeighting checkpoints are keyed by block.number
///         (OZ Checkpoints.Trace256), so clock() returns block.number (cast to
///         uint48 per ERC-6372) and CLOCK_MODE returns "mode=blocknumber".
///
///         The source is immutable. A Governor stores its token in initializer
///         storage, so upgrading the Governor implementation does not re-bind it;
///         using a different source means deploying a new DAO.
contract TokenWeightingVotesShim is IERC5805 {
    /// @notice The voting-power source this shim wraps. Immutable by design.
    IVotingPowerSource public immutable source;

    /// @notice Thrown when delegate() or delegateBySig() is called. Delegation is
    ///         handled by the underlying voting-power source, not by this shim.
    error DelegationNotSupported();

    constructor(IVotingPowerSource source_) {
        source = source_;
    }

    // ============================================================
    // IERC6372 — clock
    // ============================================================

    /// @inheritdoc IERC6372
    function clock() external view returns (uint48) {
        return uint48(block.number);
    }

    /// @inheritdoc IERC6372
    function CLOCK_MODE() external pure returns (string memory) {
        return "mode=blocknumber&from=default";
    }

    // ============================================================
    // IVotes — read path (called by Governor)
    // ============================================================

    /// @inheritdoc IVotes
    function getVotes(address account) external view returns (uint256) {
        return source.getVotingPower(account);
    }

    /// @inheritdoc IVotes
    function getPastVotes(address account, uint256 timepoint) external view returns (uint256) {
        return source.getVotingPowerAt(account, timepoint);
    }

    /// @inheritdoc IVotes
    function getPastTotalSupply(uint256 timepoint) external view returns (uint256) {
        return source.getTotalPowerAt(timepoint);
    }

    // ============================================================
    // IVotes — delegation surface (NOT called by Governor)
    // ============================================================

    /// @inheritdoc IVotes
    /// @dev Self-delegation identity. There is no delegation in this shim — voting
    ///      power is read directly from the underlying source — but tooling
    ///      (e.g. Tally) calls this view and expects a non-zero answer to render.
    function delegates(address account) external pure returns (address) {
        return account;
    }

    /// @inheritdoc IVotes
    /// @dev Reverts. Delegation is not supported by this shim.
    function delegate(address) external pure {
        revert DelegationNotSupported();
    }

    /// @inheritdoc IVotes
    /// @dev Reverts. Delegation is not supported by this shim.
    function delegateBySig(address, uint256, uint256, uint8, bytes32, bytes32) external pure {
        revert DelegationNotSupported();
    }
}
