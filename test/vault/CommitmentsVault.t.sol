// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {CommitmentsVault} from "src/periphery/vaults/CommitmentsVault.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {MockStrategy} from "../helpers/MockStrategy.sol";
import {ICommitmentsVault} from "src/periphery/vaults/interfaces/ICommitmentsVault.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {ERC4626Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";

/// @title CommitmentsVaultTest
/// @notice Comprehensive unit tests for the clean ERC-4626 CommitmentsVault: deposits, instant
///         withdraw/redeem (strategy-aware), yield accounting, deposit circuit breaker, strategy
///         migration guards, roles, and UUPS upgrade authorization.
contract CommitmentsVaultTest is Test {
    CommitmentsVault public vault;
    MockERC20 public token;
    MockStrategy public strategy;

    address public admin = makeAddr("admin");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public pauser = makeAddr("pauser");
    address public unpauser = makeAddr("unpauser");

    uint256 public constant INITIAL_DEPOSIT = 1000e18;

    function setUp() public {
        token = new MockERC20("Test Token", "TEST", 18);

        // Deploy vault implementation
        CommitmentsVault implementation = new CommitmentsVault();

        // Deploy proxy with initial strategy = address(0) so we can set it after deploying strategy
        bytes memory initData = abi.encodeCall(
            CommitmentsVault.initialize, (IERC20(address(token)), "Commitments Test Vault", "cvTEST", admin, address(0))
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        vault = CommitmentsVault(address(proxy));

        // Deploy strategy with vault address (vault must exist first)
        strategy = new MockStrategy(address(token), address(vault));

        // Admin: set strategy
        vm.prank(admin);
        vault.setYieldStrategy(address(strategy));

        // Admin: grant separate pauser/unpauser roles
        vm.startPrank(admin);
        vault.grantRole(vault.PAUSER_ROLE(), pauser);
        vault.grantRole(vault.UNPAUSER_ROLE(), unpauser);
        vm.stopPrank();

        // Fund alice and approve
        token.mint(alice, INITIAL_DEPOSIT);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);

        // Fund bob for multi-user tests
        token.mint(bob, INITIAL_DEPOSIT);
        vm.prank(bob);
        token.approve(address(vault), type(uint256).max);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /// @dev Alice deposits INITIAL_DEPOSIT and returns her share balance.
    function _aliceDeposit() internal returns (uint256 shares) {
        vm.prank(alice);
        shares = vault.deposit(INITIAL_DEPOSIT, alice);
    }

    /// @dev Deploys a fresh vault with no strategy (idle mode, totalAssets = token balance).
    function _deployIdleVault() internal returns (CommitmentsVault idleVault) {
        CommitmentsVault implementation = new CommitmentsVault();
        bytes memory initData = abi.encodeCall(
            CommitmentsVault.initialize, (IERC20(address(token)), "Idle Vault", "iVAULT", admin, address(0))
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        idleVault = CommitmentsVault(address(proxy));
    }

    // =========================================================================
    // Initialization
    // =========================================================================

    function test_initialize_setsCorrectState() public view {
        assertEq(vault.yieldStrategy(), address(strategy), "strategy");
        assertEq(address(vault.asset()), address(token), "asset");
        assertTrue(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), admin), "admin role");
        assertTrue(vault.hasRole(vault.PAUSER_ROLE(), admin), "admin pauser role");
        assertTrue(vault.hasRole(vault.UNPAUSER_ROLE(), admin), "admin unpauser role");
    }

    function test_initialize_cannotCallTwice() public {
        vm.expectRevert();
        vault.initialize(IERC20(address(token)), "X", "Y", admin, address(0));
    }

    function test_initialize_revertsForZeroAdmin() public {
        CommitmentsVault implementation = new CommitmentsVault();
        bytes memory initData =
            abi.encodeCall(CommitmentsVault.initialize, (IERC20(address(token)), "X", "Y", address(0), address(0)));
        vm.expectRevert(ICommitmentsVault.ZeroAddress.selector);
        new ERC1967Proxy(address(implementation), initData);
    }

    // =========================================================================
    // Deposit / VAULT-01
    // =========================================================================

    function test_deposit_mintsShares() public {
        uint256 shares = _aliceDeposit();
        assertGt(shares, 0, "shares minted");
        assertEq(vault.balanceOf(alice), shares, "alice share balance");
    }

    function test_deposit_transfersAssetsToStrategy() public {
        _aliceDeposit();
        // All deposited assets should be in strategy
        assertEq(strategy.totalAssets(), INITIAL_DEPOSIT, "strategy has assets");
        assertEq(token.balanceOf(address(vault)), 0, "vault holds no idle tokens");
    }

    function test_deposit_revertsWhenPaused() public {
        vm.prank(pauser);
        vault.pauseDeposits();

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(ERC4626Upgradeable.ERC4626ExceededMaxDeposit.selector, alice, INITIAL_DEPOSIT, 0)
        );
        vault.deposit(INITIAL_DEPOSIT, alice);
    }

    function test_deposit_revertsWhenPaused_mint() public {
        vm.prank(pauser);
        vault.pauseDeposits();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ERC4626Upgradeable.ERC4626ExceededMaxMint.selector, alice, 1e18, 0));
        vault.mint(1e18, alice);
    }

    function test_maxDeposit_returnsMaxWhenNotPaused() public view {
        assertEq(vault.maxDeposit(alice), type(uint256).max, "maxDeposit not paused");
    }

    function test_maxDeposit_returnsZeroWhenPaused() public {
        vm.prank(pauser);
        vault.pauseDeposits();
        assertEq(vault.maxDeposit(alice), 0, "maxDeposit paused");
    }

    function test_maxMint_returnsZeroWhenPaused() public {
        vm.prank(pauser);
        vault.pauseDeposits();
        assertEq(vault.maxMint(alice), 0, "maxMint paused");
    }

    // =========================================================================
    // Instant withdraw / redeem — standard ERC-4626 exits
    // =========================================================================

    function test_withdraw_instant_idleMode() public {
        CommitmentsVault idleVault = _deployIdleVault();
        token.mint(alice, INITIAL_DEPOSIT);
        vm.startPrank(alice);
        token.approve(address(idleVault), type(uint256).max);
        idleVault.deposit(INITIAL_DEPOSIT, alice);

        uint256 balanceBefore = token.balanceOf(alice);
        uint256 withdrawAmount = 400e18;
        uint256 sharesBurned = idleVault.withdraw(withdrawAmount, alice, alice);
        vm.stopPrank();

        assertGt(sharesBurned, 0, "shares burned");
        assertEq(token.balanceOf(alice), balanceBefore + withdrawAmount, "alice received assets instantly");
        assertEq(idleVault.totalAssets(), INITIAL_DEPOSIT - withdrawAmount, "vault assets reduced");
    }

    function test_withdraw_pullsFromStrategy() public {
        _aliceDeposit();
        // All assets sit in the strategy; vault has zero idle balance.
        assertEq(token.balanceOf(address(vault)), 0, "vault idle balance is zero");
        assertEq(token.balanceOf(address(strategy)), INITIAL_DEPOSIT, "strategy holds the assets");

        uint256 withdrawAmount = 400e18;
        uint256 aliceBalanceBefore = token.balanceOf(alice);

        vm.prank(alice);
        vault.withdraw(withdrawAmount, alice, alice);

        // Strategy balance drops by exactly the shortfall pulled; receiver is paid in full.
        assertEq(token.balanceOf(address(strategy)), INITIAL_DEPOSIT - withdrawAmount, "strategy balance dropped");
        assertEq(strategy.totalAssets(), INITIAL_DEPOSIT - withdrawAmount, "strategy accounting dropped");
        assertEq(token.balanceOf(alice), aliceBalanceBefore + withdrawAmount, "alice received assets instantly");
        assertEq(token.balanceOf(address(vault)), 0, "no residue stranded in the vault");
    }

    function test_redeem_instant_idleMode() public {
        CommitmentsVault idleVault = _deployIdleVault();
        token.mint(alice, INITIAL_DEPOSIT);
        vm.startPrank(alice);
        token.approve(address(idleVault), type(uint256).max);
        uint256 shares = idleVault.deposit(INITIAL_DEPOSIT, alice);

        uint256 balanceBefore = token.balanceOf(alice);
        uint256 expectedAssets = idleVault.previewRedeem(shares / 2);
        uint256 assets = idleVault.redeem(shares / 2, alice, alice);
        vm.stopPrank();

        assertEq(assets, expectedAssets, "redeem matches previewRedeem");
        assertEq(token.balanceOf(alice), balanceBefore + assets, "alice received assets instantly");
        assertEq(idleVault.balanceOf(alice), shares - shares / 2, "remaining shares intact");
    }

    function test_redeem_pullsFromStrategy() public {
        uint256 shares = _aliceDeposit();

        uint256 expectedAssets = vault.previewRedeem(shares);
        uint256 balanceBefore = token.balanceOf(alice);

        vm.prank(alice);
        uint256 assets = vault.redeem(shares, alice, alice);

        assertEq(assets, expectedAssets, "redeem matches previewRedeem");
        assertEq(token.balanceOf(alice), balanceBefore + assets, "alice paid from strategy pull");
        assertEq(token.balanceOf(address(strategy)), INITIAL_DEPOSIT - assets, "strategy drained by redeemed assets");
        assertEq(vault.balanceOf(alice), 0, "all shares burned");
    }

    function test_withdraw_withAllowance_thirdPartyCaller() public {
        _aliceDeposit();
        uint256 withdrawAmount = 100e18;
        uint256 sharesNeeded = vault.previewWithdraw(withdrawAmount);

        // Alice grants bob a share allowance; bob withdraws alice's position to himself.
        vm.prank(alice);
        vault.approve(bob, sharesNeeded);

        uint256 bobBalanceBefore = token.balanceOf(bob);
        vm.prank(bob);
        vault.withdraw(withdrawAmount, bob, alice);

        assertEq(token.balanceOf(bob), bobBalanceBefore + withdrawAmount, "bob received the assets");
        assertEq(vault.allowance(alice, bob), 0, "allowance fully consumed");
    }

    function test_withdraw_withoutAllowance_reverts() public {
        _aliceDeposit();

        vm.prank(bob);
        vm.expectRevert(); // ERC20InsufficientAllowance
        vault.withdraw(100e18, bob, alice);
    }

    function test_withdraw_notGatedByDepositPause() public {
        _aliceDeposit();

        vm.prank(pauser);
        vault.pauseDeposits();

        // Only the deposit circuit breaker exists — exits remain live during a pause.
        uint256 balanceBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw(100e18, alice, alice);
        assertEq(token.balanceOf(alice), balanceBefore + 100e18, "withdraw unaffected by deposit pause");
    }

    function test_roundTrip_depositRedeem_conservesAssets() public {
        uint256 shares = _aliceDeposit();

        vm.prank(alice);
        uint256 assets = vault.redeem(shares, alice, alice);

        // Full round trip: alice recovers her deposit (≤1 wei rounding to virtual shares).
        assertApproxEqAbs(assets, INITIAL_DEPOSIT, 1, "round trip conserves assets");
        assertApproxEqAbs(token.balanceOf(alice), INITIAL_DEPOSIT, 1, "alice balance restored");
        assertEq(vault.balanceOf(alice), 0, "no shares remain");
    }

    function test_maxWithdraw_reflectsHolderPosition() public {
        uint256 shares = _aliceDeposit();

        // OZ default: maxWithdraw(owner) = previewRedeem(balanceOf(owner)).
        assertEq(vault.maxWithdraw(alice), vault.previewRedeem(shares), "maxWithdraw = previewRedeem(balance)");
        assertGt(vault.maxWithdraw(alice), 0, "non-zero for a holder");
        assertEq(vault.maxWithdraw(bob), 0, "zero for a non-holder");
    }

    function test_maxRedeem_reflectsHolderBalance() public {
        uint256 shares = _aliceDeposit();

        // OZ default: maxRedeem(owner) = balanceOf(owner).
        assertEq(vault.maxRedeem(alice), shares, "maxRedeem = share balance");
        assertEq(vault.maxRedeem(bob), 0, "zero for a non-holder");
    }

    function test_withdraw_maxWithdraw_exitsFullPosition() public {
        _aliceDeposit();

        uint256 maxAssets = vault.maxWithdraw(alice);
        vm.prank(alice);
        vault.withdraw(maxAssets, alice, alice);

        assertEq(vault.maxWithdraw(alice), 0, "position fully exited");
        assertApproxEqAbs(token.balanceOf(alice), INITIAL_DEPOSIT, 1, "alice recovered her deposit");
    }

    // =========================================================================
    // Yield / VAULT-03
    // =========================================================================

    function test_totalAssets_reflectsStrategyYield() public {
        _aliceDeposit();
        uint256 yieldAmount = 100e18;

        // Simulate yield in strategy
        strategy.simulateYield(yieldAmount);

        assertEq(vault.totalAssets(), INITIAL_DEPOSIT + yieldAmount, "totalAssets includes yield");
    }

    function test_sharePrice_increasesWithYield() public {
        _aliceDeposit();
        uint256 priceBefore = vault.convertToAssets(1e18);

        strategy.simulateYield(500e18);

        uint256 priceAfter = vault.convertToAssets(1e18);
        assertGt(priceAfter, priceBefore, "share price increased with yield");
    }

    function test_yield_realizableViaWithdraw() public {
        _aliceDeposit();
        uint256 yieldAmount = 100e18;

        // Simulate yield with real backing tokens so the strategy can pay it out.
        token.mint(address(strategy), yieldAmount);
        strategy.simulateYield(yieldAmount);

        uint256 maxAssets = vault.maxWithdraw(alice);
        assertGt(maxAssets, INITIAL_DEPOSIT, "yield grew alice's claim");

        vm.prank(alice);
        vault.withdraw(maxAssets, alice, alice);
        assertApproxEqAbs(token.balanceOf(alice), INITIAL_DEPOSIT + yieldAmount, 1e9, "yield paid out on exit");
    }

    function test_totalAssets_noStrategy_usesBalance() public {
        CommitmentsVault idleVault = _deployIdleVault();

        // Directly transfer tokens (simulate idle deposit)
        token.mint(address(idleVault), 500e18);
        assertEq(idleVault.totalAssets(), 500e18, "totalAssets from balance");
    }

    // =========================================================================
    // Circuit Breaker — deposits-only pause
    // =========================================================================

    function test_pauseDeposits_onlyPauser() public {
        vm.prank(alice); // Not a pauser
        vm.expectRevert();
        vault.pauseDeposits();
    }

    function test_unpauseDeposits_onlyUnpauser() public {
        vm.prank(pauser);
        vault.pauseDeposits();

        // Pauser cannot unpause
        vm.prank(pauser);
        vm.expectRevert();
        vault.unpauseDeposits();

        // Unpauser can unpause
        vm.prank(unpauser);
        vault.unpauseDeposits();
        assertFalse(vault.depositsPaused(), "deposits unpaused");
    }

    function test_pauseDeposits_stateFlag() public {
        assertFalse(vault.depositsPaused(), "initially not paused");

        vm.prank(pauser);
        vault.pauseDeposits();

        assertTrue(vault.depositsPaused(), "paused after pauseDeposits");
    }

    function test_pauseDeposits_unpauseRestoresDeposits() public {
        vm.prank(pauser);
        vault.pauseDeposits();

        vm.prank(unpauser);
        vault.unpauseDeposits();

        uint256 shares = _aliceDeposit();
        assertGt(shares, 0, "deposit succeeds after unpause");
    }

    // =========================================================================
    // Strategy management — access control + COR-04 migration guard
    // =========================================================================

    function test_setStrategy_onlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.setYieldStrategy(address(strategy));
    }

    function test_setStrategy_updatesStrategy() public {
        MockStrategy newStrategy = new MockStrategy(address(token), address(vault));

        vm.prank(admin);
        vault.setYieldStrategy(address(newStrategy));

        assertEq(vault.yieldStrategy(), address(newStrategy), "strategy updated");
    }

    function test_setStrategy_reverts_when_old_strategy_has_assets() public {
        // Alice deposits — strategy now holds assets.
        _aliceDeposit();
        MockStrategy newStrategy = new MockStrategy(address(token), address(vault));

        uint256 currentAssets = strategy.totalAssets();
        assertGt(currentAssets, 0, "strategy has assets after deposit");

        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(ICommitmentsVault.StrategyHasAssets.selector, address(strategy), currentAssets)
        );
        vault.setYieldStrategy(address(newStrategy));
    }

    function test_setStrategy_succeeds_when_old_strategy_empty() public {
        // No deposits — strategy reports 0 totalAssets.
        MockStrategy newStrategy = new MockStrategy(address(token), address(vault));
        assertEq(strategy.totalAssets(), 0, "strategy is empty");

        vm.prank(admin);
        vault.setYieldStrategy(address(newStrategy));

        assertEq(vault.yieldStrategy(), address(newStrategy), "strategy updated");
    }

    function test_setStrategy_succeeds_from_zero_address() public {
        // Deploy a fresh vault with no strategy (address(0)) and immediately set one.
        CommitmentsVault idleVault = _deployIdleVault();
        MockStrategy freshStrategy = new MockStrategy(address(token), address(idleVault));

        // old == address(0) — guard must be skipped unconditionally.
        vm.prank(admin);
        idleVault.setYieldStrategy(address(freshStrategy));

        assertEq(idleVault.yieldStrategy(), address(freshStrategy), "strategy set from zero");
    }

    function test_setStrategy_reverts_wrongAsset() public {
        MockERC20 otherToken = new MockERC20("Other", "OTH", 18);
        MockStrategy misbound = new MockStrategy(address(otherToken), address(vault));

        vm.prank(admin);
        vm.expectRevert(ICommitmentsVault.WrongStrategyAsset.selector);
        vault.setYieldStrategy(address(misbound));
    }

    function test_setStrategy_reverts_wrongVault() public {
        MockStrategy misbound = new MockStrategy(address(token), makeAddr("otherVault"));

        vm.prank(admin);
        vm.expectRevert(ICommitmentsVault.WrongStrategyVault.selector);
        vault.setYieldStrategy(address(misbound));
    }

    function test_setStrategy_idleToLive_sweepsIdleBalance() public {
        // Alice deposits into an idle vault — assets sit in the vault itself.
        CommitmentsVault idleVault = _deployIdleVault();
        token.mint(alice, INITIAL_DEPOSIT);
        vm.startPrank(alice);
        token.approve(address(idleVault), type(uint256).max);
        idleVault.deposit(INITIAL_DEPOSIT, alice);
        vm.stopPrank();

        assertEq(token.balanceOf(address(idleVault)), INITIAL_DEPOSIT, "idle vault holds deposit");

        // Setting a live strategy sweeps the idle balance so totalAssets stays continuous.
        MockStrategy freshStrategy = new MockStrategy(address(token), address(idleVault));
        vm.prank(admin);
        idleVault.setYieldStrategy(address(freshStrategy));

        assertEq(token.balanceOf(address(idleVault)), 0, "idle balance swept out of vault");
        assertEq(freshStrategy.totalAssets(), INITIAL_DEPOSIT, "strategy received the sweep");
        assertEq(idleVault.totalAssets(), INITIAL_DEPOSIT, "totalAssets continuous across transition");
    }

    // =========================================================================
    // S2 regression: idle balance must count toward totalAssets when a strategy
    // is set, and live → live migration must not collapse the share price.
    // =========================================================================

    function test_totalAssets_countsIdleBalance_withStrategySet() public {
        _aliceDeposit();
        assertEq(vault.totalAssets(), INITIAL_DEPOSIT, "baseline: all assets in strategy");

        // Tokens landing in the vault directly (transfer, partial drain, dust) must
        // count toward NAV rather than silently vanishing from share pricing.
        uint256 idleAmount = 250e18;
        token.mint(address(vault), idleAmount);

        assertEq(vault.totalAssets(), INITIAL_DEPOSIT + idleAmount, "totalAssets = strategy + idle");
    }

    function test_totalAssets_midMigration_drainedStrategy_preservesSharePrice() public {
        uint256 shares = _aliceDeposit();
        uint256 priceBefore = vault.convertToAssets(1e18);

        // Documented migration step 1-2: pause deposits, drain the old strategy.
        // The drain parks every depositor's assets in the vault as idle balance.
        vm.prank(pauser);
        vault.pauseDeposits();
        strategy.withdraw(INITIAL_DEPOSIT);
        assertEq(strategy.totalAssets(), 0, "old strategy drained");
        assertEq(token.balanceOf(address(vault)), INITIAL_DEPOSIT, "assets idle in vault");

        // Pre-fix, totalAssets() read 0 from the drained strategy and the share price
        // collapsed to the virtual floor: redeemers got ~0 and an attacker could mint
        // the supply for a pittance. Idle must keep backing the shares.
        assertEq(vault.totalAssets(), INITIAL_DEPOSIT, "totalAssets continuous mid-migration");
        assertEq(vault.convertToAssets(1e18), priceBefore, "share price continuous mid-migration");
        assertApproxEqAbs(vault.previewRedeem(shares), INITIAL_DEPOSIT, 1, "alice's claim intact mid-migration");
    }

    function test_setStrategy_liveToLive_migration_sweepsIdleAndPreservesSharePrice() public {
        uint256 shares = _aliceDeposit();
        uint256 priceBefore = vault.convertToAssets(1e18);

        // Full documented live → live migration: pause deposits, drain old strategy,
        // then setYieldStrategy(new).
        vm.prank(pauser);
        vault.pauseDeposits();
        strategy.withdraw(INITIAL_DEPOSIT);

        MockStrategy newStrategy = new MockStrategy(address(token), address(vault));
        vm.prank(admin);
        vault.setYieldStrategy(address(newStrategy));

        // The sweep must run on live → live too (pre-fix it only ran when old == 0),
        // redeploying the drained idle balance into the new strategy.
        assertEq(token.balanceOf(address(vault)), 0, "idle balance swept into new strategy");
        assertEq(newStrategy.totalAssets(), INITIAL_DEPOSIT, "new strategy received the sweep");
        assertEq(vault.totalAssets(), INITIAL_DEPOSIT, "totalAssets continuous across migration");
        assertEq(vault.convertToAssets(1e18), priceBefore, "share price continuous across migration");

        // Depositors remain whole after the migration completes.
        vm.prank(unpauser);
        vault.unpauseDeposits();
        vm.prank(alice);
        uint256 assets = vault.redeem(shares, alice, alice);
        assertApproxEqAbs(assets, INITIAL_DEPOSIT, 1, "alice recovers her deposit post-migration");
    }

    function test_setStrategy_liveToLive_midMigrationAttacker_cannotMintSupplyCheaply() public {
        _aliceDeposit();

        // Migration in progress without a deposit pause (worst case): old strategy
        // drained, new strategy not yet set.
        strategy.withdraw(INITIAL_DEPOSIT);

        // Pre-fix, totalAssets() == 0 here, so bob's 1 token would mint as many shares
        // as alice's entire 1000-token position. Post-fix he gets fair pro-rata shares.
        vm.prank(bob);
        uint256 bobShares = vault.deposit(1e18, bob);

        assertApproxEqAbs(vault.previewRedeem(bobShares), 1e18, 1, "bob's shares are worth exactly what he deposited");
        assertLt(bobShares * 900, vault.totalSupply(), "bob holds a tiny fraction of supply, not the majority");
    }

    // =========================================================================
    // Events
    // =========================================================================

    function test_pauseDeposits_emitsEvent() public {
        vm.expectEmit(false, false, false, true, address(vault));
        emit ICommitmentsVault.DepositsPauseToggled(true);

        vm.prank(pauser);
        vault.pauseDeposits();
    }

    function test_setStrategy_emitsEvent() public {
        MockStrategy newStrategy = new MockStrategy(address(token), address(vault));

        vm.expectEmit(true, true, false, true, address(vault));
        emit ICommitmentsVault.YieldStrategyUpdated(address(strategy), address(newStrategy));

        vm.prank(admin);
        vault.setYieldStrategy(address(newStrategy));
    }

    function test_withdraw_emitsWithdrawEvent() public {
        _aliceDeposit();
        uint256 withdrawAmount = 100e18;
        uint256 sharesBurned = vault.previewWithdraw(withdrawAmount);

        vm.expectEmit(true, true, true, true, address(vault));
        emit IERC4626.Withdraw(alice, alice, alice, withdrawAmount, sharesBurned);

        vm.prank(alice);
        vault.withdraw(withdrawAmount, alice, alice);
    }

    // =========================================================================
    // Multi-user scenarios
    // =========================================================================

    function test_multiUser_independentExits() public {
        uint256 aliceShares = _aliceDeposit();

        vm.prank(bob);
        uint256 bobShares = vault.deposit(INITIAL_DEPOSIT, bob);

        // Alice exits fully; bob's position is untouched.
        vm.prank(alice);
        vault.redeem(aliceShares, alice, alice);

        assertEq(vault.balanceOf(alice), 0, "alice exited");
        assertEq(vault.balanceOf(bob), bobShares, "bob's shares untouched");

        // Bob can still exit for his full deposit afterwards.
        vm.prank(bob);
        uint256 bobAssets = vault.redeem(bobShares, bob, bob);
        assertApproxEqAbs(bobAssets, INITIAL_DEPOSIT, 1, "bob recovered his deposit");
    }

    // =========================================================================
    // ERC-4626 compliance checks
    // =========================================================================

    function test_decimalsOffset_is9() public view {
        // Verify inflation protection: share decimals = asset decimals + 9
        assertEq(vault.decimals(), token.decimals() + 9, "decimals offset = 9");
    }

    function test_convertToShares_initialRate() public view {
        // Initial rate: 1 asset = 1e9 shares (due to decimals offset)
        uint256 shares = vault.convertToShares(1e18);
        assertGt(shares, 0, "convertToShares > 0");
    }

    // =========================================================================
    // SPEC-02: maxDeposit strategy routing tests
    // =========================================================================

    function testMaxDeposit_routesThroughStrategy() public {
        // Strategy is already set in setUp(). Configure it with a specific limit.
        strategy.setMaxDeposit(500e18);

        assertEq(vault.maxDeposit(alice), 500e18, "maxDeposit should return strategy's limit");
    }

    function testMaxDeposit_returnsMaxUint_withoutStrategy() public {
        // Remove the strategy
        // First drain it (no assets currently in strategy)
        vm.prank(admin);
        vault.setYieldStrategy(address(0));

        assertEq(vault.maxDeposit(alice), type(uint256).max, "maxDeposit without strategy should return max uint");
    }

    function testMaxDeposit_returnsZero_whenPaused() public {
        // Even with a strategy configured with a large limit, pausing overrides
        strategy.setMaxDeposit(1000e18);

        vm.prank(pauser);
        vault.pauseDeposits();

        assertEq(vault.maxDeposit(alice), 0, "maxDeposit should be 0 when deposits are paused");
    }

    // =========================================================================
    // UUPS upgrade authorization
    // =========================================================================

    function test_upgrade_revertsForNonAdmin() public {
        CommitmentsVault newImplementation = new CommitmentsVault();

        vm.prank(alice);
        vm.expectRevert();
        vault.upgradeToAndCall(address(newImplementation), "");
    }

    function test_upgrade_succeedsForAdmin() public {
        uint256 shares = _aliceDeposit();
        CommitmentsVault newImplementation = new CommitmentsVault();

        vm.prank(admin);
        vault.upgradeToAndCall(address(newImplementation), "");

        // State survives the upgrade (EIP-7201 namespaced storage).
        assertEq(vault.balanceOf(alice), shares, "share balance survives upgrade");
        assertEq(vault.yieldStrategy(), address(strategy), "strategy pointer survives upgrade");
    }
}
