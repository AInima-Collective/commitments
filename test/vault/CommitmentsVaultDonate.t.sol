// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {CommitmentsVault} from "src/periphery/vaults/CommitmentsVault.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {MockStrategy} from "../helpers/MockStrategy.sol";
import {ICommitmentsVault} from "src/periphery/vaults/interfaces/ICommitmentsVault.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title CommitmentsVaultDonateTest
/// @notice Tests for the `donate(uint256)` NAV-uplift primitive.
///         Permissionless contributor pushes assets into the vault; existing
///         shareholders' claim grows pro-rata. No share minting.
///         See research/cross-vault-underwriting.md §5 for motivation.
contract CommitmentsVaultDonateTest is Test {
    CommitmentsVault public vault;
    MockERC20 public token;
    MockStrategy public strategy;

    address public admin = makeAddr("admin");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public donor = makeAddr("donor");

    uint256 public constant INITIAL_DEPOSIT = 1000e18;

    function setUp() public {
        token = new MockERC20("Test Token", "TEST", 18);

        CommitmentsVault implementation = new CommitmentsVault();

        bytes memory initData = abi.encodeCall(
            CommitmentsVault.initialize, (IERC20(address(token)), "Commitments Test Vault", "cvTEST", admin, address(0))
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        vault = CommitmentsVault(address(proxy));

        strategy = new MockStrategy(address(token), address(vault));

        vm.prank(admin);
        vault.setYieldStrategy(address(strategy));

        // Fund actors
        token.mint(alice, INITIAL_DEPOSIT);
        token.mint(bob, INITIAL_DEPOSIT);
        token.mint(donor, INITIAL_DEPOSIT * 10);

        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        token.approve(address(vault), type(uint256).max);
        vm.prank(donor);
        token.approve(address(vault), type(uint256).max);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _aliceDeposit() internal returns (uint256 shares) {
        vm.prank(alice);
        shares = vault.deposit(INITIAL_DEPOSIT, alice);
    }

    function _bobDeposit() internal returns (uint256 shares) {
        vm.prank(bob);
        shares = vault.deposit(INITIAL_DEPOSIT, bob);
    }

    // =========================================================================
    // Happy path
    // =========================================================================

    /// @notice Donation lifts NAV per share for the existing depositor.
    function test_donate_increasesNAVPerShare() public {
        uint256 aliceShares = _aliceDeposit();

        uint256 navBefore = vault.convertToAssets(aliceShares);
        assertEq(navBefore, INITIAL_DEPOSIT, "alice's claim before donation = her deposit");

        uint256 donation = 100e18;
        vm.prank(donor);
        vault.donate(donation);

        uint256 navAfter = vault.convertToAssets(aliceShares);
        // Inflation guard's virtual offset (9 decimals) makes this very nearly exact;
        // a tiny dust amount goes to virtual shares. Allow 1 wei tolerance per share decimal.
        assertApproxEqAbs(navAfter, INITIAL_DEPOSIT + donation, 1e9, "alice's claim grew by donation");
    }

    /// @notice Donation distributes pro-rata across multiple depositors.
    function test_donate_distributesProRata() public {
        // Alice puts in 1000, Bob puts in 3000 (so Alice = 25%, Bob = 75%)
        _aliceDeposit();
        token.mint(bob, INITIAL_DEPOSIT * 2); // bob has 3x INITIAL_DEPOSIT total
        vm.prank(bob);
        vault.deposit(INITIAL_DEPOSIT * 3, bob);

        uint256 aliceShares = vault.balanceOf(alice);
        uint256 bobShares = vault.balanceOf(bob);

        uint256 donation = 400e18;
        vm.prank(donor);
        vault.donate(donation);

        uint256 aliceClaim = vault.convertToAssets(aliceShares);
        uint256 bobClaim = vault.convertToAssets(bobShares);

        // Alice gets 25% of 400 = 100 uplift; Bob gets 75% = 300
        assertApproxEqAbs(aliceClaim, INITIAL_DEPOSIT + 100e18, 1e9, "alice 25% of donation");
        assertApproxEqAbs(bobClaim, INITIAL_DEPOSIT * 3 + 300e18, 1e9, "bob 75% of donation");
    }

    /// @notice totalSupply is unchanged by a donation (no shares minted).
    function test_donate_doesNotMintShares() public {
        _aliceDeposit();
        uint256 supplyBefore = vault.totalSupply();

        vm.prank(donor);
        vault.donate(50e18);

        assertEq(vault.totalSupply(), supplyBefore, "totalSupply unchanged");
    }

    /// @notice totalAssets grows by exactly the donated amount when strategy holds it.
    function test_donate_totalAssetsGrowsByDonation() public {
        _aliceDeposit();
        uint256 totalAssetsBefore = vault.totalAssets();

        uint256 donation = 250e18;
        vm.prank(donor);
        vault.donate(donation);

        assertEq(vault.totalAssets(), totalAssetsBefore + donation, "totalAssets += donation");
    }

    /// @notice Donations route through the strategy when one is set.
    function test_donate_withStrategy_forwardsToStrategy() public {
        _aliceDeposit();
        uint256 strategyAssetsBefore = strategy.totalAssets();
        uint256 vaultAssetBalanceBefore = token.balanceOf(address(vault));

        uint256 donation = 100e18;
        vm.prank(donor);
        vault.donate(donation);

        assertEq(strategy.totalAssets(), strategyAssetsBefore + donation, "strategy received donation");
        assertEq(token.balanceOf(address(vault)), vaultAssetBalanceBefore, "vault did not retain donation");
    }

    /// @notice Donation works with no strategy: assets sit in vault, totalAssets falls back to token balance.
    function test_donate_idleVault_holdsInVault() public {
        // Tear down the strategy: drain it first, then unset.
        // Easier: deploy a fresh vault with no strategy.
        CommitmentsVault impl2 = new CommitmentsVault();
        bytes memory initData = abi.encodeCall(
            CommitmentsVault.initialize, (IERC20(address(token)), "Idle Vault", "iV", admin, address(0))
        );
        ERC1967Proxy proxy2 = new ERC1967Proxy(address(impl2), initData);
        CommitmentsVault idleVault = CommitmentsVault(address(proxy2));

        token.mint(alice, INITIAL_DEPOSIT);
        vm.startPrank(alice);
        token.approve(address(idleVault), type(uint256).max);
        idleVault.deposit(INITIAL_DEPOSIT, alice);
        vm.stopPrank();

        vm.prank(donor);
        token.approve(address(idleVault), type(uint256).max);
        vm.prank(donor);
        idleVault.donate(100e18);

        assertEq(token.balanceOf(address(idleVault)), INITIAL_DEPOSIT + 100e18, "idle vault holds donation");
        assertEq(idleVault.totalAssets(), INITIAL_DEPOSIT + 100e18, "totalAssets reflects donation");
    }

    // =========================================================================
    // Permissionless callers
    // =========================================================================

    /// @notice Anyone may call donate — no role gate.
    function test_donate_permissionless() public {
        _aliceDeposit();

        // A random unprivileged caller can donate
        address randomDonor = makeAddr("randomDonor");
        token.mint(randomDonor, 50e18);
        vm.prank(randomDonor);
        token.approve(address(vault), type(uint256).max);
        vm.prank(randomDonor);
        vault.donate(50e18);
        // Did not revert
    }

    /// @notice Donations are NOT gated by depositsPaused.
    function test_donate_worksWhenDepositsPaused() public {
        _aliceDeposit();

        // Pause deposits
        vm.prank(admin);
        vault.pauseDeposits();

        // Donor can still donate
        vm.prank(donor);
        vault.donate(50e18);
        // Did not revert
    }

    // =========================================================================
    // Reverts
    // =========================================================================

    function test_donate_zeroAmount_reverts() public {
        vm.prank(donor);
        vm.expectRevert(ICommitmentsVault.ZeroAmount.selector);
        vault.donate(0);
    }

    function test_donate_insufficientApproval_reverts() public {
        address skinflint = makeAddr("skinflint");
        token.mint(skinflint, 100e18);
        // No approval

        vm.prank(skinflint);
        vm.expectRevert(); // safeTransferFrom revert
        vault.donate(100e18);
    }

    // =========================================================================
    // Exit realization
    // =========================================================================

    /// @notice The donation uplift is realizable via an instant `redeem` — the
    ///         shareholder actually receives the extra assets on exit, not just
    ///         a bigger preview number.
    function test_donate_upliftRealizableViaRedeem() public {
        uint256 aliceShares = _aliceDeposit();

        uint256 donation = 100e18;
        vm.prank(donor);
        vault.donate(donation);

        uint256 balanceBefore = token.balanceOf(alice);
        vm.prank(alice);
        uint256 assets = vault.redeem(aliceShares, alice, alice);

        assertEq(token.balanceOf(alice), balanceBefore + assets, "alice paid out instantly");
        // Alice is the sole real shareholder — she captures (almost) the whole donation.
        assertApproxEqAbs(assets, INITIAL_DEPOSIT + donation, 1e9, "redeem realizes deposit + donation");
    }

    // =========================================================================
    // Event emission
    // =========================================================================

    function test_donate_emitsEvent() public {
        _aliceDeposit();

        vm.expectEmit(true, false, false, true, address(vault));
        emit ICommitmentsVault.Donation(donor, 75e18);
        vm.prank(donor);
        vault.donate(75e18);
    }

    // =========================================================================
    // Inflation-guard interaction
    // =========================================================================

    /// @notice Donation into an empty vault (no depositors) doesn't break the
    ///         inflation guard — virtual shares prevent share-price manipulation.
    function test_donate_intoEmptyVault_doesNotBreakInflationGuard() public {
        // No deposits yet. Donation goes to strategy as virtual NAV.
        vm.prank(donor);
        vault.donate(1000e18);

        // First real depositor still gets a sane share count. With virtual offset
        // of 9, a 1000-asset deposit into a vault with 1000 in virtual NAV but no
        // real shares should mint approximately the asset amount in shares (since
        // virtual offset dominates the inflation calc).
        token.mint(alice, 1000e18);
        vm.startPrank(alice);
        token.approve(address(vault), type(uint256).max);
        uint256 shares = vault.deposit(1000e18, alice);
        vm.stopPrank();

        // Without the inflation guard, the 1000 donated assets would either:
        // (a) freeze the vault (divide-by-zero on share calc), or
        // (b) let an attacker get a single wei-share for a huge deposit.
        // With the guard, alice gets a reasonable share count.
        assertGt(shares, 0, "alice gets non-zero shares");
        // Alice's claim is bounded: she should not be able to immediately claim
        // 2x her deposit. Convert her shares back to assets:
        uint256 aliceClaim = vault.convertToAssets(shares);
        assertLe(aliceClaim, 1000e18, "alice cannot claim more than she deposited (donor's gift goes to virtual share)");
    }

    // =========================================================================
    // Fuzz
    // =========================================================================

    /// @notice Fuzz: arbitrary deposit + donate sequences preserve solvency
    ///         (totalAssets >= sum of users' redeemable claims).
    function testFuzz_donate_preservesSolvency(uint256 depositAmount, uint256 donationAmount) public {
        depositAmount = bound(depositAmount, 1e9, 1e30);
        donationAmount = bound(donationAmount, 1, 1e30);

        token.mint(alice, depositAmount);
        vm.startPrank(alice);
        token.approve(address(vault), type(uint256).max);
        uint256 shares = vault.deposit(depositAmount, alice);
        vm.stopPrank();

        token.mint(donor, donationAmount);
        vm.startPrank(donor);
        vault.donate(donationAmount);
        vm.stopPrank();

        uint256 aliceClaim = vault.convertToAssets(shares);
        // Alice's claim should not exceed totalAssets
        assertLe(aliceClaim, vault.totalAssets(), "alice's claim bounded by totalAssets");
    }
}
