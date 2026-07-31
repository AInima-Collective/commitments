// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {CommitmentsVault} from "src/periphery/vaults/CommitmentsVault.sol";
import {ICommitmentsVault} from "src/periphery/vaults/interfaces/ICommitmentsVault.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title CommitmentsVaultMetadataTest
/// @notice Tests the vault-level metadata sidecar (uri, contentHash, updatedAt).
contract CommitmentsVaultMetadataTest is Test {
    CommitmentsVault public vault;
    MockERC20 public token;

    address public admin = makeAddr("admin");
    address public stranger = makeAddr("stranger");

    function setUp() public {
        token = new MockERC20("Test Token", "TEST", 18);
        CommitmentsVault implementation = new CommitmentsVault();
        bytes memory initData = abi.encodeCall(
            CommitmentsVault.initialize, (IERC20(address(token)), "Commitments Test Vault", "cvTEST", admin, address(0))
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        vault = CommitmentsVault(address(proxy));
    }

    // =========================================================================
    // Default state
    // =========================================================================

    function test_getMetadata_defaultsToZero() public view {
        ICommitmentsVault.VaultMetadata memory m = vault.getMetadata();
        assertEq(bytes(m.uri).length, 0, "uri must default to empty");
        assertEq(m.contentHash, bytes32(0), "contentHash must default to zero");
        assertEq(m.updatedAt, 0, "updatedAt must default to zero");
    }

    // =========================================================================
    // Happy path
    // =========================================================================

    function test_setMetadata_writesAllFields() public {
        string memory uri = "ipfs://bafy.../vault.json";
        bytes32 hash = keccak256("payload-v1");

        vm.warp(1_700_000_000);
        vm.prank(admin);
        vault.setMetadata(uri, hash);

        ICommitmentsVault.VaultMetadata memory m = vault.getMetadata();
        assertEq(m.uri, uri, "uri must persist");
        assertEq(m.contentHash, hash, "contentHash must persist");
        assertEq(m.updatedAt, uint64(block.timestamp), "updatedAt must equal block.timestamp");
    }

    function test_setMetadata_emitsVaultMetadataUpdated() public {
        string memory uri = "https://example.com/vault-metadata.json";
        bytes32 hash = keccak256("payload");

        vm.warp(1_800_000_000);
        vm.prank(admin);
        vm.expectEmit(false, false, false, true);
        emit ICommitmentsVault.VaultMetadataUpdated(uri, hash, uint64(block.timestamp));
        vault.setMetadata(uri, hash);
    }

    function test_setMetadata_overwritesPriorRecord() public {
        vm.warp(1_900_000_000);
        vm.prank(admin);
        vault.setMetadata("ipfs://first", keccak256("first"));

        vm.warp(1_900_001_000);
        vm.prank(admin);
        vault.setMetadata("ipfs://second", keccak256("second"));

        ICommitmentsVault.VaultMetadata memory m = vault.getMetadata();
        assertEq(m.uri, "ipfs://second", "uri must reflect latest write");
        assertEq(m.contentHash, keccak256("second"), "contentHash must reflect latest write");
        assertEq(m.updatedAt, uint64(1_900_001_000), "updatedAt must reflect latest write");
    }

    function test_setMetadata_acceptsEmptyUriAndZeroHash() public {
        // Equivalent to "clear" — admin can write a sentinel zero record.
        vm.warp(2_000_000_000);
        vm.prank(admin);
        vault.setMetadata("", bytes32(0));

        ICommitmentsVault.VaultMetadata memory m = vault.getMetadata();
        assertEq(bytes(m.uri).length, 0, "uri must be empty");
        assertEq(m.contentHash, bytes32(0), "contentHash must be zero");
        assertEq(m.updatedAt, uint64(block.timestamp), "updatedAt must still be set");
    }

    // =========================================================================
    // Access control
    // =========================================================================

    function test_setMetadata_revertsForNonAdmin() public {
        bytes32 adminRole = vault.DEFAULT_ADMIN_ROLE();
        bytes memory expectedErr =
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, adminRole);
        vm.prank(stranger);
        vm.expectRevert(expectedErr);
        vault.setMetadata("ipfs://nope", bytes32(0));
    }

    function test_setMetadata_grantedAdminCanCall() public {
        address newAdmin = makeAddr("newAdmin");
        bytes32 adminRole = vault.DEFAULT_ADMIN_ROLE();
        vm.prank(admin);
        vault.grantRole(adminRole, newAdmin);

        vm.warp(2_100_000_000);
        vm.prank(newAdmin);
        vault.setMetadata("ipfs://granted", keccak256("granted"));

        ICommitmentsVault.VaultMetadata memory m = vault.getMetadata();
        assertEq(m.uri, "ipfs://granted", "newly-granted admin must be able to set");
    }

    function test_setMetadata_pauserRoleCannotCall() public {
        address pauser = makeAddr("pauser");
        bytes32 adminRole = vault.DEFAULT_ADMIN_ROLE();
        bytes32 pauserRole = vault.PAUSER_ROLE();
        vm.prank(admin);
        vault.grantRole(pauserRole, pauser);

        bytes memory expectedErr =
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, pauser, adminRole);
        vm.prank(pauser);
        vm.expectRevert(expectedErr);
        vault.setMetadata("ipfs://pauser", bytes32(0));
    }

    // =========================================================================
    // URI length cap
    // =========================================================================

    function test_setMetadata_rejectsOversizedUri() public {
        bytes memory big = new bytes(513);
        for (uint256 i = 0; i < 513; i++) {
            big[i] = bytes1(uint8(0x61)); // 'a'
        }

        vm.prank(admin);
        vm.expectRevert(ICommitmentsVault.URITooLong.selector);
        vault.setMetadata(string(big), bytes32(0));
    }

    function test_setMetadata_acceptsUriAtCap() public {
        bytes memory atCap = new bytes(512);
        for (uint256 i = 0; i < 512; i++) {
            atCap[i] = bytes1(uint8(0x61)); // 'a'
        }

        vm.warp(2_200_000_000);
        vm.prank(admin);
        vault.setMetadata(string(atCap), keccak256("cap"));

        ICommitmentsVault.VaultMetadata memory m = vault.getMetadata();
        assertEq(bytes(m.uri).length, 512, "uri at cap must be accepted");
        assertEq(m.contentHash, keccak256("cap"), "contentHash must persist");
    }

    function test_setMetadata_constantMatchesAdvertisedCap() public view {
        assertEq(vault.MAX_METADATA_URI_LENGTH(), 512, "URI cap must be 512 bytes");
    }
}
