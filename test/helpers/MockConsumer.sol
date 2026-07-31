// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IFanIn} from "src/extensions/mesh/interfaces/IFanIn.sol";

/// @notice Mock consumer that records interactions with the FanInNode for test assertions
contract MockConsumer {
    struct ReleaseCall {
        bytes32 denomOut;
        uint256 amount;
    }

    ReleaseCall[] public releaseCalls;

    /// @notice Record a releaseStake call and forward it to the fan-in node.
    /// @dev Phase 20.7: provider is no longer a caller-supplied param; FanInNode
    ///      derives it from `outputSources[denomOut]`.
    function releaseStake(address fanIn, bytes32 denomOut, uint256 amount) external {
        releaseCalls.push(ReleaseCall({denomOut: denomOut, amount: amount}));
        IFanIn(fanIn).releaseStake(denomOut, amount);
    }

    /// @notice Number of releaseStake calls recorded
    function releaseCallCount() external view returns (uint256) {
        return releaseCalls.length;
    }
}
