// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {CommitmentsVault} from "src/periphery/vaults/CommitmentsVault.sol";
import {IdleStrategy} from "src/periphery/vaults/strategies/IdleStrategy.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {ICommitmentsVault} from "src/periphery/vaults/interfaces/ICommitmentsVault.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IdleStrategyTest
/// @notice Exercises the reference `IdleStrategy` bound to a real `CommitmentsVault`: the full
///         deposit → strategy → withdraw plumbing round-trips, yield stays exactly zero,
///         fund-moving entry points are vault-gated, and the vault's binding validation accepts a
///         correctly-constructed strategy while rejecting a mis-bound one.
contract IdleStrategyTest is Test {
    CommitmentsVault internal vault;
    MockERC20 internal token;
    IdleStrategy internal idle;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");

    uint256 internal constant DEPOSIT = 1_000e18;

    function setUp() public {
        token = new MockERC20("Test Token", "TEST", 18);

        CommitmentsVault implementation = new CommitmentsVault();
        bytes memory initData = abi.encodeCall(
            CommitmentsVault.initialize, (IERC20(address(token)), "Commitments Test Vault", "cvTEST", admin, address(0))
        );
        vault = CommitmentsVault(address(new ERC1967Proxy(address(implementation), initData)));

        idle = new IdleStrategy(address(token), address(vault));
        vm.prank(admin);
        vault.setYieldStrategy(address(idle));

        token.mint(alice, DEPOSIT);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
    }

    function _aliceDeposit() internal returns (uint256 shares) {
        vm.prank(alice);
        shares = vault.deposit(DEPOSIT, alice);
    }

    // ---- Wiring / views ----------------------------------------------------

    function test_views_reportAssetAndVault() public view {
        assertEq(idle.asset(), address(token), "asset");
        assertEq(idle.vault(), address(vault), "bound vault");
        assertEq(idle.maxDeposit(), type(uint256).max, "unbounded");
        assertEq(idle.totalAssets(), 0, "empty at deploy");
    }

    // ---- Deposit / withdraw plumbing ---------------------------------------

    function test_deposit_routesAssetsIntoStrategy() public {
        _aliceDeposit();
        assertEq(idle.totalAssets(), DEPOSIT, "strategy custodies the deposit");
        assertEq(token.balanceOf(address(vault)), 0, "vault holds no idle balance");
        assertEq(vault.totalAssets(), DEPOSIT, "vault totalAssets counts the strategy");
    }

    function test_withdraw_pullsFromStrategy() public {
        _aliceDeposit();
        uint256 amount = 400e18;

        vm.prank(alice);
        vault.withdraw(amount, alice, alice);

        assertEq(idle.totalAssets(), DEPOSIT - amount, "strategy balance dropped by exactly the pull");
        assertEq(token.balanceOf(alice), amount, "receiver paid in full");
        assertEq(token.balanceOf(address(vault)), 0, "no residue stranded in the vault");
    }

    function test_fullRoundTrip_redeemAll() public {
        uint256 shares = _aliceDeposit();
        vm.prank(alice);
        vault.redeem(shares, alice, alice);

        assertEq(idle.totalAssets(), 0, "strategy fully drained");
        assertEq(token.balanceOf(alice), DEPOSIT, "alice whole again");
        assertEq(vault.totalAssets(), 0, "vault empty");
    }

    // ---- No yield ----------------------------------------------------------

    function test_earnsNoYield_sharesStayOneToOne() public {
        uint256 shares = _aliceDeposit();
        // Share price is 1:1 at first deposit and never appreciates: idle earns nothing.
        assertEq(vault.convertToAssets(shares), DEPOSIT, "no appreciation");

        skip(365 days);
        assertEq(idle.totalAssets(), DEPOSIT, "no yield accrues over time");
        assertEq(vault.convertToAssets(shares), DEPOSIT, "share price flat after a year");
    }

    /// @dev totalAssets is the live balance, so a direct donation to the strategy is honestly
    ///      reflected (and withdrawable to the vault) rather than silently stranded.
    function test_totalAssets_isDonationAware() public {
        _aliceDeposit();
        token.mint(address(idle), 50e18); // direct donation, bypassing the vault
        assertEq(idle.totalAssets(), DEPOSIT + 50e18, "live balance includes the donation");
        assertEq(vault.totalAssets(), DEPOSIT + 50e18, "vault sees the donated assets");
    }

    // ---- Access control ----------------------------------------------------

    function test_deposit_onlyVault() public {
        vm.expectRevert(IdleStrategy.OnlyVault.selector);
        vm.prank(alice);
        idle.deposit(1e18);
    }

    function test_withdraw_onlyVault_fundsStaySafe() public {
        _aliceDeposit();
        vm.expectRevert(IdleStrategy.OnlyVault.selector);
        vm.prank(alice);
        idle.withdraw(1e18);
        assertEq(idle.totalAssets(), DEPOSIT, "no funds left via the guarded path");
    }

    // ---- Vault binding validation ------------------------------------------

    function test_vaultRejects_wrongAsset() public {
        // A fresh idle vault with no strategy, so setYieldStrategy attempts a bind (no swap block).
        CommitmentsVault v2 = _freshIdleVault();
        MockERC20 other = new MockERC20("Other", "OTH", 18);
        IdleStrategy misAsset = new IdleStrategy(address(other), address(v2));

        vm.prank(admin);
        vm.expectRevert(ICommitmentsVault.WrongStrategyAsset.selector);
        v2.setYieldStrategy(address(misAsset));
    }

    function test_vaultRejects_wrongVault() public {
        CommitmentsVault v2 = _freshIdleVault();
        // Bound to the ORIGINAL vault, not v2.
        IdleStrategy misVault = new IdleStrategy(address(token), address(vault));

        vm.prank(admin);
        vm.expectRevert(ICommitmentsVault.WrongStrategyVault.selector);
        v2.setYieldStrategy(address(misVault));
    }

    function _freshIdleVault() internal returns (CommitmentsVault v) {
        CommitmentsVault implementation = new CommitmentsVault();
        bytes memory initData =
            abi.encodeCall(CommitmentsVault.initialize, (IERC20(address(token)), "Idle V2", "iV2", admin, address(0)));
        v = CommitmentsVault(address(new ERC1967Proxy(address(implementation), initData)));
    }
}
