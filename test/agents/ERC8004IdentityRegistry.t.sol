// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {ERC8004IdentityRegistryDev} from "src/periphery/agents/ERC8004IdentityRegistryDev.sol";
import {IERC8004IdentityRegistry} from "src/vendor/erc8004/interfaces/IERC8004IdentityRegistry.sol";

/// @title ERC8004IdentityRegistryTest
/// @notice Locks the vendored canonical registry behaviors that the indexer binding and
///         the frontend agent badge (issue #33) rely on: agent ids starting at ZERO, the
///         exact `Registered`/`MetadataSet`/`URIUpdated` event shapes, tokenURI-as-agentURI,
///         and the agentWallet auto-clear on transfer. If an upstream re-vendor changes any
///         of these, this suite fails before the indexer silently drifts.
contract ERC8004IdentityRegistryTest is Test {
    IERC8004IdentityRegistry internal registry;

    address internal admin = makeAddr("admin");
    address internal agent = makeAddr("agent");
    address internal buyer = makeAddr("buyer");

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event MetadataSet(
        uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue
    );
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);

    function setUp() public {
        ERC8004IdentityRegistryDev impl = new ERC8004IdentityRegistryDev();
        registry = IERC8004IdentityRegistry(
            address(new ERC1967Proxy(address(impl), abi.encodeCall(ERC8004IdentityRegistryDev.initializeDev, (admin))))
        );
    }

    function test_firstAgentIdIsZero() public {
        vm.prank(agent);
        uint256 id = registry.register("ipfs://agent-card");
        assertEq(id, 0, "canonical registry starts ids at 0 (_lastId++)");
        assertEq(registry.ownerOf(0), agent);

        vm.prank(buyer);
        assertEq(registry.register(), 1);
    }

    function test_registerEmitsCanonicalEvents() public {
        // Registered carries (agentId indexed, uri, owner indexed); the reserved
        // agentWallet MetadataSet follows with the registrant packed into bytes.
        vm.expectEmit(true, true, true, true);
        emit Registered(0, "ipfs://agent-card", agent);
        vm.expectEmit(true, true, true, true);
        emit MetadataSet(0, "agentWallet", "agentWallet", abi.encodePacked(agent));
        vm.prank(agent);
        registry.register("ipfs://agent-card");

        assertEq(registry.getAgentWallet(0), agent);
    }

    function test_tokenURIIsAgentURI_andSetAgentURIEmits() public {
        vm.prank(agent);
        uint256 id = registry.register("ipfs://v1");
        assertEq(registry.tokenURI(id), "ipfs://v1");

        vm.expectEmit(true, true, true, true);
        emit URIUpdated(id, "ipfs://v2", agent);
        vm.prank(agent);
        registry.setAgentURI(id, "ipfs://v2");
        assertEq(registry.tokenURI(id), "ipfs://v2");
    }

    function test_registerWithMetadataEntries() public {
        IERC8004IdentityRegistry.MetadataEntry[] memory md = new IERC8004IdentityRegistry.MetadataEntry[](1);
        md[0] = IERC8004IdentityRegistry.MetadataEntry({metadataKey: "service", metadataValue: "commitments-sla"});

        vm.prank(agent);
        uint256 id = registry.register("ipfs://agent-card", md);
        assertEq(registry.getMetadata(id, "service"), bytes("commitments-sla"));

        // The reserved key is rejected in the entries array.
        md[0].metadataKey = "agentWallet";
        vm.prank(agent);
        vm.expectRevert(bytes("reserved key"));
        registry.register("ipfs://other", md);
    }

    function test_agentWalletClearedOnTransfer() public {
        vm.prank(agent);
        uint256 id = registry.register("ipfs://agent-card");
        assertEq(registry.getAgentWallet(id), agent);

        // Transfer clears the verified wallet BEFORE the Transfer event —
        // the indexer must treat the empty-value MetadataSet as a wallet unset.
        vm.expectEmit(true, true, true, true);
        emit MetadataSet(id, "agentWallet", "agentWallet", "");
        vm.prank(agent);
        IERC721Minimal(address(registry)).transferFrom(agent, buyer, id);

        assertEq(registry.getAgentWallet(id), address(0));
        assertEq(registry.ownerOf(id), buyer);
    }

    function test_setMetadataAuthGating() public {
        vm.prank(agent);
        uint256 id = registry.register("ipfs://agent-card");

        vm.prank(buyer);
        vm.expectRevert(bytes("Not authorized"));
        registry.setMetadata(id, "service", "x");

        vm.prank(agent);
        registry.setMetadata(id, "service", "x");
        assertEq(registry.getMetadata(id, "service"), bytes("x"));
        assertTrue(registry.isAuthorizedOrOwner(agent, id));
        assertFalse(registry.isAuthorizedOrOwner(buyer, id));
    }

    function test_versionMatchesLiveDeployment() public view {
        assertEq(registry.getVersion(), "2.0.0");
    }
}

/// @dev Just the transfer entry point — IERC8004IdentityRegistry intentionally omits the
///      ERC-721 approval/transfer surface.
interface IERC721Minimal {
    function transferFrom(address from, address to, uint256 tokenId) external;
}
