// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";

/// @title TokenWeightingWeightEpochTest
/// @notice Locks in the plan-item-2 fix: weight retunes (`updateWeight`) are O(1)
///         and no longer scale with the staker set, while `getVotingPowerAt` /
///         `getTotalPowerAt` still resolve the weight epoch in force at the queried
///         block so historical values remain correct across a weight change.
contract TokenWeightingWeightEpochTest is Test {
    TokenWeighting internal tw;

    address internal provider = address(0xBB01);
    address internal governance = address(0x9011);

    bytes32 internal constant DENOM = keccak256("wstETH");
    bytes32 internal constant DENOM2 = keccak256("USDC");

    function setUp() public {
        address impl = address(new TokenWeighting());
        tw = TokenWeighting(Clones.clone(impl));
        tw.initialize(provider, governance);

        vm.prank(governance);
        tw.updateWeight(DENOM, 10000); // 1.0x

        // Start at a non-trivial block so before/after queries are meaningful.
        vm.roll(100);
    }

    /// @dev Seed `n` distinct stakers each with 1e18 in DENOM, advancing a block
    ///      between each so checkpoints get distinct keys.
    function _seedStakers(uint256 n) internal {
        for (uint256 i = 0; i < n; i++) {
            address s = address(uint160(0xC0FFEE + i));
            vm.roll(block.number + 1);
            vm.prank(provider);
            tw.stake(s, DENOM, 1e18);
        }
    }

    /// @notice CORE DoS FIX: the gas cost of a weight retune must NOT grow with the
    ///         number of stakers. We measure retune gas with a small staker set and a
    ///         large one; the delta must be negligible (the previous O(stakers × denoms)
    ///         loop made this delta grow linearly and eventually exceed the block gas
    ///         limit, permanently bricking weight governance).
    function test_retuneGasIsStakerCountIndependent() public {
        // --- Few stakers ---
        _seedStakers(5);
        vm.roll(block.number + 1);
        vm.prank(governance);
        uint256 g0 = gasleft();
        tw.updateWeight(DENOM, 9000);
        uint256 gasFew = g0 - gasleft();

        // --- Many additional stakers (10x more) ---
        _seedStakers(500);
        vm.roll(block.number + 1);
        vm.prank(governance);
        g0 = gasleft();
        tw.updateWeight(DENOM, 8000);
        uint256 gasMany = g0 - gasleft();

        emit log_named_uint("retune gas @ 5 stakers", gasFew);
        emit log_named_uint("retune gas @ 505 stakers", gasMany);

        // The DoS fix invariant: adding 500 stakers must NOT increase retune cost.
        // A weight retune touches a single per-denom weight checkpoint, so its cost is
        // independent of the staker set (any small residual delta comes from OZ
        // Checkpoints array append mechanics, not from iterating stakers). Under the
        // old O(stakers × denoms) loop, 500 extra stakers would have added millions of
        // gas (>5k each); the 50k slack here cleanly separates O(1) from O(n).
        assertLt(gasMany, gasFew + 50_000, "retune gas must not grow with staker count");
        assertLt(gasMany, 100_000, "retune must be O(1)");
    }

    /// @notice Even with a staker set far larger than the old O(n) loop could ever
    ///         have processed within the block gas limit, a retune still succeeds
    ///         cheaply. (The old loop at ~thousands of stakers would have reverted.)
    function test_retuneSucceedsWithHugeStakerSet() public {
        _seedStakers(2000);
        vm.roll(block.number + 1);

        vm.prank(governance);
        uint256 g0 = gasleft();
        tw.updateWeight(DENOM, 7777);
        uint256 used = g0 - gasleft();

        emit log_named_uint("retune gas @ 2000 stakers", used);
        // Comfortably under any block gas limit — O(1), not O(stakers).
        assertLt(used, 100_000, "retune must be O(1)");
    }

    /// @notice Historical correctness across a weight change: a query at a block
    ///         BEFORE the retune must use the OLD weight; a query AT/AFTER must use
    ///         the NEW weight. RAW stake is unchanged throughout.
    function test_getVotingPowerAt_resolvesWeightEpoch() public {
        address s = address(0xAAA1);

        vm.roll(block.number + 1);
        uint256 stakeBlock = block.number;
        vm.prank(provider);
        tw.stake(s, DENOM, 100e18); // power @ 1.0x = 100e18

        // Snapshot a couple of blocks under the OLD weight.
        vm.roll(stakeBlock + 5);
        uint256 oldEpochBlock = block.number;

        // Retune to 0.5x at a later block.
        vm.roll(stakeBlock + 10);
        uint256 retuneBlock = block.number;
        vm.prank(governance);
        tw.updateWeight(DENOM, 5000);

        vm.roll(retuneBlock + 5); // move on so all queries are historical

        // Before the retune: OLD weight (1.0x) → 100e18.
        assertEq(tw.getVotingPowerAt(s, oldEpochBlock), 100e18, "pre-retune uses old weight");
        assertEq(tw.getVotingPowerAt(s, stakeBlock), 100e18, "at stake block uses old weight");

        // At/after the retune: NEW weight (0.5x) → 50e18.
        assertEq(tw.getVotingPowerAt(s, retuneBlock), 50e18, "at retune block uses new weight");
        assertEq(tw.getVotingPowerAt(s, retuneBlock + 3), 50e18, "after retune uses new weight");

        // Before any stake: 0.
        assertEq(tw.getVotingPowerAt(s, stakeBlock - 1), 0, "no power before stake");

        // Total power tracks the same epoch resolution (single staker here).
        assertEq(tw.getTotalPowerAt(oldEpochBlock), 100e18, "total pre-retune old weight");
        assertEq(tw.getTotalPowerAt(retuneBlock), 50e18, "total at retune new weight");

        // Live reads reflect the current (new) weight.
        assertEq(tw.getVotingPower(s), 50e18, "live power uses current weight");
        assertEq(tw.getTotalPower(), 50e18, "live total uses current weight");
    }

    /// @notice Fuzz: for any stake/weight pair, historical power before a retune equals
    ///         stake*oldWeight and after equals stake*newWeight — i.e. voting-power
    ///         VALUES are unchanged by the cost-model refactor for a given weight set.
    function testFuzz_historicalValuesUnchangedAcrossRetune(uint96 amount, uint16 oldW, uint16 newW) public {
        amount = uint96(bound(amount, 1, type(uint96).max));
        uint256 oldWeight = bound(oldW, 1, 10000);
        uint256 newWeight = bound(newW, 1, 10000);

        address s = address(0xBEEF);

        vm.prank(governance);
        tw.updateWeight(DENOM2, oldWeight);

        vm.roll(block.number + 1);
        uint256 stakeBlock = block.number;
        vm.prank(provider);
        tw.stake(s, DENOM2, amount);

        vm.roll(block.number + 3);
        uint256 retuneBlock = block.number;
        vm.prank(governance);
        tw.updateWeight(DENOM2, newWeight);

        vm.roll(block.number + 3);

        assertEq(tw.getVotingPowerAt(s, stakeBlock), uint256(amount) * oldWeight / 10000, "old epoch value");
        assertEq(tw.getVotingPowerAt(s, retuneBlock), uint256(amount) * newWeight / 10000, "new epoch value");
        assertEq(tw.getTotalPowerAt(stakeBlock), uint256(amount) * oldWeight / 10000, "total old epoch");
        assertEq(tw.getTotalPowerAt(retuneBlock), uint256(amount) * newWeight / 10000, "total new epoch");
    }

    /// @notice Multi-denom historical totals: total power at a block equals the sum of
    ///         per-denom (rawTotalStake * epochWeight), recovered in O(denoms) without
    ///         iterating stakers.
    function test_multiDenomHistoricalTotal() public {
        vm.prank(governance);
        tw.updateWeight(DENOM2, 5000); // 0.5x

        // Two stakers across two denoms.
        vm.roll(block.number + 1);
        vm.prank(provider);
        tw.stake(address(0x1), DENOM, 100e18); // 1.0x
        vm.roll(block.number + 1);
        vm.prank(provider);
        tw.stake(address(0x2), DENOM2, 200e18); // 0.5x

        vm.roll(block.number + 1);
        uint256 snap = block.number;
        vm.roll(block.number + 5);

        // 100e18 * 1.0 + 200e18 * 0.5 = 200e18
        assertEq(tw.getTotalPowerAt(snap), 200e18, "multi-denom total at snapshot");
        assertEq(tw.getTotalPower(), 200e18, "multi-denom live total");
    }
}
