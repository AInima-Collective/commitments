// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {IBackingAdapter} from "src/core/interfaces/IBackingAdapter.sol";
import {IVotingPowerSource} from "src/shared/interfaces/IVotingPowerSource.sol";

/// @dev Settable-index adapter for suites that need backing appreciation
///      (premium accrual through `IndexAppreciationYield`).
contract MockIndexAdapter is IBackingAdapter {
    uint256 public index = 1e18;

    function setIndex(uint256 v) external {
        index = v;
    }

    function indexNow(address) external view returns (uint256) {
        return index;
    }

    function payoutDenomination(address token) external pure returns (address) {
        return token;
    }
}

/// @dev Fee-on-transfer mock: skims `feeBps` to `0xdead` on every transfer, so the recipient
///      receives strictly less than `value`. Proves the measured-delta rule (ERC §A.2).
contract FeeOnTransferERC20 is ERC20 {
    uint16 public feeBps;

    constructor(uint16 feeBps_) ERC20("Fee", "FEE") {
        feeBps = feeBps_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = (value * feeBps) / 10_000;
            super._update(from, address(0xdead), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}

/// @dev Minimal eligibility oracle: tracks which addresses are operators.
contract MockEligibility {
    mapping(address => bool) public ok;

    function setOperator(address op, bool v) external {
        ok[op] = v;
    }

    function isOperator(address op) external view returns (bool) {
        return ok[op];
    }
}

/// @dev Voting-power source with settable live power (the total follows it). Historical queries
///      return the live value unless a snapshot was set at that block.
contract MockVotingPowerSource is IVotingPowerSource {
    mapping(address => uint256) public power;
    mapping(address => mapping(uint256 => uint256)) public powerAt;
    uint256 public total;
    mapping(uint256 => uint256) public totalAt;

    function setPower(address who, uint256 v) external {
        uint256 old = power[who];
        power[who] = v;
        total = total + v - old;
    }

    /// @dev Set a historical snapshot; useful when a test needs to validate a
    ///      past reference block without advancing chain state.
    function setPowerAt(address who, uint256 blockNumber, uint256 v) external {
        powerAt[who][blockNumber] = v;
    }

    function setTotalAt(uint256 blockNumber, uint256 v) external {
        totalAt[blockNumber] = v;
    }

    function getVotingPower(address who) external view returns (uint256) {
        return power[who];
    }

    function getVotingPowerAt(address who, uint256 blockNumber) external view returns (uint256) {
        uint256 snapshot = powerAt[who][blockNumber];
        return snapshot == 0 ? power[who] : snapshot;
    }

    function getTotalPower() external view returns (uint256) {
        return total;
    }

    function getTotalPowerAt(uint256 blockNumber) external view returns (uint256) {
        uint256 snapshot = totalAt[blockNumber];
        return snapshot == 0 ? total : snapshot;
    }
}
