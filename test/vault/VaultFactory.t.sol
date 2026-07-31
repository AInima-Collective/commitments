// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {VaultFactory} from "src/periphery/vaults/VaultFactory.sol";
import {CommitmentsVault} from "src/periphery/vaults/CommitmentsVault.sol";
import {ICommitmentsVault} from "src/periphery/vaults/interfaces/ICommitmentsVault.sol";
import {MockERC20} from "../helpers/MockERC20.sol";

contract VaultFactoryTest is Test {
    VaultFactory public factory;
    CommitmentsVault public implementation;
    MockERC20 public token;
    MockERC20 public tokenB;
    MockERC20 public tokenC;

    address public admin = makeAddr("admin");
    address public nonOwner = makeAddr("nonOwner");

    function setUp() public {
        // Deploy vault implementation (not initialized — serves as template)
        implementation = new CommitmentsVault();

        // Deploy factory with implementation reference
        factory = new VaultFactory(address(implementation));

        // Deploy test tokens
        token = new MockERC20("Test Token", "TEST", 18);
        tokenB = new MockERC20("Token B", "TOKB", 18);
        tokenC = new MockERC20("Token C", "TOKC", 6);
    }

    // =========================================================================
    // Basic deployment tests
    // =========================================================================

    function test_deployVault_createsVault() public {
        address vault = factory.deployVault(address(token), admin, address(0));
        assertNotEq(vault, address(0), "Vault address must be non-zero");
        assertEq(factory.vaultByAsset(address(token)), vault, "vaultByAsset must return deployed vault");
    }

    function test_deployVault_initializesCorrectly() public {
        address vault = factory.deployVault(address(token), admin, address(0));
        ICommitmentsVault cv = ICommitmentsVault(vault);

        assertEq(cv.asset(), address(token), "Asset must match");
        assertEq(cv.yieldStrategy(), address(0), "Strategy must be the configured idle mode");
        assertTrue(
            CommitmentsVault(vault).hasRole(CommitmentsVault(vault).DEFAULT_ADMIN_ROLE(), admin),
            "Admin must hold DEFAULT_ADMIN_ROLE"
        );
    }

    function test_deployVault_constructsNameAndSymbol() public {
        address vault = factory.deployVault(address(token), admin, address(0));

        // Cast to ERC20 to access name() and symbol()
        assertEq(CommitmentsVault(vault).name(), "Commitments TEST Vault", "Name must be 'Commitments TEST Vault'");
        assertEq(CommitmentsVault(vault).symbol(), "cvTEST", "Symbol must be 'cvTEST'");
    }

    function test_deployVault_registersInAllVaults() public {
        address vault = factory.deployVault(address(token), admin, address(0));

        assertEq(factory.vaultCount(), 1, "vaultCount must be 1");
        assertEq(factory.allVaults(0), vault, "allVaults[0] must match deployed vault");
    }

    // =========================================================================
    // Duplicate prevention (Pitfall 6 / T-02-14)
    // =========================================================================

    function test_deployVault_revertsForDuplicateAsset() public {
        factory.deployVault(address(token), admin, address(0));

        vm.expectRevert(abi.encodeWithSelector(VaultFactory.VaultAlreadyExists.selector, address(token)));
        factory.deployVault(address(token), admin, address(0));
    }

    // =========================================================================
    // Input validation
    // =========================================================================

    function test_deployVault_revertsForZeroAddress() public {
        vm.expectRevert(VaultFactory.ZeroAddress.selector);
        factory.deployVault(address(0), admin, address(0));
    }

    // =========================================================================
    // Access control (T-02-15)
    // =========================================================================

    function test_deployVault_onlyOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert();
        factory.deployVault(address(token), admin, address(0));
    }

    function test_deployVault_ownerCanDeploy() public {
        // Factory deployer is owner — should succeed without revert
        address vault = factory.deployVault(address(token), admin, address(0));
        assertNotEq(vault, address(0));
    }

    // =========================================================================
    // Multi-asset registry
    // =========================================================================

    function test_deployVault_multipleAssets() public {
        address vaultA = factory.deployVault(address(token), admin, address(0));
        address vaultB = factory.deployVault(address(tokenB), admin, address(0));
        address vaultC = factory.deployVault(address(tokenC), admin, address(0));

        assertEq(factory.vaultCount(), 3, "vaultCount must be 3");
        assertEq(factory.vaultByAsset(address(token)), vaultA, "vaultByAsset(token) must match");
        assertEq(factory.vaultByAsset(address(tokenB)), vaultB, "vaultByAsset(tokenB) must match");
        assertEq(factory.vaultByAsset(address(tokenC)), vaultC, "vaultByAsset(tokenC) must match");
        assertNotEq(vaultA, vaultB, "Vaults must be different addresses");
        assertNotEq(vaultB, vaultC, "Vaults must be different addresses");
    }

    function test_deployVault_allVaultsEnumeration() public {
        address vaultA = factory.deployVault(address(token), admin, address(0));
        address vaultB = factory.deployVault(address(tokenB), admin, address(0));

        assertEq(factory.allVaults(0), vaultA, "allVaults[0] must be vaultA");
        assertEq(factory.allVaults(1), vaultB, "allVaults[1] must be vaultB");
    }

    // =========================================================================
    // Integration: vault functionality after factory deploy
    // =========================================================================

    function test_vaultFunctionality_afterFactoryDeploy() public {
        address vaultAddr = factory.deployVault(address(token), admin, address(0));
        CommitmentsVault vault = CommitmentsVault(vaultAddr);

        address alice = makeAddr("alice");
        uint256 depositAmount = 1e18;

        // Mint tokens to alice
        token.mint(alice, depositAmount);

        // Alice deposits
        vm.startPrank(alice);
        token.approve(vaultAddr, depositAmount);
        uint256 shares = vault.deposit(depositAmount, alice);
        vm.stopPrank();

        assertGt(shares, 0, "Alice must receive non-zero shares");
        assertEq(vault.balanceOf(alice), shares, "Alice share balance must match");
    }

    // =========================================================================
    // VaultDeployed event
    // =========================================================================

    function test_deployVault_emitsVaultDeployedEvent() public {
        // The vault address (topic 2) is unknown before deployment — check the asset topic only.
        vm.expectEmit(true, false, false, false);
        emit VaultFactory.VaultDeployed(address(token), address(0));
        factory.deployVault(address(token), admin, address(0));
    }

    // =========================================================================
    // Factory immutables
    // =========================================================================

    function test_factory_vaultImplementation() public view {
        assertEq(factory.vaultImplementation(), address(implementation), "Implementation address must match");
    }
}
