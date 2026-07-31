// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title DummyERC20 — standard-token model for the Certora scene
/// @notice Embodies the verification assumption stated in PROPERTIES.md: no
///         fee-on-transfer, no rebasing, no hooks. All IERC20 calls in the
///         scene DISPATCH here.
contract DummyERC20 {
    string public name = "Dummy";
    string public symbol = "DUM";
    uint8 public decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}
