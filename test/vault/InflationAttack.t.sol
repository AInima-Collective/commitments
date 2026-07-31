// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import {CommitmentsVault} from "src/periphery/vaults/CommitmentsVault.sol";
import {MockERC20} from "../helpers/MockERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title InflationAttack — VAULT-07 dedicated proof
/// @notice Proves that the _decimalsOffset() = 9 virtual share mechanism prevents the ERC-4626 inflation attack.
///
/// Background on the classic inflation attack:
/// 1. Attacker deposits 1 wei → gets some shares at the initial 1:1 ratio
/// 2. Attacker donates a large amount of tokens directly to the vault (bypassing deposit)
/// 3. This inflates totalAssets without minting new shares → share price spikes
/// 4. Victim deposits and receives 0 shares (or severely rounded-down shares)
/// 5. Attacker withdraws all shares, capturing most of the victim's deposit as profit
///
/// OpenZeppelin's mitigation: _decimalsOffset() = 9 adds a virtual offset of 1e9 shares
/// to the share price calculation:
///   shares = assets * (totalSupply + 10^9) / (totalAssets + 1)
/// This makes the share price denominator start at 1e9 virtual shares, so a donation
/// attack requires spending 1e9x more than the profit — economically infeasible.
contract InflationAttackTest is Test {
    CommitmentsVault public vault;
    MockERC20 public token;

    address public admin = makeAddr("admin");
    address public attacker = makeAddr("attacker");
    address public victim = makeAddr("victim");

    uint256 constant LARGE_AMOUNT = 1e18;
    uint256 constant ONE_WEI = 1;

    function setUp() public {
        // Deploy token
        token = new MockERC20("Test Token", "TEST", 18);

        // Deploy CommitmentsVault implementation
        CommitmentsVault implementation = new CommitmentsVault();

        // Deploy proxy with no strategy — totalAssets() reads balanceOf(vault)
        // This isolates the inflation attack test from strategy complexity
        bytes memory initData = abi.encodeCall(
            CommitmentsVault.initialize, (IERC20(address(token)), "Commitments TEST Vault", "cvTEST", admin, address(0))
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        vault = CommitmentsVault(address(proxy));

        // Fund attacker and victim
        token.mint(attacker, LARGE_AMOUNT + ONE_WEI + 1);
        token.mint(victim, LARGE_AMOUNT + 1);
    }

    // =========================================================================
    // VAULT-07: Primary inflation attack proof
    // =========================================================================

    /// @notice Core VAULT-07 test: attacker cannot significantly profit from the donation attack.
    /// The victim MUST receive non-zero shares even after the attacker's donation.
    function test_inflationAttack_fails() public {
        // ---- ATTACKER SETUP ----
        // Step 1: Attacker deposits 1 wei to become first depositor
        vm.startPrank(attacker);
        token.approve(address(vault), ONE_WEI);
        uint256 attackerShares = vault.deposit(ONE_WEI, attacker);
        vm.stopPrank();

        assertGt(attackerShares, 0, "Attacker must receive shares for initial deposit");

        // Step 2: Attacker donates LARGE_AMOUNT directly to vault (bypasses deposit, inflates price)
        vm.prank(attacker);
        token.transfer(address(vault), LARGE_AMOUNT);

        // ---- VICTIM DEPOSIT ----
        // Step 3: Victim deposits LARGE_AMOUNT — this is the attack target
        vm.startPrank(victim);
        token.approve(address(vault), LARGE_AMOUNT);
        uint256 victimShares = vault.deposit(LARGE_AMOUNT, victim);
        vm.stopPrank();

        // CRITICAL ASSERTION (VAULT-07): victim MUST receive non-zero shares
        assertGt(victimShares, 0, "Victim must receive non-zero shares - inflation attack failed");

        // ---- ECONOMIC ANALYSIS ----
        // The victim's redeemable value should be close to their deposit.
        // Exits are now instant ERC-4626 redeems — prove it by actually exiting.
        uint256 balanceBefore = token.balanceOf(victim);
        vm.prank(victim);
        uint256 victimRedeemable = vault.redeem(victimShares, victim, victim);
        assertGt(victimRedeemable, 0, "Victim must be able to redeem non-zero assets");
        assertEq(token.balanceOf(victim), balanceBefore + victimRedeemable, "Victim received assets on instant exit");

        // Victim should NOT lose more than 0.1% of their deposit to the attack
        // (a few wei rounding loss is acceptable, but not a significant theft)
        uint256 maxAcceptableLoss = LARGE_AMOUNT / 1000; // 0.1%
        assertGe(victimRedeemable + maxAcceptableLoss, LARGE_AMOUNT, "Victim must not lose >0.1% to inflation attack");
    }

    /// @notice Quantifies that the attacker's profit (from stealing victim funds) is negligible.
    /// The key metric: how much of the victim's deposit does the attacker capture?
    ///
    /// With _decimalsOffset()=9:
    ///   - Attacker deposits 1 wei -> gets ~1e9 virtual shares
    ///   - Attacker donates 1e18 -> total assets = 1e18+1, shares = 1e9
    ///   - Victim deposits 1e18 -> gets ~1e9 shares (equal to attacker's)
    ///   - Total: 2e18+1 assets, ~2e9 shares
    ///   - Attacker's share: ~50% of pool = ~1e18 assets redeemable
    ///   - Attacker spent: 1 wei (deposit) + 1e18 (donation) = ~1e18+1
    ///   - Net gain from victim: 0 (attacker gets back what they put in, minus rounding)
    ///
    /// The attacker cannot extract a meaningful portion of the victim's deposit.
    function test_inflationAttack_attackerProfit_bounded() public {
        // Attacker deposits 1 wei
        vm.startPrank(attacker);
        token.approve(address(vault), ONE_WEI);
        uint256 attackerShares = vault.deposit(ONE_WEI, attacker);
        vm.stopPrank();

        // Attacker donates LARGE_AMOUNT as the "attack"
        vm.prank(attacker);
        token.transfer(address(vault), LARGE_AMOUNT);

        // Victim deposits LARGE_AMOUNT
        vm.startPrank(victim);
        token.approve(address(vault), LARGE_AMOUNT);
        uint256 victimShares = vault.deposit(LARGE_AMOUNT, victim);
        vm.stopPrank();

        // Attacker's redeemable value
        uint256 attackerRedeemable = vault.previewRedeem(attackerShares);
        uint256 victimRedeemable = vault.previewRedeem(victimShares);

        // Attacker's total spend: LARGE_AMOUNT (donation) + 1 (deposit) = LARGE_AMOUNT + 1
        uint256 attackerTotalSpend = LARGE_AMOUNT + ONE_WEI;

        // Net profit to attacker from victim's funds:
        // If attacker recovers more than they spent, the excess must have come from victim
        // Key check: attacker cannot recover significantly more than they spent
        if (attackerRedeemable > attackerTotalSpend) {
            uint256 stolenFromVictim = attackerRedeemable - attackerTotalSpend;
            // Stolen amount must be < 0.01% of victim deposit
            assertLt(stolenFromVictim, LARGE_AMOUNT / 10_000, "Attacker must not steal >0.01% of victim deposit");
        }

        // And victim must retain most of their deposit
        uint256 victimLoss = LARGE_AMOUNT > victimRedeemable ? LARGE_AMOUNT - victimRedeemable : 0;
        assertLt(victimLoss, LARGE_AMOUNT / 1000, "Victim must not lose >0.1% to inflation attack");
    }

    // =========================================================================
    // First depositor share math
    // =========================================================================

    /// @notice First depositor should receive shares proportional to the virtual offset.
    /// With _decimalsOffset() = 9, OZ ERC4626 uses:
    ///   shares = assets * (totalSupply + 10^9) / (totalAssets + 1)
    /// For the first deposit: shares = 1e18 * 1e9 / 1 = 1e27
    function test_firstDeposit_correctShares() public {
        address alice = makeAddr("alice");
        token.mint(alice, LARGE_AMOUNT);

        uint256 expectedShares = vault.previewDeposit(LARGE_AMOUNT);

        vm.startPrank(alice);
        token.approve(address(vault), LARGE_AMOUNT);
        uint256 actualShares = vault.deposit(LARGE_AMOUNT, alice);
        vm.stopPrank();

        assertEq(actualShares, expectedShares, "Actual shares must match previewDeposit");
        assertGt(actualShares, 0, "First depositor must receive non-zero shares");

        // With decimalsOffset=9: first deposit of 1e18 yields 1e27 shares
        // Formula: shares = assets * (totalSupply + 10^decimalsOffset) / (totalAssets + 1)
        //                  = 1e18 * (0 + 1e9) / (0 + 1) = 1e27
        assertEq(actualShares, 1e27, "First deposit of 1e18 should yield 1e27 shares with decimalsOffset=9");
    }

    /// @notice Verify the _decimalsOffset = 9 effect by checking the first deposit share math.
    /// The large virtual share count (1e9 baseline) is what makes the inflation attack uneconomical.
    function test_decimalsOffset_returns9() public {
        // For the first deposit, the OZ formula with _decimalsOffset()=9 gives:
        //   previewDeposit(1e18) = 1e18 * (totalSupply + 10^9) / (totalAssets + 1)
        //                        = 1e18 * (0 + 1e9) / (0 + 1)
        //                        = 1e27
        uint256 firstDepositShares = vault.previewDeposit(1e18);
        assertEq(firstDepositShares, 1e27, "previewDeposit(1e18) for fresh vault should be 1e27 (decimalsOffset=9)");

        // This means that to inflate the share price by 1:1 (doubling the price),
        // an attacker would need to donate 10^9 tokens relative to each wei of initial deposit.
        // The protection is inherent in the virtual share count.
    }

    // =========================================================================
    // Additional robustness tests
    // =========================================================================

    /// @notice Verify multiple depositors all receive fair shares.
    function test_multipleDepositors_receiveProportionalShares() public {
        address alice = makeAddr("alice");
        address bob = makeAddr("bob");

        token.mint(alice, LARGE_AMOUNT);
        token.mint(bob, LARGE_AMOUNT);

        // Alice deposits first
        vm.startPrank(alice);
        token.approve(address(vault), LARGE_AMOUNT);
        uint256 aliceShares = vault.deposit(LARGE_AMOUNT, alice);
        vm.stopPrank();

        // Bob deposits same amount
        vm.startPrank(bob);
        token.approve(address(vault), LARGE_AMOUNT);
        uint256 bobShares = vault.deposit(LARGE_AMOUNT, bob);
        vm.stopPrank();

        // With no yield, both should receive equal shares (same price point)
        assertEq(aliceShares, bobShares, "Equal deposits should yield equal shares with no yield");
        assertGt(aliceShares, 0, "Alice must receive non-zero shares");
        assertGt(bobShares, 0, "Bob must receive non-zero shares");
    }
}
