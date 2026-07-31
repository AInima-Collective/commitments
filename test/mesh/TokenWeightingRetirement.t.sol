// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {TokenWeighting} from "src/extensions/mesh/TokenWeighting.sol";
import {ITokenWeighting} from "src/extensions/mesh/interfaces/ITokenWeighting.sol";

/// @title TokenWeightingRetirementTest
/// @notice Locks the denom-retirement path (#95): a MAX_DENOMS cap that bounds the
///         O(denoms) voting-power queries, purge of never-staked denoms, weight-0
///         retirement of staked denoms, and — the load-bearing guarantee — that
///         retirement never changes a historical `getVotingPowerAt` / `getTotalPowerAt`.
contract TokenWeightingRetirementTest is Test {
    TokenWeighting internal tw;

    address internal provider = address(0xBB01);
    address internal governance = address(0x9011);
    address internal staker = address(0x57A0);

    bytes32 internal constant A = keccak256("A");
    bytes32 internal constant B = keccak256("B");

    function setUp() public {
        address impl = address(new TokenWeighting());
        tw = TokenWeighting(Clones.clone(impl));
        tw.initialize(provider, governance);
    }

    function _updateWeight(bytes32 denom, uint256 w) internal {
        vm.roll(block.number + 1);
        vm.prank(governance);
        tw.updateWeight(denom, w);
    }

    function _stake(bytes32 denom, uint256 amount) internal {
        vm.roll(block.number + 1);
        vm.prank(provider);
        tw.stake(staker, denom, amount);
    }

    // ---- Purge (never-staked) ----------------------------------------------

    function test_retire_neverStaked_purgesAndReclaimsSlot() public {
        _updateWeight(A, 10_000);
        assertEq(tw.denomCount(), 1, "registered");

        vm.roll(block.number + 1);
        vm.expectEmit(true, false, false, false, address(tw));
        emit ITokenWeighting.DenomPurged(A);
        vm.prank(governance);
        tw.retireDenom(A);

        assertEq(tw.denomCount(), 0, "purged: slot reclaimed");
        assertFalse(tw.isDenomRetired(A), "purged denom carries no retired flag");
        assertEq(tw.weights(A), 0, "live weight cleared");

        // Re-addable from scratch.
        _updateWeight(A, 5_000);
        assertEq(tw.denomCount(), 1, "re-registered");
        assertEq(tw.weights(A), 5_000, "fresh weight");
    }

    // ---- Weight-0 retirement (staked) + HISTORY PRESERVATION ----------------

    function test_retire_staked_isInert_andPreservesHistory() public {
        _updateWeight(A, 10_000); // 1.0x
        _stake(A, 100e18); // power = 100e18

        vm.roll(block.number + 1);
        uint256 snapBlock = block.number;
        uint256 histPower = tw.getVotingPowerAt(staker, snapBlock);
        uint256 histTotal = tw.getTotalPowerAt(snapBlock);
        assertEq(histPower, 100e18, "power before retirement");
        assertEq(histTotal, 100e18, "total before retirement");

        // Retire (has stake history => inert weight-0, NOT purged).
        vm.roll(block.number + 5);
        vm.expectEmit(true, false, false, true, address(tw));
        emit ITokenWeighting.DenomRetired(A, 10_000);
        vm.prank(governance);
        tw.retireDenom(A);

        assertTrue(tw.isDenomRetired(A), "marked retired");
        assertEq(tw.denomCount(), 1, "kept in the iterated set for history");

        // HISTORY UNCHANGED at the pre-retirement block.
        assertEq(tw.getVotingPowerAt(staker, snapBlock), histPower, "historical power unchanged by retirement");
        assertEq(tw.getTotalPowerAt(snapBlock), histTotal, "historical total unchanged by retirement");

        // Contributes zero from the retirement block onward (live + at-block).
        vm.roll(block.number + 1);
        assertEq(tw.getVotingPower(staker), 0, "live power zeroed");
        assertEq(tw.getVotingPowerAt(staker, block.number), 0, "post-retire power zeroed");
        assertEq(tw.getTotalPowerAt(block.number), 0, "post-retire total zeroed");
    }

    function test_stake_intoRetired_reverts() public {
        _updateWeight(A, 10_000);
        _stake(A, 100e18);
        vm.roll(block.number + 1);
        vm.prank(governance);
        tw.retireDenom(A);

        vm.roll(block.number + 1);
        vm.prank(provider);
        vm.expectRevert(ITokenWeighting.DenomIsRetired.selector);
        tw.stake(staker, A, 1e18);
    }

    function test_updateWeight_reactivatesRetiredDenom() public {
        _updateWeight(A, 10_000);
        _stake(A, 100e18);
        vm.roll(block.number + 1);
        vm.prank(governance);
        tw.retireDenom(A);
        assertTrue(tw.isDenomRetired(A));

        // Governance re-activates via a fresh non-zero weight.
        _updateWeight(A, 8_000);
        assertFalse(tw.isDenomRetired(A), "re-activated");

        // Staking works again and contributes at the new weight.
        _stake(A, 50e18);
        assertEq(tw.getVotingPower(staker), 150e18 * 8_000 / 10_000, "re-activated power at new weight");
    }

    // ---- Cap ----------------------------------------------------------------

    function test_cap_registrationBeyondMaxReverts_thenRetireReclaims() public {
        uint256 max = tw.MAX_DENOMS();
        for (uint256 i = 0; i < max; i++) {
            _updateWeight(keccak256(abi.encode("d", i)), 10_000);
        }
        assertEq(tw.denomCount(), max, "filled to the cap");

        // One more NEW denom reverts.
        vm.roll(block.number + 1);
        vm.prank(governance);
        vm.expectRevert(ITokenWeighting.DenomCapReached.selector);
        tw.updateWeight(keccak256("overflow"), 10_000);

        // Retiring a never-staked denom purges it, reclaiming a slot...
        vm.roll(block.number + 1);
        vm.prank(governance);
        tw.retireDenom(keccak256(abi.encode("d", uint256(0))));
        assertEq(tw.denomCount(), max - 1, "slot reclaimed");

        // ...so a new denom now fits.
        _updateWeight(keccak256("overflow"), 10_000);
        assertEq(tw.denomCount(), max, "back at the cap with the new denom");
    }

    // ---- Guards -------------------------------------------------------------

    function test_retire_unregistered_reverts() public {
        vm.prank(governance);
        vm.expectRevert(ITokenWeighting.UnregisteredDenom.selector);
        tw.retireDenom(B);
    }

    function test_retire_alreadyRetired_reverts() public {
        _updateWeight(A, 10_000);
        _stake(A, 1e18);
        vm.roll(block.number + 1);
        vm.prank(governance);
        tw.retireDenom(A);

        vm.roll(block.number + 1);
        vm.prank(governance);
        vm.expectRevert(ITokenWeighting.AlreadyRetired.selector);
        tw.retireDenom(A);
    }

    function test_retire_onlyGovernance() public {
        _updateWeight(A, 10_000);
        vm.expectRevert(ITokenWeighting.OnlyGovernance.selector);
        tw.retireDenom(A);
    }
}
