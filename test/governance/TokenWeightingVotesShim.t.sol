// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";
import {TokenWeightingVotesShim} from "src/periphery/governance/TokenWeightingVotesShim.sol";
import {IVotingPowerSource} from "src/shared/interfaces/IVotingPowerSource.sol";

/// @notice Mock IVotingPowerSource used to test the shim without spinning up a full
///         TokenWeighting + mesh. For end-to-end fuzz coverage we use the real
///         TokenWeighting in the fuzz test below.
contract MockVotingPowerSource is IVotingPowerSource {
    mapping(address => uint256) public power;
    mapping(address => mapping(uint256 => uint256)) public pastPower;
    uint256 public total;
    mapping(uint256 => uint256) public pastTotal;

    function setPower(address who, uint256 amount) external {
        power[who] = amount;
    }

    function setPastPower(address who, uint256 blockNumber, uint256 amount) external {
        pastPower[who][blockNumber] = amount;
    }

    function setTotal(uint256 amount) external {
        total = amount;
    }

    function setPastTotal(uint256 blockNumber, uint256 amount) external {
        pastTotal[blockNumber] = amount;
    }

    function getVotingPower(address who) external view returns (uint256) {
        return power[who];
    }

    function getVotingPowerAt(address who, uint256 blockNumber) external view returns (uint256) {
        return pastPower[who][blockNumber];
    }

    function getTotalPower() external view returns (uint256) {
        return total;
    }

    function getTotalPowerAt(uint256 blockNumber) external view returns (uint256) {
        return pastTotal[blockNumber];
    }
}

contract TokenWeightingVotesShimTest is Test {
    MockVotingPowerSource internal mockSource;
    TokenWeightingVotesShim internal shim;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        mockSource = new MockVotingPowerSource();
        shim = new TokenWeightingVotesShim(mockSource);
    }

    // ============================================================
    // ERC-6372 (clock)
    // ============================================================

    function test_clock_returnsBlockNumber() public {
        vm.roll(1234);
        assertEq(shim.clock(), uint48(1234));
        vm.roll(987654);
        assertEq(shim.clock(), uint48(987654));
    }

    function test_CLOCK_MODE_returnsBlockNumberMode() public view {
        assertEq(shim.CLOCK_MODE(), "mode=blocknumber&from=default");
    }

    // ============================================================
    // Read path (used by Governor)
    // ============================================================

    function test_getVotes_passesThroughToSource() public {
        mockSource.setPower(alice, 100e18);
        assertEq(shim.getVotes(alice), 100e18);
        assertEq(shim.getVotes(bob), 0);
    }

    function test_getPastVotes_passesThroughAtBlock() public {
        mockSource.setPastPower(alice, 100, 42e18);
        mockSource.setPastPower(alice, 200, 99e18);
        assertEq(shim.getPastVotes(alice, 100), 42e18);
        assertEq(shim.getPastVotes(alice, 200), 99e18);
        assertEq(shim.getPastVotes(alice, 300), 0);
    }

    function test_getPastTotalSupply_passesThroughAtBlock() public {
        mockSource.setPastTotal(100, 1000e18);
        mockSource.setPastTotal(200, 5000e18);
        assertEq(shim.getPastTotalSupply(100), 1000e18);
        assertEq(shim.getPastTotalSupply(200), 5000e18);
    }

    function test_supportsZeroPower_noUnderflow() public view {
        assertEq(shim.getVotes(alice), 0);
        assertEq(shim.getPastVotes(alice, 100), 0);
        assertEq(shim.getPastTotalSupply(100), 0);
    }

    // ============================================================
    // Delegation surface (Governor never calls these)
    // ============================================================

    function test_delegates_returnsSelfDelegationIdentity() public view {
        assertEq(shim.delegates(alice), alice);
        assertEq(shim.delegates(bob), bob);
        assertEq(shim.delegates(address(0xdead)), address(0xdead));
    }

    function test_delegate_reverts() public {
        vm.expectRevert(TokenWeightingVotesShim.DelegationNotSupported.selector);
        shim.delegate(bob);
    }

    function test_delegateBySig_reverts() public {
        vm.expectRevert(TokenWeightingVotesShim.DelegationNotSupported.selector);
        shim.delegateBySig(bob, 0, 0, 0, bytes32(0), bytes32(0));
    }

    function test_source_isImmutable() public view {
        assertEq(address(shim.source()), address(mockSource));
    }

    // ============================================================
    // End-to-end fuzz: real TokenWeighting → shim agreement
    // ============================================================

    /// @dev Spins up a real TokenWeighting clone, stakes Alice, advances the chain,
    ///      and asserts every shim read matches the underlying source.
    function testFuzz_pastVotesMatchesSourceAt(uint96 stake_, uint8 blocksAhead_) public {
        uint256 stake = uint256(stake_);
        vm.assume(stake > 0);
        uint256 blocksAhead = uint256(blocksAhead_);

        address provider = address(0xCAFE);
        address gov = address(0xBEEF);

        address impl = address(new TokenWeighting());
        TokenWeighting tw = TokenWeighting(Clones.clone(impl));
        tw.initialize(provider, gov);

        bytes32 denom = keccak256("wstETH");

        vm.prank(gov);
        tw.updateWeight(denom, 10000); // 1.0x

        TokenWeightingVotesShim fuzzShim = new TokenWeightingVotesShim(tw);

        uint256 stakeBlock = block.number;
        vm.prank(provider);
        tw.stake(alice, denom, stake);

        // Advance the chain.
        vm.roll(block.number + blocksAhead);

        // Both source and shim should agree at the stake block.
        assertEq(fuzzShim.getPastVotes(alice, stakeBlock), tw.getVotingPowerAt(alice, stakeBlock));
        assertEq(fuzzShim.getPastTotalSupply(stakeBlock), tw.getTotalPowerAt(stakeBlock));

        // And at the current block.
        assertEq(fuzzShim.getVotes(alice), tw.getVotingPower(alice));
    }
}
