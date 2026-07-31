// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";

import {PremiumSkimStrategy} from "src/periphery/vaults/strategies/PremiumSkimStrategy.sol";
import {SkimmingMockStrategy} from "../helpers/SkimmingMockStrategy.sol";
import {MockERC20} from "../helpers/MockERC20.sol";

/// @title PremiumSkimStrategyTest
/// @notice Unit surface of the skim strategy's high-water-mark accounting: principal tracking
///         through deposits/withdrawals (including gain-exiting withdrawals), no double-charge,
///         loss → no skim → recovery charges only above the mark, the operator/premium split,
///         vault-only gates, and the loud unbacked-skim failure.
contract PremiumSkimStrategyTest is Test {
    SkimmingMockStrategy internal strategy;
    MockERC20 internal dai;

    address internal vaultAddr = makeAddr("vault");
    address internal operator = makeAddr("operator");
    address internal conduit = makeAddr("conduit");
    address internal yielder = makeAddr("yielder");

    uint16 internal constant SKIM_BPS = 2_000; // 20% of new gains
    uint16 internal constant OP_FEE_BPS = 1_000; // 10% of the skim

    function setUp() public {
        dai = new MockERC20("Dai Stablecoin", "DAI", 18);
        strategy = new SkimmingMockStrategy(address(dai), vaultAddr, operator, conduit, SKIM_BPS, OP_FEE_BPS);
        dai.mint(yielder, type(uint128).max);
        vm.prank(yielder);
        dai.approve(address(strategy), type(uint256).max);
    }

    // ---------------------------------------------------------------
    // Helpers replicating the vault's push handshake
    // ---------------------------------------------------------------

    function _vaultDeposit(uint256 assets) internal {
        dai.mint(address(strategy), assets); // vault pushes before calling
        vm.prank(vaultAddr);
        strategy.deposit(assets);
    }

    function _vaultWithdraw(uint256 assets) internal {
        vm.prank(vaultAddr);
        strategy.withdraw(assets);
    }

    function _backedYield(uint256 amount) internal {
        vm.prank(yielder);
        strategy.simulateBackedYield(amount);
    }

    // ---------------------------------------------------------------
    // Constructor validation
    // ---------------------------------------------------------------

    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert(PremiumSkimStrategy.ZeroAddress.selector);
        new SkimmingMockStrategy(address(0), vaultAddr, operator, conduit, SKIM_BPS, OP_FEE_BPS);
        vm.expectRevert(PremiumSkimStrategy.ZeroAddress.selector);
        new SkimmingMockStrategy(address(dai), address(0), operator, conduit, SKIM_BPS, OP_FEE_BPS);
        vm.expectRevert(PremiumSkimStrategy.ZeroAddress.selector);
        new SkimmingMockStrategy(address(dai), vaultAddr, address(0), conduit, SKIM_BPS, OP_FEE_BPS);
        vm.expectRevert(PremiumSkimStrategy.ZeroAddress.selector);
        new SkimmingMockStrategy(address(dai), vaultAddr, operator, address(0), SKIM_BPS, OP_FEE_BPS);
    }

    function test_constructor_rejectsBpsOverMax() public {
        vm.expectRevert(PremiumSkimStrategy.BpsExceedsMax.selector);
        new SkimmingMockStrategy(address(dai), vaultAddr, operator, conduit, 10_001, OP_FEE_BPS);
        vm.expectRevert(PremiumSkimStrategy.BpsExceedsMax.selector);
        new SkimmingMockStrategy(address(dai), vaultAddr, operator, conduit, SKIM_BPS, 10_001);
    }

    // ---------------------------------------------------------------
    // Vault-only gates
    // ---------------------------------------------------------------

    function test_deposit_onlyVault() public {
        vm.expectRevert(PremiumSkimStrategy.OnlyVault.selector);
        strategy.deposit(1e18);
    }

    function test_withdraw_onlyVault() public {
        vm.expectRevert(PremiumSkimStrategy.OnlyVault.selector);
        strategy.withdraw(1e18);
    }

    // ---------------------------------------------------------------
    // Principal accounting
    // ---------------------------------------------------------------

    function test_depositAndWithdraw_trackPrincipal() public {
        _vaultDeposit(1_000e18);
        assertEq(strategy.principal(), 1_000e18);
        assertEq(strategy.totalAssets(), 1_000e18);

        _vaultWithdraw(400e18);
        assertEq(strategy.principal(), 600e18);
        assertEq(strategy.totalAssets(), 600e18);
        assertEq(dai.balanceOf(vaultAddr), 400e18);
    }

    function test_withdraw_beyondPrincipal_untracksExitedGains() public {
        _vaultDeposit(1_000e18);
        _backedYield(100e18);
        strategy.skim(); // fee 20, charged = 80, totalAssets 1_080

        // 1_050 out: 1_000 principal + 50 of the charged gains leave to depositors.
        _vaultWithdraw(1_050e18);
        assertEq(strategy.principal(), 0);
        assertEq(strategy.chargedGains(), 30e18); // 80 − 50 exited
        assertEq(strategy.totalAssets(), 30e18);

        // Remaining gains are exactly the charged mark — nothing new to skim.
        (uint256 newGains,,) = strategy.pendingSkim();
        assertEq(newGains, 0);
    }

    function test_withdraw_gainsExitBeyondChargedMark_floorsAtZero() public {
        _vaultDeposit(1_000e18);
        _backedYield(100e18); // uncharged gains
        // 1_090 out: gainsOut 90 > chargedGains 0 → charged stays floored at 0.
        _vaultWithdraw(1_090e18);
        assertEq(strategy.principal(), 0);
        assertEq(strategy.chargedGains(), 0);
        assertEq(strategy.totalAssets(), 10e18);
        // The 10 remaining gains are fresh — skimmable.
        (uint256 newGains, uint256 opFee, uint256 prem) = strategy.pendingSkim();
        assertEq(newGains, 10e18);
        assertEq(opFee + prem, 2e18);
    }

    // ---------------------------------------------------------------
    // HWM skim math
    // ---------------------------------------------------------------

    function test_skim_splitsFeeAndRemarks() public {
        _vaultDeposit(1_000e18);
        _backedYield(100e18);

        (uint256 newGains, uint256 opFee, uint256 prem) = strategy.pendingSkim();
        assertEq(newGains, 100e18);
        assertEq(opFee, 2e18); // 20% skim → 20; 10% of that → 2
        assertEq(prem, 18e18);

        vm.expectEmit(true, true, true, true);
        emit PremiumSkimStrategy.YieldSkimmed(100e18, 20e18);
        vm.expectEmit(true, true, true, true);
        emit PremiumSkimStrategy.OperatorFeePaid(operator, 2e18);
        vm.expectEmit(true, true, true, true);
        emit PremiumSkimStrategy.PremiumRouted(conduit, 18e18);
        (uint256 paidOp, uint256 paidPrem) = strategy.skim();

        assertEq(paidOp, opFee);
        assertEq(paidPrem, prem);
        assertEq(dai.balanceOf(operator), 2e18);
        assertEq(dai.balanceOf(conduit), 18e18);
        assertEq(strategy.totalAssets(), 1_080e18);
        assertEq(strategy.chargedGains(), 80e18); // post-skim gains fully charged
    }

    function test_skim_noDoubleCharge() public {
        _vaultDeposit(1_000e18);
        _backedYield(100e18);
        strategy.skim();

        (uint256 newGains,,) = strategy.pendingSkim();
        assertEq(newGains, 0);
        vm.expectRevert(PremiumSkimStrategy.NothingToSkim.selector);
        strategy.skim();
    }

    function test_skim_chargesOnlyIncrementalGains() public {
        _vaultDeposit(1_000e18);
        _backedYield(100e18);
        strategy.skim(); // charged 80

        _backedYield(50e18); // gains 130, new = 50
        (uint256 newGains, uint256 opFee, uint256 prem) = strategy.pendingSkim();
        assertEq(newGains, 50e18);
        assertEq(opFee + prem, 10e18);
        strategy.skim();
        assertEq(strategy.chargedGains(), 120e18); // 130 − 10
        assertEq(dai.balanceOf(operator), 3e18); // 2 + 1
        assertEq(dai.balanceOf(conduit), 27e18); // 18 + 9
    }

    function test_loss_blocksSkimUntilRecoveredAboveMark() public {
        _vaultDeposit(1_000e18);
        _backedYield(100e18);
        strategy.skim(); // charged 80, totalAssets 1_080

        strategy.simulateLoss(60e18); // gains 20 < charged 80
        (uint256 newGains,,) = strategy.pendingSkim();
        assertEq(newGains, 0);
        vm.expectRevert(PremiumSkimStrategy.NothingToSkim.selector);
        strategy.skim();
        assertEq(strategy.chargedGains(), 80e18); // never decreases on loss

        _backedYield(60e18); // gains back to 80 == mark — still nothing NEW
        (newGains,,) = strategy.pendingSkim();
        assertEq(newGains, 0);

        _backedYield(20e18); // gains 100, new = 20 above the mark
        (newGains,,) = strategy.pendingSkim();
        assertEq(newGains, 20e18);
        strategy.skim();
        assertEq(strategy.chargedGains(), 96e18); // 100 − 4
    }

    function test_skim_feeRoundsToZero_reverts() public {
        _vaultDeposit(1_000e18);
        _backedYield(1); // 1 wei of gains → fee = 0
        (uint256 newGains, uint256 opFee, uint256 prem) = strategy.pendingSkim();
        assertEq(newGains, 1);
        assertEq(opFee + prem, 0);
        vm.expectRevert(PremiumSkimStrategy.NothingToSkim.selector);
        strategy.skim();
    }

    function test_skim_unbackedYield_revertsLoudly() public {
        _vaultDeposit(1_000e18);
        strategy.simulateYield(100e18); // ledger-only: no tokens behind it
        _vaultWithdraw(1_000e18); // drain the real backing
        vm.expectRevert(); // ERC20 transfer failure — intentionally loud
        strategy.skim();
    }

    function test_donationViaDeposit_isPrincipal_neverSkimmed() public {
        _vaultDeposit(1_000e18);
        // A vault donation lands through the same push+deposit path.
        _vaultDeposit(500e18);
        assertEq(strategy.principal(), 1_500e18);
        (uint256 newGains,,) = strategy.pendingSkim();
        assertEq(newGains, 0);
    }

    // ---------------------------------------------------------------
    // Fuzz: charge discipline over deposit/yield/loss/skim sequences
    // ---------------------------------------------------------------

    /// @dev Across an arbitrary yield→skim→loss→recover→skim sequence, total fees taken never
    ///      exceed skimBps of total yield injected, and every skim leaves gains == charged mark.
    function testFuzz_skimNeverOvercharges(uint96 dep, uint96 y1, uint96 loss, uint96 y2) public {
        uint256 depA = bound(uint256(dep), 1e18, 1e27);
        uint256 y1A = bound(uint256(y1), 0, 1e27);
        uint256 y2A = bound(uint256(y2), 0, 1e27);
        _vaultDeposit(depA);

        uint256 feesTaken;
        if (y1A > 0) _backedYield(y1A);
        (, uint256 op1, uint256 p1) = strategy.pendingSkim();
        if (op1 + p1 > 0) {
            strategy.skim();
            feesTaken += op1 + p1;
            assertEq(_gains(), strategy.chargedGains());
        }

        uint256 lossA = bound(uint256(loss), 0, strategy.totalAssets());
        if (lossA > 0) strategy.simulateLoss(lossA);
        (, uint256 opL, uint256 pL) = strategy.pendingSkim();
        if (lossA > 0 && _gains() <= strategy.chargedGains()) {
            assertEq(opL + pL, 0); // under the mark ⇒ nothing skimmable
        }

        if (y2A > 0) _backedYield(y2A);
        (, uint256 op2, uint256 p2) = strategy.pendingSkim();
        if (op2 + p2 > 0) {
            strategy.skim();
            feesTaken += op2 + p2;
            assertEq(_gains(), strategy.chargedGains());
        }

        // Total charge ≤ skimBps of total yield ever injected.
        assertLe(feesTaken, ((y1A + y2A) * SKIM_BPS) / 10_000);
        // Split conservation on every skim is implied: opFee + premium == fee (checked above).
    }

    function _gains() internal view returns (uint256) {
        uint256 ta = strategy.totalAssets();
        uint256 p = strategy.principal();
        return ta > p ? ta - p : 0;
    }
}
