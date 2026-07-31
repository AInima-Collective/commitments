// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IArbiter} from "src/shared/arbitration/interfaces/IArbiter.sol";
import {ArbiterCapabilities} from "src/shared/arbitration/ArbiterCapabilities.sol";
import {ManualArbiter} from "src/periphery/arbiters/ManualArbiter.sol";

/// @title ArbiterCapabilitiesTest
/// @notice Locks the capability-interface surface introduced for issue #60:
///         ERC-165 discovery, the honest per-arbiter capability bitmap, the
///         metadata-URI affordance, and the {ArbiterCapabilities.has} helper.
///         Concrete deployments of every reference arbiter are exercised in
///         their own suites; this suite pins the introspection contract itself.
contract ArbiterCapabilitiesTest is Test {
    ManualArbiter internal arbiter;

    address internal owner = makeAddr("owner");
    address internal manager = makeAddr("manager");

    function setUp() public {
        arbiter = new ManualArbiter(owner, manager);
    }

    // ---- ERC-165 -----------------------------------------------------------

    function testSupportsIArbiterAndERC165() public view {
        assertTrue(arbiter.supportsInterface(type(IArbiter).interfaceId), "supports IArbiter");
        assertTrue(arbiter.supportsInterface(type(IERC165).interfaceId), "supports IERC165");
    }

    function testRejectsUnknownInterface() public view {
        assertFalse(arbiter.supportsInterface(0xffffffff), "0xffffffff is the invalid sentinel");
        assertFalse(arbiter.supportsInterface(bytes4(keccak256("nonsense()"))), "unknown selector");
    }

    /// @dev The interfaceId excludes the inherited ERC-165 selector (Solidity
    ///      convention): it is the XOR of IArbiter's own three selectors only.
    function testInterfaceIdComposition() public pure {
        bytes4 expected = IArbiter.commitmentManager.selector ^ IArbiter.arbiterCapabilities.selector
            ^ IArbiter.arbiterMetadataURI.selector;
        assertEq(type(IArbiter).interfaceId, expected, "interfaceId is XOR of own selectors");
        assertTrue(type(IArbiter).interfaceId != type(IERC165).interfaceId, "distinct from ERC-165 id");
    }

    // ---- Capability bitmap -------------------------------------------------

    function testManualArbiterAdvertisesFullSurface() public view {
        uint256 caps = arbiter.arbiterCapabilities();
        assertTrue(ArbiterCapabilities.has(caps, ArbiterCapabilities.INITIATE_FORFEIT), "forfeit");
        assertTrue(ArbiterCapabilities.has(caps, ArbiterCapabilities.CANCEL_FORFEIT), "cancel");
        assertTrue(ArbiterCapabilities.has(caps, ArbiterCapabilities.RELEASE_COMMITMENT), "release");
        assertTrue(ArbiterCapabilities.has(caps, ArbiterCapabilities.FORFEIT_AGREEMENT), "forfeit agreement");
        assertTrue(ArbiterCapabilities.has(caps, ArbiterCapabilities.RELEASE_AGREEMENT), "release agreement");
        assertTrue(ArbiterCapabilities.has(caps, ArbiterCapabilities.SETTLE_AGREEMENT), "settle agreement");
        assertTrue(ArbiterCapabilities.has(caps, ArbiterCapabilities.MUTUAL_LOSS), "mutual");
    }

    // ---- Metadata URI ------------------------------------------------------

    function testMetadataURIStartsEmptyAndIsOwnerSettable() public {
        assertEq(arbiter.arbiterMetadataURI(), "", "empty until set");

        vm.prank(owner);
        arbiter.setMetadataURI("ipfs://policy");
        assertEq(arbiter.arbiterMetadataURI(), "ipfs://policy", "owner set");
    }

    function testMetadataURIOnlyOwner() public {
        vm.expectRevert();
        arbiter.setMetadataURI("ipfs://evil"); // no prank == this test contract, not owner
    }

    // ---- has() helper semantics --------------------------------------------

    function testHasSingleAndCombinedMasks() public pure {
        uint256 caps = ArbiterCapabilities.INITIATE_FORFEIT | ArbiterCapabilities.MUTUAL_LOSS;

        // Single-bit probes.
        assertTrue(ArbiterCapabilities.has(caps, ArbiterCapabilities.INITIATE_FORFEIT));
        assertTrue(ArbiterCapabilities.has(caps, ArbiterCapabilities.MUTUAL_LOSS));
        assertFalse(ArbiterCapabilities.has(caps, ArbiterCapabilities.SETTLE_AGREEMENT));

        // Combined mask: ALL bits must be present.
        uint256 both = ArbiterCapabilities.INITIATE_FORFEIT | ArbiterCapabilities.MUTUAL_LOSS;
        assertTrue(ArbiterCapabilities.has(caps, both), "has all of a combined mask");

        uint256 withMissing = both | ArbiterCapabilities.SETTLE_AGREEMENT;
        assertFalse(ArbiterCapabilities.has(caps, withMissing), "missing one bit fails combined mask");

        // NONE is trivially satisfied.
        assertTrue(ArbiterCapabilities.has(caps, ArbiterCapabilities.NONE), "empty mask always present");
    }

    /// @dev Bits are distinct powers of two — no accidental aliasing.
    function testCapabilityBitsAreDistinctPowersOfTwo() public pure {
        uint256[7] memory bits = [
            ArbiterCapabilities.INITIATE_FORFEIT,
            ArbiterCapabilities.CANCEL_FORFEIT,
            ArbiterCapabilities.RELEASE_COMMITMENT,
            ArbiterCapabilities.FORFEIT_AGREEMENT,
            ArbiterCapabilities.RELEASE_AGREEMENT,
            ArbiterCapabilities.SETTLE_AGREEMENT,
            ArbiterCapabilities.MUTUAL_LOSS
        ];
        uint256 seen;
        for (uint256 i; i < bits.length; ++i) {
            assertTrue(bits[i] != 0 && (bits[i] & (bits[i] - 1)) == 0, "power of two");
            assertEq(seen & bits[i], 0, "no overlap with earlier bits");
            seen |= bits[i];
        }
    }
}
