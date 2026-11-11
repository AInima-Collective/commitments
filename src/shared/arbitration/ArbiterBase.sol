// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IArbiter} from "src/shared/arbitration/interfaces/IArbiter.sol";
import {ICommitmentManager} from "src/core/interfaces/ICommitmentManager.sol";

/// @title ArbiterBase
/// @notice Shared scaffolding for arbiters: the immutable manager binding, the {IArbiter}
///         introspection that does not vary, and the errors and predicate the forfeit-driving
///         arbiters share.
abstract contract ArbiterBase is IArbiter {
    /// @notice CommitmentManager this arbiter dispatches to. Immutable, so a commitment that names
    ///         this arbiter can rely on the manager binding never changing.
    ICommitmentManager public immutable manager;

    error ZeroAddress();
    error WrongArbiter(address expected, address actual);
    error CommitmentNotActive(uint256 commitmentId);
    error ChallengeWindowTooShort(uint64 required, uint64 actual);

    constructor(address manager_) {
        if (manager_ == address(0)) revert ZeroAddress();
        manager = ICommitmentManager(manager_);
    }

    /// @inheritdoc IArbiter
    function commitmentManager() external view returns (address) {
        return address(manager);
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IArbiter).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    /// @dev A forfeit proposal that was initiated and is neither executed nor cancelled.
    function _forfeitProposalActive(ICommitmentManager.ForfeitProposal memory p) internal pure returns (bool) {
        return p.initiatedAt != 0 && !p.executed && !p.cancelled;
    }
}
