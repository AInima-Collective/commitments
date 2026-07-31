// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IServiceManager} from "src/extensions/services/interfaces/IServiceManager.sol";
import {IServiceHandler} from "src/extensions/services/interfaces/IServiceHandler.sol";

/// @notice Minimal mock that implements `IServiceManager.validate` either
///         pass or fail, so we can exercise the adapter's quorum-validation
///         dependency without a full operator-service stack.
contract MockServiceManager is IServiceManager {
    bool public failNext;

    function setFailNext(bool v) external {
        failNext = v;
    }

    function validate(IServiceHandler.Envelope calldata, IServiceHandler.SignatureData calldata) external view {
        if (failNext) revert InvalidSignature();
    }

    function getOperatorWeight(address) external pure returns (uint256) {
        return 0;
    }

    function getServiceURI() external pure returns (string memory) {
        return "";
    }

    function setServiceURI(string calldata) external {}

    function getLatestOperatorForSigningKey(address) external pure returns (address) {
        return address(0);
    }

    function getStakeRegistry() external pure returns (address) {
        return address(0);
    }
}
